# Settings Clarity And Company Branding Design

**Date:** 2026-08-15  
**Status:** Approved direction; implementation review pending  
**Audience:** Nestory workspace administrators

## Objective

Make Appearance, Teams, and Rent policy understandable without explanatory clutter, make Settings visibly respect the organization accent, and add a secure company-logo asset that can be reused by reports later.

## Chosen Approach

Use a private `organization-assets` Supabase Storage bucket and store the active logo object's path on the organization. Upload a new versioned object for every replacement rather than overwriting a stable path. Only an active Super Admin may create, select, replace, or remove the organization logo.

This is preferred over:

- a public bucket, which would disclose customer branding assets without a current public-product requirement;
- storing image bytes in Postgres, which would mix file delivery with operational relational data;
- reusing `nestory-documents`, whose access rules and retention semantics belong to records rather than organization identity.

## Visual Direction

- **Visual thesis:** quiet operational surfaces where the selected company accent guides focus and action without tinting every panel.
- **Content plan:** controls first, one compact live sample, consequential guidance beside its action, and history only where it supports audit.
- **Interaction thesis:** accent choices update the compact sample immediately; save feedback remains brief; Replace and Remove expose confirmation only when an existing logo is affected.

## Appearance And Semantic Theme

The selected organization accent must drive semantic UI tokens across Settings: primary actions, links, focus rings, selected navigation, and active indicators. Settings navigation must stop using hard-coded foreground/background colors for its active state.

The Appearance editor remains a draft until saved. Its compact sample demonstrates selected navigation, a primary action, a link, and focus treatment without a tall empty preview panel. The current user's light/dark preference remains personal and is not overridden by changing the organization default.

Copy is reduced to labels and one short clarification where needed. The page will not repeat that the accent is shared in the header, field help, and preview.

## Company Logo

The Appearance page gains a `Company logo` row with:

- the current logo or a neutral company initial placeholder;
- `Upload logo` when empty;
- `Replace` and `Remove` when present;
- concise requirements shown once: PNG or JPEG, maximum 2 MB, square or horizontal artwork recommended.

The server validates the file independently of browser metadata:

- allowed extension and MIME type are PNG and JPEG only;
- file signature must match the claimed type;
- file size must be greater than zero and no more than 2 MB;
- dimensions must be at least 128 by 128 pixels and no more than 4096 by 4096 pixels;
- the original filename is never used as the object key.

The object path is generated as `<organization-id>/logos/<uuid>.<ext>`. A new path is used for each replacement to avoid stale CDN content. The previous object is removed only after the new object and organization pointer are saved successfully. A failed cleanup leaves an auditable orphan for later cleanup rather than breaking the active logo.

`organizations.logo_storage_path` is nullable. The stored value is a path, not a signed URL. UI reads use short-lived signed URLs. Server-side report generation later downloads the object by path with the caller's organization authorization; report rendering is not changed in this pass.

## Storage And Authorization

The private `organization-assets` bucket accepts only `image/png` and `image/jpeg` and has a 2 MB bucket-level limit.

Storage policies derive the organization ID from the first path segment and require active organization membership for reads. Insert and delete require active Super Admin authority for the same organization. Updates are unnecessary because objects are immutable and replacement uses a new path.

The checked organization-branding mutation:

- resolves the authenticated actor server-side;
- requires active Super Admin membership in the target organization;
- validates that the selected object exists under the organization's path;
- updates only `logo_storage_path`;
- writes an organization activity-log entry containing old and new paths;
- exposes no service-role credential to the browser.

## Rent Policy Clarity

The draft form is reorganized into three compact groups:

1. `Billing schedule` — supported frequencies, timezone, and due-day source.
2. `Lease changes` — start, end, notice, and mid-period charging behavior.
3. `Exceptions` — concessions, rent-free periods, and waivers.

Saving the draft is labelled `Save draft` and explicitly has no lease impact. Approval is separated visually and renamed `Approve and apply policy`. Beside that action, the UI states only the consequences that matter:

- the policy becomes active from its effective date;
- approval may immediately create missing current-month rent for active and notice-given leases;
- the approved version cannot be edited, so corrections require a later version.

Approval requires an explicit confirmation that repeats these effects. Internal phrases such as `immutable version`, `explicit rules`, and repeated `Resolve this rule` labels are replaced with plain choices and one unresolved-count summary.

## Teams And People

Teams currently provide a name, optional branch scope, and optional manager selected from People. They do not contain member assignments and do not change workspace access.

The Teams page states this relationship once in a compact context row and links to `/people`. Empty-state copy says `Create a team to name an operating group and choose its manager.` Existing team rows gain visible `Scope` and `Manager` labels or column headings. No team-membership table or People assignment workflow is added in this pass.

## Copy Reduction Rules

- Remove helper text that repeats the heading or control label.
- Keep text only when it explains scope, permissions, irreversible effects, or the absence of an expected relationship.
- Prefer specific action labels such as `Save draft`, `Approve and apply policy`, `Upload logo`, and `Open People`.
- Avoid internal implementation language in customer-facing copy.

## Error Handling

- Invalid logo files remain local and produce one field-level error.
- Upload failure does not change the active logo.
- Database-pointer failure removes the newly uploaded object when safe; otherwise it records a cleanup failure without selecting the object.
- Signed-URL failure shows the placeholder and a retryable logo error without blocking the rest of Appearance.
- Rent-policy approval errors remain beside the approval action and preserve the draft.

## Test Strategy

Implementation follows test-first development.

- Component tests cover semantic Settings selection, compact Appearance preview, reduced copy, logo empty/present/error states, Teams-to-People explanation, and rent-policy impact/confirmation copy.
- Action tests cover logo type, signature, size, dimensions, generated paths, cross-organization rejection, replacement ordering, and cleanup failure.
- pgTAP tests cover the new column, bucket configuration, same-organization read policy, Super Admin write/delete policy, checked pointer update, grants, and activity logging.
- Existing Settings, theme-runtime, organization, People, lease, and rent-policy suites remain green.
- Browser verification covers Appearance, Teams, and Rent policy at desktop and mobile widths in light and dark mode with no horizontal overflow or console errors.

## Delivery Boundaries

This pass stores and displays the company logo in Settings and provides a reusable server-side loader. It does not place the logo into reports, emails, login pages, the Nestory product mark, or public pages. It does not add team membership, change permissions, alter lease terms, or approve a rent policy during verification.

Implementation remains isolated in `D:\nestory\.worktrees\settings-redesign` on `codex/settings-redesign`. No merge, hosted migration, or deployment is included without separate authorization.
