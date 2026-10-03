/* eslint @typescript-eslint/no-require-imports: "off" -- Next's CommonJS caller must also work without require(esm). */
const { globSync: findDirectories } = require("tinyglobby");
const { isAbsolute, join, parse, resolve } = require("node:path");
const fs = require("node:fs");

// fdir follows directory links but omits the link itself from directory output.
// Its supported filesystem hook lets directory links follow the normal path.
function linksToDirectory(path) {
  try { return fs.statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false; }
  catch (error) {
    if (["ENOENT", "ENOTDIR", "ELOOP"].includes(error.code)) return false;
    throw error;
  }
}

function readDirectoryEntries(directory, options) {
  return fs.readdirSync(directory, options).map((entry) =>
    entry.isSymbolicLink() && linksToDirectory(join(directory, entry.name))
      ? Object.create(entry, { isDirectory: { value: () => true } })
      : entry);
}

function hasEmptyBraceAlternative(pattern) {
  const groups = [];
  let inCharacterClass = false;
  for (const character of pattern) {
    if (character === "[") inCharacterClass = true;
    if (inCharacterClass) {
      if (character === "]") inCharacterClass = false;
      if (groups.length) groups.at(-1).previous = character;
      continue;
    }
    if (character === "{") groups.push({ previous: "{", empty: false });
    else if (character === "}" && groups.length) {
      const group = groups.pop();
      if (group.empty || group.previous === ",") return true;
      if (groups.length) groups.at(-1).previous = "}";
    } else if (groups.length) {
      const group = groups.at(-1);
      group.empty ||= character === "," && (group.previous === "{" || group.previous === ",");
      group.previous = character;
    }
  }
  if (groups.length) {
    throw new TypeError("Next.js ESLint rootDir unmatched opening braces are unsupported; list roots explicitly without braces");
  }
  return false;
}

// @next/eslint-plugin-next 16.3.8 uses only this API, with onlyDirectories.
// Fail explicitly if a dependency upgrade starts using a broader API.
function globSync(patterns, options) {
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
  if (hasEmptyBraceAlternative(patterns) || /(^|[/{,(|])\*\*(?=[/},)|]|$)/.test(patterns)) {
    throw new TypeError("Next.js ESLint rootDir empty brace alternatives and globstars are unsupported; list roots explicitly or use a single-level wildcard");
  }
  if (/(^|\/)\.\.(\/|$)/.test(patterns)) {
    throw new TypeError("Next.js ESLint rootDir parent-directory traversal is unsupported; use absolute roots instead");
  }
  if (/(^|[^!*+?@])\(/.test(patterns)) {
    throw new TypeError("Next.js ESLint rootDir bare parentheses are unsupported; list roots explicitly without grouping");
  }
  let groupDepth = 0;
  for (const character of patterns) {
    if (character === "(") groupDepth += 1;
    else if (character === ")") groupDepth = Math.max(0, groupDepth - 1);
    else if (character === "/" && groupDepth > 0) {
      throw new TypeError("Next.js ESLint rootDir slash-spanning extglobs are unsupported; list roots explicitly");
    }
  }
  if (/\?(?!\()[^/]*\//.test(patterns)) {
    throw new TypeError("Next.js ESLint rootDir question-mark wildcards before path separators are unsupported; list roots explicitly or use a star wildcard");
  }
  // Composing extglobs after a dynamic parent has different zero-segment
  // semantics. Keep this adapter's supported grammar explicit and bounded.
  let dynamicParent = false;
  for (const segment of patterns.split("/")) {
    if (dynamicParent && /[!?*+@]\(/.test(segment)) {
      throw new TypeError("Next.js ESLint rootDir extglobs after dynamic parent segments are unsupported; list roots explicitly");
    }
    if (dynamicParent && /^\*{3,}$/.test(segment)) {
      throw new TypeError("Next.js ESLint rootDir repeated-star segments after dynamic parents are unsupported; list roots explicitly");
    }
    dynamicParent ||= ["*", "?", "[", "{", "("].some((token) => segment.includes(token));
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
  // Negative extglobs can match zero segments in tinyglobby, adding the
  // search root itself. Only an explicitly configured root may select it.
  const searchRoot = resolve(cwd ?? process.cwd());
  if (resolve(patterns) !== searchRoot && directories.some((directory) => resolve(directory) === searchRoot)) {
    throw new TypeError("Next.js ESLint rootDir implicit search-root matches are unsupported; list roots explicitly");
  }
  return directories.map((directory) => directory === parse(directory).root ? directory : directory.replace(/\/$/, ""));
}

module.exports = { globSync };
