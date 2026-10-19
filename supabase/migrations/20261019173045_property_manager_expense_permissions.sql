-- New opt-in capabilities only: no existing role, membership, or access state changes.
-- Keep enum creation in its own committed migration before referencing values.
ALTER TYPE public.organization_permission_key ADD VALUE IF NOT EXISTS 'finance.post_expenses';
ALTER TYPE public.organization_permission_key ADD VALUE IF NOT EXISTS 'finance.correct_expenses';
