-- The same control drives scheduled rent, lease-change catch-up and manual entry.
-- Shipping the setting does not change the control or generate financial records.
BEGIN;

CREATE FUNCTION app_private.pilot_rent_posting_admin(p_organization_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  claims jsonb := (SELECT auth.jwt());
  actor uuid := (SELECT auth.uid());
BEGIN
  IF p_organization_id IS DISTINCT FROM '752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid
    OR session_user IS DISTINCT FROM 'authenticator'
    OR current_setting('role',true) IS DISTINCT FROM 'authenticated'
    OR actor IS NULL OR claims->>'sub' IS DISTINCT FROM actor::text
    OR claims->>'role' IS DISTINCT FROM 'authenticated' OR claims->>'aud' IS DISTINCT FROM 'authenticated'
    OR claims->'is_anonymous' IS DISTINCT FROM 'false'::jsonb
    OR NOT pg_input_is_valid(coalesce(claims->>'session_id',''),'uuid')
    OR coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$' THEN
    RETURN false;
  END IF;
  RETURN to_timestamp((claims->>'exp')::double precision) > clock_timestamp()
    AND app_private.financial_reset_actor_is_current(p_organization_id,actor,(claims->>'session_id')::uuid);
END;
$$;
REVOKE ALL ON FUNCTION app_private.pilot_rent_posting_admin(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.guard_automatic_rent_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NOT NEW.automatic_rent_enabled THEN
      RAISE EXCEPTION 'automatic_rent_policy_restart_required' USING ERRCODE='42501';
    END IF;
  ELSIF NEW.automatic_rent_enabled IS DISTINCT FROM OLD.automatic_rent_enabled THEN
    IF OLD.status='open' AND NEW.status='open' AND OLD.organization_id=NEW.organization_id
      AND OLD.generation=NEW.generation AND OLD.financial_start_date=NEW.financial_start_date
      AND app_private.pilot_rent_posting_admin(OLD.organization_id) THEN
      PERFORM app_private.assert_financial_write_allowed(OLD.organization_id);
      INSERT INTO public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,previous_values,new_values)
      VALUES (OLD.organization_id,(SELECT auth.uid()),'organization',OLD.organization_id,'rent_auto_posting_changed',
        jsonb_build_object('automatic_rent_enabled',OLD.automatic_rent_enabled),
        jsonb_build_object('automatic_rent_enabled',NEW.automatic_rent_enabled));
    ELSIF NOT OLD.automatic_rent_enabled OR NEW.automatic_rent_enabled OR OLD.status<>'frozen' OR NEW.status<>'open'
      OR NEW.generation<>OLD.generation OR NEW.financial_start_date<>OLD.financial_start_date
      OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_manual_restart_receipts r WHERE r.organization_id=NEW.organization_id
        AND r.backend_pid=pg_backend_pid() AND r.transaction_id=pg_current_xact_id()) THEN
      RAISE EXCEPTION 'automatic_rent_policy_restart_required' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION app_private.set_pilot_rent_auto_posting(p_organization_id uuid,p_enabled boolean,p_expected_updated_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  control app_private.financial_write_controls%ROWTYPE;
  actor uuid := (SELECT auth.uid());
  actor_session_id uuid;
BEGIN
  IF NOT app_private.pilot_rent_posting_admin(p_organization_id) THEN
    RAISE EXCEPTION 'rent_posting_setting_forbidden' USING ERRCODE='42501';
  END IF;
  IF p_enabled IS NULL OR p_expected_updated_at IS NULL OR NOT isfinite(p_expected_updated_at) THEN
    RAISE EXCEPTION 'rent_posting_setting_invalid' USING ERRCODE='22023';
  END IF;
  -- Acquire the exclusive counterpart to the lease/cron lock before reading state.
  IF NOT pg_try_advisory_xact_lock(hashtextextended('financial_write_lifecycle_v1:'||p_organization_id::text,0)) THEN
    RAISE EXCEPTION 'rent_posting_setting_busy' USING ERRCODE='55P03';
  END IF;
  PERFORM app_private.assert_financial_write_allowed(p_organization_id);
  SELECT * INTO control FROM app_private.financial_write_controls WHERE organization_id=p_organization_id FOR UPDATE NOWAIT;
  IF NOT FOUND OR control.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'rent_posting_setting_stale' USING ERRCODE='40001';
  END IF;

  -- Keep the membership, session and its configured step-up policy stable for this save.
  actor_session_id := ((SELECT auth.jwt())->>'session_id')::uuid;
  LOCK TABLE app_private.privileged_email_step_up_policies IN SHARE MODE NOWAIT;
  PERFORM 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
    JOIN public.organization_members m ON m.user_id=u.id AND m.organization_id=p_organization_id
    WHERE s.id=actor_session_id AND s.user_id=actor FOR SHARE OF s,u,m NOWAIT;
  PERFORM 1 FROM app_private.privileged_email_step_up_grants g WHERE g.organization_id=p_organization_id
    AND g.user_id=actor AND g.session_id=actor_session_id FOR SHARE NOWAIT;
  IF NOT app_private.pilot_rent_posting_admin(p_organization_id) THEN
    RAISE EXCEPTION 'rent_posting_setting_forbidden' USING ERRCODE='42501';
  END IF;
  IF control.automatic_rent_enabled IS DISTINCT FROM p_enabled THEN
    UPDATE app_private.financial_write_controls SET automatic_rent_enabled=p_enabled WHERE organization_id=p_organization_id;
  END IF;
  RETURN p_enabled;
END;
$$;

CREATE FUNCTION public.set_pilot_rent_auto_posting(p_organization_id uuid,p_enabled boolean,p_expected_updated_at timestamptz)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT app_private.set_pilot_rent_auto_posting(p_organization_id,p_enabled,p_expected_updated_at);
$$;
REVOKE ALL ON FUNCTION app_private.set_pilot_rent_auto_posting(uuid,boolean,timestamptz),
  public.set_pilot_rent_auto_posting(uuid,boolean,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.set_pilot_rent_auto_posting(uuid,boolean,timestamptz),
  public.set_pilot_rent_auto_posting(uuid,boolean,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_financial_write_context(p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_control app_private.financial_write_controls%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id=p_organization_id AND m.user_id=(SELECT auth.uid())
  ) THEN RAISE EXCEPTION 'financial_context_forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_control FROM app_private.financial_write_controls WHERE organization_id=p_organization_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('generation',0,'status','open','financial_start_date',NULL,'enforced',false);
  END IF;
  RETURN jsonb_build_object('generation',v_control.generation,'status',v_control.status,
    'financial_start_date',v_control.financial_start_date,'enforced',true,'automatic_rent_enabled',v_control.automatic_rent_enabled)
    || CASE WHEN p_organization_id='752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid
      THEN jsonb_build_object('automatic_rent_updated_at',v_control.updated_at) ELSE '{}'::jsonb END;
END;
$$;

-- A completed reopening receipt describes the transition to manual billing at that time.
-- Keep its authorization and checkpoint checks; report the current posting policy on replay.
DO $restart_readback$
DECLARE
  definition text;
  before_text text;
  after_text text;
  routine regprocedure;
BEGIN
  FOR routine,before_text,after_text IN VALUES
    ('public.get_pilot_manual_restart_status()'::regprocedure,
      'IF w.status=''open'' AND NOT w.automatic_rent_enabled AND EXISTS(',
      'IF w.status=''open'' AND EXISTS('),
    ('public.get_pilot_manual_restart_status()'::regprocedure,
      'CASE WHEN NOT w.automatic_rent_enabled THEN ''manual'' ELSE ''paused'' END',
      'CASE WHEN v_status=''already_open'' AND w.automatic_rent_enabled THEN ''automatic'' WHEN NOT w.automatic_rent_enabled THEN ''manual'' ELSE ''paused'' END'),
    ('public.restart_pilot_manual_billing(uuid,integer,text)'::regprocedure,
      'AND financial_start_date=r.financial_start_date AND NOT automatic_rent_enabled) THEN',
      'AND financial_start_date=r.financial_start_date) THEN'),
    ('public.restart_pilot_manual_billing(uuid,integer,text)'::regprocedure,
      '''status'',''already_open'',''billing_mode'',''manual''',
      '''status'',''already_open'',''billing_mode'',(SELECT CASE WHEN automatic_rent_enabled THEN ''automatic'' ELSE ''manual'' END FROM app_private.financial_write_controls WHERE organization_id=p)')
  LOOP
    definition := pg_get_functiondef(routine);
    IF cardinality(string_to_array(definition,before_text)) <> 2 THEN
      RAISE EXCEPTION 'Unexpected Pilot restart definition for %',routine;
    END IF;
    EXECUTE replace(definition,before_text,after_text);
  END LOOP;
END;
$restart_readback$;

COMMENT ON FUNCTION public.set_pilot_rent_auto_posting(uuid,boolean,timestamptz) IS
  'Changes the posting policy for an open Pilot workspace. The next normal run considers each eligible lease in its current billing month.';
COMMENT ON FUNCTION public.restart_pilot_manual_billing(uuid,integer,text) IS
  'One named-admin reopening of the completed Pilot October baseline into manual billing. A later settings change is independent of the reopening receipt.';
COMMIT;
