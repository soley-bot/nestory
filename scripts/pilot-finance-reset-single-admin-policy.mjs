// Scope discriminator only. This supplies no consent, session or execution authority.
export const PILOT_SINGLE_ADMIN_POLICY='pilot-october-single-admin-v1';
const org='752a87b8-bd04-4a45-9cb8-00687af66e73',project='pfvmztxktkwyewvxfgot';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const fail=()=>{throw Error('pilot_single_admin_policy_invalid')};
export function isPilotSingleAdminZeroPlan(plan){
 if(!plan||!Object.hasOwn(plan,'approval_policy'))return false;
 if(plan.approval_policy!==PILOT_SINGLE_ADMIN_POLICY||plan.version!==4||plan.organization_id!==org||
  plan.effective_date!=='2026-10-01'||!uuid.test(plan.maker_actor_id)||plan.reviewer_actor_id!==null)fail();
 return true;
}
export function assertPilotSingleAdminOperation(plan,operation){
 const single=isPilotSingleAdminZeroPlan(plan);if(!single)return false;
 if(!operation||operation.operationId!==plan.operation_id||operation.organizationId!==org||operation.projectRef!==project||
  operation.cutoff!=='2026-10-01'||operation.issueDate!=='2026-10-01'||operation.sourceGeneration!==0||operation.targetGeneration!==1||
  operation.invoiceDatePolicy!=='empty-books-no-invoices')fail();
 return true;
}
