BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(7);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',true);

INSERT INTO public.finance_expense_items(id,organization_id,property_id,expense_type,vendor_label,invoice_date,amount,currency,category,status,economic_scope,owner_bill_status,owner_reimbursable_amount,owner_reimbursed_amount,company_loss_amount)
VALUES('f1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','maintenance','Cross-month vendor','2026-06-15',200,'USD','Repair','approved','property_expense','not_billable',0,0,0);

SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.record_finance_payment('00000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001',40,'2026-06-30','PAY-JUNE')$$,'June partial payment records');
SELECT lives_ok($$SELECT public.record_finance_payment('00000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001',50,'2026-07-10','PAY-JULY')$$,'July partial payment records');
SELECT lives_ok($$SELECT public.record_finance_payment('00000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001',25,'2026-07-20','PAY-JULY-2')$$,'second July partial payment records');
SELECT is((SELECT count(*) FROM public.get_finance_payment_drilldown('00000000-0000-0000-0000-000000000001','2026-07-01','2026-08-01',NULL,NULL,'maintenance','paid',NULL,50,0)),2::bigint,'July paid basis returns both July settlements despite approved obligation status');
SELECT ok(EXISTS(SELECT 1 FROM public.get_finance_payment_drilldown('00000000-0000-0000-0000-000000000001','2026-07-01','2026-08-01',NULL,NULL,'maintenance','paid',NULL,50,0) WHERE paid_date='2026-07-10' AND allocation_amount=50 AND total_count=2 AND scoped_amount=75),'drilldown exposes exact partial allocation date amount count and aggregate');
SELECT ok((SELECT total_count=2 AND scoped_amount=75 FROM public.get_finance_payment_drilldown('00000000-0000-0000-0000-000000000001','2026-07-01','2026-08-01',NULL,NULL,'maintenance','paid',NULL,1,0)),'window count and aggregate remain exact when the result page is truncated');
RESET ROLE;
INSERT INTO public.finance_expense_items(organization_id,property_id,expense_type,vendor_label,invoice_date,amount,currency,category,status,economic_scope,owner_bill_status,owner_reimbursable_amount,owner_reimbursed_amount,company_loss_amount)
SELECT '00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','supplies','Scale vendor '||series,'2026-07-01',1,'USD','scale-marker','approved','property_expense','not_billable',0,0,0 FROM generate_series(1,1001) series;
SET LOCAL ROLE authenticated;
SELECT is((SELECT approved_count FROM public.get_finance_expense_scoped_summary('00000000-0000-0000-0000-000000000001','2026-07-01','2026-08-01','2026-07-31',NULL,NULL,'supplies',NULL,'scale-marker')),1001::bigint,'scoped summary remains exact beyond the PostgREST default row cap');
SELECT * FROM finish();
ROLLBACK;
