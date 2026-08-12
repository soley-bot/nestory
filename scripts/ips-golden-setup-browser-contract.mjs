import { validateLocalBaseUrl } from "./smoke-ui-redesign-policy.mjs";

export const goldenSetupPhases = Object.freeze([
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

export function readGoldenSetupSmokeConfig(env = process.env) {
  if (env.ALLOW_LOCAL_MUTATION_SMOKE !== "1") {
    throw new Error(
      "Set ALLOW_LOCAL_MUTATION_SMOKE=1 to authorize synthetic local record creation.",
    );
  }

  return {
    baseUrl: validateLocalBaseUrl(
      env.NESTORY_BASE_URL ?? "http://localhost:3000",
    ),
    password: env.NESTORY_TEST_PASSWORD ?? "123456789",
    superAdminEmail: env.NESTORY_TEST_EMAIL ?? "nestory@gmail.com",
    submitterEmail:
      env.NESTORY_FINANCE_MEMBER_EMAIL ?? "finance.member@nestory.com",
  };
}

export function makeGoldenSetupNames(timestamp = new Date().toISOString()) {
  const suffix = timestamp.replace(/\D/g, "").slice(-6);

  if (suffix.length !== 6) {
    throw new Error("Golden setup timestamp must contain at least six digits.");
  }

  return {
    owner: `Golden Owner ${suffix}`,
    property: `Golden Property ${suffix}`,
    propertyCode: `GLD-${suffix}`,
    tenant: `Golden Tenant ${suffix}`,
    unit: `G-${suffix}`,
  };
}

export function validateLocalRuntimeAttestation({
  appOrigin,
  attestation,
  baseUrl,
  expectedSupabaseUrl,
}) {
  const expectedAppOrigin = validateLocalBaseUrl(baseUrl);
  const validatedAppOrigin = validateLocalBaseUrl(appOrigin);
  if (validatedAppOrigin !== expectedAppOrigin) {
    throw new Error("The app redirected away from the approved local origin.");
  }

  let attestedSupabaseOrigin;
  try {
    attestedSupabaseOrigin = validateLocalBaseUrl(
      attestation?.supabaseOrigin ?? "",
    );
  } catch {
    throw new Error("The app did not attest a local Supabase runtime.");
  }

  const expectedSupabaseOrigin = validateLocalBaseUrl(expectedSupabaseUrl);
  if (attestedSupabaseOrigin !== expectedSupabaseOrigin) {
    throw new Error(
      "The app Supabase target does not match the local Supabase runtime.",
    );
  }

  return validatedAppOrigin;
}
