# Invitation Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make invitation email links establish a verified Supabase session, route recipients directly into explicit Nestory access acceptance, ask only new identities to create a password, and publish branded invitation emails.

**Architecture:** Introduce a route-handler-specific Supabase client whose cookie writes are bound to the exact redirect response returned by Next.js. Keep the existing checked database invitation RPCs, but move new-user password creation before membership acceptance and retain the existing-user magic-link path. Publish the repository-owned invite, magic-link, and recovery templates through the linked Supabase configuration only after code verification.

**Tech Stack:** Next.js 16.2.9 App Router, TypeScript, `@supabase/ssr`, `@supabase/supabase-js`, Supabase Auth/Postgres, Vitest, Vercel.

## Global Constraints

- Supabase Auth remains authoritative for identities, verified email addresses, passwords, sessions, and tokens.
- Nestory remains authoritative for invitation intent, assigned role and scope, staff linkage, explicit acceptance, membership creation, and activity history.
- Administrators never choose, receive, log, or transmit user passwords.
- Public signup and public workspace creation remain disabled.
- Membership is created only after a confirmed email matches a pending, unexpired invitation and the recipient explicitly accepts.
- Redirects remain limited by `safeAuthNextPath`; never redirect to arbitrary URLs.
- Do not expose Auth tokens, passwords, server secrets, or complete provider errors.
- Preserve the existing `email_exists` and legacy `user_already_exists` compatibility behavior.
- Work only in the isolated `codex/fix-admin-secret-bom` worktree until review and merge.

---

## File Map

- Create `src/lib/db/auth-route.ts`: construct a Supabase SSR client for a Route Handler and bind every Auth cookie write to a supplied `NextResponse`.
- Create `src/lib/db/auth-route.test.ts`: prove request cookies are read and response cookies are written.
- Modify `src/app/auth/confirm/route.ts`: verify OTP with the response-bound client and return the same response containing the session cookies.
- Modify `src/app/auth/callback/route.ts`: exchange PKCE codes with the same response-bound client.
- Modify `src/features/auth/auth-entry-routes.test.ts`: cover invite, magic-link, recovery, and PKCE response-cookie propagation.
- Modify `src/features/auth/invitation-acceptance.ts`: set a required new-user password before calling the membership acceptance RPC.
- Modify `src/features/auth/invitation-acceptance.test.ts`: prove password failure leaves membership pending and existing users never update passwords.
- Modify `supabase/templates/invite.html`: branded new-user onboarding email.
- Modify `supabase/templates/magic_link.html`: branded existing-user access email.
- Modify `supabase/templates/recovery.html`: aligned branded recovery email.
- Create `src/features/auth/auth-email-templates.test.ts`: assert required Supabase variables, safe link contracts, and accurate new/existing-user copy.
- Modify `docs/auth-invitation-runbook.md`: document recipient-owned passwords, hosted template publishing, and verification.

---

### Task 1: Bind Supabase Auth cookies to Route Handler responses

**Files:**
- Create: `src/lib/db/auth-route.ts`
- Create: `src/lib/db/auth-route.test.ts`
- Modify: `src/app/auth/confirm/route.ts`
- Modify: `src/app/auth/callback/route.ts`
- Modify: `src/features/auth/auth-entry-routes.test.ts`

**Interfaces:**
- Consumes: `getSupabaseEnv(): { supabaseKey: string; supabaseUrl: string }`, `NextRequest`, and `NextResponse`.
- Produces: `createSupabaseAuthRouteClient(request: NextRequest, response: NextResponse): SupabaseClient<Database>`.

- [ ] **Step 1: Write the failing cookie-adapter test**

Add `src/lib/db/auth-route.test.ts` with a mocked `createServerClient`. Capture
the supplied cookie adapter and prove it reads the request and writes the
response:

```ts
import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { createServerClient } = vi.hoisted(() => ({
  createServerClient: vi.fn((_url, _key, options) => options),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("@/lib/db/env", () => ({
  getSupabaseEnv: () => ({
    supabaseKey: "publishable-key",
    supabaseUrl: "https://example.supabase.co",
  }),
}));

import { createSupabaseAuthRouteClient } from "@/lib/db/auth-route";

describe("createSupabaseAuthRouteClient", () => {
  it("reads request cookies and writes Auth cookies to the returned response", () => {
    const request = new NextRequest("https://app.example.com/auth/confirm", {
      headers: { cookie: "existing=value" },
    });
    const response = NextResponse.redirect(
      new URL("/accept-invite", request.url),
    );

    const client = createSupabaseAuthRouteClient(request, response) as unknown as {
      cookies: {
        getAll(): { name: string; value: string }[];
        setAll(values: { name: string; value: string; options: { httpOnly: boolean } }[]): void;
      };
    };

    expect(client.cookies.getAll()).toEqual(
      expect.arrayContaining([{ name: "existing", value: "value" }]),
    );

    client.cookies.setAll([
      {
        name: "sb-session",
        value: "verified",
        options: { httpOnly: true },
      },
    ]);

    expect(response.cookies.get("sb-session")?.value).toBe("verified");
  });
});
```

- [ ] **Step 2: Run the adapter test and verify RED**

Run:

```powershell
npm run test -- src/lib/db/auth-route.test.ts
```

Expected: FAIL because `@/lib/db/auth-route` does not exist.

- [ ] **Step 3: Implement the response-bound client**

Create `src/lib/db/auth-route.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/db/env";
import type { Database } from "@/types/database";

export function createSupabaseAuthRouteClient(
  request: NextRequest,
  response: NextResponse,
) {
  const { supabaseKey, supabaseUrl } = getSupabaseEnv();

  return createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, options, value }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });
}
```

- [ ] **Step 4: Run the adapter test and verify GREEN**

Run:

```powershell
npm run test -- src/lib/db/auth-route.test.ts
```

Expected: PASS, 1 test.

- [ ] **Step 5: Change callback tests to require response-cookie propagation**

In `src/features/auth/auth-entry-routes.test.ts`, mock
`createSupabaseAuthRouteClient` instead of `createSupabaseServerClient`. Make
`verifyOtp` and `exchangeCodeForSession` set a sentinel cookie on the supplied
response before returning success:

```ts
createSupabaseAuthRouteClient.mockImplementation((_request, response) => ({
  auth: {
    exchangeCodeForSession: async (code: string) => {
      response.cookies.set("sb-session", `code:${code}`);
      return { data: { user: { id: "user-id" } }, error: null };
    },
    verifyOtp: async ({ token_hash, type }: { token_hash: string; type: string }) => {
      response.cookies.set("sb-session", `${type}:${token_hash}`);
      return { data: { user: { id: "user-id" } }, error: null };
    },
  },
}));
```

Add assertions to the successful invite, magic-link, recovery, and PKCE tests:

```ts
expect(response.cookies.get("sb-session")?.value).toBe("invite:valid");
```

Use `magiclink:valid`, `recovery:valid`, and `code:valid` for their respective
cases.

- [ ] **Step 6: Run callback tests and verify RED**

Run:

```powershell
npm run test -- src/features/auth/auth-entry-routes.test.ts
```

Expected: FAIL because the routes still create a separate server client and do
not return the response carrying the sentinel cookie.

- [ ] **Step 7: Return the exact response used by Supabase**

In both Route Handlers:

1. Validate inputs.
2. Compute the safe internal next path.
3. Create `const response = authRedirectResponse(request, nextPath)`.
4. Create the client with `createSupabaseAuthRouteClient(request, response)`.
5. Verify/exchange the Auth token.
6. Return a separate error redirect on failure.
7. Return `response` on success.

For recovery verification, set `RECOVERY_MARKER_COOKIE` on the same `response`
after successful OTP verification.

- [ ] **Step 8: Run focused callback tests**

Run:

```powershell
npm run test -- src/lib/db/auth-route.test.ts src/features/auth/auth-entry-routes.test.ts
```

Expected: PASS with no failed tests.

- [ ] **Step 9: Commit the route-cookie boundary**

```powershell
git add src/lib/db/auth-route.ts src/lib/db/auth-route.test.ts src/app/auth/confirm/route.ts src/app/auth/callback/route.ts src/features/auth/auth-entry-routes.test.ts
git commit -m "fix: persist invitation auth sessions"
```

---

### Task 2: Make password creation precede membership acceptance

**Files:**
- Modify: `src/features/auth/invitation-acceptance.ts`
- Modify: `src/features/auth/invitation-acceptance.test.ts`

**Interfaces:**
- Consumes: `InvitationRow.password_required`, `supabase.auth.updateUser`, and `accept_organization_invitation`.
- Produces: new identities have a password before membership creation; existing identities call only the acceptance RPC.

- [ ] **Step 1: Rewrite the password-failure test for the required invariant**

In `src/features/auth/invitation-acceptance.test.ts`, make
`updateUser` fail and assert the acceptance RPC is never called:

```ts
it("keeps membership pending when a new identity cannot set its password", async () => {
  getUser.mockResolvedValue({
    data: { user: { email: "invitee@example.com" } },
    error: null,
  });
  rpc.mockResolvedValueOnce({
    data: [{ ...invitation, password_required: true }],
    error: null,
  });
  updateUser.mockResolvedValue({ error: new Error("password rejected") });

  const formData = invitationForm({
    password: "correct-horse-battery",
    passwordConfirm: "correct-horse-battery",
  });
  const result = await acceptInvitationAction({}, formData);

  expect(result).toEqual({
    message: "The password could not be created. Try again or request a new invitation.",
    status: "error",
  });
  expect(rpc).toHaveBeenCalledTimes(1);
});
```

Update the success test to assert:

```ts
expect(updateUser.mock.invocationCallOrder[0]).toBeLessThan(
  rpc.mock.invocationCallOrder[1],
);
```

Keep the existing-user test asserting `updateUser` is not called.

- [ ] **Step 2: Run the acceptance tests and verify RED**

Run:

```powershell
npm run test -- src/features/auth/invitation-acceptance.test.ts
```

Expected: FAIL because the current implementation accepts membership before
calling `updateUser`.

- [ ] **Step 3: Move password creation before the acceptance RPC**

In `acceptInvitationAction`, after invitation validation:

```ts
if (newPassword) {
  const { error: passwordError } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (passwordError) {
    return {
      message: "The password could not be created. Try again or request a new invitation.",
      status: "error",
    };
  }
}

const { error: acceptanceError } = await supabase.rpc(
  "accept_organization_invitation",
  { p_invitation_id: parsedInvitationId.data },
);
```

Remove the old post-acceptance `updateUser` block. Preserve the existing
invitation lookup, schema validation, and workspace redirect.

- [ ] **Step 4: Run focused acceptance tests**

Run:

```powershell
npm run test -- src/features/auth/invitation-acceptance.test.ts src/app/accept-invite/page.test.tsx
```

Expected: PASS. The existing-user case must report zero `updateUser` calls.

- [ ] **Step 5: Commit the onboarding ordering**

```powershell
git add src/features/auth/invitation-acceptance.ts src/features/auth/invitation-acceptance.test.ts
git commit -m "fix: secure invited user password onboarding"
```

---

### Task 3: Brand and validate Auth email templates

**Files:**
- Modify: `supabase/templates/invite.html`
- Modify: `supabase/templates/magic_link.html`
- Modify: `supabase/templates/recovery.html`
- Create: `src/features/auth/auth-email-templates.test.ts`
- Modify: `docs/auth-invitation-runbook.md`

**Interfaces:**
- Consumes: Supabase template variables `.RedirectTo` and `.TokenHash`.
- Produces: email-safe links for OTP types `invite`, `magiclink`, and `recovery`.

- [ ] **Step 1: Write template contract tests**

Create `src/features/auth/auth-email-templates.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function template(name: string) {
  return readFileSync(`supabase/templates/${name}.html`, "utf8");
}

describe("Supabase Auth email templates", () => {
  it.each([
    ["invite", "invite"],
    ["magic_link", "magiclink"],
    ["recovery", "recovery"],
  ])("%s preserves the token-hash callback contract", (name, type) => {
    const html = template(name);

    expect(html).toContain("{{ .RedirectTo }}");
    expect(html).toContain("{{ .TokenHash }}");
    expect(html).toContain(`type=${type}`);
    expect(html).not.toContain("{{ .ConfirmationURL }}");
  });

  it("explains user-owned password creation only in a new-user invitation", () => {
    expect(template("invite")).toContain("create your private password");
    expect(template("magic_link")).toContain("Your current password will not change");
    expect(template("magic_link")).not.toContain("create your private password");
  });

  it("states that workspace access still requires explicit acceptance", () => {
    expect(template("invite")).toContain("review and accept");
    expect(template("magic_link")).toContain("review and accept");
  });
});
```

- [ ] **Step 2: Run template tests and verify RED**

Run:

```powershell
npm run test -- src/features/auth/auth-email-templates.test.ts
```

Expected: FAIL because the current copy does not contain the required
new-user/existing-user language.

- [ ] **Step 3: Update all three templates**

Keep inline styles and a maximum content width near 520px. Use these exact
message contracts:

- `invite.html`
  - Heading: `You’re invited to Nestory`
  - Body: `Verify your email, review and accept the assigned workspace access, then create your private password.`
  - Button: `Review invitation`
  - Security note: opening the email does not grant access until acceptance.
- `magic_link.html`
  - Heading: `Review your Nestory workspace invitation`
  - Body: `Use this secure link to sign in, review and accept the assigned workspace access. Your current password will not change.`
  - Button: `Review invitation`
  - Security note: the link is intended only for the named recipient.
- `recovery.html`
  - Heading: `Reset your Nestory password`
  - Body: `Use this secure link to choose a replacement password.`
  - Button: `Reset password`

For every template, retain:

```html
href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=..."
```

Add a small plain-language note telling recipients to request a fresh email if
the button has expired. Do not print the raw token separately.

- [ ] **Step 4: Update the invitation runbook**

In `docs/auth-invitation-runbook.md`, document:

- Admins assign access but never passwords.
- New identities create their password after verified invitation entry.
- Existing identities retain their password and accept through a magic link.
- Hosted templates come from `supabase/templates`.
- `supabase config push` is a production configuration write and requires a
  review of the linked project, target ref, and local `config.toml`.

- [ ] **Step 5: Run template and copy checks**

Run:

```powershell
npm run test -- src/features/auth/auth-email-templates.test.ts
npm run test:ui-copy
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit templates and runbook**

```powershell
git add supabase/templates/invite.html supabase/templates/magic_link.html supabase/templates/recovery.html src/features/auth/auth-email-templates.test.ts docs/auth-invitation-runbook.md
git commit -m "feat: brand invitation onboarding emails"
```

---

### Task 4: Verify, publish hosted templates, and deploy

**Files:**
- Verify only: all files changed in Tasks 1-3.
- Production configuration write: linked Supabase project `pfvmztxktkwyewvxfgot`.
- Deployment target: Vercel project `prj_jQnruwZcvxh1jAA8mJHDpgdSy6CD`.

**Interfaces:**
- Consumes: tested branch commits, linked Supabase CLI project, authenticated Vercel CLI.
- Produces: hosted templates, production deployment, and evidence for both invitation variants.

- [ ] **Step 1: Run the complete local verification gate**

```powershell
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

Expected: all commands exit 0. Record exact test counts and any warnings.

- [ ] **Step 2: Confirm provenance and clean scope**

```powershell
git status --short
git log -5 --oneline
Get-Content supabase/.temp/project-ref
vercel whoami
vercel env ls production --format json
```

Expected:

- Worktree clean.
- Branch is `codex/fix-admin-secret-bom`.
- Supabase ref is `pfvmztxktkwyewvxfgot`.
- Vercel project contains the required Supabase URL, publishable key, and
  server-secret variable without printing their values.

- [ ] **Step 3: Inspect the Supabase configuration write**

Run:

```powershell
npx supabase config push --project-ref pfvmztxktkwyewvxfgot --debug
```

Review the CLI's proposed configuration changes before confirming. Proceed only
if changes are limited to the intended repository-owned Auth configuration and
templates. Abort if it proposes replacing SMTP credentials, site URL,
redirect allowlists, third-party providers, or unrelated rate limits.

Expected: linked Auth configuration accepts the three template files without
unrelated changes.

- [ ] **Step 4: Push the implementation branch**

```powershell
git push origin codex/fix-admin-secret-bom
```

Expected: remote branch points to the verified local HEAD.

- [ ] **Step 5: Deploy the exact verified commit**

```powershell
vercel deploy --prod --yes --project nestory --scope soley-bots-projects
```

Then verify:

```powershell
vercel inspect https://nestory-bay.vercel.app
curl.exe -sS -o NUL -w "PUBLIC_STATUS=%{http_code}`n" https://nestory-bay.vercel.app/
```

Expected: production deployment `Ready`, canonical alias attached, public
status 200.

- [ ] **Step 6: Verify a new-user invitation**

Using a disposable email that does not exist in `auth.users`:

1. Create the invitation from `/users-roles`.
2. Confirm Supabase Auth logs show `POST /invite` success.
3. Open the received link in a clean browser context.
4. Confirm the browser lands on `/accept-invite?invitation=<uuid>` without a
   password-login detour.
5. Confirm organization, role, scope, and staff record are correct.
6. Create a password and accept.
7. Query:

```sql
select invitation.status, invitation.delivery_method, invitation.auth_user_id,
       invitation.accepted_at, member.role, member.branch_id, member.person_id
from public.organization_invitations as invitation
join public.organization_members as member
  on member.organization_id = invitation.organization_id
 and member.user_id = invitation.auth_user_id
where invitation.email = lower('<disposable-new-user-email>')
order by invitation.created_at desc
limit 1;
```

Expected: `accepted`, delivery method `invite`, non-null Auth user and accepted
timestamp, and membership fields matching the invitation.

- [ ] **Step 7: Verify an existing-user invitation**

Use a confirmed Auth user with a known existing password and no membership in
the target organization:

1. Create/resend the Nestory invitation.
2. Confirm Auth logs show `/invite` returning `email_exists`, followed by a
   successful non-creating magic-link request.
3. Open the email in a clean browser context.
4. Confirm direct arrival at `/accept-invite?invitation=<uuid>`.
5. Confirm no password fields render.
6. Accept and confirm membership.
7. Sign out and confirm the original password still signs in.

Expected: delivery method `magic_link`, accepted membership, unchanged password.

- [ ] **Step 8: Inspect production logs and report limitations**

Check Vercel runtime logs for the new deployment and Supabase Auth logs for both
flows. Confirm there are no `ByteString`, token-verification, redirect, or
unexpected-signup errors. If delivery is blocked by the default Supabase mail
service, report custom SMTP as a separate manual credential dependency; do not
weaken the Auth flow or create membership manually.

- [ ] **Step 9: Final commit/push parity check**

```powershell
git status --short
git rev-parse HEAD
git rev-parse origin/codex/fix-admin-secret-bom
```

Expected: clean worktree and identical local/remote SHAs. Report branch, SHA,
Supabase configuration result, Vercel deployment ID, route checks, Auth log
evidence, and any manual SMTP limitation.
