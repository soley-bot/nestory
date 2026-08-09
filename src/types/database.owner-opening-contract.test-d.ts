import type { Database } from "./database";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Expect<Value extends true> = Value;

type SubmitArgs =
  Database["public"]["Functions"]["submit_owner_opening_balance"]["Args"];
type ReviewArgs =
  Database["public"]["Functions"]["review_owner_opening_balance"]["Args"];

type AmountStaysExactText = Expect<Equal<SubmitArgs["p_amount"], string>>;
type SourceReferenceSupportsDocumentOnly = Expect<
  Equal<SubmitArgs["p_source_reference"], string | null>
>;
type SupportingDocumentSupportsReferenceOnly = Expect<
  Equal<SubmitArgs["p_supporting_document_id"], string | null>
>;
type ResubmissionStartsNullable = Expect<
  Equal<SubmitArgs["p_resubmission_of_request_id"], string | null>
>;
type ReviewReasonMatchesPublicSql = Expect<
  Equal<ReviewArgs["p_review_reason"], string | null>
>;

export type OwnerOpeningRpcTypeContract =
  | AmountStaysExactText
  | SourceReferenceSupportsDocumentOnly
  | SupportingDocumentSupportsReferenceOnly
  | ResubmissionStartsNullable
  | ReviewReasonMatchesPublicSql;
