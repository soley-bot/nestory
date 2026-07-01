CREATE OR REPLACE FUNCTION app_private.validate_document_links(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_lease_id uuid,
  p_timeline_event_id uuid,
  p_ledger_entry_id uuid,
  p_task_id uuid,
  p_tenant_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  lease_row public.leases%ROWTYPE;
  ledger_row public.ledger_entries%ROWTYPE;
  task_row public.tasks%ROWTYPE;
  timeline_row public.timeline_events%ROWTYPE;
  unit_row public.units%ROWTYPE;
BEGIN
  IF p_property_id IS NULL THEN
    RAISE EXCEPTION 'Choose a property' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.properties
    WHERE organization_id = p_organization_id
      AND id = p_property_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  IF p_unit_id IS NOT NULL THEN
    SELECT *
    INTO unit_row
    FROM public.units
    WHERE organization_id = p_organization_id
      AND id = p_unit_id
      AND archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unit not found' USING ERRCODE = '23503';
    END IF;

    IF unit_row.property_id <> p_property_id THEN
      RAISE EXCEPTION 'Unit not found under selected property' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF p_lease_id IS NOT NULL THEN
    SELECT *
    INTO lease_row
    FROM public.leases
    WHERE organization_id = p_organization_id
      AND id = p_lease_id
      AND archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lease not found' USING ERRCODE = '23503';
    END IF;

    IF lease_row.property_id <> p_property_id THEN
      RAISE EXCEPTION 'Lease not found under selected property' USING ERRCODE = '23503';
    END IF;

    IF lease_row.unit_id IS NOT NULL AND lease_row.unit_id IS DISTINCT FROM p_unit_id THEN
      RAISE EXCEPTION 'Lease not found under selected unit' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF p_ledger_entry_id IS NOT NULL THEN
    SELECT *
    INTO ledger_row
    FROM public.ledger_entries
    WHERE organization_id = p_organization_id
      AND id = p_ledger_entry_id
      AND archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ledger entry not found' USING ERRCODE = '23503';
    END IF;

    IF ledger_row.property_id <> p_property_id THEN
      RAISE EXCEPTION 'Ledger entry not found under selected property' USING ERRCODE = '23503';
    END IF;

    IF ledger_row.unit_id IS DISTINCT FROM p_unit_id THEN
      RAISE EXCEPTION 'Ledger entry not found under selected unit' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF p_timeline_event_id IS NOT NULL THEN
    SELECT *
    INTO timeline_row
    FROM public.timeline_events
    WHERE organization_id = p_organization_id
      AND id = p_timeline_event_id
      AND archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Timeline event not found' USING ERRCODE = '23503';
    END IF;

    IF timeline_row.property_id <> p_property_id THEN
      RAISE EXCEPTION 'Timeline event not found under selected property' USING ERRCODE = '23503';
    END IF;

    IF timeline_row.unit_id IS DISTINCT FROM p_unit_id THEN
      RAISE EXCEPTION 'Timeline event not found under selected unit' USING ERRCODE = '23503';
    END IF;

    IF timeline_row.ledger_entry_id IS DISTINCT FROM p_ledger_entry_id THEN
      RAISE EXCEPTION 'Timeline event not found under selected ledger entry' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF p_task_id IS NOT NULL THEN
    SELECT *
    INTO task_row
    FROM public.tasks
    WHERE organization_id = p_organization_id
      AND id = p_task_id
      AND archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Maintenance task not found' USING ERRCODE = '23503';
    END IF;

    IF task_row.property_id <> p_property_id THEN
      RAISE EXCEPTION 'Maintenance task not found under selected property' USING ERRCODE = '23503';
    END IF;

    IF task_row.unit_id IS NOT NULL AND task_row.unit_id IS DISTINCT FROM p_unit_id THEN
      RAISE EXCEPTION 'Maintenance task not found under selected unit' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF p_tenant_request_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.tenant_requests
    WHERE organization_id = p_organization_id
      AND id = p_tenant_request_id
      AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Tenant request not found' USING ERRCODE = '23503';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.sync_property_primary_owner(
  p_organization_id uuid,
  p_property_id uuid,
  p_owner_person_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  current_owner_ids uuid[];
  today date := current_date;
BEGIN
  SELECT coalesce(array_agg(person_id ORDER BY person_id), ARRAY[]::uuid[])
  INTO current_owner_ids
  FROM (
    SELECT person_id
    FROM public.property_owners
    WHERE organization_id = p_organization_id
      AND property_id = p_property_id
      AND is_primary
      AND archived_at IS NULL
      AND ended_on IS NULL
    FOR UPDATE
  ) current_owners;

  IF p_owner_person_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.people
      WHERE organization_id = p_organization_id
        AND id = p_owner_person_id
        AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Owner person not found' USING ERRCODE = '23503';
    END IF;

    UPDATE public.person_roles
    SET
      archived_at = NULL,
      archived_by = NULL,
      status = 'active',
      updated_by = (SELECT auth.uid())
    WHERE organization_id = p_organization_id
      AND person_id = p_owner_person_id
      AND role = 'owner';

    IF NOT FOUND THEN
      INSERT INTO public.person_roles (
        organization_id,
        person_id,
        role,
        status,
        created_by,
        updated_by
      )
      VALUES (
        p_organization_id,
        p_owner_person_id,
        'owner',
        'active',
        (SELECT auth.uid()),
        (SELECT auth.uid())
      );
    END IF;
  END IF;

  UPDATE public.property_owners
  SET
    ended_on = today,
    updated_by = (SELECT auth.uid())
  WHERE organization_id = p_organization_id
    AND property_id = p_property_id
    AND is_primary
    AND archived_at IS NULL
    AND ended_on IS NULL
    AND (p_owner_person_id IS NULL OR person_id <> p_owner_person_id);

  IF p_owner_person_id IS NOT NULL
    AND NOT p_owner_person_id = ANY(current_owner_ids) THEN
    INSERT INTO public.property_owners (
      organization_id,
      property_id,
      person_id,
      ownership_label,
      is_primary,
      started_on,
      created_by,
      updated_by
    )
    VALUES (
      p_organization_id,
      p_property_id,
      p_owner_person_id,
      'Primary',
      true,
      today,
      (SELECT auth.uid()),
      (SELECT auth.uid())
    );
  END IF;

  IF current_owner_ids IS DISTINCT FROM coalesce(
    CASE
      WHEN p_owner_person_id IS NULL THEN ARRAY[]::uuid[]
      ELSE ARRAY[p_owner_person_id]
    END,
    ARRAY[]::uuid[]
  ) THEN
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
      'property',
      p_property_id,
      'property_owner_updated',
      jsonb_build_object('owner_person_ids', current_owner_ids),
      jsonb_build_object('owner_person_id', p_owner_person_id)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_document(
  p_organization_id uuid,
  p_category text,
  p_file_name text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_property_id uuid,
  p_unit_id uuid DEFAULT NULL,
  p_lease_id uuid DEFAULT NULL,
  p_timeline_event_id uuid DEFAULT NULL,
  p_ledger_entry_id uuid DEFAULT NULL,
  p_task_id uuid DEFAULT NULL,
  p_tenant_request_id uuid DEFAULT NULL,
  p_activity_entity_type text DEFAULT 'document',
  p_activity_entity_id uuid DEFAULT NULL,
  p_activity_action text DEFAULT 'created',
  p_activity_new_values jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  new_document_id uuid;
  normalized_category text := trim(coalesce(p_category, ''));
  normalized_file_name text := trim(coalesce(p_file_name, ''));
  normalized_mime_type text := trim(coalesce(p_mime_type, ''));
  normalized_storage_path text := trim(coalesce(p_storage_path, ''));
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF length(normalized_category) = 0 OR length(normalized_category) > 80 THEN
    RAISE EXCEPTION 'Document category is invalid' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_file_name) = 0 THEN
    RAISE EXCEPTION 'Document file name is required' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_storage_path) = 0 THEN
    RAISE EXCEPTION 'Document storage path is required' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_mime_type) = 0 THEN
    RAISE EXCEPTION 'Document MIME type is required' USING ERRCODE = '22023';
  END IF;

  IF p_size_bytes < 0 THEN
    RAISE EXCEPTION 'Document size is invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM app_private.validate_document_links(
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_lease_id,
    p_timeline_event_id,
    p_ledger_entry_id,
    p_task_id,
    p_tenant_request_id
  );

  INSERT INTO public.documents (
    organization_id,
    property_id,
    unit_id,
    lease_id,
    timeline_event_id,
    ledger_entry_id,
    task_id,
    tenant_request_id,
    category,
    file_name,
    storage_path,
    mime_type,
    size_bytes,
    uploaded_by
  )
  VALUES (
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_lease_id,
    p_timeline_event_id,
    p_ledger_entry_id,
    p_task_id,
    p_tenant_request_id,
    normalized_category,
    normalized_file_name,
    normalized_storage_path,
    normalized_mime_type,
    p_size_bytes,
    (SELECT auth.uid())
  )
  RETURNING id INTO new_document_id;

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
    coalesce(nullif(trim(p_activity_entity_type), ''), 'document'),
    coalesce(p_activity_entity_id, new_document_id),
    coalesce(nullif(trim(p_activity_action), ''), 'created'),
    coalesce(p_activity_new_values, '{}'::jsonb)
      || jsonb_build_object(
        'document_id', new_document_id,
        'category', normalized_category,
        'file_name', normalized_file_name,
        'property_id', p_property_id,
        'unit_id', p_unit_id,
        'lease_id', p_lease_id,
        'timeline_event_id', p_timeline_event_id,
        'ledger_entry_id', p_ledger_entry_id,
        'task_id', p_task_id,
        'tenant_request_id', p_tenant_request_id
      )
  );

  RETURN new_document_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_document(
  p_document_id uuid,
  p_organization_id uuid,
  p_category text,
  p_property_id uuid,
  p_unit_id uuid DEFAULT NULL,
  p_lease_id uuid DEFAULT NULL,
  p_task_id uuid DEFAULT NULL,
  p_file_name text DEFAULT NULL,
  p_storage_path text DEFAULT NULL,
  p_mime_type text DEFAULT NULL,
  p_size_bytes bigint DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  old_document public.documents%ROWTYPE;
  new_document public.documents%ROWTYPE;
  replacing_file boolean;
  normalized_category text := trim(coalesce(p_category, ''));
  normalized_file_name text := nullif(trim(coalesce(p_file_name, '')), '');
  normalized_mime_type text := nullif(trim(coalesce(p_mime_type, '')), '');
  normalized_storage_path text := nullif(trim(coalesce(p_storage_path, '')), '');
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_document
  FROM public.documents
  WHERE id = p_document_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found' USING ERRCODE = '23503';
  END IF;

  IF length(normalized_category) = 0 OR length(normalized_category) > 80 THEN
    RAISE EXCEPTION 'Document category is invalid' USING ERRCODE = '22023';
  END IF;

  replacing_file := normalized_file_name IS NOT NULL
    OR normalized_storage_path IS NOT NULL
    OR normalized_mime_type IS NOT NULL
    OR p_size_bytes IS NOT NULL;

  IF replacing_file AND (
    normalized_file_name IS NULL
    OR normalized_storage_path IS NULL
    OR normalized_mime_type IS NULL
    OR p_size_bytes IS NULL
    OR p_size_bytes < 0
  ) THEN
    RAISE EXCEPTION 'Replacement document file is invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM app_private.validate_document_links(
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_lease_id,
    old_document.timeline_event_id,
    old_document.ledger_entry_id,
    p_task_id,
    old_document.tenant_request_id
  );

  UPDATE public.documents
  SET
    category = normalized_category,
    property_id = p_property_id,
    unit_id = p_unit_id,
    lease_id = p_lease_id,
    task_id = p_task_id,
    file_name = CASE WHEN replacing_file THEN normalized_file_name ELSE file_name END,
    storage_path = CASE WHEN replacing_file THEN normalized_storage_path ELSE storage_path END,
    mime_type = CASE WHEN replacing_file THEN normalized_mime_type ELSE mime_type END,
    size_bytes = CASE WHEN replacing_file THEN p_size_bytes ELSE size_bytes END
  WHERE id = p_document_id
  RETURNING * INTO new_document;

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
    'document',
    p_document_id,
    CASE WHEN replacing_file THEN 'document_replaced' ELSE 'updated' END,
    jsonb_build_object(
      'archived_at', old_document.archived_at,
      'category', old_document.category,
      'file_name', old_document.file_name,
      'lease_id', old_document.lease_id,
      'ledger_entry_id', old_document.ledger_entry_id,
      'mime_type', old_document.mime_type,
      'property_id', old_document.property_id,
      'size_bytes', old_document.size_bytes,
      'storage_path', old_document.storage_path,
      'task_id', old_document.task_id,
      'tenant_request_id', old_document.tenant_request_id,
      'timeline_event_id', old_document.timeline_event_id,
      'unit_id', old_document.unit_id
    ),
    jsonb_build_object(
      'archived_at', new_document.archived_at,
      'category', new_document.category,
      'file_name', new_document.file_name,
      'lease_id', new_document.lease_id,
      'ledger_entry_id', new_document.ledger_entry_id,
      'mime_type', new_document.mime_type,
      'property_id', new_document.property_id,
      'size_bytes', new_document.size_bytes,
      'storage_path', new_document.storage_path,
      'task_id', new_document.task_id,
      'tenant_request_id', new_document.tenant_request_id,
      'timeline_event_id', new_document.timeline_event_id,
      'unit_id', new_document.unit_id
    )
  );

  RETURN p_document_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_document(
  p_document_id uuid,
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  old_document public.documents%ROWTYPE;
  new_document public.documents%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_document
  FROM public.documents
  WHERE id = p_document_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found' USING ERRCODE = '23503';
  END IF;

  UPDATE public.documents
  SET
    archived_at = now(),
    archived_by = (SELECT auth.uid())
  WHERE id = p_document_id
  RETURNING * INTO new_document;

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
    'document',
    p_document_id,
    'archived',
    jsonb_build_object('archived_at', old_document.archived_at),
    jsonb_build_object('archived_at', new_document.archived_at)
  );

  RETURN p_document_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_document(
  p_document_id uuid,
  p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  old_document public.documents%ROWTYPE;
  new_document public.documents%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_document
  FROM public.documents
  WHERE id = p_document_id
    AND organization_id = p_organization_id
    AND archived_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found' USING ERRCODE = '23503';
  END IF;

  UPDATE public.documents
  SET
    archived_at = NULL,
    archived_by = NULL
  WHERE id = p_document_id
  RETURNING * INTO new_document;

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
    'document',
    p_document_id,
    'restored',
    jsonb_build_object('archived_at', old_document.archived_at),
    jsonb_build_object('archived_at', new_document.archived_at)
  );

  RETURN p_document_id;
END;
$$;

DROP FUNCTION IF EXISTS public.create_property(uuid, text, text, text, text, text, text, date, text);
DROP FUNCTION IF EXISTS public.update_property(uuid, uuid, text, text, text, text, text, text, date, text);

CREATE OR REPLACE FUNCTION public.create_property(
  p_organization_id uuid,
  p_name text,
  p_code text,
  p_property_type text,
  p_owner text,
  p_address text,
  p_status text,
  p_acquisition_date date,
  p_notes text,
  p_owner_person_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  new_property_id uuid;
  normalized_code text := upper(trim(coalesce(p_code, '')));
  normalized_name text := trim(coalesce(p_name, ''));
  normalized_property_type text := trim(coalesce(p_property_type, ''));
  normalized_status text := lower(trim(coalesce(p_status, '')));
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF length(normalized_name) = 0 THEN
    RAISE EXCEPTION 'Property name is required' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_name) > 120 THEN
    RAISE EXCEPTION 'Property name is too long' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_code) = 0 THEN
    RAISE EXCEPTION 'Property code is required' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_code) > 24 THEN
    RAISE EXCEPTION 'Property code is too long' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_property_type) = 0 THEN
    RAISE EXCEPTION 'Property type is required' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_property_type) > 80 THEN
    RAISE EXCEPTION 'Property type is too long' USING ERRCODE = '22023';
  END IF;

  IF normalized_status NOT IN ('active', 'under_renovation', 'inactive') THEN
    RAISE EXCEPTION 'Property status is not supported' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.properties (
    organization_id,
    name,
    code,
    property_type,
    owner,
    address,
    status,
    acquisition_date,
    notes,
    created_by,
    updated_by
  )
  VALUES (
    p_organization_id,
    normalized_name,
    normalized_code,
    normalized_property_type,
    NULLIF(trim(coalesce(p_owner, '')), ''),
    NULLIF(trim(coalesce(p_address, '')), ''),
    normalized_status,
    p_acquisition_date,
    NULLIF(trim(coalesce(p_notes, '')), ''),
    (SELECT auth.uid()),
    (SELECT auth.uid())
  )
  RETURNING id INTO new_property_id;

  PERFORM app_private.sync_property_primary_owner(
    p_organization_id,
    new_property_id,
    p_owner_person_id
  );

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
    'property',
    new_property_id,
    'property_created',
    jsonb_build_object(
      'name', normalized_name,
      'code', normalized_code,
      'property_type', normalized_property_type,
      'owner', NULLIF(trim(coalesce(p_owner, '')), ''),
      'owner_person_id', p_owner_person_id,
      'address', NULLIF(trim(coalesce(p_address, '')), ''),
      'status', normalized_status,
      'acquisition_date', p_acquisition_date,
      'notes', NULLIF(trim(coalesce(p_notes, '')), ''),
      'archived_at', NULL,
      'archived_by', NULL
    )
  );

  RETURN new_property_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_property(
  p_property_id uuid,
  p_organization_id uuid,
  p_name text,
  p_code text,
  p_property_type text,
  p_owner text,
  p_address text,
  p_status text,
  p_acquisition_date date,
  p_notes text,
  p_owner_person_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, app_private
AS $$
DECLARE
  old_property public.properties%ROWTYPE;
  new_property public.properties%ROWTYPE;
  normalized_code text := upper(trim(coalesce(p_code, '')));
  normalized_name text := trim(coalesce(p_name, ''));
  normalized_property_type text := trim(coalesce(p_property_type, ''));
  normalized_status text := lower(trim(coalesce(p_status, '')));
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO old_property
  FROM public.properties
  WHERE id = p_property_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = '23503';
  END IF;

  IF length(normalized_name) = 0 THEN
    RAISE EXCEPTION 'Property name is required' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_name) > 120 THEN
    RAISE EXCEPTION 'Property name is too long' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_code) = 0 THEN
    RAISE EXCEPTION 'Property code is required' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_code) > 24 THEN
    RAISE EXCEPTION 'Property code is too long' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_property_type) = 0 THEN
    RAISE EXCEPTION 'Property type is required' USING ERRCODE = '22023';
  END IF;

  IF length(normalized_property_type) > 80 THEN
    RAISE EXCEPTION 'Property type is too long' USING ERRCODE = '22023';
  END IF;

  IF normalized_status NOT IN ('active', 'under_renovation', 'inactive') THEN
    RAISE EXCEPTION 'Property status is not supported' USING ERRCODE = '22023';
  END IF;

  UPDATE public.properties
  SET
    name = normalized_name,
    code = normalized_code,
    property_type = normalized_property_type,
    owner = NULLIF(trim(coalesce(p_owner, '')), ''),
    address = NULLIF(trim(coalesce(p_address, '')), ''),
    status = normalized_status,
    acquisition_date = p_acquisition_date,
    notes = NULLIF(trim(coalesce(p_notes, '')), ''),
    updated_by = (SELECT auth.uid())
  WHERE id = p_property_id
  RETURNING * INTO new_property;

  PERFORM app_private.sync_property_primary_owner(
    p_organization_id,
    p_property_id,
    p_owner_person_id
  );

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
    'property',
    p_property_id,
    'property_updated',
    jsonb_build_object(
      'name', old_property.name,
      'code', old_property.code,
      'property_type', old_property.property_type,
      'owner', old_property.owner,
      'address', old_property.address,
      'status', old_property.status,
      'acquisition_date', old_property.acquisition_date,
      'notes', old_property.notes,
      'archived_at', old_property.archived_at,
      'archived_by', old_property.archived_by
    ),
    jsonb_build_object(
      'name', new_property.name,
      'code', new_property.code,
      'property_type', new_property.property_type,
      'owner', new_property.owner,
      'owner_person_id', p_owner_person_id,
      'address', new_property.address,
      'status', new_property.status,
      'acquisition_date', new_property.acquisition_date,
      'notes', new_property.notes,
      'archived_at', new_property.archived_at,
      'archived_by', new_property.archived_by
    )
  );

  RETURN p_property_id;
END;
$$;

REVOKE ALL ON FUNCTION app_private.validate_document_links(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.sync_property_primary_owner(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_document(uuid, text, text, text, text, bigint, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_document(uuid, uuid, text, uuid, uuid, uuid, uuid, text, text, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_document(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_document(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_property(uuid, text, text, text, text, text, text, date, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_property(uuid, uuid, text, text, text, text, text, text, date, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_private.validate_document_links(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.sync_property_primary_owner(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_document(uuid, text, text, text, text, bigint, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_document(uuid, uuid, text, uuid, uuid, uuid, uuid, text, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_document(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_document(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_property(uuid, text, text, text, text, text, text, date, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_property(uuid, uuid, text, text, text, text, text, text, date, text, uuid) TO authenticated;
