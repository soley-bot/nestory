# Workspace Arrival Action Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the saturated blue `/workspace` action with a quiet frost-glass control that belongs to the cinematic card and photograph.

**Architecture:** Preserve the existing server-rendered workspace page and action behavior. Change only the page-scoped action tokens and link classes, then lock the result through the existing route-render and theme-contract tests.

**Tech Stack:** Next.js 16.2.9 App Router, React 19, TypeScript, Tailwind CSS 4, global CSS custom properties, Vitest.

## Global Constraints

- Keep the action's size, position, `Open workspace` label, radius, `href`, role-derived destination, and `prefetch={false}` unchanged.
- Preserve the action's original outer auto width and `px-4` inset by rendering the frost border as an inset 1px shadow that does not participate in layout.
- Use a frost-glass surface `rgb(244 247 250 / 8%)`, frost border `rgb(244 247 250 / 18%)`, frost text `#f4f7fa`, and hover surface `rgb(244 247 250 / 14%)`.
- Remove the saturated blue action values `#8fb8ff` and `#a7c8ff` from the workspace-arrival palette.
- Remove the upward hover translation; hover may change only the glass-surface opacity.
- Retain the existing frost focus ring and midnight ring offset.
- Do not change the photograph, scrim, card, typography, motion, auth, routing, data loading, dependencies, or any other route.
- Keep all action colors in the existing `.workspace-arrival-page` palette scope.

## File Map

- Modify `src/app/workspace/page.tsx`: change only the `Open workspace` link's visual utility classes.
- Modify `src/app/globals.css`: replace the blue action tokens with frost-glass action tokens.
- Modify `src/app/workspace/page.test.ts`: prove the control has the approved border/surface treatment and no hover lift.
- Modify `src/lib/ui/theme-contract.test.ts`: enforce exact action tokens, readable frost text, and approved source classes.

---

### Task 1: Integrate the workspace action into the glass card

**Files:**
- Modify: `src/app/workspace/page.test.ts:50-64`
- Modify: `src/lib/ui/theme-contract.test.ts:336-366`
- Modify: `src/app/globals.css:129-132`
- Modify: `src/app/workspace/page.tsx:44-50`

**Interfaces:**
- Consumes: the existing `.workspace-arrival-page` custom-property scope and the `Link` that receives `entryPath`.
- Produces: `--workspace-arrival-action`, `--workspace-arrival-action-hover`, `--workspace-arrival-action-border`, and `--workspace-arrival-action-fg` with the exact approved values.
- Preserves: `href={entryPath}`, `prefetch={false}`, action copy, dimensions, position, radius, and focus-ring tokens.

- [ ] **Step 1: Add failing route-render assertions for the neutral control**

Extend the existing `"renders the approved cinematic workspace arrival composition"` test in `src/app/workspace/page.test.ts` with:

```tsx
expect(html).toContain(
  "shadow-[inset_0_0_0_1px_var(--workspace-arrival-action-border)]",
);
expect(html).toContain("transition-colors");
expect(html).toContain("px-4");
expect(html).not.toContain("px-[15px]");
expect(html).not.toContain(
  "border-[var(--workspace-arrival-action-border)]",
);
expect(html).not.toContain("hover:-translate-y-0.5");
expect(html).not.toContain("transition-[transform,background-color]");
```

- [ ] **Step 2: Update the theme-contract expectations before changing CSS**

Replace the workspace palette/action portion of `"keeps the workspace arrival palette isolated and readable"` in `src/lib/ui/theme-contract.test.ts` so the complete test becomes:

```tsx
it("keeps the workspace arrival palette isolated and readable", () => {
  const workspacePalette = getCustomProperties(
    getBlock(globalsCss, ".workspace-arrival-page"),
  );
  const workspaceSource = getSource("src/app/workspace/page.tsx");

  expect(workspacePalette).toMatchObject({
    "--workspace-arrival-bg": "#0a1622",
    "--workspace-arrival-fg": "#f4f7fa",
    "--workspace-arrival-action": "rgb(244 247 250 / 8%)",
    "--workspace-arrival-action-hover": "rgb(244 247 250 / 14%)",
    "--workspace-arrival-action-border": "rgb(244 247 250 / 18%)",
    "--workspace-arrival-action-fg": "#f4f7fa",
  });
  for (const foregroundToken of [
    "--workspace-arrival-fg",
    "--workspace-arrival-action-fg",
  ]) {
    expect(
      getContrastRatio(
        workspacePalette[foregroundToken],
        workspacePalette["--workspace-arrival-bg"],
      ),
      `${foregroundToken} contrast on workspace arrival background`,
    ).toBeGreaterThanOrEqual(4.5);
  }
  expect(workspaceSource).toContain(
    "shadow-[inset_0_0_0_1px_var(--workspace-arrival-action-border)]",
  );
  expect(workspaceSource).toContain(
    "bg-[var(--workspace-arrival-action)]",
  );
  expect(workspaceSource).toContain(
    "text-[var(--workspace-arrival-action-fg)]",
  );
  expect(workspaceSource).not.toContain("hover:-translate-y-0.5");
});
```

The contrast assertion uses the midnight page background because the action
surface is translucent and is composited over that background/card family.

- [ ] **Step 3: Run the focused tests and confirm the approved treatment is missing**

Run:

```powershell
npm run test -- src/app/workspace/page.test.ts src/lib/ui/theme-contract.test.ts
```

Expected: FAIL because the existing link still lifts on hover, lacks the action-border class, and the palette still contains blue action values.

- [ ] **Step 4: Replace the blue action tokens with frost-glass tokens**

In `.workspace-arrival-page` in `src/app/globals.css`, replace the current action declarations with:

```css
  --workspace-arrival-action: rgb(244 247 250 / 8%);
  --workspace-arrival-action-hover: rgb(244 247 250 / 14%);
  --workspace-arrival-action-border: rgb(244 247 250 / 18%);
  --workspace-arrival-action-fg: #f4f7fa;
  --workspace-arrival-focus: #f4f7fa;
```

Do not change the surrounding page, scrim, or card tokens.

- [ ] **Step 5: Replace only the action's visual classes**

In `src/app/workspace/page.tsx`, replace the `Link` class with:

```tsx
className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-[var(--workspace-arrival-action)] px-4 text-sm font-semibold text-[var(--workspace-arrival-action-fg)] shadow-[inset_0_0_0_1px_var(--workspace-arrival-action-border)] outline-none transition-colors duration-200 hover:bg-[var(--workspace-arrival-action-hover)] focus-visible:ring-2 focus-visible:ring-[var(--workspace-arrival-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--workspace-arrival-bg)]"
```

Leave `href`, `prefetch`, and children untouched.

The inset stroke is the user's approved exact-size resolution. A layout border
was rejected after live verification showed browser-scale rounding could still
change the outer width.

- [ ] **Step 6: Run focused tests, lint, and type checking**

Run:

```powershell
npm run test -- src/app/workspace/page.test.ts src/lib/ui/theme-contract.test.ts
npm run lint -- "src/app/workspace/page.tsx" "src/app/workspace/page.test.ts" "src/lib/ui/theme-contract.test.ts"
npx tsc --noEmit
```

Expected: 2 test files PASS, ESLint exits with code 0, and TypeScript reports no errors.

- [ ] **Step 7: Commit the refinement**

```powershell
git add src/app/workspace/page.tsx src/app/workspace/page.test.ts src/app/globals.css src/lib/ui/theme-contract.test.ts
git commit -m "fix(ui): integrate workspace arrival action"
```

Expected: one commit containing only the link treatment, local tokens, and focused contracts.

---

### Task 2: Verify the refined action in the live arrival screen

**Files:**
- Verify: `src/app/workspace/page.tsx`
- Verify: `src/app/globals.css`
- Verify: `src/app/workspace/page.test.ts`
- Verify: `src/lib/ui/theme-contract.test.ts`

**Interfaces:**
- Consumes: the completed `/workspace` page and the existing signed-in local browser session.
- Produces: browser evidence for normal, hover, focus, desktop, and mobile action states; no source change is expected.

- [ ] **Step 1: Reload the signed-in desktop page at 1186x794**

Open or reload `http://localhost:3000/workspace` at `1186x794` and confirm:

- The action retains its existing size, location, radius, and label.
- Computed background is `rgba(244, 247, 250, 0.08)`.
- Computed box shadow includes an inset 1px stroke using
  `rgba(244, 247, 250, 0.18)`.
- Computed text is `rgb(244, 247, 250)`.
- Computed transform is `none`.
- The card and photograph remain unchanged and the document does not overflow.

- [ ] **Step 2: Verify hover and focus states**

Use the browser's supported hover/pseudo-state inspection and confirm:

- Hover background becomes `rgba(244, 247, 250, 0.14)`.
- Hover does not translate or scale the action.
- The focus-visible state retains the existing frost ring and midnight offset.

Clear any forced pseudo state immediately after measurement.

- [ ] **Step 3: Verify mobile bounds at 390x844**

Set the viewport to `390x844`, reload `/workspace`, and confirm the unchanged action remains completely inside the card and viewport with no document overflow.

Reset the viewport to the user's normal size and leave `/workspace` open for continued annotation.

- [ ] **Step 4: Record the handoff**

Report the changed files, commit SHA, exact automated commands/results, desktop and mobile computed-state evidence, and any capture limitation. Do not claim a screenshot exists if the in-app browser capture backend times out.
