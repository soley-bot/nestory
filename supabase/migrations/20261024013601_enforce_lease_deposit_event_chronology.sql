-- A later receipt must never fund an earlier refund, retention or application.
-- Keep deposit-to-rent custody/linkage validation unchanged; this invariant also
-- covers legacy deposits that have no verified-custody confirmation.
BEGIN;
CREATE FUNCTION app_private.lock_lease_deposit_event_chronology()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_organization_id uuid;
  v_old_deposit_id uuid;
  v_new_organization_id uuid;
  v_new_deposit_id uuid;
  v_scope record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old_organization_id := OLD.organization_id;
    v_old_deposit_id := OLD.lease_deposit_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_organization_id := NEW.organization_id;
    v_new_deposit_id := NEW.lease_deposit_id;
  END IF;

  -- Checked receipt and reversal commands already lock this parent before
  -- mutating events. Use that same serialization point for every event write,
  -- with stable ordering if a privileged correction changes its deposit.
  FOR v_scope IN
    SELECT DISTINCT scope.organization_id, scope.deposit_id
    FROM (VALUES
      (v_old_organization_id, v_old_deposit_id),
      (v_new_organization_id, v_new_deposit_id)
    ) AS scope(organization_id, deposit_id)
    WHERE scope.organization_id IS NOT NULL AND scope.deposit_id IS NOT NULL
    ORDER BY scope.organization_id, scope.deposit_id
  LOOP
    -- A real row version change makes stale REPEATABLE READ writers abort,
    -- whereas a row lock alone would let them validate an obsolete snapshot.
    -- The contractual amount remains unchanged.
    UPDATE public.lease_deposits AS deposit
    SET amount = deposit.amount
    WHERE deposit.organization_id = v_scope.organization_id
      AND deposit.id = v_scope.deposit_id;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION app_private.check_lease_deposit_event_chronology()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_organization_id uuid;
  v_old_deposit_id uuid;
  v_new_organization_id uuid;
  v_new_deposit_id uuid;
  v_scope record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old_organization_id := OLD.organization_id;
    v_old_deposit_id := OLD.lease_deposit_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_organization_id := NEW.organization_id;
    v_new_deposit_id := NEW.lease_deposit_id;
  END IF;

  FOR v_scope IN
    SELECT DISTINCT scope.organization_id, scope.deposit_id
    FROM (VALUES
      (v_old_organization_id, v_old_deposit_id),
      (v_new_organization_id, v_new_deposit_id)
    ) AS scope(organization_id, deposit_id)
    WHERE scope.organization_id IS NOT NULL AND scope.deposit_id IS NOT NULL
    ORDER BY scope.organization_id, scope.deposit_id
  LOOP
    IF EXISTS (
      WITH daily AS (
        SELECT event.event_date,
          sum(CASE
            WHEN event.reversal_of_id IS NULL THEN
              CASE WHEN event.event_type = 'received' THEN event.amount ELSE -event.amount END
            ELSE
              CASE WHEN original.event_type = 'received' THEN -event.amount ELSE event.amount END
          END) AS amount
        FROM public.lease_deposit_events AS event
        LEFT JOIN public.lease_deposit_events AS original
          ON original.organization_id = event.organization_id
         AND original.id = event.reversal_of_id
        WHERE event.organization_id = v_scope.organization_id
          AND event.lease_deposit_id = v_scope.deposit_id
        GROUP BY event.event_date
      ), balances AS (
        SELECT sum(daily.amount) OVER (
          ORDER BY daily.event_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS held_amount
        FROM daily
      )
      SELECT 1 FROM balances WHERE held_amount < 0
    ) THEN
      RAISE EXCEPTION 'Deposit event would make historical held balance negative'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

ALTER FUNCTION app_private.lock_lease_deposit_event_chronology() OWNER TO postgres;
ALTER FUNCTION app_private.check_lease_deposit_event_chronology() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.lock_lease_deposit_event_chronology(),
  app_private.check_lease_deposit_event_chronology()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER lock_lease_deposit_event_chronology
BEFORE INSERT OR UPDATE OR DELETE ON public.lease_deposit_events
FOR EACH ROW EXECUTE FUNCTION app_private.lock_lease_deposit_event_chronology();

-- Defer validation until the complete checked command has written its linked
-- events. Original and reversal effects remain at their own business dates;
-- same-day events are summed without inventing an intraday ordering.
CREATE CONSTRAINT TRIGGER lease_deposit_event_chronology
AFTER INSERT OR UPDATE OR DELETE ON public.lease_deposit_events
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app_private.check_lease_deposit_event_chronology();

COMMIT;
