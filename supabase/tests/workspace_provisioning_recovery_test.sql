BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(7);

CREATE TEMP TABLE workspace_provisioning_test_state (
  invitation_id uuid,
  organization_id uuid
) ON COMMIT DROP;

SELECT set_config('request.jwt.claim.role', 'service_role', true);

INSERT INTO workspace_provisioning_test_state (organization_id, invitation_id)
SELECT organization_id, invitation_id
FROM public.provision_client_workspace(
  'Recovery Test Company',
  'recovery-test-company',
  'first-admin@example.com'
);

SELECT is(
  (
    SELECT status
    FROM public.organization_invitations
    WHERE id = (SELECT invitation_id FROM workspace_provisioning_test_state)
  ),
  'pending',
  'initial provisioning creates a pending first-admin invitation'
);

SELECT public.mark_organization_invitation_delivery_failed(
  (SELECT invitation_id FROM workspace_provisioning_test_state),
  'SMTP temporarily unavailable'
);

SELECT is(
  (
    SELECT status
    FROM public.organization_invitations
    WHERE id = (SELECT invitation_id FROM workspace_provisioning_test_state)
  ),
  'send_failed',
  'a failed first delivery records a recoverable invitation state'
);

SELECT is(
  (
    SELECT invitation_id
    FROM public.provision_client_workspace(
      'Recovery Test Company',
      'recovery-test-company',
      'first-admin@example.com'
    )
  ),
  (SELECT invitation_id FROM workspace_provisioning_test_state),
  'rerunning provisioning resumes the same first-admin invitation'
);

SELECT is(
  (
    SELECT organization_id
    FROM public.provision_client_workspace(
      'Recovery Test Company',
      'recovery-test-company',
      'first-admin@example.com'
    )
  ),
  (SELECT organization_id FROM workspace_provisioning_test_state),
  'rerunning provisioning reuses the same workspace'
);

SELECT is(
  (
    SELECT status
    FROM public.organization_invitations
    WHERE id = (SELECT invitation_id FROM workspace_provisioning_test_state)
  ),
  'pending',
  'resuming provisioning returns the invitation to pending before redelivery'
);

SELECT ok(
  (
    SELECT expires_at > now() + interval '59 minutes'
    FROM public.organization_invitations
    WHERE id = (SELECT invitation_id FROM workspace_provisioning_test_state)
  ),
  'resuming provisioning refreshes the invitation expiry'
);

SELECT throws_ok(
  $$SELECT * FROM public.provision_client_workspace(
    'Recovery Test Company',
    'recovery-test-company',
    'different-admin@example.com'
  )$$,
  '55000',
  'Existing workspace provisioning can only resume for its original administrator',
  'a different email cannot claim an unactivated workspace'
);

SELECT * FROM finish();
ROLLBACK;
