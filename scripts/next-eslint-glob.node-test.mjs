import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const pluginRequire = createRequire(require.resolve("@next/eslint-plugin-next/package.json"));
const { getRootDirs } = pluginRequire("./dist/utils/get-root-dirs.js");
const adapter = pluginRequire("fast-glob");
const normalized = (paths) => paths.map((path) => path.replaceAll("\\", "/")).sort();
const unsupported = /supports only explicit directory paths; replace glob syntax with an array of plain paths/;

// Retain every previously reviewed glob shape as a rejection regression.
const rejectedRoots = [
  "", "!apps/web", "apps/*", "apps/w**b", "apps/w**", "apps/***", "apps/?eb",
  "apps/[[:alpha:]]*", "apps/{admin,web}", "apps/@(admin|web)", "apps/!(admin)",
  "apps/?(web)/pages", "apps/app{01..05}", "packages/pkg{2..10..2}", "apps/{a..z}",
  "apps/{web,pkg{01..05}}", "../*", "../../a*", "..\\*", "apps/{,web}",
  "apps/{web,}", "apps/{web,,admin}", "apps/{web,{,admin}}", "apps/**",
  "apps/**/web", "apps/{**,web}", "apps/{web,**}", "apps/{**/web,web}",
  "apps/{@(**),web}", "apps/@(**)", "apps/+(**)", "apps/(web)", "apps/@((web))",
  "apps/app?/web", "apps/a?p1/*", "apps/app?/", "apps/foo[{,,}]bar",
  "apps/foo{,,bar", "apps/[abc", "apps/[abc/*", "apps/[abc/def]/*", "apps/@(child",
  "apps/*/?(pages)", "apps/*/*(pages)", "apps/*/!(pages)", "apps/*/@(pages|)",
  "apps/*/+(pages)", "apps/@(web|admin)/?(pages)/src", "apps/{*,.special}",
  "apps/{!(admin),admin}", "apps/{w**,admin}", "apps/*{web,.special}",
  "apps/{web,admin}/?(pages)", "apps/{web,admin}/***",
  "apps/@(web/pages|admin/pages)", "@(apps/web|apps/admin)", "apps/*/***",
  "apps/*/****", "!(admin)", "./!(admin)", "{!(admin),web}", "{.,web}",
  "@(admin|web)", "apps/*/.", "apps/*/./pages", "apps/@(web|admin)/.",
  "apps/child]", "apps/child}", "apps/child)", "apps/web|admin",
];

async function withDirectory(prefix, run) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  // Validate before entering cleanup, so a guard cannot mask the test failure.
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
  try { await run(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test("the pinned Next plugin resolves only the reviewed explicit-directory API", () => {
  assert.equal(pluginRequire("./package.json").version, "16.3.8");
  assert.equal(pluginRequire("fast-glob/package.json").name, "@nestory/next-eslint-glob");
  for (const args of [
    ["*", { onlyFiles: true }], ["*", { onlyDirectories: true, deep: 1 }],
    [[], { onlyDirectories: true }], [null, { onlyDirectories: true }], [".", null],
  ]) assert.throws(() => adapter.globSync(...args), /Review Next.js ESLint directory adapter/);
});

test("npm validates the installed scoped override as a satisfied dependency edge", () => {
  const windows = process.platform === "win32";
  const result = spawnSync(windows ? "cmd.exe" : "npm", windows
    ? ["/d", "/c", "npm ls fast-glob --all --json"]
    : ["ls", "fast-glob", "--all", "--json"], { cwd: root, encoding: "utf8", timeout: 60000 });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr + result.stdout);
});

test("Next's CommonJS caller works without synchronous require of ES modules", () => {
  const flags = process.allowedNodeEnvironmentFlags.has("--no-experimental-require-module")
    ? ["--no-experimental-require-module"] : [];
  const result = spawnSync(process.execPath, [...flags, "-e", [
    'const { createRequire } = require("node:module");',
    'const pluginRequire = createRequire(require.resolve("@next/eslint-plugin-next/package.json"));',
    'const { getRootDirs } = pluginRequire("./dist/utils/get-root-dirs.js");',
    'require("node:assert/strict").deepEqual(getRootDirs({ cwd: process.cwd(), settings: { next: { rootDir: "." } } }), ["."]);',
  ].join("\n")], { cwd: root, encoding: "utf8", timeout: 60000 });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr + result.stdout);
});

test("all glob and malformed-pattern shapes fail with explicit configuration guidance", () => {
  for (const rootDir of rejectedRoots) {
    assert.throws(() => getRootDirs({ cwd: root, settings: { next: { rootDir } } }), unsupported, rootDir);
  }
});

test("ESLint rejects glob configuration instead of silently changing page discovery", async () => {
  for (const rootDir of ["apps/*", ["." , "apps/{*,.special}"], "apps/{!(admin),admin}", "apps/*/./pages", ""]) {
    const eslint = new ESLint({ cwd: root, overrideConfig: [{ settings: { next: { rootDir } } }] });
    await assert.rejects(
      eslint.lintText('export default function Page() { return <a href="/about/">About</a>; }', { filePath: "src/glob-rejection-fixture.tsx" }),
      unsupported,
    );
  }
});

test("actual Next discovery supports explicit paths, arrays and defaults without walking siblings", async (t) => {
  await withDirectory("nestory-next-roots-", async (directory) => {
    const apps = join(directory, "apps");
    const web = join(apps, "web");
    const admin = join(apps, "admin");
    const linkedWeb = join(apps, "linked-web");
    const loop = join(apps, "loop");
    await mkdir(apps);
    await Promise.all([mkdir(join(web, "pages"), { recursive: true }), mkdir(admin),
      ...[".hidden", "foo,,bar", "root with spaces", "mail@site+root"].map((name) => mkdir(join(apps, name)))]);
    await writeFile(join(apps, "file.txt"), "not a directory");
    await symlink(web, linkedWeb, "junction");
    await symlink(loop, loop, "junction");
    const discover = (rootDir) => normalized(getRootDirs({ cwd: directory, settings: { next: { rootDir } } }));
    const cases = [
      ["literal root is not recursively expanded", web, [web]],
      ["literal commas", join(apps, "foo,,bar"), [join(apps, "foo,,bar")]],
      ["literal spaces", join(apps, "root with spaces"), [join(apps, "root with spaces")]],
      ["ordinary punctuation", join(apps, "mail@site+root"), [join(apps, "mail@site+root")]],
      ["literal hidden directory", join(apps, ".hidden"), [join(apps, ".hidden")]],
      ["directory link retains its alias", linkedWeb, [linkedWeb]],
      ["directory beneath a link", join(linkedWeb, "pages"), [join(linkedWeb, "pages")]],
      ["explicit directory arrays", [web, admin], [web, admin]],
      ["Next ignores non-string array entries", [web, admin, 1, null], [web, admin]],
      ["absent root", join(apps, "absent"), []],
      ["file is not a root", join(apps, "file.txt"), []],
      ["path beneath a file is not a root", join(apps, "file.txt", "child"), []],
      ["selected cyclic link is not a root", loop, []],
      ["Windows separators normalized by Next", web.replaceAll("/", "\\"), [web]],
    ];
    for (const [label, input, expected] of cases) {
      await t.test(label, () => assert.deepEqual(discover(input), normalized(expected)));
    }
    await t.test("default context root bypasses all parsing, including special characters", () => {
      for (const cwd of [directory, join(directory, "root(with)[symbols]")]) {
        assert.deepEqual(getRootDirs({ cwd, settings: {} }), [cwd]);
      }
    });
    await t.test("relative, parent, dot and trailing-separator paths retain explicit selection", () => {
      const previousCwd = process.cwd();
      try {
        process.chdir(apps);
        for (const [input, expected] of [
          [relative(apps, web), web], [".", apps], ["./.", apps], ["../apps/web", web],
          ["web/../admin", admin], ["web/", web], ["web/.", web],
        ]) {
          assert.deepEqual(normalized(discover(input).map((path) => resolve(path))), normalized([expected]));
        }
      } finally { process.chdir(previousCwd); }
    });
  });
});

test("Next lint retains internal-link and image diagnostics for explicit directory roots", async () => {
  await withDirectory("nestory-next-lint-", async (directory) => {
    const web = join(directory, "web");
    const linkedWeb = join(directory, "linked-web");
    await mkdir(join(web, "pages"), { recursive: true });
    await writeFile(join(web, "pages", "about.tsx"), "export default function About() { return null; }");
    await symlink(web, linkedWeb, "junction");
    for (const rootDir of [web, [web], linkedWeb]) {
      const eslint = new ESLint({ cwd: root, overrideConfig: [{ settings: { next: { rootDir } } }] });
      const [result] = await eslint.lintText('export default function Page() { return <a href="/about/">About</a>; }', { filePath: "src/root-compatibility-fixture.tsx" });
      assert.ok(result.messages.some((message) => message.ruleId === "@next/next/no-html-link-for-pages"), JSON.stringify(result.messages));
      const [imageResult] = await eslint.lintText('export default function Page() { return <img src="/preview.png" alt="Preview" />; }', { filePath: "src/root-compatibility-fixture.tsx" });
      assert.ok(imageResult.messages.some((message) => message.ruleId === "@next/next/no-img-element"));
    }
  });
});

test("permission and I/O errors stop root discovery instead of becoming empty results", (t) => {
  const nativeStat = fs.statSync;
  let failure;
  t.mock.method(fs, "statSync", (path, options) => {
    if (resolve(path) === resolve(root)) throw failure;
    return nativeStat(path, options);
  });
  for (const code of ["EACCES", "EIO"]) {
    failure = Object.assign(new Error("Synthetic filesystem failure"), { code });
    assert.throws(() => getRootDirs({ cwd: root, settings: { next: { rootDir: root } } }), (error) => error === failure);
  }
});

test("vendored shadcn CSS preserves the exact previously used stylesheet and license", async () => {
  const css = await readFile(new URL("../src/app/vendor/shadcn-tailwind.css", import.meta.url));
  assert.equal(createHash("sha256").update(css).digest("hex"), "bc7d83425702955b4cb67cb14ede9d603f9d912376d57a2d81d661094d2a782a");
  const license = await readFile(new URL("../src/app/vendor/shadcn-LICENSE.md", import.meta.url), "utf8");
  assert.match(license, /Copyright \(c\) 2023 shadcn/);
  const globals = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(globals, /@import "\.\/vendor\/shadcn-tailwind\.css"/);
});