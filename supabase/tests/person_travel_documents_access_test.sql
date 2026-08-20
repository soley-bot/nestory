BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(6);

SELECT has_table(
  'public',
  'person_travel_documents',
  'travel documents use a separate restricted relation'
);
SELECT hasnt_column(
  'public',
  'people',
  'passport_number',
  'passport number is not exposed through the broadly readable people table'
);
SELECT hasnt_column(
  'public',
  'people',
  'passport_expiry_date',
  'passport expiry is not exposed through the broadly readable people table'
);
SELECT hasnt_column(
  'public',
  'people',
  'visa_expiry_date',
  'visa expiry is not exposed through the broadly readable people table'
);

CREATE TEMP TABLE travel_document_access_state (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO travel_document_access_state DEFAULT VALUES;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', user_id, 'authenticated',
  'authenticated', email,
  extensions.crypt('travel-document-test', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
FROM (
  SELECT admin_id AS user_id, 'travel-admin@example.test' AS email
  FROM travel_document_access_state
  UNION ALL
  SELECT member_id, 'travel-member@example.test'
  FROM travel_document_access_state
) AS users;

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Travel document access',
  'travel-doc-' || left(organization_id::text, 8)
FROM travel_document_access_state;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin'
FROM travel_document_access_state
UNION ALL
SELECT organization_id, member_id, 'finance_member'
FROM travel_document_access_state;

INSERT INTO public.people (id, organization_id, display_name, party_type)
SELECT person_id, organization_id, 'Restricted Tenant', 'individual'
FROM travel_document_access_state;

INSERT INTO public.person_travel_documents (
  person_id, organization_id, passport_number, passport_expiry_date,
  visa_expiry_date
)
SELECT person_id, organization_id, 'N1234567', DATE '2031-04-30',
  DATE '2028-09-15'
FROM travel_document_access_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT member_id::text FROM travel_document_access_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::integer FROM public.person_travel_documents),
  0,
  'ordinary organization members cannot read travel documents'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM travel_document_access_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::integer FROM public.person_travel_documents),
  1,
  'organization administrators can read travel documents'
);

SELECT * FROM finish();

ROLLBACK;
