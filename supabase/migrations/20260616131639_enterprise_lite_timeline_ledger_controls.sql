CREATE TABLE IF NOT EXISTS public.ledger_period_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  locked_at timestamptz,
  locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_period_locks_month_start_check
    CHECK (period_start = date_trunc('month', period_start)::date),
  CONSTRAINT ledger_period_locks_reason_length_check
    CHECK (reason IS NULL OR length(reason) <= 400),
  CONSTRAINT ledger_period_locks_unique_period
    UNIQUE (organization_id, period_start)
);

DROP TRIGGER IF EXISTS set_ledger_period_locks_updated_at
ON public.ledger_period_locks;

CREATE TRIGGER set_ledger_period_locks_updated_at
BEFORE UPDATE ON public.ledger_period_locks
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.ledger_period_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read ledger period locks"
ON public.ledger_period_locks;

CREATE POLICY "Admins can read ledger period locks"
ON public.ledger_period_locks
FOR SELECT
TO authenticated
USING (app_private.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can create ledger period locks"
ON public.ledger_period_locks;

CREATE POLICY "Admins can create ledger period locks"
ON public.ledger_period_locks
FOR INSERT
TO authenticated
WITH CHECK (app_private.is_org_admin(organization_id));

DROP POLICY IF EXISTS "Admins can update ledger period locks"
ON public.ledger_period_locks;

CREATE POLICY "Admins can update ledger period locks"
ON public.ledger_period_locks
FOR UPDATE
TO authenticated
USING (app_private.is_org_admin(organization_id))
WITH CHECK (app_private.is_org_admin(organization_id));

GRANT SELECT, INSERT, UPDATE ON public.ledger_period_locks TO authenticated;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS ledger_entry_id uuid
    REFERENCES public.ledger_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ledger_period_locks_organization_period_idx
  ON public.ledger_period_locks (organization_id, period_start);

CREATE INDEX IF NOT EXISTS documents_ledger_entry_id_idx
  ON public.documents (ledger_entry_id);

CREATE OR REPLACE FUNCTION app_private.is_ledger_period_locked(
  target_organization_id uuid,
  target_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ledger_period_locks
    WHERE organization_id = target_organization_id
      AND period_start = date_trunc('month', target_date)::date
      AND locked_at IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION app_private.storage_object_org_id(object_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_text text;
BEGIN
  org_text := split_part(object_name, '/', 1);

  IF org_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN org_text::uuid;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION app_private.is_ledger_period_locked(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.storage_object_org_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.is_ledger_period_locked(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.storage_object_org_id(text) TO authenticated;

CREATE OR REPLACE FUNCTION app_private.enforce_ledger_entry_period_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF app_private.is_ledger_period_locked(NEW.organization_id, NEW.transaction_date) THEN
      RAISE EXCEPTION 'Accounting period is locked' USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF app_private.is_ledger_period_locked(OLD.organization_id, OLD.transaction_date)
      OR app_private.is_ledger_period_locked(NEW.organization_id, NEW.transaction_date) THEN
      RAISE EXCEPTION 'Accounting period is locked' USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.enforce_timeline_financial_period_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  old_is_financial boolean := false;
  new_is_financial boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_is_financial := NEW.cost_amount IS NOT NULL OR NEW.ledger_entry_id IS NOT NULL;

    IF new_is_financial
      AND app_private.is_ledger_period_locked(NEW.organization_id, NEW.event_date) THEN
      RAISE EXCEPTION 'Accounting period is locked' USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_is_financial := OLD.cost_amount IS NOT NULL OR OLD.ledger_entry_id IS NOT NULL;
    new_is_financial := NEW.cost_amount IS NOT NULL OR NEW.ledger_entry_id IS NOT NULL;

    IF (old_is_financial
        AND app_private.is_ledger_period_locked(OLD.organization_id, OLD.event_date))
      OR (new_is_financial
        AND app_private.is_ledger_period_locked(NEW.organization_id, NEW.event_date)) THEN
      RAISE EXCEPTION 'Accounting period is locked' USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_ledger_entry_period_open() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.enforce_timeline_financial_period_open() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_ledger_entry_period_open
ON public.ledger_entries;

CREATE TRIGGER enforce_ledger_entry_period_open
BEFORE INSERT OR UPDATE ON public.ledger_entries
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_ledger_entry_period_open();

DROP TRIGGER IF EXISTS enforce_timeline_financial_period_open
ON public.timeline_events;

CREATE TRIGGER enforce_timeline_financial_period_open
BEFORE INSERT OR UPDATE ON public.timeline_events
FOR EACH ROW
EXECUTE FUNCTION app_private.enforce_timeline_financial_period_open();

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'nestory-documents',
  'nestory-documents',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins can read Nestory documents"
ON storage.objects;

CREATE POLICY "Admins can read Nestory documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'nestory-documents'
  AND app_private.is_org_admin(app_private.storage_object_org_id(name))
);

DROP POLICY IF EXISTS "Admins can upload Nestory documents"
ON storage.objects;

CREATE POLICY "Admins can upload Nestory documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'nestory-documents'
  AND app_private.is_org_admin(app_private.storage_object_org_id(name))
);

DROP POLICY IF EXISTS "Admins can update Nestory documents"
ON storage.objects;

CREATE POLICY "Admins can update Nestory documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'nestory-documents'
  AND app_private.is_org_admin(app_private.storage_object_org_id(name))
)
WITH CHECK (
  bucket_id = 'nestory-documents'
  AND app_private.is_org_admin(app_private.storage_object_org_id(name))
);

DROP POLICY IF EXISTS "Admins can delete Nestory documents"
ON storage.objects;

CREATE POLICY "Admins can delete Nestory documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'nestory-documents'
  AND app_private.is_org_admin(app_private.storage_object_org_id(name))
);

CREATE OR REPLACE FUNCTION public.set_ledger_period_lock(
  p_organization_id uuid,
  p_period_start date,
  p_locked boolean,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  lock_id uuid;
  normalized_period date := date_trunc('month', p_period_start)::date;
  normalized_reason text := NULLIF(trim(coalesce(p_reason, '')), '');
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF normalized_reason IS NOT NULL AND length(normalized_reason) > 400 THEN
    RAISE EXCEPTION 'Reason is too long' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ledger_period_locks (
    organization_id,
    period_start,
    locked_at,
    locked_by,
    reason
  )
  VALUES (
    p_organization_id,
    normalized_period,
    CASE WHEN p_locked THEN now() ELSE NULL END,
    CASE WHEN p_locked THEN (SELECT auth.uid()) ELSE NULL END,
    normalized_reason
  )
  ON CONFLICT (organization_id, period_start) DO UPDATE
  SET
    locked_at = CASE WHEN p_locked THEN now() ELSE NULL END,
    locked_by = CASE WHEN p_locked THEN (SELECT auth.uid()) ELSE NULL END,
    reason = normalized_reason
  RETURNING id INTO lock_id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  )
  VALUES (
    p_organization_id,
    (SELECT auth.uid()),
    'ledger_period',
    lock_id,
    CASE WHEN p_locked THEN 'locked' ELSE 'unlocked' END,
    jsonb_build_object(
      'period_start', normalized_period,
      'reason', normalized_reason
    )
  );

  RETURN lock_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_timeline_event(
  p_event_id uuid,
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  old_event public.timeline_events%ROWTYPE;
  new_event public.timeline_events%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_event
  FROM public.timeline_events
  WHERE id = p_event_id
    AND organization_id = p_organization_id
    AND archived_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timeline event not found' USING ERRCODE = '23503';
  END IF;

  IF old_event.ledger_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ledger-linked timeline events must be restored from ledger'
      USING ERRCODE = '22023';
  END IF;

  IF old_event.cost_amount IS NOT NULL
    AND app_private.is_ledger_period_locked(p_organization_id, old_event.event_date) THEN
    RAISE EXCEPTION 'Accounting period is locked' USING ERRCODE = '22023';
  END IF;

  UPDATE public.timeline_events
  SET
    archived_at = NULL,
    archived_by = NULL,
    updated_by = (SELECT auth.uid())
  WHERE id = p_event_id
  RETURNING * INTO new_event;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    previous_values,
    new_values
  )
  VALUES (
    p_organization_id,
    (SELECT auth.uid()),
    'timeline_event',
    p_event_id,
    'restored',
    jsonb_build_object(
      'title', old_event.title,
      'event_date', old_event.event_date,
      'archived_at', old_event.archived_at,
      'archived_by', old_event.archived_by
    ),
    jsonb_build_object(
      'title', new_event.title,
      'event_date', new_event.event_date,
      'archived_at', new_event.archived_at,
      'archived_by', new_event.archived_by
    )
  );

  RETURN p_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_ledger_entry(
  p_entry_id uuid,
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  old_ledger public.ledger_entries%ROWTYPE;
  new_ledger public.ledger_entries%ROWTYPE;
  old_timeline public.timeline_events%ROWTYPE;
  new_timeline public.timeline_events%ROWTYPE;
  linked_timeline_found boolean := false;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_ledger
  FROM public.ledger_entries
  WHERE id = p_entry_id
    AND organization_id = p_organization_id
    AND archived_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ledger entry not found' USING ERRCODE = '23503';
  END IF;

  IF app_private.is_ledger_period_locked(p_organization_id, old_ledger.transaction_date) THEN
    RAISE EXCEPTION 'Accounting period is locked' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO old_timeline
  FROM public.timeline_events
  WHERE ledger_entry_id = p_entry_id
    AND organization_id = p_organization_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  linked_timeline_found := FOUND;

  UPDATE public.ledger_entries
  SET
    archived_at = NULL,
    archived_by = NULL,
    updated_by = (SELECT auth.uid())
  WHERE id = p_entry_id
  RETURNING * INTO new_ledger;

  IF linked_timeline_found THEN
    UPDATE public.timeline_events
    SET
      archived_at = NULL,
      archived_by = NULL,
      updated_by = (SELECT auth.uid())
    WHERE id = old_timeline.id
    RETURNING * INTO new_timeline;

    INSERT INTO public.activity_logs (
      organization_id,
      actor_id,
      entity_type,
      entity_id,
      action,
      previous_values,
      new_values
    )
    VALUES (
      p_organization_id,
      (SELECT auth.uid()),
      'timeline_event',
      new_timeline.id,
      'restored_from_ledger',
      jsonb_build_object(
        'ledger_entry_id', old_timeline.ledger_entry_id,
        'title', old_timeline.title,
        'event_date', old_timeline.event_date,
        'archived_at', old_timeline.archived_at,
        'archived_by', old_timeline.archived_by
      ),
      jsonb_build_object(
        'ledger_entry_id', new_timeline.ledger_entry_id,
        'title', new_timeline.title,
        'event_date', new_timeline.event_date,
        'archived_at', new_timeline.archived_at,
        'archived_by', new_timeline.archived_by
      )
    );
  END IF;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    previous_values,
    new_values
  )
  VALUES (
    p_organization_id,
    (SELECT auth.uid()),
    'ledger_entry',
    p_entry_id,
    'restored',
    jsonb_build_object(
      'category', old_ledger.category,
      'transaction_date', old_ledger.transaction_date,
      'archived_at', old_ledger.archived_at,
      'archived_by', old_ledger.archived_by
    ),
    jsonb_build_object(
      'category', new_ledger.category,
      'transaction_date', new_ledger.transaction_date,
      'archived_at', new_ledger.archived_at,
      'archived_by', new_ledger.archived_by
    )
  );

  RETURN p_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_ledger_period_lock(uuid, date, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_timeline_event(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_ledger_entry(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_ledger_period_lock(uuid, date, boolean, text)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.restore_timeline_event(uuid, uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.restore_ledger_entry(uuid, uuid)
TO authenticated;
