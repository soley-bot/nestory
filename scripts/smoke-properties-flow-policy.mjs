import { validateLocalBaseUrl } from "./smoke-ui-redesign-policy.mjs";

export function resolvePropertiesFlowConfig(environment = process.env) {
  if (environment.ALLOW_LOCAL_MUTATION_SMOKE !== "1") {
    throw new Error("ALLOW_LOCAL_MUTATION_SMOKE must be exactly 1.");
  }

  return {
    baseUrl: validateLocalBaseUrl(
      environment.NESTORY_BASE_URL ?? "http://localhost:3000",
    ),
    email: environment.NESTORY_TEST_EMAIL ?? "nestory@gmail.com",
    password: environment.NESTORY_TEST_PASSWORD ?? "123456789",
  };
}
