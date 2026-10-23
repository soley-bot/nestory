BEGIN;
-- Exact-row synthetic maintenance only. Foundation capabilities bind one
-- organization, operation phase, backend/top-level xid, verb and full OLD/NEW
-- images. They are private, single-use and never created by these triggers.
-- Unknown predecessor functions or trigger layouts fail closed before edits.
DO $migration$
DECLARE v_pin record; v_actual text; v_definition text; v_position integer;
  v_prefix text; v_verbs text; v_table regclass; v_anchor text;
BEGIN
  PERFORM 'app_private.financial_reset_action_allowed(oid,text,jsonb,jsonb)'::regprocedure;
  PERFORM 'app_private.begin_financial_reset_row_action()'::regprocedure;
  PERFORM 'app_private.finish_financial_reset_row_action()'::regprocedure;
  FOR v_pin IN SELECT * FROM (VALUES
    ('app_private.advance_financial_report_source_revision()','7548ecc849c42fb4677a2f64af6cd9658dbdc3724b3f20a64182e3b9c6978ad0'),
    ('app_private.apply_owner_cash_after_tenant_payment()','ba1cb6dbd3ed41505ba1b38b86c308bb6e0ee695f1998ba713a2ced42b4dfa90'),
    ('app_private.apply_owner_transfer_remediation()','3fa8297531ac78ce3683b73f23c55ab7be0bd60eb8c4f4cb6d5f5a5c9222528a'),
    ('app_private.assign_owner_cash_unit()','b28a118806dc08230ac2a1a3d8356c9b5a30f89eafe11994a2501eed84d0d17a'),
    ('app_private.bind_deposit_rent_custody_attestation()','2437170a97e475b4e5e14cbf18e065d492b704910009b1e65bda49a67d64f44c'),
    ('app_private.check_lease_deposit_event_chronology()','0b4e4a5ba6cdd0636b9115bb4d495ed66e84c1b4ab99cbbbacde0a5a2e0350d3'),
    ('app_private.create_management_fee_owner_charge()','d3b650441ba44dfea36d96c2962187d9c60daf0e2ce70168a30ebea8e3d1c5c6'),
    ('app_private.deposit_rent_correction_guard()','8526a926c20add86d135de5840bba11604a3df6a7225a4eff31904ab6dd57a66'),
    ('app_private.deposit_rent_immutable()','30373c828732c7816a2d1579e55593120f25d9e1478d2ff0205607905283fc0f'),
    ('app_private.deposit_rent_linked_event_immutable()','41a1fad35b9d6b9de1b61395b5a36ba0c02df4ffbeb2858eff89ee8116de4f2d'),
    ('app_private.deposit_rent_settlement_guard()','4cdee98929b05e9cd09a6b87fbff70070d0e325de3591d2d3f1388b713dc44a7'),
    ('app_private.deposit_rent_validate()','7aef5615f7fa7f17faf594954b7902b7e58958e9bad5a87d4df4738b5ad18642'),
    ('app_private.deposit_rent_validate_owner_bridge()','08fe06a404cf28adb14ed05496fb75067b9cd53aea42419bbe6eac37c8fc44ff'),
    ('app_private.derive_lease_deposit_status_from_events()','02a6e7359abdf5b0fbccf259d64c4f15c278a27739d1a2312f7c540bda3f27ac'),
    ('app_private.derive_owner_payment_allocation_sign()','e36e3d22353504646b395dbdc504f276af811ff26de17ab182e4c8f4427dfd7e'),
    ('app_private.enforce_canonical_income_settlement()','426237e0e16f96e983752fa66748534598c61e79f4903dfd151ce717adba2e26'),
    ('app_private.enforce_finance_settlement_derived_fields()','6516ea40b55aac5d2112fe9768efd383d3e932d3532f4f4b518deb2b0b3a0dbc'),
    ('app_private.enforce_invoice_income_allocation_total()','b35cb0e84aecd067931d0e1ea569183d7413fa56df8291bf630b268c9bcbd840'),
    ('app_private.enforce_ledger_entry_period_open()','fb7863e69c0d91e704551223c8034b0ad3ceb9356b898008c8b6660cc4b85347'),
    ('app_private.enforce_owner_opening_balance_approved_entries()','9de94746215b8486ad25387df02c3db21703e66ca18316b444151b59bcdf9a39'),
    ('app_private.enforce_privileged_email_step_up_on_organization_mutation()','1e520b36b68923ee8bfa4c40c48ea88a7042e56a528dd368988537589b627c8f'),
    ('app_private.enforce_reconciliation_source_link()','385788ebd4a6bd9088a0a2b74b976fd7ae58524f74c9201d8ec52c5b640f3f55'),
    ('app_private.enforce_reserved_ledger_projection()','4662182bb13fabb21f6c37f18f4d0d897035293d7bb767bd5c54a7b07c74571e'),
    ('app_private.enforce_settled_income_material()','672bcb7e29a16026b78f2b0232d4682924fde948e5b743e57c3a810192dd015e'),
    ('app_private.enforce_timeline_financial_period_open()','ddc0245e45746455b16810011c534cd1369af33a89571d91071315f0b85801c0'),
    ('app_private.enqueue_maintenance_reminder()','bee8cec7194171e5445fc7a2a9836b586ded1f300445871e17a9cbfce6ba3be4'),
    ('app_private.guard_branch_scoped_document()','4006febd75c062adec551e2d7ed1ff8d78c80c7285651e5274edf62ff9edbe66'),
    ('app_private.guard_document_content_fingerprint()','ba321abd735b65b71c7f1bae2f689cd8b17904b5609c43aa5d1af8279dad9d2d'),
    ('app_private.guard_document_storage_organization()','4b313c108416dbcca82939c0b19ffd2563091c3428c41eba4029a4c9e517c3f1'),
    ('app_private.guard_expense_approval_tenant_allocation()','d3938ee4144bcdb7e9bfe37d45229efceea173700713dde8e8bc0f57f427ca93'),
    ('app_private.guard_expense_approval_tenant_income()','ae18071179a49f8ba0408fa96b159ddf3ef654022e9e70d15765508b77947f1e'),
    ('app_private.guard_expense_submission_evidence_reuse()','42cdcc92aa2d81c661d3319994ec1db8d1626c138325567bb4db9b5de3a692b6'),
    ('app_private.guard_expense_transaction_child_status()','89b829afdf2c8a7ef9e05d327439d5810562f78bc04286f3cdc5cf380c371892'),
    ('app_private.guard_finance_income_creation_contract()','dc42ad5cc7a44f055e56796c94ebfc68cb0efc6b707e88512440a3afef11e545'),
    ('app_private.guard_financial_evidence_document()','db88ec0f62601bf0e8d21e658068b6e7f3314d25a2aea2bd32b00a38707274ba'),
    ('app_private.guard_financial_generation_row()','97ebfb41ff37cfa0da542199de99cb0003417bf423070520997da69485cd477b'),
    ('app_private.guard_financial_write_row()','824fbdfde8ad11e4b7f58b38d8fd26a866551f19700c137060dd8a4444c9aa87'),
    ('app_private.guard_historical_rent_evidence()','ccc42d8bad0c1029ed9b78c1b81d636037e4ab58e46e89325d790a697f736e8d'),
    ('app_private.guard_lease_derived_rent_income()','35e25c29c3190a05ca01cf68d632361629db2c9d8275f233ac5d66f00afe69a1'),
    ('app_private.guard_lease_derived_rent_receipt_allocation()','3e7d9f20f7e3d41ca2bc150626f65b2759bcdcffc68fafa2b65f07e7d562c019'),
    ('app_private.guard_legacy_expense_replacement()','5712ca3cacbe907d5abc5fd98e4c1f53c174e32c0dc6d363aae397d1059fa8a0'),
    ('app_private.guard_maintenance_cost_fields()','569ad536bd5bc3f0053fec15df42458dbc2c3b36953b498081324dd6ae484121'),
    ('app_private.guard_owner_balance_append_only()','2c1ce8369dc475fbfa0c547eed3d5cf62fecdc7ddc048ef2191e731d6b9b7eca'),
    ('app_private.guard_owner_balance_period_lifecycle()','21cb735797f7b909358c50d63c4cf136ea0b4daf5c6edd854a3ceb17b369178e'),
    ('app_private.guard_owner_balance_period_write()','1612c34e7d6d495f4bd3029cb1cadb3d971363f84cfca1807bd13bcc262cd955'),
    ('app_private.guard_owner_cash_event_correction()','8a5e185db16c9f87e327c408556cc52fa503e1923cfa7321506c72bed74609fa'),
    ('app_private.guard_owner_close_write()','2b3ce9143a2c165275d6e8a4648c72caac993d36407a78bb13ecfc6949424909'),
    ('app_private.guard_owner_month_rent_completeness()','6145af7aa432cc8ea25c79ae5a9069f25ed7789004c17db2d6897ec273e8a3be'),
    ('app_private.guard_owner_opening_balance_correction_target()','5677facfc4643273a598e57f3b5a899a3af24a57864a8492c2e7c53da79bd519'),
    ('app_private.guard_owner_opening_balance_entry_immutable()','16a7c118cb7a032c4deaccc2d10dca8d52f67c646fdf58faa50b12dbfd112c9c'),
    ('app_private.guard_owner_opening_balance_entry_insert()','8b43c11f7338a16782f44f52f3aed9483ea0b49a9635448e87419065fd3932f1'),
    ('app_private.guard_owner_opening_balance_request_mutation()','e7b7d985d22296e212eec9fbf360a6b4bba848596bf1729a54f07d40640e578a'),
    ('app_private.guard_owner_opening_cash_dependency()','40492c9669c3ba5e671d8a97d80a42cf700f0397c700d8a54ff2bca90035c43e'),
    ('app_private.guard_owner_payment_allocation_outstanding()','76b9c0a06ba6d4b78d3482fbdb8c276a5ec851d043f7084ee142554c857795c0'),
    ('app_private.guard_owner_statement_completion_before_reopen()','a99ce4257636c93465c1300f281b90e4b7bd0fc9ea6ec8ceb4d5d094a479fe89'),
    ('app_private.guard_owner_statement_write()','f130093eac68e144cb19f01867eb5710f385483faf86c0f68e941a99a74d723e'),
    ('app_private.guard_paid_cost_approval_evidence()','c9b8a19658976580ee8c7807ff67ac5925fe7b0310acd8305d88f5b759aa06aa'),
    ('app_private.guard_paid_cost_evidence_cleanup_claim()','56c6a959fe54a52c0e849082b9f5c3cc2fdc11ec9328ddcc3c50778645b688ed'),
    ('app_private.guard_preserved_write_row()','b6d4383e152b8e8e4ffe5138f250a40d33c33250dc33c64c5b8cb24d24e9be21'),
    ('app_private.guard_reversed_owner_expense_allocation()','af127d4d0d7c9ba7a76838f502fb6175ee163da8b7885939b180914c6b13e8c7'),
    ('app_private.guard_task_branch_scope()','2bbeb869c0c410068cf003dd03e04b5141c76eabb8d2c94905328c7bf423080c'),
    ('app_private.guard_tenant_commercial_document_artifact_write()','58ecb539746e770792b15a746f7d1bfa398fe2fbd60759eb9ff0d4550b815022'),
    ('app_private.guard_tenant_invoice_correction_occurrence()','c7cee243806afdff5ad9700ae94eb18aa16ae4d93bf87ea9039a786cf5702ea7'),
    ('app_private.guard_tenant_invoice_line_finance_category()','1b4a93e7bda0047d0ad518ee0257407c295000f6e8ebcb86812afcad10dce3fb'),
    ('app_private.guard_tenant_invoice_rent_segments()','60526c6dfecd387dd79796f0dc83e1eaa8783253978fed5551c5c6c1d08709ad'),
    ('app_private.guard_timeline_financial_write_row()','d9c295840a11276628795b726029780a1683220c5b41563c7a4dec059f343057'),
    ('app_private.inherit_lease_deposit_liability_account()','ee9e265f97a0f7bd66955a21ff9610abfc2621e46ead255fee60e6aa4f956b48'),
    ('app_private.lock_expense_evidence_reference()','6630f5ed7f8e16345effe1dad0c1ef7c0ba38ca848de6d1ecff8a1217e6ee763'),
    ('app_private.lock_lease_deposit_event_chronology()','7a5348dfb681f789e6aa6e6c93624944c4ab602cdaa4b3fb028d8cca9bb0bef2'),
    ('app_private.lock_legacy_owner_cash_effect()','a913feb0ef23018379d84970268e6fdd82ff1399a6958792f9eaa6e4bdaa2326'),
    ('app_private.lock_owner_balance_lifecycle(uuid,uuid,uuid,public.currency_code)','9e36225b1769b3beee37d234bd4e2b61508c4e11142a52050f69965897b5fcd5'),
    ('app_private.lock_owner_balance_mutation(uuid,uuid,uuid,public.currency_code,date)','e1b17624862097f9a921152d03b99171e483daac1f6dddc19b59a7166bc48258'),
    ('app_private.lock_property_financial_month(uuid,uuid,public.currency_code,date)','8123a17daf0edb77dfcda0f8b6e51f778131ad89e5f97d641ca1f0f7e761ed13'),
    ('app_private.lock_owner_opening_evidence_reference()','bb100f56c26fe3027ddc1b59bbf801ee238bf3794af626a5225c6d3847608c01'),
    ('app_private.mark_owner_balance_periods_stale_after_opening_entry()','7083db459a1823fc04245127dbd7e980ea61629308cef7b735a5e8bf5c01aa84'),
    ('app_private.normalize_unreceived_deposit_status()','f15a17c7d3b648e0b39e91c7846a5c727d70e3ec135331f4501c3702bc18d314'),
    ('app_private.prepare_owner_invoice_line_recognition()','0a8ad84a0c10e39e281ee8e007ac80c107801af84fe9429b0fcbd47d9b37fda5'),
    ('app_private.prepare_tenant_invoice_line_recognition()','f0489abbb79e33c1cdc507c275b62158ef9ff0c441c019b67495ad898b902122'),
    ('app_private.stamp_financial_record()','9e2098b39782b060772058d9bf7c899870f7e3049de1516bc08102dc25204046'),
    ('app_private.sync_voided_tenant_invoice_income_status()','c7a86a74c4705eb5f834ea3526abc4dbb8c1cd9a1ae315440f2ce2e60a9e61e4'),
    ('app_private.validate_property_cash_reversal()','6b899a4217da2dc4b548e932dad659b4cc30d93bda2ef65de0aed3489fbac6ea'),
    ('public.set_updated_at()','5c8dc264cf868953882b5576d76833fabbbf208350e757263294f27e8392d994'),
    ('public.validate_task_scope()','6788b171ebea3696a94084c175508cb05d6999a0c9b3626a48f8da9264811825')
  ) AS pins(signature,sha256) LOOP
    v_definition:=replace(pg_catalog.pg_get_functiondef(v_pin.signature::regprocedure),E'\r\n',E'\n');
    IF encode(extensions.digest(v_definition,'sha256'),'hex')<>v_pin.sha256 THEN
      RAISE EXCEPTION 'financial_reset_guard_predecessor_mismatch: %',v_pin.signature;
    END IF;
  END LOOP;
  FOR v_pin IN SELECT * FROM (VALUES
    ('public.documents','d84753b826c0b3f32190b1ec30b406e962eb5e80e669811e9736f3a53391cf31',8),
    ('public.notification_outbox','5374d483b1cda95a1c5127d67f625b3ee782af8a01d8e4e8ddef7ec009e219d7',3),
    ('public.lease_deposits','a06cd694599b7370a1464e0842eb2438819047d9406301e0aa112b37a2981958',5),
    ('public.tasks','0eb4bf7f9f58ad67043c1f2fcfd89d73a8b7daf3b94059e0d1347094240da9d5',8),
    ('public.timeline_events','b1b50f15fa1d591a2258273196db1a789b4253ff73d2ee64b07d2e95c45d7071',6),
    ('public.deposit_rent_allocations','b0d7609c3d422976d05fc57db54de66c92bec0850b4d5014c2190af7154067f4',6),
    ('public.deposit_rent_applications','5c2f9a117e1f746a8aa0d8d43efbd51996674db9e72fedc78a28683d188a1518',7),
    ('public.deposit_rent_custody_confirmations','db7191ecfb5ef04f507539d5d636d0a70e0223f941f44862b2302bee436c35ab',4),
    ('public.deposit_rent_owner_bridges','fd153e3a7244b16c4ec845fe8aae9d7cfb2787ff0745b21d44f65c6555d7d85f',4),
    ('public.expense_customer_adjustments','105842bd090e2da68f7b2c7dc207bd83d5a22869bdbbc14c882c2907eed69794',6),
    ('public.expense_legacy_replacements','e975e6412d6727128f0906f4d9a756488e40e6f3002a272928b571017d8e10ac',4),
    ('public.expense_submissions','fa1ef56bcde92dc5cdb837e629dd104f3f523f3d4a21f7debfd85ebe19b2329e',9),
    ('public.expense_transaction_lines','a77f5dbc8840d5c8d2d2ef04a0d377e4080e168f1893eed372726812cc18e6e9',3),
    ('public.expense_transaction_scopes','36c1cef7dd4fe3c2f30851dc5cc99975cfd7bc08d8057053fa871a4e3d6df703',3),
    ('public.expense_transactions','45bb4996e0c0bed6323013e59885b578dd6e415ccb2c9d5b0af053b93f702062',4),
    ('public.fee_payment_date_corrections','00fed6c2ccebe3784ed2d915662e059afd9236477b5277b4f73fb7975f550701',5),
    ('public.finance_expense_items','05f6a4d5b3e99b70d9f7dfafc6e340ea6e084d9d7eb1c5dbecd996a344d0b6a4',6),
    ('public.finance_income_items','125b5242e1e40e852c64c02c1c3b6c9d21f47d2c9a1f8a8519dc9d1756d5e7c8',10),
    ('public.finance_payment_allocations','3fe866c61a632d0f44900e54299d845ba07735b53c5a336f9437611249a56aed',4),
    ('public.finance_payments','06ab8f5fb559ff1e59cedfe81cee862c855f11705e9780ffdee20e1e40277151',6),
    ('public.finance_receipt_allocations','3c997cf0e82cd3f1771f542165e7b029268010310829f66883d79ca7b2c7b37b',9),
    ('public.finance_receipts','d83215ed5834883daac297d65b3bbc95985878e6297cb6cffb2f8257c1c9e527',7),
    ('public.financial_month_locks','4c23a0e7c3367660021945dcd25e28e5f7c30f010664eee08039bed2bdd5e4ed',3),
    ('public.historical_rent_settlement_reapplications','56109f52fc656e4cff6bf78d55d763061c3b5f485d076429c04e73d0e16a56f9',4),
    ('public.ips_expense_responsibilities','caab7d9d042581b646c13715611e7b26d9581fa3192ab154203635c4c4ccfd62',4),
    ('public.lease_deposit_events','28944844702b214add703760cd2ed82814910fb077a63ddc2eeec54e41f5ab16',13),
    ('public.ledger_entries','bffb9e8635df6318327c66645745f82987bc49bbe38675c4eb1aafeecb3095a6',7),
    ('public.management_fee_occurrences','cacac46ae215228ddb9df70ea55b823ad144ef115afecac2908f10d8e40ffa9b',5),
    ('public.owner_balance_period_components','e9a988fb0364738b30d901a865b05faae09181c9c1664daf4c049396af884984',4),
    ('public.owner_balance_periods','5117b478c750a5f86b40452291cb2b8cc73638209d034401f4f4a35c979e6bc8',6),
    ('public.owner_cash_events','31174ebf79d25d663be3776951ab4571c2872b130f63f9bdeccef50ee66f41ab',7),
    ('public.owner_cash_source_consumptions','a6e44591a01acb36986861a16925bcad34b8ece468ec0d772745e187ae728018',4),
    ('public.owner_charge_cash_allocations','de1ba73a5c784a41ecfd2910aa9a428bb03f579f19f4e07a040a720e0ef02499',6),
    ('public.owner_close_corrections','e831a9e56a6bf34831741c1f84103124c08290edd21af6526f748808c4bf0e75',4),
    ('public.owner_close_line_sources','26698486fecf4be2e56b23c53fcffcddf87b87735a034ff22a0a8ab68886c65e',4),
    ('public.owner_close_lines','40ec0dd6ae469197bc80acd4b46779cdf388527eab826f616b97fb54abb2eed9',4),
    ('public.owner_close_revisions','23bae937f3371e3eed26ad0de6594f01a7b655824184c49f92270c63f9b5801e',6),
    ('public.owner_close_series','69df72858b86329f0a864a254e4c9b91733eb46e7b1c4fe1d8e027e71ac6c7a1',5),
    ('public.owner_collection_confirmation_allocations','b4d812de57aab9f7ea4606b1a59a5599189ad8493cf3cf14de2de5b6e9a1c7e9',8),
    ('public.owner_collection_confirmations','767950408a9c1a21c771efe19cddf7a9b1803eee7b52824ef9762874c19fbbb2',4),
    ('public.owner_component_movements','a55bd612052033fef2cfafe113e8c9d69a3ceda4d1b4862cf5dfd6cee997cec4',4),
    ('public.owner_component_transfer_instructions','0f13823017b1162df571240eb42948ac19fd4b01107fb277748fded1c54ef3ef',4),
    ('public.owner_component_transfer_lines','2a65153ab726a4851840ab367b6db6bd1704180bec7a8f6a6341859610ca3855',4),
    ('public.owner_event_allocation_sets','cee59cffb34ef24db8b6674cf84d20fa58aa91aaf922b716b1e5d9edd99e41d5',4),
    ('public.owner_event_owner_allocations','0e2d920fe116cbcf63b8bdb258062efbb891512253ea8acae3cdd1ddfbd47662',4),
    ('public.owner_invoice_lines','79c70a720f770053ff09f349913556f387fce5447e2fb4f10828b81a46ca47f7',5),
    ('public.owner_invoices','c7bd3800115567426ffe33e8e7bee9d06b8d33eb8c8cfbd97acb90d216d266a0',4),
    ('public.owner_opening_balance_entries','0bbb9471e2eb2de8bd3d182683632bc6e1c0c51647a531f642d151c777c65f00',8),
    ('public.owner_opening_balance_requests','5543ea08061ae1ec80469613d80d82a5fb32f1d700e036621294aa875610452c',7),
    ('public.owner_payment_allocations','8872c15db6b24c14e02258bbb67c779771dae265a62e34d75edbefb3e64f1d14',6),
    ('public.owner_payments','ea7c4f5d077d9a997e7afe95e176a368d7ee7685369028805c8d86f3d5564786',4),
    ('public.owner_statement_artifacts','718e5388d706ce48d23381c36a5a5e0843963fe3d8ca9d02afaa6fc4a33f44a3',5),
    ('public.owner_statement_publications','0d5871f4f26b34adc004b7149474df803469f9cb722b608e58e5d2aa33a9d33f',6),
    ('public.petty_cash_entries','83e93333de90b94f1cd4f17a525588a5b23a4fe49ffd03f3be0d70bc118d8e80',5),
    ('public.petty_cash_periods','e4713d6edabe779fb3f6476813ace4933322ded059859c5f16dc4188b6285d98',4),
    ('public.property_withdrawals','0585e6ce7c973875bfc42f11a0aec77550c61e3a97b39ac89e22bc409fe495be',4),
    ('public.rent_generation_exceptions','4802e83a0387e36583a5df75f198e831e998920e3663a1bcfff3a6afc70995d9',4),
    ('public.tenant_commercial_document_artifacts','4d2326952608a0c971085672983d33f5a867149ec2b6df6eae134a89e096a109',5),
    ('public.tenant_credit_occurrences','d249c6d232c2c9ab73583aa36901669e74178d7f295a9c1602ac10d0ea723ace',4),
    ('public.tenant_invoice_corrections','6d4acdc43bbb1893da6a30ed4e8b0835f6245a3601f37ed19c3ee0e3df8b5932',4),
    ('public.tenant_invoice_lines','186bac8a8800ef3cc5bd1dc8380a63a06b87da748ab61a8a8a783880288d0900',7),
    ('public.tenant_invoice_payment_allocations','a45bd046a78213e92d1b093197fa4e48e79cf6a6c9498df7c6f77b16144fd97b',5),
    ('public.tenant_invoice_payments','4edf759b617b2ed0fe75cc1c41aa685a09d2a3b009fdcf5881c1fdfe513c9216',5),
    ('public.tenant_invoice_rent_segments','ce58f3bb0008331f25290a45649a378a7a16b49e54c94d8b9945dacad7a77acd',4),
    ('public.tenant_invoices','b29026a801aa30a9f8caed6567181f8e68c5403cfaf55640897e17ab06a876b9',7),
    ('app_private.deferred_owner_cash','23c8e65ca7d178d4a5f36ef5f958ea0f30b703eb3a601336f39fce6237e27a0e',1),
    ('app_private.deposit_rent_application_attestations','75ccab9e6739add6ec6e01ac517da83f16b31b1b2f0be9785d5ed16784acd881',3),
    ('app_private.deposit_rent_custody_attestations','df7d95436dc9803bed41e4c41293f556c19ac6a0ea6ff85b6ce9fe8b06919092',3)
  ) AS pins(relation,sha256,trigger_count) LOOP
    v_table:=v_pin.relation::regclass;
    SELECT encode(extensions.digest(coalesce(string_agg(
      trigger.tgname::text||chr(31)||trigger.tgenabled::text||chr(31)||replace(pg_catalog.pg_get_triggerdef(trigger.oid),E'\r\n',E'\n'),
      E'\n' ORDER BY trigger.tgname COLLATE "C"),''),'sha256'),'hex') INTO v_actual
    FROM pg_catalog.pg_trigger trigger WHERE trigger.tgrelid=v_table AND NOT trigger.tgisinternal;
    IF v_actual<>v_pin.sha256 OR (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgrelid=v_table AND NOT tgisinternal)<>v_pin.trigger_count THEN
      RAISE EXCEPTION 'financial_reset_trigger_predecessor_mismatch: %',v_pin.relation;
    END IF;
    IF EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=v_table AND NOT tgisinternal AND
      ((tgtype&2<>0 AND tgname COLLATE "C"<='000_financial_reset_row_action') OR
       (tgtype&2=0 AND NOT tgdeferrable AND tgname COLLATE "C">='zzzz_financial_reset_row_action_complete'))) THEN
      RAISE EXCEPTION 'financial_reset_trigger_order_unproven: %',v_pin.relation;
    END IF;
  END LOOP;
  FOR v_pin IN SELECT * FROM (VALUES
    ('app_private.guard_financial_write_row()','IUD','lifecycle and exact generation'),
    ('app_private.guard_preserved_write_row()','IUD','lifecycle and exact generation'),
    ('app_private.guard_financial_generation_row()','IUD','lifecycle and exact generation'),
    ('app_private.guard_timeline_financial_write_row()','U','retained financial projection'),
    ('app_private.guard_maintenance_cost_fields()','U','retained financial projection'),
    ('app_private.guard_financial_evidence_document()','U','retained financial projection'),
    ('app_private.deposit_rent_immutable()','IUD','immutable or checked historical authority'),
    ('app_private.deposit_rent_linked_event_immutable()','IUD','immutable or checked historical authority'),
    ('app_private.deposit_rent_correction_guard()','IUD','immutable or checked historical authority'),
    ('app_private.guard_legacy_expense_replacement()','IUD','immutable or checked historical authority'),
    ('app_private.guard_owner_balance_append_only()','IUD','immutable or checked historical authority'),
    ('app_private.guard_owner_balance_period_write()','IUD','immutable or checked historical authority'),
    ('app_private.guard_owner_close_write()','IUD','immutable or checked historical authority'),
    ('app_private.guard_owner_statement_write()','IUD','immutable or checked historical authority'),
    ('app_private.guard_tenant_commercial_document_artifact_write()','IUD','immutable or checked historical authority'),
    ('app_private.guard_tenant_invoice_correction_occurrence()','IUD','immutable or checked historical authority'),
    ('app_private.guard_tenant_invoice_rent_segments()','IUD','immutable or checked historical authority'),
    ('app_private.guard_historical_rent_evidence()','IUD','immutable or checked historical authority'),
    ('app_private.guard_owner_opening_balance_entry_immutable()','IUD','immutable or checked historical authority'),
    ('app_private.guard_owner_opening_balance_request_mutation()','IUD','immutable or checked historical authority'),
    ('app_private.enforce_reserved_ledger_projection()','IUD','immutable or checked historical authority'),
    ('app_private.guard_finance_income_creation_contract()','IUD','historical command provenance'),
    ('app_private.enforce_settled_income_material()','IUD','historical command provenance'),
    ('app_private.guard_expense_approval_tenant_income()','IUD','historical command provenance'),
    ('app_private.guard_lease_derived_rent_income()','IUD','historical command provenance'),
    ('app_private.enforce_canonical_income_settlement()','IUD','historical command provenance'),
    ('app_private.guard_expense_approval_tenant_allocation()','IUD','historical command provenance'),
    ('app_private.guard_lease_derived_rent_receipt_allocation()','IUD','historical command provenance'),
    ('app_private.guard_expense_transaction_child_status()','U','cycle staging of immutable authority'),
    ('app_private.guard_owner_statement_completion_before_reopen()','U','cycle staging of immutable authority'),
    ('app_private.guard_owner_month_rent_completeness()','IU','historical close eligibility'),
    ('app_private.prepare_tenant_invoice_line_recognition()','I','preserve archived derived fields'),
    ('app_private.prepare_owner_invoice_line_recognition()','I','preserve archived derived fields'),
    ('app_private.assign_owner_cash_unit()','I','preserve archived derived fields'),
    ('app_private.inherit_lease_deposit_liability_account()','I','preserve archived derived fields'),
    ('app_private.create_management_fee_owner_charge()','I','preserve archived derived fields'),
    ('app_private.guard_owner_balance_period_lifecycle()','IU','preserve archived period state'),
    ('app_private.apply_owner_transfer_remediation()','IU','preserve archived period state'),
    ('app_private.stamp_financial_record()','IU','preserve exact archived audit images'),
    ('app_private.derive_lease_deposit_status_from_events()','IUD','explicitly planned header projection'),
    ('app_private.normalize_unreceived_deposit_status()','IUD','explicitly planned header projection'),
    ('app_private.bind_deposit_rent_custody_attestation()','I','do not repeat historical business side effects'),
    ('app_private.apply_owner_cash_after_tenant_payment()','I','do not repeat historical business side effects'),
    ('app_private.mark_owner_balance_periods_stale_after_opening_entry()','I','do not repeat historical business side effects'),
    ('public.set_updated_at()','U','preserve exact bound update audit image')
  ) AS patches(signature,verbs,reason) LOOP
    v_definition:=replace(pg_catalog.pg_get_functiondef(v_pin.signature::regprocedure),E'\r\n',E'\n');
    v_position:=strpos(v_definition,E'\nBEGIN');
    IF v_position=0 THEN RAISE EXCEPTION 'financial_reset_guard_body_unrecognized: %',v_pin.signature; END IF;
    SELECT string_agg(quote_literal(verb),',') INTO v_verbs
    FROM (VALUES ('I','INSERT'),('U','UPDATE'),('D','DELETE')) AS operation(letter,verb)
    WHERE strpos(v_pin.verbs,letter)>0;
    -- Preserve invoker/current_user semantics. Ordinary invoker triggers never
    -- need EXECUTE on the private verifier. Definer guards run as postgres.
    v_prefix:=format(E'\n  -- Exact bound reset action: %s.\n  IF current_user = ''postgres'' THEN\n    IF TG_OP IN (%s) THEN\n      IF app_private.financial_reset_action_allowed(TG_RELID,TG_OP,\n        CASE WHEN TG_OP=''INSERT'' THEN NULL ELSE to_jsonb(OLD) END,\n        CASE WHEN TG_OP=''DELETE'' THEN NULL ELSE to_jsonb(NEW) END) THEN\n        IF TG_OP=''DELETE'' THEN RETURN OLD; END IF;\n        RETURN NEW;\n      END IF;\n    END IF;\n  END IF;',v_pin.reason,v_verbs);
    v_definition:=overlay(v_definition placing E'\nBEGIN'||v_prefix from v_position for length(E'\nBEGIN'));
    EXECUTE v_definition;
  END LOOP;
  -- Exact restore retains invoice-derived scope and the same month -> owner
  -- advisory locks. Only the incompatible ordinary frozen-write assertion is
  -- replaced by the already entered, full-row-bound action verifier. The
  -- unchanged normal helper remains the path for every ordinary write.
  v_definition:=replace(pg_catalog.pg_get_functiondef('app_private.lock_legacy_owner_cash_effect()'::regprocedure),E'\r\n',E'\n');
  v_anchor:=E'  PERFORM app_private.lock_owner_balance_mutation(\n    NEW.organization_id,\n    NEW.property_id,\n    v_owner_person_id,\n    v_currency,\n    v_effective_date\n  );';
  IF (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 THEN
    RAISE EXCEPTION 'financial_reset_legacy_owner_lock_anchor_changed';
  END IF;
  v_prefix:=$lock_restore$
  IF current_user='postgres' AND TG_OP='INSERT' AND TG_RELID IN (
    'public.owner_charge_cash_allocations'::regclass,
    'public.expense_customer_adjustments'::regclass
  ) THEN
    IF app_private.financial_reset_action_allowed(TG_RELID,TG_OP,NULL,to_jsonb(NEW)) THEN
      IF NEW.organization_id IS NULL OR NEW.property_id IS NULL
        OR v_currency IS NULL OR v_effective_date IS NULL THEN
        RAISE EXCEPTION 'Complete property month scope is required' USING ERRCODE='22004';
      END IF;
      IF NOT EXISTS(SELECT 1 FROM public.properties property
        WHERE property.organization_id=NEW.organization_id AND property.id=NEW.property_id) THEN
        RAISE EXCEPTION 'Property not found' USING ERRCODE='23503';
      END IF;
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        pg_catalog.concat_ws(':','financial_month_v1',NEW.organization_id,
          pg_catalog.date_trunc('month',v_effective_date)::date),0));
      PERFORM app_private.lock_owner_balance_lifecycle(
        NEW.organization_id,NEW.property_id,v_owner_person_id,v_currency);
      RETURN NEW;
    END IF;
  END IF;
$lock_restore$;
  v_definition:=replace(v_definition,v_anchor,v_prefix||v_anchor);
  EXECUTE v_definition;
  FOREACH v_table IN ARRAY ARRAY[
    'public.documents'::regclass,
    'public.notification_outbox'::regclass,
    'public.lease_deposits'::regclass,
    'public.tasks'::regclass,
    'public.timeline_events'::regclass,
    'public.deposit_rent_allocations'::regclass,
    'public.deposit_rent_applications'::regclass,
    'public.deposit_rent_custody_confirmations'::regclass,
    'public.deposit_rent_owner_bridges'::regclass,
    'public.expense_customer_adjustments'::regclass,
    'public.expense_legacy_replacements'::regclass,
    'public.expense_submissions'::regclass,
    'public.expense_transaction_lines'::regclass,
    'public.expense_transaction_scopes'::regclass,
    'public.expense_transactions'::regclass,
    'public.fee_payment_date_corrections'::regclass,
    'public.finance_expense_items'::regclass,
    'public.finance_income_items'::regclass,
    'public.finance_payment_allocations'::regclass,
    'public.finance_payments'::regclass,
    'public.finance_receipt_allocations'::regclass,
    'public.finance_receipts'::regclass,
    'public.financial_month_locks'::regclass,
    'public.historical_rent_settlement_reapplications'::regclass,
    'public.ips_expense_responsibilities'::regclass,
    'public.lease_deposit_events'::regclass,
    'public.ledger_entries'::regclass,
    'public.management_fee_occurrences'::regclass,
    'public.owner_balance_period_components'::regclass,
    'public.owner_balance_periods'::regclass,
    'public.owner_cash_events'::regclass,
    'public.owner_cash_source_consumptions'::regclass,
    'public.owner_charge_cash_allocations'::regclass,
    'public.owner_close_corrections'::regclass,
    'public.owner_close_line_sources'::regclass,
    'public.owner_close_lines'::regclass,
    'public.owner_close_revisions'::regclass,
    'public.owner_close_series'::regclass,
    'public.owner_collection_confirmation_allocations'::regclass,
    'public.owner_collection_confirmations'::regclass,
    'public.owner_component_movements'::regclass,
    'public.owner_component_transfer_instructions'::regclass,
    'public.owner_component_transfer_lines'::regclass,
    'public.owner_event_allocation_sets'::regclass,
    'public.owner_event_owner_allocations'::regclass,
    'public.owner_invoice_lines'::regclass,
    'public.owner_invoices'::regclass,
    'public.owner_opening_balance_entries'::regclass,
    'public.owner_opening_balance_requests'::regclass,
    'public.owner_payment_allocations'::regclass,
    'public.owner_payments'::regclass,
    'public.owner_statement_artifacts'::regclass,
    'public.owner_statement_publications'::regclass,
    'public.petty_cash_entries'::regclass,
    'public.petty_cash_periods'::regclass,
    'public.property_withdrawals'::regclass,
    'public.rent_generation_exceptions'::regclass,
    'public.tenant_commercial_document_artifacts'::regclass,
    'public.tenant_credit_occurrences'::regclass,
    'public.tenant_invoice_corrections'::regclass,
    'public.tenant_invoice_lines'::regclass,
    'public.tenant_invoice_payment_allocations'::regclass,
    'public.tenant_invoice_payments'::regclass,
    'public.tenant_invoice_rent_segments'::regclass,
    'public.tenant_invoices'::regclass,
    'app_private.deferred_owner_cash'::regclass,
    'app_private.deposit_rent_application_attestations'::regclass,
    'app_private.deposit_rent_custody_attestations'::regclass
  ] LOOP
    EXECUTE format('CREATE TRIGGER "000_financial_reset_row_action" BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION app_private.begin_financial_reset_row_action()',v_table);
    EXECUTE format('CREATE TRIGGER zzzz_financial_reset_row_action_complete AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION app_private.finish_financial_reset_row_action()',v_table);
  END LOOP;
END;
$migration$;
-- Source revisions, privileged actor checks, scope/reversal validators and all
-- deferred conservation/evidence/chronology/completeness checks remain active.
COMMIT;
