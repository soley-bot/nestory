# Workspace Arrival Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/workspace` into a dark, cinematic arrival screen with a full-bleed property photograph, a compact right-aligned workspace card, and restrained motion.

**Architecture:** Keep `WorkspacePage` as a server component and preserve its existing authentication and role-derived routing. Render the existing local blue-hour asset with Next.js `Image`, keep the visual palette and scrim in a page-scoped CSS contract, and add CSS-only motion with a reduced-motion override.

**Tech Stack:** Next.js 16.2.9 App Router, React 19, TypeScript, Tailwind CSS 4, global CSS custom properties, Vitest, React server rendering tests.

## Global Constraints

- Keep `/workspace` as an authenticated transition surface with one `h1`, one primary action, no navigation, no metrics, and no second dashboard shell.
- Preserve `requireWorkspaceContext`, `getWorkspaceEntryPath`, `formatRole`, `prefetch={false}`, and the existing admin, manager, and member destinations.
- Use `/marketing/login-property-building-blue-hour.png`; do not add or generate another image asset.
- Use `next/image` with `fill`, `sizes="100vw"`, decorative `alt=""`, and `preload` for the above-the-fold full-viewport image.
- Keep the existing Inter typography and do not add dependencies, client state, timers, or JavaScript-driven animation.
- The approved palette is midnight `#0a1622`, slate `#153047`, warm window amber `#d6a35d`, frost `#f4f7fa`, and restrained blue `#8fb8ff`.
- The background movement lasts approximately 14 seconds; the card enters once; both movements are disabled under `prefers-reduced-motion: reduce`.
- Page-specific colors and animation selectors must not change login, signup, setup, dashboard, or marketing surfaces.
- Before implementation, retain the Next.js 16 image rules from `node_modules/next/dist/docs/01-app/01-getting-started/12-images.md` and `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`: a `fill` image needs a positioned parent, a responsive `fill` image needs `sizes`, decorative imagery uses an empty alt, and Next.js 16 uses `preload` instead of deprecated `priority`.

## File Map

- Modify `src/app/workspace/page.tsx`: render the full-bleed image, directional scrim, bounded responsive layout, and compact workspace card while preserving server-side context and routing.
- Modify `src/app/workspace/page.test.ts`: lock the route destinations, semantic shape, decorative image, and approved page/card hooks.
- Modify `src/app/globals.css`: define the isolated workspace-arrival palette, scrim, image movement, card entrance, and reduced-motion behavior.
- Modify `src/lib/ui/theme-contract.test.ts`: register the workspace palette scope, prove readable foreground/action contrast, and enforce the motion/reduced-motion contract.

---

### Task 1: Build the static cinematic arrival composition

**Files:**
- Modify: `src/app/workspace/page.test.ts:33-49`
- Modify: `src/lib/ui/theme-contract.test.ts:47-56, 277-296`
- Modify: `src/app/workspace/page.tsx:1-40`
- Modify: `src/app/globals.css:123-150`

**Interfaces:**
- Consumes: `requireWorkspaceContext(): Promise<WorkspaceContext>` and `getWorkspaceEntryPath(role): string` exactly as the existing page does.
- Produces: CSS hooks `.workspace-arrival-page`, `.workspace-arrival-image`, `.workspace-arrival-scrim`, and `.workspace-arrival-card` for Task 2 and visual verification.
- Produces: page-scoped custom properties `--workspace-arrival-bg`, `--workspace-arrival-fg`, `--workspace-arrival-muted`, `--workspace-arrival-line`, `--workspace-arrival-card`, `--workspace-arrival-action`, `--workspace-arrival-action-hover`, `--workspace-arrival-action-fg`, `--workspace-arrival-focus`, and `--workspace-arrival-scrim`.

- [ ] **Step 1: Add a failing route-render test for the approved composition**

Append this test inside `describe("WorkspacePage", ...)` in `src/app/workspace/page.test.ts`:

```tsx
it("renders the approved cinematic workspace arrival composition", async () => {
  requireWorkspaceContext.mockResolvedValue({
    organizationName: "Riverside Operations",
    role: "admin",
  });

  const html = renderToStaticMarkup(await WorkspacePage());

  expect(html).toContain("workspace-arrival-page");
  expect(html).toContain("workspace-arrival-image");
  expect(html).toContain("workspace-arrival-scrim");
  expect(html).toContain("workspace-arrival-card");
  expect(html).toContain("login-property-building-blue-hour.png");
  expect(html).toContain('alt=""');
});
```

- [ ] **Step 2: Replace the old semantic-CTA theme test with the page-scoped palette contract**

Add `".workspace-arrival-page"` to `paletteScopes` in `src/lib/ui/theme-contract.test.ts`, then replace the existing `"keeps the workspace CTA semantic and readable in both themes"` test with:

```tsx
it("keeps the workspace arrival palette isolated and readable", () => {
  const workspacePalette = getCustomProperties(
    getBlock(globalsCss, ".workspace-arrival-page"),
  );
  const workspaceSource = getSource("src/app/workspace/page.tsx");

  expect(workspacePalette).toMatchObject({
    "--workspace-arrival-bg": "#0a1622",
    "--workspace-arrival-fg": "#f4f7fa",
    "--workspace-arrival-action": "#8fb8ff",
    "--workspace-arrival-action-fg": "#0a1622",
  });
  expect(
    getContrastRatio(
      workspacePalette["--workspace-arrival-fg"],
      workspacePalette["--workspace-arrival-bg"],
    ),
  ).toBeGreaterThanOrEqual(4.5);
  expect(
    getContrastRatio(
      workspacePalette["--workspace-arrival-action-fg"],
      workspacePalette["--workspace-arrival-action"],
    ),
  ).toBeGreaterThanOrEqual(4.5);
  expect(workspaceSource).toContain(
    "bg-[var(--workspace-arrival-action)]",
  );
  expect(workspaceSource).toContain(
    "text-[var(--workspace-arrival-action-fg)]",
  );
});
```

- [ ] **Step 3: Run the focused tests and confirm they fail for the missing visual contract**

Run:

```powershell
npm run test -- src/app/workspace/page.test.ts src/lib/ui/theme-contract.test.ts
```

Expected: FAIL because the page does not contain the `workspace-arrival-*` hooks and `globals.css` does not define a `.workspace-arrival-page` block.

- [ ] **Step 4: Implement the full-bleed image and responsive right-side card**

Replace `src/app/workspace/page.tsx` with:

```tsx
import Image from "next/image";
import Link from "next/link";

import { requireWorkspaceContext } from "@/lib/auth/context";
import { getWorkspaceEntryPath } from "@/lib/auth/workspace-entry";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const context = await requireWorkspaceContext();
  const entryPath = getWorkspaceEntryPath(context.role);

  return (
    <main className="workspace-arrival-page relative isolate grid min-h-dvh place-items-center overflow-hidden bg-[var(--workspace-arrival-bg)] text-[var(--workspace-arrival-fg)]">
      <div aria-hidden="true" className="absolute inset-0 -z-20">
        <Image
          alt=""
          className="workspace-arrival-image object-cover object-[42%_center] lg:object-center"
          fill
          preload
          sizes="100vw"
          src="/marketing/login-property-building-blue-hour.png"
        />
      </div>
      <div
        aria-hidden="true"
        className="workspace-arrival-scrim absolute inset-0 -z-10"
      />

      <div className="grid w-full max-w-[1180px] place-items-center px-4 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_430px] lg:gap-16 lg:px-14">
        <section
          aria-labelledby="workspace-entry-title"
          className="workspace-arrival-card w-full max-w-md rounded-lg border border-[var(--workspace-arrival-line)] bg-[var(--workspace-arrival-card)] p-6 shadow-[0_24px_80px_rgb(0_0_0/0.42)] backdrop-blur-xl lg:col-start-2"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--workspace-arrival-muted)]">
            {formatRole(context.role)} workspace
          </p>
          <h1
            className="mt-2 text-xl font-semibold tracking-tight"
            id="workspace-entry-title"
          >
            {context.organizationName}
          </h1>
          <Link
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-[var(--workspace-arrival-action)] px-4 text-sm font-semibold text-[var(--workspace-arrival-action-fg)] outline-none transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-[var(--workspace-arrival-action-hover)] focus-visible:ring-2 focus-visible:ring-[var(--workspace-arrival-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--workspace-arrival-bg)]"
            href={entryPath}
            prefetch={false}
          >
            Open workspace
          </Link>
        </section>
      </div>
    </main>
  );
}

function formatRole(role: "admin" | "manager" | "member") {
  return role === "admin" ? "Admin" : role === "manager" ? "Manager" : "Member";
}
```

- [ ] **Step 5: Add the isolated palette and directional scrim**

Insert this block in `src/app/globals.css` immediately before `.auth-photo-page`:

```css
.workspace-arrival-page {
  --workspace-arrival-bg: #0a1622;
  --workspace-arrival-fg: #f4f7fa;
  --workspace-arrival-muted: rgb(244 247 250 / 68%);
  --workspace-arrival-line: rgb(244 247 250 / 16%);
  --workspace-arrival-card: rgb(10 22 34 / 78%);
  --workspace-arrival-action: #8fb8ff;
  --workspace-arrival-action-hover: #a7c8ff;
  --workspace-arrival-action-fg: #0a1622;
  --workspace-arrival-focus: #f4f7fa;
  --workspace-arrival-scrim:
    linear-gradient(90deg, rgb(4 11 19 / 18%) 0%, rgb(4 11 19 / 36%) 48%, rgb(4 11 19 / 80%) 100%),
    linear-gradient(0deg, rgb(4 11 19 / 38%) 0%, rgb(4 11 19 / 8%) 55%, rgb(4 11 19 / 24%) 100%);
}

.workspace-arrival-scrim {
  background: var(--workspace-arrival-scrim);
}
```

The warm amber remains in the source photograph rather than becoming an extra interface accent. This keeps the button blue and the control hierarchy singular.

- [ ] **Step 6: Run the focused tests and lint**

Run:

```powershell
npm run test -- src/app/workspace/page.test.ts src/lib/ui/theme-contract.test.ts
npm run lint -- "src/app/workspace/page.tsx" "src/app/workspace/page.test.ts" "src/lib/ui/theme-contract.test.ts"
```

Expected: both test files PASS; ESLint exits with code 0.

- [ ] **Step 7: Commit the static visual composition**

```powershell
git add src/app/workspace/page.tsx src/app/workspace/page.test.ts src/app/globals.css src/lib/ui/theme-contract.test.ts
git commit -m "feat(ui): add cinematic workspace arrival surface"
```

Expected: one commit containing the photo layout, local palette contract, and focused tests.

---

### Task 2: Add atmospheric motion with a reduced-motion stop

**Files:**
- Modify: `src/lib/ui/theme-contract.test.ts` after the workspace palette test
- Modify: `src/app/globals.css:227-262`

**Interfaces:**
- Consumes: `.workspace-arrival-image` and `.workspace-arrival-card` emitted by Task 1.
- Produces: `@keyframes nestory-workspace-drift`, `@keyframes nestory-workspace-card-in`, and reduced-motion overrides for both visual hooks.

- [ ] **Step 1: Add a failing CSS motion-contract test**

Add this test after the workspace palette test in `src/lib/ui/theme-contract.test.ts`:

```tsx
it("keeps workspace arrival motion atmospheric and motion-safe", () => {
  expect(getBlock(globalsCss, ".workspace-arrival-image")).toMatch(
    /animation:\s*nestory-workspace-drift 14s/,
  );
  expect(getBlock(globalsCss, ".workspace-arrival-card")).toMatch(
    /animation:\s*nestory-workspace-card-in 680ms/,
  );
  expect(globalsCss).toContain("@keyframes nestory-workspace-drift");
  expect(globalsCss).toContain("@keyframes nestory-workspace-card-in");
  expect(globalsCss).toMatch(
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.workspace-arrival-image,[\s\S]*\.workspace-arrival-card[\s\S]*animation:\s*none !important/,
  );
});
```

- [ ] **Step 2: Run the theme contract test and confirm it fails**

Run:

```powershell
npm run test -- src/lib/ui/theme-contract.test.ts
```

Expected: FAIL because neither workspace animation nor its reduced-motion override exists.

- [ ] **Step 3: Add the 14-second image drift and one-time card entrance**

Add these rules in `src/app/globals.css` after the existing auth animation selectors and before the auth keyframes:

```css
.workspace-arrival-image {
  animation: nestory-workspace-drift 14s ease-in-out infinite alternate;
  transform: scale(1.03);
  transform-origin: center;
}

.workspace-arrival-card {
  animation: nestory-workspace-card-in 680ms 90ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes nestory-workspace-drift {
  from {
    transform: scale(1.03) translate3d(0, 0, 0);
  }
  to {
    transform: scale(1.075) translate3d(-0.8%, -0.3%, 0);
  }
}

@keyframes nestory-workspace-card-in {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.99);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
```

- [ ] **Step 4: Add explicit reduced-motion final states**

Keep the existing auth reduced-motion declaration and add this separate block immediately after it:

```css
@media (prefers-reduced-motion: reduce) {
  .workspace-arrival-image,
  .workspace-arrival-card {
    animation: none !important;
    transition-duration: 0.001ms !important;
  }

  .workspace-arrival-image {
    transform: scale(1.03);
  }

  .workspace-arrival-card {
    opacity: 1;
    transform: none;
  }
}
```

- [ ] **Step 5: Run focused tests, lint, and type checking**

Run:

```powershell
npm run test -- src/app/workspace/page.test.ts src/lib/ui/theme-contract.test.ts
npm run lint -- "src/app/workspace/page.tsx" "src/app/workspace/page.test.ts" "src/lib/ui/theme-contract.test.ts"
npx tsc --noEmit
```

Expected: focused tests PASS, ESLint exits with code 0, and TypeScript reports no errors.

- [ ] **Step 6: Commit the motion-safe atmosphere**

```powershell
git add src/app/globals.css src/lib/ui/theme-contract.test.ts
git commit -m "feat(ui): add motion-safe workspace atmosphere"
```

Expected: one commit containing only animation rules, reduced-motion behavior, and the CSS contract test.

---

### Task 3: Verify the complete workspace entry experience

**Files:**
- Verify: `src/app/workspace/page.tsx`
- Verify: `src/app/globals.css`
- Verify: `src/app/workspace/page.test.ts`
- Verify: `src/lib/ui/theme-contract.test.ts`

**Interfaces:**
- Consumes: the completed `/workspace` route and its existing authenticated local fixture.
- Produces: a handoff record of automated and browser checks; no source change is expected.

- [ ] **Step 1: Run the complete narrow automated gate**

```powershell
npm run test -- src/app/workspace/page.test.ts src/lib/ui/theme-contract.test.ts
npm run lint -- "src/app/workspace/page.tsx" "src/app/workspace/page.test.ts" "src/lib/ui/theme-contract.test.ts"
npx tsc --noEmit
npm run build
```

Expected: all commands exit with code 0. The build completes without a deprecated `priority` warning for `WorkspacePage` because the new image uses `preload`.

- [ ] **Step 2: Verify desktop composition in the signed-in browser**

Open `http://localhost:3000/workspace` at the user's annotated 1186x794 viewport and confirm:

- The apartment building and illuminated windows remain legible on the left.
- The compact card occupies the quieter right side without touching the viewport edge.
- Role, organization, and `Open workspace` remain readable at first glance.
- The image moves slowly without drawing attention away from the action.
- Keyboard focus on `Open workspace` is clearly visible.

Expected: no horizontal or vertical document overflow and no console error caused by the route.

- [ ] **Step 3: Verify the mobile crop and card bounds**

Set the browser viewport to 390x844, reload `/workspace`, and confirm:

- The card is centered, fully inside the viewport, and retains edge padding.
- The image crop still includes useful building/window detail.
- The organization name wraps without clipping or pushing the action out of view.
- The action remains reachable by keyboard and touch.

Reset the viewport override after the check.

- [ ] **Step 4: Verify reduced-motion behavior**

Run the browser with reduced-motion emulation, reload `/workspace`, and confirm the image and card render in their final positions without visible drift or entrance translation.

Expected: the page is visually complete immediately and the focused CSS motion test remains green.

- [ ] **Step 5: Record the handoff**

Report:

- Files changed: `src/app/workspace/page.tsx`, `src/app/workspace/page.test.ts`, `src/app/globals.css`, and `src/lib/ui/theme-contract.test.ts`.
- User-visible result: cinematic blue-hour background, right-aligned translucent card, subtle image drift, one-time card entrance, and motion-safe fallback.
- Exact commands run and their results.
- Browser viewports checked and any limitation that could not be verified.
- Branch name and the two implementation commit SHAs.
