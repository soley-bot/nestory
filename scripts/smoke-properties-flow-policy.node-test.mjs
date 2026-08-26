import assert from "node:assert/strict";
import test from "node:test";

import { resolvePropertiesFlowConfig } from "./smoke-properties-flow-policy.mjs";

test("property mutation smoke requires an explicit local opt-in", () => {
  assert.throws(
    () => resolvePropertiesFlowConfig({}),
    /ALLOW_LOCAL_MUTATION_SMOKE must be exactly 1/,
  );
});

test("property mutation smoke rejects hosted targets even with opt-in", () => {
  assert.throws(
    () =>
      resolvePropertiesFlowConfig({
        ALLOW_LOCAL_MUTATION_SMOKE: "1",
        NESTORY_BASE_URL: "https://nestory.example.com",
      }),
    /BASE_URL must use a loopback host/,
  );
});

test("property mutation smoke resolves only the local fixture configuration", () => {
  assert.deepEqual(
    resolvePropertiesFlowConfig({
      ALLOW_LOCAL_MUTATION_SMOKE: "1",
      NESTORY_BASE_URL: "http://127.0.0.1:3000/path?ignored=yes",
    }),
    {
      baseUrl: "http://127.0.0.1:3000",
      email: "nestory@gmail.com",
      password: "123456789",
    },
  );
});
