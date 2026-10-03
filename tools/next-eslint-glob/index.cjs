/* eslint @typescript-eslint/no-require-imports: "off" -- Next's CommonJS caller must also work without require(esm). */
const fs = require("node:fs");

// The pinned Next plugin uses only this API. This adapter accepts explicit
// directory paths, not glob expressions; Next handles arrays of paths itself.
function globSync(directory, options) {
  if (
    typeof directory !== "string" || !options || options.onlyDirectories !== true ||
    Object.keys(options).some((key) => key !== "onlyDirectories")
  ) {
    throw new TypeError("Review Next.js ESLint directory adapter before changing its API");
  }
  if (!directory || directory.startsWith("!") ||
      ["*", "?", "[", "]", "{", "}", "(", ")", "|"].some((token) => directory.includes(token))) {
    throw new TypeError("Next.js ESLint rootDir supports only explicit directory paths; replace glob syntax with an array of plain paths, for example [\"apps/web\", \"apps/admin\"]");
  }
  try {
    return fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory() ? [directory] : [];
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "ELOOP"].includes(error.code)) return [];
    throw error;
  }
}

module.exports = { globSync };