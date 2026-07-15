import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(
  resolve(process.cwd(), "src", "app", "globals.css"),
  "utf8",
);

const ordinaryTypographySources = [
  "src/components/ui/button.tsx",
  "src/components/ui/input.tsx",
  "src/components/ui/select-control.tsx",
  "src/components/ui/date-picker-field.tsx",
  "src/components/ui/month-picker-field.tsx",
  "src/components/ui/search-combo.tsx",
  "src/components/ui/side-drawer.tsx",
  "src/features/properties/components/property-inspector.tsx",
  "src/features/units/components/unit-inspector.tsx",
  "src/features/people/components/people-inspector.tsx",
  "src/features/leases/components/lease-inspector.tsx",
  "src/features/timeline/components/timeline-inspector.tsx",
] as const;

const focusVisibleControlSources = [
  "src/components/ui/button.tsx",
  "src/components/ui/checkbox-control.tsx",
  "src/components/ui/date-picker-field.tsx",
  "src/components/ui/input.tsx",
  "src/components/ui/month-picker-field.tsx",
  "src/components/ui/select-control.tsx",
  "src/components/ui/textarea.tsx",
] as const;

const rawColorMutations = [
  ["hex", "#123456"],
  ["rgb", "rgb(18 52 86)"],
  ["rgba", "rgba(18, 52, 86, 0.5)"],
  ["hsl", "hsl(160 40% 30%)"],
  ["hsla", "hsla(160, 40%, 30%, 0.5)"],
  ["hwb", "hwb(160 20% 30%)"],
  ["lab", "lab(50% 20 10)"],
  ["lch", "lch(50% 30 160)"],
  ["oklab", "oklab(50% 0.1 0.1)"],
  ["oklch", "oklch(50% 0.1 160)"],
  ["color", "color(display-p3 0.2 0.4 0.3)"],
] as const;

const paletteScopes = new Set([
  ":root",
  '[data-theme="dark"]',
  ".landing-page",
  '[data-theme="dark"] .landing-page',
  ".auth-photo-page",
  '[data-theme="dark"] .auth-photo-page',
]);

type CssBlock = {
  end: number;
  header: string;
  start: number;
};

function getBlock(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([^{}]*)\\}`));

  expect(match, `Expected a CSS block for ${selector}`).not.toBeNull();

  return match?.[1] ?? "";
}

function getCustomProperties(block: string): Record<string, string> {
  return Object.fromEntries(
    Array.from(block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g), (match) => [
      match[1],
      match[2].trim(),
    ]),
  );
}

function getSource(path: string): string {
  return readFileSync(resolve(process.cwd(), ...path.split("/")), "utf8");
}

function getContrastRatio(foreground: string, background: string): number {
  const luminances = [foreground, background]
    .map(getRelativeLuminance)
    .sort((left, right) => right - left);

  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

function getRelativeLuminance(hexColor: string): number {
  expect(hexColor).toMatch(/^#[\da-f]{6}$/i);

  const channels = [1, 3, 5].map((index) =>
    Number.parseInt(hexColor.slice(index, index + 2), 16),
  );
  const linearChannels = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return (
    0.2126 * linearChannels[0] +
    0.7152 * linearChannels[1] +
    0.0722 * linearChannels[2]
  );
}

function parseBlocks(source: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  const stack: CssBlock[] = [];
  let statementStart = 0;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (character === ";") {
      statementStart = index + 1;
      continue;
    }

    if (character === "{") {
      const block: CssBlock = {
        end: source.length,
        header: source.slice(statementStart, index).trim(),
        start: index + 1,
      };

      blocks.push(block);
      stack.push(block);
      statementStart = index + 1;
      continue;
    }

    if (character === "}") {
      const block = stack.pop();

      if (block) {
        block.end = index;
      }

      statementStart = index + 1;
    }
  }

  return blocks;
}

function getRawColorViolations(source: string): string[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = parseBlocks(withoutComments);
  const rawColorPattern =
    /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;

  return Array.from(withoutComments.matchAll(rawColorPattern)).flatMap((match) => {
    const index = match.index ?? 0;
    const containingBlocks = blocks
      .filter((block) => block.start <= index && index < block.end)
      .sort((left, right) => right.start - left.start);
    const block = containingBlocks[0];
    const isPreservedPrintColor =
      block !== undefined &&
      block.header === "body" &&
      containingBlocks.some(
        (candidate) => candidate.header === "@media print",
      ) &&
      match[0].toLowerCase() === "#ffffff" &&
      /^background\s*:\s*#ffffff$/i.test(
        getDeclarationAt(withoutComments, block, index),
      );

    if (!block || paletteScopes.has(block.header) || isPreservedPrintColor) {
      return [];
    }

    const line = withoutComments.slice(0, index).split("\n").length;
    return [`line ${line} (${block.header}): ${match[0]}`];
  });
}

function getDeclarationAt(source: string, block: CssBlock, index: number): string {
  const previousSemicolon = source.lastIndexOf(";", index);
  const declarationStart = Math.max(previousSemicolon + 1, block.start);
  const declarationEnd = source.indexOf(";", index);

  return source.slice(declarationStart, declarationEnd).trim();
}

describe("authenticated theme contract", () => {
  it("defines the approved light and dark semantic tokens", () => {
    const lightTheme = getCustomProperties(getBlock(globalsCss, ":root"));
    const darkTheme = getCustomProperties(
      getBlock(globalsCss, '[data-theme="dark"]'),
    );

    expect(lightTheme).toMatchObject({
      "--surface-canvas": "#f3f5f4",
      "--surface-work": "#fafbf9",
      "--surface-raised": "#ffffff",
      "--state-selected": "#dcebe6",
      "--state-selected-strong": "#356e62",
      "--state-attention": "#b7791f",
      "--state-danger": "#b42318",
      "--focus-ring": "#2f7d71",
      "--record-spine": "var(--state-selected-strong)",
      "--type-body": "14px",
      "--type-table": "13px",
      "--type-table-header": "11px",
    });
    expect(darkTheme).toMatchObject({
      "--surface-canvas": "#0e1413",
      "--surface-work": "#141c1a",
      "--surface-raised": "#1b2522",
      "--state-selected": "#203a34",
      "--state-selected-strong": "#86bfb0",
      "--state-attention": "#d6a85f",
      "--state-danger": "#ff8a80",
      "--focus-ring": "#9fd7c8",
      "--record-spine": "var(--state-selected-strong)",
      "--type-body": "14px",
      "--type-table": "13px",
      "--type-table-header": "11px",
    });
  });

  it("maps legacy aliases without conflating success and selection", () => {
    for (const selector of [":root", '[data-theme="dark"]']) {
      const theme = getCustomProperties(getBlock(globalsCss, selector));

      expect(theme).toMatchObject({
        "--background": "var(--surface-canvas)",
        "--surface": "var(--surface-work)",
        "--surface-muted": "var(--surface-canvas)",
        "--accent": "var(--state-selected-strong)",
        "--accent-strong": "var(--state-selected-strong)",
        "--accent-soft": "var(--state-selected)",
        "--warning": "var(--state-attention-foreground)",
        "--danger": "var(--state-danger)",
        "--success": "var(--state-success)",
      });
      expect(theme["--state-success"]).not.toBe(theme["--state-selected-strong"]);
    }
  });

  it("applies the semantic type scale to body and tables", () => {
    expect(getBlock(globalsCss, "body")).toMatch(
      /font-size:\s*var\(--type-body\)/,
    );
    expect(getBlock(globalsCss, "table")).toMatch(
      /font-size:\s*var\(--type-table\)/,
    );
    expect(getBlock(globalsCss, "thead")).toMatch(
      /font-size:\s*var\(--type-table-header\)/,
    );
  });

  it("lets ordinary shell and shared control copy inherit 14px", () => {
    const appShellSource = getSource("src/components/layout/app-shell.tsx");

    expect(appShellSource).not.toMatch(
      /min-h-screen[^"\n]*text-\[13px\]/,
    );
    expect(appShellSource).toContain("text-[13px]");

    for (const path of ordinaryTypographySources) {
      expect(getSource(path), path).not.toContain("text-[13px]");
    }
  });

  it("uses the focus token across shared, setup, and maintenance controls", () => {
    for (const path of focusVisibleControlSources) {
      const source = getSource(path);

      expect(source, path).toContain("focus-visible:ring-focus-ring");
      expect(source, path).not.toContain("ring-accent-soft");
    }

    const searchComboSource = getSource("src/components/ui/search-combo.tsx");
    expect(searchComboSource).toContain("focus-within:ring-focus-ring");
    expect(searchComboSource).not.toContain("ring-accent-soft");

    const setupSource = getSource(
      "src/features/auth/components/setup-organization-form.tsx",
    );
    expect(setupSource).toContain("focus-within:ring-focus-ring");
    expect(setupSource).toContain("focus-visible:ring-focus-ring");
    expect(setupSource).not.toMatch(/focus-(?:visible|within):ring-accent/);

    const maintenanceWorkSource = getSource(
      "src/features/maintenance/components/maintenance-work-surfaces.tsx",
    );
    expect(maintenanceWorkSource).toContain("focus-visible:ring-focus-ring");
    expect(maintenanceWorkSource).not.toContain("focus-visible:ring-accent");

    const maintenanceBoardSource = getSource(
      "src/features/maintenance/components/maintenance-board-surface.tsx",
    );
    expect(maintenanceBoardSource).not.toContain("ring-accent-soft");
  });

  it("keeps small semantic text at WCAG AA contrast", () => {
    for (const selector of [":root", '[data-theme="dark"]']) {
      const theme = getCustomProperties(getBlock(globalsCss, selector));

      for (const surfaceToken of [
        "--surface-canvas",
        "--surface-work",
        "--surface-raised",
      ]) {
        expect(
          getContrastRatio(
            theme["--foreground-subtle"],
            theme[surfaceToken],
          ),
          `${selector} subtle text contrast on ${surfaceToken}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        getContrastRatio(
          theme["--state-attention-foreground"],
          theme["--surface-work"],
        ),
        `${selector} attention text contrast`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("exports every semantic token through the Tailwind theme", () => {
    expect(getCustomProperties(getBlock(globalsCss, "@theme inline"))).toMatchObject({
      "--color-surface-canvas": "var(--surface-canvas)",
      "--color-surface-work": "var(--surface-work)",
      "--color-surface-raised": "var(--surface-raised)",
      "--color-border-neutral": "var(--border-neutral)",
      "--color-state-selected": "var(--state-selected)",
      "--color-state-selected-strong": "var(--state-selected-strong)",
      "--color-state-attention": "var(--state-attention)",
      "--color-state-attention-foreground":
        "var(--state-attention-foreground)",
      "--color-state-attention-soft": "var(--state-attention-soft)",
      "--color-state-danger": "var(--state-danger)",
      "--color-state-danger-soft": "var(--state-danger-soft)",
      "--color-state-success": "var(--state-success)",
      "--color-state-success-soft": "var(--state-success-soft)",
      "--color-focus-ring": "var(--focus-ring)",
      "--color-record-spine": "var(--record-spine)",
      "--text-body": "var(--type-body)",
      "--text-table": "var(--type-table)",
      "--text-table-header": "var(--type-table-header)",
    });
  });

  it("accepts only the preserved literals in explicit palette scopes", () => {
    expect(getRawColorViolations(globalsCss)).toEqual([]);
  });

  it.each(rawColorMutations)(
    "rejects an authenticated %s color literal",
    (syntax, literal) => {
      const violations = getRawColorViolations(
        `${globalsCss}\n.workspace-${syntax} { color: ${literal}; }`,
      );

      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain(`(.workspace-${syntax})`);
    },
  );

  it("rejects authenticated raw colors nested inside print", () => {
    const violations = getRawColorViolations(`${globalsCss}
@media print {
  .workspace-print { color: rgba(18, 52, 86, 0.5); }
}`);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("(.workspace-print)");
  });

  it("rejects new raw print declarations beside the preserved background", () => {
    const violations = getRawColorViolations(`${globalsCss}
@media print {
  body { color: #000000; }
}`);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("(body)");
  });
});
