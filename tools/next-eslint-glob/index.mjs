import { globSync as findDirectories } from "tinyglobby";
import { isAbsolute, join, parse } from "node:path";
import { readdirSync, statSync } from "node:fs";

// fdir follows directory links but omits the link itself from directory output.
// Its supported filesystem hook lets directory links follow the normal path.
function readDirectoryEntries(directory, options) {
  return readdirSync(directory, options).map((entry) =>
    entry.isSymbolicLink() && statSync(join(directory, entry.name), { throwIfNoEntry: false })?.isDirectory()
      ? Object.create(entry, { isDirectory: { value: () => true } })
      : entry);
}

// @next/eslint-plugin-next 16.3.8 uses only this API, with onlyDirectories.
// Fail explicitly if a dependency upgrade starts using a broader API.
export function globSync(patterns, options) {
  if (
    typeof patterns !== "string" || !options || options.onlyDirectories !== true ||
    Object.keys(options).some((key) => key !== "onlyDirectories")
  ) {
    throw new TypeError("Review Next.js ESLint glob compatibility before changing its API");
  }
  // Picomatch does not preserve fast-glob's padded/stepped brace ranges.
  // Fail lint instead of silently omitting application roots from its rules.
  if (/\{[^{}]*\.\.[^{}]*\}/.test(patterns)) {
    throw new TypeError("Next.js ESLint rootDir brace ranges are unsupported; list roots explicitly or use a wildcard");
  }
  if (/\{,|,,|,\}/.test(patterns) || patterns.includes("**")) {
    throw new TypeError("Next.js ESLint rootDir empty brace alternatives and globstars are unsupported; list roots explicitly or use a single-level wildcard");
  }
  if (/(^|\/)\.\.(\/|$)/.test(patterns)) {
    throw new TypeError("Next.js ESLint rootDir parent-directory traversal is unsupported; use absolute roots instead");
  }
  if (/(^|[^!*+?@])\(/.test(patterns)) {
    throw new TypeError("Next.js ESLint rootDir bare parentheses are unsupported; list roots explicitly without grouping");
  }
  // Match from the filesystem root explicitly: tinyglobby's absolute-pattern
  // normalization differs on Windows, including when `absolute` is enabled.
  const absolute = isAbsolute(patterns);
  const cwd = absolute ? parse(patterns).root : undefined;
  const pattern = absolute ? patterns.slice(cwd.length) || "." : patterns;
  let readError;
  const directories = findDirectories(pattern, {
    onlyDirectories: true,
    expandDirectories: false,
    absolute,
    cwd,
    fs: { readdirSync(directory, readOptions) {
      try { return readDirectoryEntries(directory, readOptions); }
      catch (error) {
        // fdir suppresses read errors. Preserve missing-path behavior but do
        // not turn permission or I/O failures into an apparently empty root.
        if (error.code !== "ENOENT" && error.code !== "ENOTDIR") readError ??= error;
        throw error;
      }
    } },
  });
  if (readError) throw readError;
  return directories.map((directory) => directory === parse(directory).root ? directory : directory.replace(/\/$/, ""));
}
