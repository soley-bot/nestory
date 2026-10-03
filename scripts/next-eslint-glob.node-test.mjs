import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const pluginRequire = createRequire(require.resolve("@next/eslint-plugin-next/package.json"));
const { getRootDirs } = pluginRequire("./dist/utils/get-root-dirs.js");
const adapter = pluginRequire("fast-glob");
const normalized = (paths) => paths.map((path) => path.replaceAll("\\", "/")).sort();

test("the installed pinned Next plugin resolves its scoped, reviewed directory adapter", () => {
  assert.equal(pluginRequire("./package.json").version, "16.3.8");
  assert.equal(pluginRequire("fast-glob/package.json").name, "@nestory/next-eslint-glob");
  assert.throws(() => adapter.globSync("*", { onlyFiles: true }), /Review Next.js ESLint/);
  assert.throws(() => adapter.globSync("*", { onlyDirectories: true, deep: 1 }), /Review Next.js ESLint/);
});

test("unsupported brace ranges fail explicitly rather than silently dropping lint roots", () => {
  for (const rootDir of ["apps/app{01..05}", "packages/pkg{2..10..2}", "apps/{a..z}", "apps/{web,pkg{01..05}}"]) {
    assert.throws(() => getRootDirs({ cwd: root, settings: { next: { rootDir } } }), /brace ranges are unsupported; list roots explicitly or use a wildcard/);
  }
});

test("ESLint rejects unsupported patterns instead of silently changing page discovery", async () => {
  for (const rootDir of ["apps/app{01..05}", "apps/{,web}", "apps/{web,}", "apps/{web,,admin}", "apps/{web,{,admin}}", "apps/**", "apps/**/web"]) {
    const eslint = new ESLint({ cwd: root, overrideConfig: [{ settings: { next: { rootDir } } }] });
    await assert.rejects(
      eslint.lintText('export default function Page() { return <a href="/about/">About</a>; }', { filePath: "src/glob-range-fixture.tsx" }),
      /Next.js ESLint rootDir .* unsupported; list roots explicitly/,
    );
  }
});

test("actual Next root discovery retains literal, glob and array directory semantics", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "nestory-next-glob-"));
  const apps = join(directory, "apps");
  const web = join(apps, "web");
  const admin = join(apps, "admin");
  const linkedWeb = join(apps, "linked-web");
  await Promise.all([mkdir(join(web, "pages"), { recursive: true }), mkdir(admin, { recursive: true }), mkdir(join(apps, ".hidden"), { recursive: true })]);
  await writeFile(join(apps, "file.txt"), "not a directory");
  await symlink(web, linkedWeb, "junction");
  const discover = (rootDir) => normalized(getRootDirs({ cwd: directory, settings: { next: { rootDir } } }));
  try {
    const cases = [
      ["literal root is not expanded recursively", web, [web]],
      ["wildcard includes directory links, not files or hidden paths", `${apps}/*`, [admin, linkedWeb, web]],
      ["literal directory link remains an application root", linkedWeb, [linkedWeb]],
      ["a directory beneath a link retains its configured path", join(linkedWeb, "pages"), [join(linkedWeb, "pages")]],
      ["brace pattern", `${apps}/{admin,web}`, [admin, web]],
      ["extglob pattern", `${apps}/@(admin|web)`, [admin, web]],
      ["absent root", `${apps}/absent`, []],
      ["file cannot become a project root", join(apps, "file.txt"), []],
      ["explicit hidden directory", join(apps, ".hidden"), [join(apps, ".hidden")]],
      ["array roots ignore non-string members", [web, admin, 1, null], [admin, web]],
      ["Windows separator normalization", web.replaceAll("/", "\\"), [web]],
    ];
    for (const [label, input, expected] of cases) {
      await t.test(label, () => assert.deepEqual(discover(input), normalized(expected)));
    }
    await t.test("default uses ESLint context cwd", () => {
      assert.deepEqual(getRootDirs({ cwd: directory, settings: {} }), [directory]);
    });
    await t.test("relative configured root preserves its directory", () => {
      const found = discover(relative(process.cwd(), web));
      assert.deepEqual(normalized(found.map((path) => resolve(path))), normalized([web]));
    });
    await t.test("explicit current directory remains the current directory", () => {
      const found = discover(".");
      assert.deepEqual(normalized(found.map((path) => resolve(path))), normalized([process.cwd()]));
    });
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + "/") || resolve(directory).startsWith(resolve(tmpdir()) + "\\"));
    await rm(directory, { recursive: true, force: true });
  }
});

test("Next lint still detects internal HTML links under configured literal and glob roots", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nestory-next-lint-"));
  const web = join(directory, "web");
  const linkedWeb = join(directory, "linked-web");
  await mkdir(join(web, "pages"), { recursive: true });
  await writeFile(join(web, "pages", "about.tsx"), "export default function About() { return null; }");
  await symlink(web, linkedWeb, "junction");
  try {
    for (const rootDir of [web, `${directory}/*`, [web], linkedWeb, `${directory}/linked-*`]) {
      const eslint = new ESLint({ cwd: root, overrideConfig: [{ settings: { next: { rootDir } } }] });
      const [result] = await eslint.lintText('export default function Page() { return <a href="/about/">About</a>; }', { filePath: "src/glob-compatibility-fixture.tsx" });
      assert.ok(result.messages.some((message) => message.ruleId === "@next/next/no-html-link-for-pages"), JSON.stringify({ rootDir, messages: result.messages }));
      const [imageResult] = await eslint.lintText('export default function Page() { return <img src="/preview.png" alt="Preview" />; }', { filePath: "src/glob-compatibility-fixture.tsx" });
      assert.ok(imageResult.messages.some((message) => message.ruleId === "@next/next/no-img-element"));
    }
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + "/") || resolve(directory).startsWith(resolve(tmpdir()) + "\\"));
    await rm(directory, { recursive: true, force: true });
  }
});

test("a denied directory read stops lint root discovery instead of passing with no roots", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "nestory-next-denied-"));
  const nativeRead = fs.readdirSync;
  const denied = Object.assign(new Error("Synthetic directory access denied"), { code: "EACCES" });
  const mockedRead = t.mock.method(fs, "readdirSync", (path, options) => {
    if (resolve(path) === resolve(directory)) throw denied;
    return nativeRead(path, options);
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => getRootDirs({ cwd: root, settings: { next: { rootDir: `${directory}/*` } } }), (error) => error === denied);
  } finally {
    mockedRead.mock.restore();
    syncBuiltinESMExports();
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + "/") || resolve(directory).startsWith(resolve(tmpdir()) + "\\"));
    await rm(directory, { recursive: true, force: true });
  }
});

test("vendored shadcn CSS preserves the exact previously used stylesheet and license", async () => {
  const css = await readFile(new URL("../src/app/vendor/shadcn-tailwind.css", import.meta.url));
  // npm shadcn@4.19.0 / package/dist/tailwind.css, retained without edits.
  assert.equal(createHash("sha256").update(css).digest("hex"), "bc7d83425702955b4cb67cb14ede9d603f9d912376d57a2d81d661094d2a782a");
  const license = await readFile(new URL("../src/app/vendor/shadcn-LICENSE.md", import.meta.url), "utf8");
  assert.match(license, /Copyright \(c\) 2023 shadcn/);
  const globals = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(globals, /@import "\.\/vendor\/shadcn-tailwind\.css"/);
});
