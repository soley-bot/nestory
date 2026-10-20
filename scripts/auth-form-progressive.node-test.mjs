import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
// Exercise the same bundled renderer and server references as Next's App Router.
// No server action, network call, or application server runs in this test.
const React = require("next/dist/compiled/react");
const { renderToReadableStream } = require("next/dist/compiled/react-dom/server.edge");
const { createServerReference } = require("next/dist/compiled/react-server-dom-webpack/client.edge");
const ts = require("typescript");

test("auth forms retain native POST and action-state fields before hydration", async () => {
  const source = readFileSync(new URL("../src/features/auth/components/use-auth-form.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "react") return React;
      if (name === "next/navigation") return { unstable_rethrow: (error) => { throw error; } };
      throw new Error(`Unexpected auth form import: ${name}`);
    },
  });
  const serverAction = createServerReference("synthetic-action-never-invoked");
  function Form() {
    const { action, onSubmit, formRef } = exports.useAuthForm(serverAction);
    return React.createElement("form", { action, onSubmit, ref: formRef },
      React.createElement("input", { name: "email", defaultValue: "fixture@example.invalid" }));
  }
  const stream = await renderToReadableStream(React.createElement(Form));
  const html = await new Response(stream).text();
  assert.match(html, /<form[^>]*method="POST"/i);
  assert.match(html, /name="\$ACTION_(?:REF|ID)_/);
  assert.match(html, /name="\$ACTION_KEY"/);
  assert.doesNotMatch(html, /<form[^>]*action="javascript:/);
});
