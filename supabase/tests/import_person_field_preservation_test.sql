BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(29);

SELECT ok(
  NOT has_function_privilege('authenticated', 'app_private.trim_import_cell(text)', 'EXECUTE'),
  'authenticated cannot invoke the private import trim helper directly'
);
SELECT is(
  app_private.trim_import_cell(
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
    || 'core' ||
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
  ),
  'core',
  'import trim removes every ECMAScript trim character at both cell boundaries'
);
SELECT is(
  app_private.trim_import_cell(U&'\0085\180E\200Bcore\0085\180E\200B'),
  U&'\0085\180E\200Bcore\0085\180E\200B',
  'import trim preserves characters outside the ECMAScript whitespace set'
);

CREATE TEMP TABLE import_person_state (
  run_id uuid,
  result jsonb,
  preserved_person jsonb
) ON COMMIT DROP;

INSERT INTO import_person_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON import_person_state TO authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a7030000-0000-4000-8000-000000000002',
  'authenticated', 'authenticated', 'import-person-fields@example.test',
  extensions.crypt('import-person-fields', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

INSERT INTO public.organizations(id, name, slug)
VALUES
  ('a7030000-0000-4000-8000-000000000001', 'Import person fields', 'import-person-fields'),
  ('a7030000-0000-4000-8000-000000000009', 'Other import organization', 'other-import-person-fields');

INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES (
  'a7030000-0000-4000-8000-000000000001',
  'a7030000-0000-4000-8000-000000000002',
  'super_admin'
);

INSERT INTO public.people (
  id, organization_id, display_name, legal_name, party_type,
  primary_email, primary_phone, tax_identifier, notes
)
VALUES
  (
    'a7030000-0000-4000-8000-000000000003',
    'a7030000-0000-4000-8000-000000000001',
    'Shared Name', 'Existing Company Ltd', 'company',
    'company@example.test', '+10000000003', 'COMPANY-TAX', 'Existing company notes'
  ),
  (
    'a7030000-0000-4000-8000-000000000004',
    'a7030000-0000-4000-8000-000000000001',
    'Shared Name', 'Other Individual', 'individual',
    'individual@example.test', '+10000000004', 'PERSON-TAX', 'Other person notes'
  ),
  (
    'a7030000-0000-4000-8000-000000000005',
    'a7030000-0000-4000-8000-000000000009',
    'Foreign Person', 'Foreign Company Ltd', 'company',
    'foreign@example.test', '+10000000005', 'FOREIGN-TAX', 'Foreign notes'
  );

INSERT INTO public.person_roles(organization_id, person_id, role, status)
VALUES
  ('a7030000-0000-4000-8000-000000000001', 'a7030000-0000-4000-8000-000000000003', 'tenant', 'active'),
  ('a7030000-0000-4000-8000-000000000001', 'a7030000-0000-4000-8000-000000000004', 'tenant', 'active');

INSERT INTO public.person_travel_documents (
  person_id, organization_id, passport_number, passport_expiry_date, visa_expiry_date
)
VALUES (
  'a7030000-0000-4000-8000-000000000003',
  'a7030000-0000-4000-8000-000000000001',
  'IMPORT-PASSPORT', '2031-04-30', '2028-09-15'
);

SELECT ok(
  NOT has_function_privilege('anon', 'app_private.update_person_preserving_unmapped_fields_for_import(uuid,uuid,jsonb,jsonb,jsonb,text[])', 'EXECUTE'),
  'anon cannot invoke the private import person writer'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'app_private.update_person_preserving_unmapped_fields_for_import(uuid,uuid,jsonb,jsonb,jsonb,text[])', 'EXECUTE'),
  'authenticated cannot invoke the private import person writer directly'
);
SELECT ok(
  NOT has_function_privilege('service_role', 'app_private.update_person_preserving_unmapped_fields_for_import(uuid,uuid,jsonb,jsonb,jsonb,text[])', 'EXECUTE'),
  'service role cannot invoke the private import person writer directly'
);

SELECT set_config('request.jwt.claim.sub', 'a7030000-0000-4000-8000-000000000002', true);
SET LOCAL ROLE authenticated;

UPDATE import_person_state
SET run_id = (public.stage_import_run_v1(
  'a7030000-0000-4000-8000-000000000001',
  'people', 'unmapped-company-fields.csv', 10::bigint, 'text/csv',
  '["ID","Name","Roles"]', '{"personId":"ID","displayName":"Name","roles":"Roles"}',
  '[{"source_row_number":2,"row_status":"ready","action_label":"Update","raw_data":{"ID":"a7030000-0000-4000-8000-000000000003","Name":"Renamed Company","Roles":"tenant"},"normalized_data":{"existingPersonId":"a7030000-0000-4000-8000-000000000003","displayName":"Renamed Company","roles":["tenant"],"legalName":null,"partyType":"individual","primaryEmail":null,"primaryPhone":null,"taxIdentifier":null,"notes":null},"issues":[]}]'
) ->> 'runId')::uuid;

RESET ROLE;
UPDATE public.people
SET primary_phone = '+10000000999'
WHERE id = 'a7030000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;

UPDATE import_person_state
SET result = public.commit_generic_import_run(run_id, 'a7030000-0000-4000-8000-000000000001');

SELECT is(
  (SELECT result FROM import_person_state),
  '{"status":"committed","created":0,"updated":1,"failed":0,"skipped":0}'::jsonb,
  'public checked commit safely resumes legacy normalized nulls and default party type'
);
SELECT is(
  (SELECT jsonb_build_object('legalName', legal_name, 'partyType', party_type, 'primaryEmail', primary_email,
    'primaryPhone', primary_phone, 'taxIdentifier', tax_identifier, 'notes', notes)
   FROM public.people WHERE id = 'a7030000-0000-4000-8000-000000000003'),
  '{"legalName":"Existing Company Ltd","partyType":"company","primaryEmail":"company@example.test","primaryPhone":"+10000000999","taxIdentifier":"COMPANY-TAX","notes":"Existing company notes"}'::jsonb,
  'unmapped fields retain the latest stored values and company type at commit'
);
SELECT is(
  (SELECT display_name FROM public.people WHERE id = 'a7030000-0000-4000-8000-000000000003'),
  'Renamed Company',
  'mapped display name still updates'
);
SELECT is(
  (SELECT jsonb_build_object('displayName', display_name, 'legalName', legal_name, 'partyType', party_type,
    'primaryEmail', primary_email, 'primaryPhone', primary_phone, 'taxIdentifier', tax_identifier, 'notes', notes)
   FROM public.people WHERE id = 'a7030000-0000-4000-8000-000000000004'),
  '{"displayName":"Shared Name","legalName":"Other Individual","partyType":"individual","primaryEmail":"individual@example.test","primaryPhone":"+10000000004","taxIdentifier":"PERSON-TAX","notes":"Other person notes"}'::jsonb,
  'the same-name person with a different email remains unchanged'
);

RESET ROLE;
SELECT is(
  (SELECT jsonb_build_object('passport', passport_number, 'passportExpiry', passport_expiry_date, 'visaExpiry', visa_expiry_date)
   FROM public.person_travel_documents WHERE person_id = 'a7030000-0000-4000-8000-000000000003'),
  '{"passport":"IMPORT-PASSPORT","passportExpiry":"2031-04-30","visaExpiry":"2028-09-15"}'::jsonb,
  'import updates preserve restricted travel documents'
);
SET LOCAL ROLE authenticated;

UPDATE import_person_state
SET run_id = (public.stage_import_run_v1(
  'a7030000-0000-4000-8000-000000000001',
  'people', 'mapped-company-blanks.csv', 10::bigint, 'text/csv',
  '["ID","Name","Legal","Type","Email","Phone","Tax","Notes","Roles"]',
  '{"personId":"ID","displayName":"Name","legalName":"Legal","partyType":"Type","primaryEmail":"Email","primaryPhone":"Phone","taxIdentifier":"Tax","notes":"Notes","roles":"Roles"}',
  '[{"source_row_number":2,"row_status":"warning","action_label":"Update","raw_data":{"ID":"a7030000-0000-4000-8000-000000000003","Name":"Renamed Company","Legal":"","Type":"","Email":"","Phone":"","Tax":"","Notes":"","Roles":"tenant"},"normalized_data":{"existingPersonId":"a7030000-0000-4000-8000-000000000003","displayName":"Renamed Company","legalName":null,"partyType":null,"primaryEmail":null,"primaryPhone":"","taxIdentifier":"","notes":null,"roles":["tenant"]},"issues":[{"level":"warning","message":"Mapped blank fields clear existing values; blank party type preserves the existing type."}]}]'
) ->> 'runId')::uuid;

UPDATE import_person_state
SET result = public.commit_generic_import_run(run_id, 'a7030000-0000-4000-8000-000000000001');

SELECT is(
  (SELECT result ->> 'status' FROM import_person_state), 'committed',
  'mapped blanks commit through the checked public entrypoint'
);
SELECT is(
  (SELECT jsonb_build_object('legalName', legal_name, 'partyType', party_type, 'primaryEmail', primary_email,
    'primaryPhone', primary_phone, 'taxIdentifier', tax_identifier, 'notes', notes)
   FROM public.people WHERE id = 'a7030000-0000-4000-8000-000000000003'),
  '{"legalName":null,"partyType":"company","primaryEmail":null,"primaryPhone":null,"taxIdentifier":null,"notes":null}'::jsonb,
  'explicit null and mapped empty strings clear nullable fields while blank party type preserves company'
);
SELECT throws_ok(
  format('SELECT public.commit_generic_import_run(%L, %L)',
    (SELECT run_id FROM import_person_state), 'a7030000-0000-4000-8000-000000000001'),
  '22023', 'Import run must be staged before commit',
  'person field preservation retains the terminal replay guard'
);

UPDATE import_person_state
SET run_id = (public.stage_import_run_v1(
  'a7030000-0000-4000-8000-000000000001',
  'people', 'mapped-person-values.csv', 10::bigint, 'text/csv',
  '["ID","Name","Type","Email","Notes","Roles"]',
  '{"personId":"ID","displayName":"Name","partyType":"Type","primaryEmail":"Email","notes":"Notes","roles":"Roles"}',
  '[{"source_row_number":2,"row_status":"ready","action_label":"Update","raw_data":{"ID":"a7030000-0000-4000-8000-000000000003","Name":"Renamed Company","Type":" Person ","Email":"updated@example.test","Notes":"Updated notes","Roles":"tenant"},"normalized_data":{"existingPersonId":"a7030000-0000-4000-8000-000000000003","displayName":"Renamed Company","partyType":"individual","primaryEmail":"updated@example.test","notes":"Updated notes","roles":["tenant"]},"issues":[]}]'
) ->> 'runId')::uuid;

UPDATE import_person_state
SET result = public.commit_generic_import_run(run_id, 'a7030000-0000-4000-8000-000000000001');

SELECT is(
  (SELECT result ->> 'status' FROM import_person_state), 'committed',
  'explicit mapped values commit successfully'
);
SELECT is(
  (SELECT jsonb_build_object('legalName', legal_name, 'partyType', party_type, 'primaryEmail', primary_email,
    'primaryPhone', primary_phone, 'taxIdentifier', tax_identifier, 'notes', notes)
   FROM public.people WHERE id = 'a7030000-0000-4000-8000-000000000003'),
  '{"legalName":null,"partyType":"individual","primaryEmail":"updated@example.test","primaryPhone":null,"taxIdentifier":null,"notes":"Updated notes"}'::jsonb,
  'explicit mapped party type, email, and notes change while omitted null fields stay null'
);

UPDATE import_person_state
SET run_id = (public.stage_import_run_v1(
  'a7030000-0000-4000-8000-000000000001',
  'people', 'mapped-company-alias.csv', 10::bigint, 'text/csv',
  '["ID","Name","Type","Roles"]',
  '{"personId":"ID","displayName":"Name","partyType":"Type","roles":"Roles"}',
  '[{"source_row_number":2,"row_status":"ready","action_label":"Update","raw_data":{"ID":"a7030000-0000-4000-8000-000000000003","Name":"Renamed Company","Type":" BuSiNeSs ","Roles":"tenant"},"normalized_data":{"existingPersonId":"a7030000-0000-4000-8000-000000000003","displayName":"Renamed Company","partyType":"company","roles":["tenant"]},"issues":[]}]'
) ->> 'runId')::uuid;

UPDATE import_person_state
SET result = public.commit_generic_import_run(run_id, 'a7030000-0000-4000-8000-000000000001');

SELECT is(
  (SELECT result ->> 'status' FROM import_person_state), 'committed',
  'mapped party type aliases retain preview normalization'
);
SELECT is(
  (SELECT party_type FROM public.people WHERE id = 'a7030000-0000-4000-8000-000000000003'),
  'company',
  'mixed-case Business with surrounding spaces applies the normalized company type'
);

UPDATE import_person_state
SET preserved_person = (SELECT to_jsonb(person) FROM public.people person
  WHERE id = 'a7030000-0000-4000-8000-000000000003'),
run_id = (public.stage_import_run_v1(
  'a7030000-0000-4000-8000-000000000001',
  'people', 'invalid-mapped-type.csv', 10::bigint, 'text/csv',
  '["ID","Name","Type","Roles"]',
  '{"personId":"ID","displayName":"Name","partyType":"Type","roles":"Roles"}',
  '[{"source_row_number":2,"row_status":"ready","action_label":"Update","raw_data":{"ID":"a7030000-0000-4000-8000-000000000003","Name":"Must roll back","Type":"invalid","Roles":"tenant"},"normalized_data":{"existingPersonId":"a7030000-0000-4000-8000-000000000003","displayName":"Must roll back","partyType":"invalid","notes":null,"roles":["tenant"]},"issues":[]}]'
) ->> 'runId')::uuid;

UPDATE import_person_state
SET result = public.commit_generic_import_run(run_id, 'a7030000-0000-4000-8000-000000000001');

SELECT is(
  (SELECT result FROM import_person_state),
  '{"status":"failed","created":0,"updated":0,"failed":1,"skipped":0}'::jsonb,
  'unsupported mapped party type remains a failed checked row'
);
SELECT is(
  (SELECT to_jsonb(person) FROM public.people person WHERE id = 'a7030000-0000-4000-8000-000000000003'),
  (SELECT preserved_person FROM import_person_state),
  'failed mapped validation rolls back all person changes'
);
SELECT is(
  (SELECT error_message FROM public.import_rows WHERE import_run_id = (SELECT run_id FROM import_person_state)),
  'Party type is not supported',
  'failed mapped validation retains the canonical person error'
);

UPDATE import_person_state
SET run_id = (public.stage_import_run_v1(
  'a7030000-0000-4000-8000-000000000001',
  'people', 'cross-organization-id.csv', 10::bigint, 'text/csv',
  '["ID","Name","Roles"]', '{"personId":"ID","displayName":"Name","roles":"Roles"}',
  '[{"source_row_number":2,"row_status":"ready","action_label":"Update","raw_data":{"ID":"a7030000-0000-4000-8000-000000000005","Name":"Must not update foreign person","Roles":"tenant"},"normalized_data":{"existingPersonId":"a7030000-0000-4000-8000-000000000005","displayName":"Must not update foreign person","roles":["tenant"]},"issues":[]}]'
) ->> 'runId')::uuid;

SELECT throws_ok(
  format('SELECT public.commit_generic_import_run(%L, %L)',
    (SELECT run_id FROM import_person_state), 'a7030000-0000-4000-8000-000000000001'),
  '23514', 'Re-upload this import: the mapped person ID is unavailable in this organization.',
  'an explicit person ID from another organization is rejected before commit'
);
SELECT is(
  (SELECT status FROM public.import_runs WHERE id = (SELECT run_id FROM import_person_state)),
  'staged',
  'rejected cross-organization selection leaves the complete run staged'
);

RESET ROLE;
SELECT is(
  (SELECT display_name FROM public.people WHERE id = 'a7030000-0000-4000-8000-000000000005'),
  'Foreign Person',
  'the foreign person remains unchanged'
);
SET LOCAL ROLE authenticated;

UPDATE import_person_state
SET run_id = (public.stage_import_run_v1(
  'a7030000-0000-4000-8000-000000000001',
  'people', 'new-person-defaults.csv', 10::bigint, 'text/csv',
  '["Name","Roles"]', '{"displayName":"Name","roles":"Roles"}',
  '[{"source_row_number":2,"row_status":"ready","action_label":"Create","raw_data":{"Name":"Created import person","Roles":"tenant"},"normalized_data":{"existingPersonId":null,"displayName":"Created import person","partyType":"individual","roles":["tenant"]},"issues":[]}]'
) ->> 'runId')::uuid;

UPDATE import_person_state
SET result = public.commit_generic_import_run(run_id, 'a7030000-0000-4000-8000-000000000001');

SELECT is(
  (SELECT result FROM import_person_state),
  '{"status":"committed","created":1,"updated":0,"failed":0,"skipped":0}'::jsonb,
  'new-person import still creates with an explicit default party type'
);
SELECT is(
  (SELECT jsonb_build_object('legalName', legal_name, 'partyType', party_type, 'primaryEmail', primary_email,
    'primaryPhone', primary_phone, 'taxIdentifier', tax_identifier, 'notes', notes)
   FROM public.people WHERE organization_id = 'a7030000-0000-4000-8000-000000000001'
     AND display_name = 'Created import person'),
  '{"legalName":null,"partyType":"individual","primaryEmail":null,"primaryPhone":null,"taxIdentifier":null,"notes":null}'::jsonb,
  'unmapped optional fields on new people retain canonical creation defaults'
);
SELECT is(
  (SELECT count(*) FROM public.person_roles WHERE organization_id = 'a7030000-0000-4000-8000-000000000001'
    AND person_id = 'a7030000-0000-4000-8000-000000000003' AND role = 'tenant' AND status = 'active' AND archived_at IS NULL),
  1::bigint,
  'person preservation keeps canonical role synchronization'
);

SELECT public.update_person(
  'a7030000-0000-4000-8000-000000000003', 'a7030000-0000-4000-8000-000000000001',
  'Renamed Company', 'Before whitespace legal', 'company', 'before-whitespace@example.test',
  '+10000000123', 'BEFORE-TAX', 'Before whitespace notes', ARRAY['tenant']::text[]
);

UPDATE import_person_state
SET run_id = (public.stage_import_run_v1(
  'a7030000-0000-4000-8000-000000000001', 'people', 'mapped-unicode-whitespace.csv', 10::bigint, 'text/csv',
  '["ID","Name","Legal","Type","Email","Phone","Tax","Notes","Roles"]',
  '{"personId":"ID","displayName":"Name","legalName":"Legal","partyType":"Type","primaryEmail":"Email","primaryPhone":"Phone","taxIdentifier":"Tax","notes":"Notes","roles":"Roles"}',
  jsonb_build_array(jsonb_build_object(
    'source_row_number', 2, 'row_status', 'warning', 'action_label', 'Update',
    'raw_data', jsonb_build_object(
      'ID', U&'\0009\00A0a7030000-0000-4000-8000-000000000003\FEFF\2028',
      'Name', 'Renamed Company', 'Legal', U&'\0009\00A0\FEFF\2028',
      'Type', U&'\0009\00A0\FEFF\2028', 'Email', U&'\0009\00A0\FEFF\2028',
      'Phone', U&'\000A\2003\2029', 'Tax', U&'\1680\202F\205F',
      'Notes', U&'\000D\3000\FEFF', 'Roles', 'tenant'
    ),
    'normalized_data', jsonb_build_object(
      'existingPersonId', 'a7030000-0000-4000-8000-000000000003', 'displayName', 'Renamed Company',
      'legalName', NULL, 'partyType', 'individual', 'primaryEmail', NULL, 'primaryPhone', NULL,
      'taxIdentifier', NULL, 'notes', NULL, 'roles', jsonb_build_array('tenant')
    ), 'issues', jsonb_build_array(jsonb_build_object('level', 'warning', 'message', 'Mapped blanks clear nullable fields and keep the existing party type.'))
  ))
) ->> 'runId')::uuid;

UPDATE import_person_state
SET result = public.commit_generic_import_run(run_id, 'a7030000-0000-4000-8000-000000000001');
SELECT is((SELECT result ->> 'status' FROM import_person_state), 'committed', 'whitespace-only mapped cells commit with the same blank semantics as preview');
SELECT is(
  (SELECT jsonb_build_object('legalName', legal_name, 'partyType', party_type, 'primaryEmail', primary_email,
    'primaryPhone', primary_phone, 'taxIdentifier', tax_identifier, 'notes', notes)
   FROM public.people WHERE id = 'a7030000-0000-4000-8000-000000000003'),
  '{"legalName":null,"partyType":"company","primaryEmail":null,"primaryPhone":null,"taxIdentifier":null,"notes":null}'::jsonb,
  'tabs and Unicode whitespace clear all mapped nullable fields while preserving company type'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
