import assert from "node:assert/strict";
import test from "node:test";
import {
  goldenSetupPhases,
  makeGoldenSetupNames,
  readGoldenSetupSmokeConfig,
  validateLocalRuntimeAttestation,
} from "./ips-golden-setup-browser-contract.mjs";

test("golden setup smoke requires an explicit local mutation opt-in", () => {
  assert.throws(
    () =>
      readGoldenSetupSmokeConfig({
        NESTORY_BASE_URL: "http://localhost:3014",
      }),
    /ALLOW_LOCAL_MUTATION_SMOKE=1/,
  );
});

test("golden setup smoke rejects hosted and credential-bearing URLs", () => {
  for (const baseUrl of [
    "https://nestory.example.com",
    "http://user:secret@localhost:3014",
  ]) {
    assert.throws(() =>
      readGoldenSetupSmokeConfig({
        ALLOW_LOCAL_MUTATION_SMOKE: "1",
        NESTORY_BASE_URL: baseUrl,
      }),
    );
  }
});

test("golden setup smoke exposes the complete required browser journey", () => {
  assert.deepEqual(goldenSetupPhases, [
    "owner",
    "property",
    "unit",
    "tenant",
    "lease",
    "billing",
    "opening-balances",
    "rent-ready",
    "downstream-links",
  ]);
});

test("golden setup names are unique, compact, and traceable", () => {
  assert.deepEqual(makeGoldenSetupNames("20260811T153045Z"), {
    owner: "Golden Owner 153045",
    property: "Golden Property 153045",
    propertyCode: "GLD-153045",
    tenant: "Golden Tenant 153045",
    unit: "G-153045",
  });
});

test("golden setup binds the browser server to the exact local Supabase runtime", () => {
  assert.equal(
    validateLocalRuntimeAttestation({
      appOrigin: "http://localhost:3014",
      attestation: { supabaseOrigin: "http://127.0.0.1:54321" },
      baseUrl: "http://localhost:3014",
      expectedSupabaseUrl: "http://127.0.0.1:54321",
    }),
    "http://localhost:3014",
  );

  assert.throws(
    () =>
      validateLocalRuntimeAttestation({
        appOrigin: "https://nestory.example.com",
        attestation: { supabaseOrigin: "http://127.0.0.1:54321" },
        baseUrl: "http://localhost:3014",
        expectedSupabaseUrl: "http://127.0.0.1:54321",
      }),
    /loopback host/,
  );

  assert.throws(
    () =>
      validateLocalRuntimeAttestation({
        appOrigin: "http://localhost:3014",
        attestation: { supabaseOrigin: "https://hosted.supabase.co" },
        baseUrl: "http://localhost:3014",
        expectedSupabaseUrl: "http://127.0.0.1:54321",
      }),
    /local Supabase runtime/,
  );
});
