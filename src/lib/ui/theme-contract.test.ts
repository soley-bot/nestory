import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const globals = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const workspacePage = fs.readFileSync(
  path.join(root, "src/components/layout/workspace-page.tsx"),
  "utf8",
);
const organizationTheme = fs.readFileSync(
  path.join(root, "src/lib/theme/organization-theme.ts"),
  "utf8",
);
const tablePrimitive = fs.readFileSync(
  path.join(root, "src/components/ui/table.tsx"),
  "utf8",
);
const interactiveTable = fs.readFileSync(
  path.join(root, "src/components/data/interactive-table.tsx"),
  "utf8",
);
const components = JSON.parse(
  fs.readFileSync(path.join(root, "components.json"), "utf8"),
) as { style?: string; tailwind?: { cssVariables?: boolean } };

describe("Shadcn theme contract", () => {
  it("keeps the default semantic surface tokens in both themes", () => {
    for (const token of [
      "--background",
      "--foreground",
      "--card",
      "--primary",
      "--muted",
      "--border",
      "--input",
      "--ring",
    ]) {
      expect(globals).toContain(token);
    }

    expect(globals).toContain(":root");
    expect(globals).toContain(".dark");
  });

  it("does not expose retired presentation aliases", () => {
    for (const token of [
      "--surface-canvas",
      "--surface-work",
      "--surface-raised",
      "--surface-muted",
      "--foreground-muted",
      "--foreground-subtle",
      "--border-neutral",
      "--control-border",
      "--focus-ring",
      "--accent-strong",
      "--accent-soft",
      "--brand-solid",
      "--brand-on-solid",
      "--brand-text",
      "--brand-soft",
      "--state-selected",
    ]) {
      expect(globals).not.toContain(token);
    }
  });

  it("uses the configured Shadcn preset and CSS variables", () => {
    expect(components.style).toBe("radix-nova");
    expect(components.tailwind?.cssVariables).toBe(true);
  });

  it("keeps Geist as a literal Tailwind font family", () => {
    expect(globals).toContain('"Geist"');
    expect(globals).not.toContain("--font-sans: var(--font-sans)");
  });

  it("uses one graphite dark surface hierarchy", () => {
    expect(globals).toContain("--background: #101313");
    expect(globals).toContain("--card: #151919");
    expect(globals).toContain("--popover: #1b2020");
    expect(globals).toContain("--muted: #1b2020");
    expect(globals).toContain("--border: #343b3a");
    expect(globals).toContain("--foreground: #f1f4f2");
    expect(globals).toContain("--muted-foreground: #aeb7b3");
    expect(workspacePage).toContain("bg-background");
    expect(workspacePage).not.toContain("bg-muted/30");
  });

  it("keeps organization accents separate from semantic state colors", () => {
    expect(organizationTheme).toContain('"--org-accent-seed"');
    for (const token of [
      "--state-success",
      "--state-attention",
      "--state-danger",
    ]) {
      const declarations = globals
        .split("\n")
        .filter((line) => line.includes(`${token}:`));
      expect(declarations.length).toBeGreaterThan(0);
      expect(declarations.every((line) => !line.includes("--org-accent"))).toBe(
        true,
      );
    }
  });

  it("applies organization accents to table hierarchy without recoloring table text", () => {
    for (const token of [
      '"--table-header-bg"',
      '"--table-row-hover"',
      '"--table-row-selected"',
      '"--table-row-selected-indicator"',
    ]) {
      expect(organizationTheme).toContain(token);
    }

    expect(tablePrimitive).toContain("bg-[var(--table-header-bg)]");
    expect(tablePrimitive).toContain("hover:bg-[var(--table-row-hover)]");
    expect(tablePrimitive).toContain("data-[state=selected]:bg-[var(--table-row-selected)]");
    expect(interactiveTable).toContain("hover:bg-[var(--table-row-hover)]");
    expect(interactiveTable).toContain("bg-[var(--table-row-selected)]");
    expect(interactiveTable).toContain("var(--table-row-selected-indicator)");

    for (const source of readTypeScriptSources(path.join(root, "src/features"))) {
      for (const match of source.matchAll(/<thead\b[^>]*>/g)) {
        expect(match[0]).toContain("bg-[var(--table-header-bg)]");
      }
    }
  });
});

function readTypeScriptSources(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return readTypeScriptSources(target);
    return entry.name.endsWith(".tsx") ? [fs.readFileSync(target, "utf8")] : [];
  });
}
