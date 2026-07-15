import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(
  resolve(process.cwd(), "src", "app", "globals.css"),
  "utf8",
);

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
    /#[\da-f]{3,8}\b|\b(?:rgb|hsl|oklch|lab|lch|color)\(/gi;

  return Array.from(withoutComments.matchAll(rawColorPattern)).flatMap((match) => {
    const index = match.index ?? 0;
    const containingBlocks = blocks
      .filter((block) => block.start <= index && index < block.end)
      .sort((left, right) => right.start - left.start);
    const block = containingBlocks[0];
    const isPrintPalette = containingBlocks.some(
      (candidate) => candidate.header === "@media print",
    );

    if (!block || paletteScopes.has(block.header) || isPrintPalette) {
      return [];
    }

    const line = withoutComments.slice(0, index).split("\n").length;
    return [`line ${line} (${block.header}): ${match[0]}`];
  });
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
        "--warning": "var(--state-attention)",
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

  it("rejects raw colors outside explicit palette scopes", () => {
    expect(getRawColorViolations(globalsCss)).toEqual([]);
    expect(
      getRawColorViolations(
        `${globalsCss}\n.workspace-route { border-color: #123456; }`,
      ),
    ).toEqual([
      expect.stringContaining("(.workspace-route): #123456"),
    ]);
  });
});
