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
  ".workspace-arrival-page",
  '[data-theme="dark"] .workspace-arrival-page',
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
      "--brand-deep": "#135e4b",
      "--brand-mid": "#4cb572",
      "--brand-light": "#a1d8b5",
      "--brand-mist": "#ccdcdb",
      "--surface-canvas": "#f3f5f4",
      "--surface-work": "#fafbf9",
      "--surface-raised": "#ffffff",
      "--state-selected": "#e2ebe7",
      "--state-selected-strong": "#135e4b",
      "--state-attention": "#b7791f",
      "--state-danger": "#b42318",
      "--state-success": "#237a3e",
      "--focus-ring": "#135e4b",
      "--control-border": "#77817d",
      "--record-spine": "var(--state-selected-strong)",
      "--type-body": "14px",
      "--type-table": "13px",
      "--type-table-header": "11px",
    });
    expect(darkTheme).toMatchObject({
      "--brand-deep": "#135e4b",
      "--brand-mid": "#4cb572",
      "--brand-light": "#a1d8b5",
      "--brand-mist": "#ccdcdb",
      "--surface-canvas": "#111314",
      "--surface-work": "#17191a",
      "--surface-raised": "#202324",
      "--state-selected": "#1b332a",
      "--state-selected-strong": "#a1d8b5",
      "--state-attention": "#d6a85f",
      "--state-danger": "#ff8a80",
      "--state-success": "#86d49b",
      "--focus-ring": "#a1d8b5",
      "--border-neutral": "#343839",
      "--control-border": "#7e8883",
      "--foreground": "#eef0ef",
      "--foreground-muted": "#b8bdba",
      "--foreground-subtle": "#a1a7a4",
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

    const maintenanceWorkSource = getSource(
      "src/features/maintenance/components/maintenance-work-surfaces.tsx",
    );
    expect(maintenanceWorkSource).toContain("focus-visible:ring-focus-ring");
    expect(maintenanceWorkSource).not.toContain("focus-visible:ring-accent");
    expect(maintenanceWorkSource).toContain("bg-accent text-background");
    expect(maintenanceWorkSource).not.toContain("bg-accent text-white");

    const maintenanceBoardSource = getSource(
      "src/features/maintenance/components/maintenance-board-surface.tsx",
    );
    expect(maintenanceBoardSource).not.toContain("ring-accent-soft");

    for (const path of ["src/features/auth/components/login-form.tsx"]) {
      const source = getSource(path);
      expect(source, path).toContain("focus-visible:ring-focus-ring");
      expect(source, path).not.toContain("focus-visible:ring-accent");
    }

    const inputSource = getSource("src/components/ui/input.tsx");
    expect(inputSource).toContain("focus-visible:ring-focus-ring");
    expect(inputSource).not.toContain("focus-visible:ring-accent");
  });

  it("keeps the landing workspace preview on the shared brand palette", () => {
    const previewSource = getSource(
      "src/features/marketing/components/control-preview.tsx",
    );

    expect(previewSource).toContain("--preview-accent: #135e4b");
    expect(previewSource).toContain("--preview-accent: #4cb572");
    expect(previewSource).not.toContain("--preview-blue");
    expect(previewSource).not.toMatch(/#(?:9b4fd0|8fb8ff|1f4e8c)/i);
  });

  it("keeps small semantic text at WCAG AA contrast", () => {
    for (const selector of [":root", '[data-theme="dark"]']) {
      const theme = getCustomProperties(getBlock(globalsCss, selector));

      for (const surfaceToken of [
        "--surface-canvas",
        "--surface-work",
        "--surface-raised",
        "--state-selected",
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

  it("keeps brand, semantic state, focus, and control roles contrast-safe", () => {
    const lightTheme = getCustomProperties(getBlock(globalsCss, ":root"));
    const darkTheme = getCustomProperties(
      getBlock(globalsCss, '[data-theme="dark"]'),
    );

    for (const [label, foreground, background, minimum] of [
      [
        "light on-brand text",
        lightTheme["--brand-on-solid"],
        lightTheme["--brand-deep"],
        4.5,
      ],
      [
        "dark on-brand text",
        darkTheme["--brand-on-solid"],
        darkTheme["--brand-mid"],
        4.5,
      ],
      [
        "light selected text",
        lightTheme["--state-selected-strong"],
        lightTheme["--state-selected"],
        4.5,
      ],
      [
        "dark selected text",
        darkTheme["--state-selected-strong"],
        darkTheme["--state-selected"],
        4.5,
      ],
      [
        "light success text",
        lightTheme["--state-success"],
        lightTheme["--state-success-soft"],
        4.5,
      ],
      [
        "dark success text",
        darkTheme["--state-success"],
        darkTheme["--state-success-soft"],
        4.5,
      ],
      [
        "light focus ring",
        lightTheme["--focus-ring"],
        lightTheme["--surface-raised"],
        3,
      ],
      [
        "dark focus ring",
        darkTheme["--focus-ring"],
        darkTheme["--surface-work"],
        3,
      ],
      [
        "light control border",
        lightTheme["--control-border"],
        lightTheme["--surface-raised"],
        3,
      ],
      [
        "dark control border",
        darkTheme["--control-border"],
        darkTheme["--surface-raised"],
        3,
      ],
    ] as const) {
      expect(
        getContrastRatio(foreground, background),
        label,
      ).toBeGreaterThanOrEqual(minimum);
    }
  });

  it("keeps landing copy readable in both themes", () => {
    for (const selector of [
      ".landing-page",
      '[data-theme="dark"] .landing-page',
    ]) {
      const palette = getCustomProperties(getBlock(globalsCss, selector));

      for (const token of [
        "--landing-muted",
        "--landing-subtle",
        "--landing-accent",
      ]) {
        expect(
          getContrastRatio(palette[token], palette["--landing-bg"]),
          `${selector} ${token}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps the workspace arrival palette isolated and readable", () => {
    const lightWorkspacePalette = getCustomProperties(
      getBlock(globalsCss, ".workspace-arrival-page"),
    );
    const darkWorkspacePalette = getCustomProperties(
      getBlock(globalsCss, '[data-theme="dark"] .workspace-arrival-page'),
    );
    const workspaceSource = getSource("src/app/workspace/page.tsx");

    expect(lightWorkspacePalette).toMatchObject({
      "--workspace-arrival-bg": "#f3f5f4",
      "--workspace-arrival-fg": "#17211f",
      "--workspace-arrival-action": "#17211f",
      "--workspace-arrival-action-fg": "#f3f5f4",
      "--workspace-arrival-card": "rgb(250 251 250 / 94%)",
      "--workspace-arrival-line": "rgb(17 19 20 / 20%)",
      "--workspace-arrival-overlay-bg": "rgb(17 19 20 / 68%)",
      "--workspace-arrival-overlay-fg": "#f8faf9",
    });
    expect(darkWorkspacePalette).toMatchObject({
      "--workspace-arrival-bg": "#111314",
      "--workspace-arrival-fg": "#eef0ef",
      "--workspace-arrival-action": "#202324",
      "--workspace-arrival-action-fg": "#eef0ef",
      "--workspace-arrival-action-border": "#7e8883",
      "--workspace-arrival-focus": "#a1d8b5",
    });
    const authPhotoPalette = getCustomProperties(
      getBlock(globalsCss, ".auth-photo-page"),
    );
    expect(authPhotoPalette).toMatchObject({
      "--auth-page-card-bg": "rgb(250 251 250 / 96%)",
      "--auth-page-input-bg": "#ffffff",
      "--auth-page-input-border": "#77817d",
      "--auth-page-fg": "#f8faf9",
      "--auth-page-muted": "rgb(248 250 249 / 88%)",
      "--auth-page-subtle": "rgb(248 250 249 / 78%)",
      "--auth-page-header-bg": "rgb(17 19 20 / 68%)",
    });
    const darkAuthPhotoPalette = getCustomProperties(
      getBlock(globalsCss, '[data-theme="dark"] .auth-photo-page'),
    );
    expect(darkAuthPhotoPalette).toMatchObject({
      "--auth-page-card-bg": "rgb(22 24 25 / 94%)",
      "--auth-page-input-bg": "#1b1e1f",
      "--auth-page-input-border": "#7e8883",
      "--background": "#111314",
      "--border": "#363b3c",
      "--foreground": "#eef0ef",
      "--surface": "#1b1e1f",
    });
    expect(lightWorkspacePalette["--workspace-arrival-scrim"]).toContain(
      "rgb(11 17 15 / 12%)",
    );
    expect(authPhotoPalette["--auth-page-scrim"]).toContain(
      "rgb(11 17 15 / 78%)",
    );
    expect(authPhotoPalette["--auth-page-scrim"]).not.toContain(
      "rgb(243 245 244",
    );
    expect(
      getContrastRatio(
        lightWorkspacePalette["--workspace-arrival-fg"],
        lightWorkspacePalette["--workspace-arrival-bg"],
      ),
      "light workspace text contrast",
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      getContrastRatio(
        lightWorkspacePalette["--workspace-arrival-action-fg"],
        lightWorkspacePalette["--workspace-arrival-action"],
      ),
      "light workspace action contrast",
    ).toBeGreaterThanOrEqual(4.5);
    for (const foregroundToken of [
      "--workspace-arrival-fg",
      "--workspace-arrival-action-fg",
    ]) {
      expect(
        getContrastRatio(
          darkWorkspacePalette[foregroundToken],
          darkWorkspacePalette["--workspace-arrival-bg"],
        ),
        `${foregroundToken} contrast on dark workspace background`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      getContrastRatio(
        darkWorkspacePalette["--workspace-arrival-action-fg"],
        darkWorkspacePalette["--workspace-arrival-action"],
      ),
      "dark workspace action contrast",
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      getContrastRatio(
        authPhotoPalette["--auth-page-input-border"],
        authPhotoPalette["--auth-page-input-bg"],
      ),
      "light auth input boundary contrast",
    ).toBeGreaterThanOrEqual(3);
    expect(
      getContrastRatio(
        darkAuthPhotoPalette["--auth-page-input-border"],
        darkAuthPhotoPalette["--auth-page-input-bg"],
      ),
      "dark auth input boundary contrast",
    ).toBeGreaterThanOrEqual(3);
    expect(workspaceSource).toContain(
      "shadow-[inset_0_0_0_1px_var(--workspace-arrival-action-border)]",
    );
    expect(workspaceSource).toContain(
      "bg-[var(--workspace-arrival-action)] px-4 text-sm",
    );
    expect(workspaceSource).not.toContain(
      "border border-[var(--workspace-arrival-action-border)]",
    );
    expect(workspaceSource).not.toContain("px-[15px]");
    expect(workspaceSource).toContain(
      "bg-[var(--workspace-arrival-action)]",
    );
    expect(workspaceSource).toContain(
      "text-[var(--workspace-arrival-action-fg)]",
    );
    expect(workspaceSource).not.toContain("hover:-translate-y-0.5");
  });

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

  it("exports every semantic token through the Tailwind theme", () => {
    expect(getCustomProperties(getBlock(globalsCss, "@theme inline"))).toMatchObject({
      "--color-surface-canvas": "var(--surface-canvas)",
      "--color-surface-work": "var(--surface-work)",
      "--color-surface-raised": "var(--surface-raised)",
      "--color-border-neutral": "var(--border-neutral)",
      "--color-control-border": "var(--control-border)",
      "--color-state-selected": "var(--state-selected)",
      "--color-state-selected-strong": "var(--state-selected-strong)",
      "--color-brand-solid": "var(--brand-solid)",
      "--color-brand-on-solid": "var(--brand-on-solid)",
      "--color-brand-text": "var(--brand-text)",
      "--color-brand-soft": "var(--brand-soft)",
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
