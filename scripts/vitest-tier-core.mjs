import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const ignoredSegments = new Set([
  ".claude",
  ".git",
  ".next",
  ".worktrees",
  "dist",
  "node_modules",
]);

const vitestFilePattern = /(?:^|\/)[^/]+\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/;
const jsdomDirectivePattern = /@vitest-environment\s+jsdom\b/;

function normalize(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isIgnored(path) {
  return normalize(path)
    .split("/")
    .some((segment) => ignoredSegments.has(segment));
}

export async function classifyVitestFiles(paths, readText = readFile) {
  const ignored = [];
  const ui = [];
  const unit = [];

  for (const rawPath of paths) {
    const path = normalize(rawPath);
    if (isIgnored(path)) {
      ignored.push(path);
      continue;
    }
    const source = await readText(path, "utf8");
    (jsdomDirectivePattern.test(source) ? ui : unit).push(path);
  }

  return {
    ignored: ignored.sort(),
    ui: ui.sort(),
    unit: unit.sort(),
  };
}

export async function discoverVitestFiles(projectRoot = process.cwd()) {
  const files = [];

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (ignoredSegments.has(entry.name)) continue;
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      const projectPath = normalize(relative(projectRoot, absolutePath));
      if (vitestFilePattern.test(projectPath)) files.push(projectPath);
    }
  }

  await visit(projectRoot);
  return files.sort();
}
