-- User-approved one-operation execution window. This changes no existing
-- authorization, native binding, consumed-context check or transaction guard.
BEGIN;

DO $pilot_execute_window$
DECLARE d text; a text; b text; constraint_name text;
BEGIN
 SELECT conname INTO STRICT constraint_name FROM pg_constraint
 WHERE conrelid='app_private.financial_reset_actor_authorizations'::regclass AND contype='c'
 AND pg_get_expr(conbin,conrelid)=$old$((expires_at > issued_at) AND (expires_at <= (issued_at + '00:05:00'::interval)) AND (expires_at <= credential_expires_at))$old$;
 EXECUTE format('ALTER TABLE app_private.financial_reset_actor_authorizations DROP CONSTRAINT %I',constraint_name);
 -- Row-level upper bound only. Issuance additionally requires the exact
 -- existing reservation binding below; API roles still cannot insert rows.
 ALTER TABLE app_private.financial_reset_actor_authorizations
 ADD CONSTRAINT financial_reset_actor_authorizations_lifetime_check CHECK(
  expires_at>issued_at AND expires_at<=credential_expires_at AND
  expires_at<=issued_at+CASE WHEN organization_id='752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid
   AND operation_id='7c70e27f-ba37-48cc-8f93-d32badcb2fb7'::uuid AND action='execute'
   AND NOT (binding ? 'recovery') AND binding->'continuation_semantic'->'version'='4'::jsonb
   AND binding->>'invoice_date_policy'='empty-books-no-invoices'
  THEN interval '15 minutes' ELSE interval '5 minutes' END);

 d:=replace(pg_get_functiondef('public.authorize_financial_reset_hosted_action(jsonb,text)'::regprocedure),E'\r\n',E'\n');
 a:=$old$ SELECT least(v_now+interval '5 minutes',v_credential_expiry,s.not_after) INTO STRICT v_expiry FROM auth.sessions s WHERE s.id=v_session AND s.user_id=v_actor;$old$;
 b:=$new$ SELECT least(v_now+CASE WHEN v_org='752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid
  AND p_binding->>'operation_id'='7c70e27f-ba37-48cc-8f93-d32badcb2fb7' AND p_action='execute'
  AND NOT (p_binding ? 'recovery') AND p_binding->'continuation_semantic'->'version'='4'::jsonb
  AND p_binding->>'invoice_date_policy'='empty-books-no-invoices'
  AND EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_reservations r
   WHERE r.operation_id='7c70e27f-ba37-48cc-8f93-d32badcb2fb7'::uuid AND r.organization_id=v_org
   AND r.binding=p_binding AND r.binding_sha256=app_private.financial_reset_hash(p_binding))
  THEN interval '15 minutes' ELSE interval '5 minutes' END,v_credential_expiry,s.not_after)
 INTO STRICT v_expiry FROM auth.sessions s WHERE s.id=v_session AND s.user_id=v_actor;$new$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN
  RAISE EXCEPTION 'financial_reset_pilot_expiry_anchor_changed';
 END IF;
 EXECUTE replace(d,a,b);
END;
$pilot_execute_window$;

COMMIT;
