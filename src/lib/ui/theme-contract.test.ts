import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const globals = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const workspacePage = fs.readFileSync(
  path.join(root, "src/components/layout/workspace-page.tsx"),
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
});
