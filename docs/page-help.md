# Page help

`PageHeader` and `WorkspacePage` offer optional help without navigating or replacing page content. Known staff routes receive verified guidance automatically. Unknown routes receive no help button. Reporting detail routes deliberately have no default accounting copy.

The reporting owner can supply `help={content}` to `WorkspacePage` or `PageHeader`, or render `<PageHelp content={content} />` in a custom header. Import `PageHelpContent` from `@/components/help/page-help-content`. Pass `help={false}` to suppress automatic guidance.

```tsx
const content: PageHelpContent = {
  title: "Report title",
  purpose: "One sentence describing current behavior.",
  steps: ["First step.", "Second step.", "Third step."],
  example: "A short example verified against the implementation.",
  questions: [{ question: "A common question?", answer: "A concise answer." }],
  terms: [{ term: "An unfamiliar term", meaning: "A plain-language meaning." }],
};

<WorkspacePage title="Report title" help={content}>{results}</WorkspacePage>
```

The shared component owns responsive presentation, keyboard focus, Escape, closing, and optional term disclosures. Route changes reset the panel; query changes retain it. The panel uses the existing Radix Sheet, leaving the page's mounted form, filters, and scroll container intact. All controls work by click, touch, and keyboard. Critical action consequences and errors belong to the existing action UI and must remain visible there.

## Content evidence

| Guidance | Current implementation inspected |
| --- | --- |
| Dashboard | `overview-screen.tsx`, `portfolio-workspace.tsx`, overview property/month pickers |
| Properties and units | Property/unit screens, registers, detail views, `unit-form.tsx` |
| People | `people-module-page.tsx`, `people-screen.tsx`, Settings Access destinations |
| Leases and deposits | Lease screen/detail view, deposit activity form and available activity rules in `lease-detail-screen.tsx` |
| Rent and finance | `finance-operations-screen.tsx`, `finance-workspace-navigation.tsx` |
| Maintenance | `maintenance-screen.tsx` and its filters, record details, and workflow actions |
| Reports directory | `reports-directory.tsx`; accounting-specific report help is reserved for the reporting owner |
| Settings and account | `settings-shell.tsx`, `settings-navigation.ts`, draft action bar, `account-screen.tsx` |
| Imports | `import-preview-screen.tsx`, CSV file size check, dependency readiness checks, ready-row commit behavior |

This change owns the reusable help files and shared header integration. It does not edit report, lease, finance, or accounting workflow implementations. The integration coordinator owns integration and release.
