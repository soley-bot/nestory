import { globSync as findDirectories } from "tinyglobby";
import { isAbsolute, parse } from "node:path";

// @next/eslint-plugin-next 16.3.8 uses only this API, with onlyDirectories.
// Fail explicitly if a dependency upgrade starts using a broader API.
export function globSync(patterns, options) {
  if (
    typeof patterns !== "string" || !options || options.onlyDirectories !== true ||
    Object.keys(options).some((key) => key !== "onlyDirectories")
  ) {
    throw new TypeError("Review Next.js ESLint glob compatibility before changing its API");
  }
  // Match from the filesystem root explicitly: tinyglobby's absolute-pattern
  // normalization differs on Windows, including when `absolute` is enabled.
  const absolute = isAbsolute(patterns);
  const cwd = absolute ? parse(patterns).root : undefined;
  const pattern = absolute ? patterns.slice(cwd.length) || "." : patterns;
  return findDirectories(pattern, {
    onlyDirectories: true,
    expandDirectories: false,
    absolute,
    cwd,
  }).map((directory) => directory === parse(directory).root ? directory : directory.replace(/\/$/, ""));
}
