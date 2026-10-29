-- Preserve the released branch-visibility decision, but skip its relationship
-- graph when no branch was resolved. Every relationship EXISTS in the original
-- resolver compares a branch UUID with p_branch_id using equality, so NULL
-- makes every EXISTS false (including the explicit relationship in the wrapper).
-- The original result is therefore false, not NULL, for this exact input.
--
-- Provenance: original resolver 20260822041743_branch_scope_domain_enforcement;
-- wrapper/rename 20260822045638_core_domain_mutation_authority. Pin both bodies
-- because the equivalence argument depends on the resolver as well as wrapper.
DO $guard$
DECLARE
  predecessor record;
BEGIN
  FOR predecessor IN SELECT * FROM (VALUES
    ('app_private.person_is_visible_in_branch(uuid,uuid,uuid)',
     '5d27afcb41d61198a281f03f291195a79b1b32950ca6980c3d2baba1cd835d42'),
    ('app_private.person_is_visible_in_branch_without_explicit_relationship(uuid,uuid,uuid)',
     '165ad014bc3aa88c7cb18463ecbe53f03aab2cd6571d5c8991224da7e0631c82')
  ) AS expected(signature, sha256)
  LOOP
    IF pg_catalog.encode(extensions.digest(
      pg_catalog.replace(pg_catalog.pg_get_functiondef(predecessor.signature::regprocedure), E'\r\n', E'\n'),
      'sha256'
    ), 'hex') IS DISTINCT FROM predecessor.sha256 THEN
      RAISE EXCEPTION 'person_visibility_null_branch_predecessor_changed: %', predecessor.signature;
    END IF;
  END LOOP;
END
$guard$;

-- CREATE OR REPLACE retains the existing owner and authenticated-only EXECUTE
-- ACL. This is the existing private SECURITY DEFINER resolver, not a new reader;
-- neither its grants nor the policies that invoke it are changed here.
CREATE OR REPLACE FUNCTION app_private.person_is_visible_in_branch(
  p_organization_id uuid,
  p_person_id uuid,
  p_branch_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT CASE WHEN p_branch_id IS NULL THEN false ELSE
    app_private.person_is_visible_in_branch_without_explicit_relationship($1,$2,$3)
    OR (
      app_private.has_org_permission(
        $1,
        'people.view'::public.organization_permission_key
      )
      AND app_private.current_active_branch_id($1) = $3
      AND EXISTS (
        SELECT 1
        FROM public.people AS person
        JOIN public.person_branch_relationships AS relationship
          ON relationship.organization_id = person.organization_id
         AND relationship.person_id = person.id
         AND relationship.branch_id = $3
         AND relationship.archived_at IS NULL
        WHERE person.organization_id = $1
          AND person.id = $2
      )
    )
  END;
$$;
