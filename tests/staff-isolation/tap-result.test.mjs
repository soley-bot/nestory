import { describe, expect, it } from "vitest";
import { summarizeTap } from "./tap-result.mjs";

describe("disposable database evidence", () => {
  it.each([
    "BEGIN\nSET\n1..2\nfixture-user\nok 1 - allowed\n# diagnostic\nok 2 - denied\nROLLBACK\n",
    "BEGIN\r\nok 1 - allowed\r\nok 2 - denied\r\n1..2\r\nROLLBACK\r\n",
  ])("accepts a complete pgTAP plan with psql setup output", (stdout) => {
    expect(summarizeTap(stdout)).toEqual({
      planned: 2, assertions: 2, passed: 2, failed: 0, valid: true, errors: [],
    });
  });

  it.each([
    ["empty process output", ""],
    ["setup only", "BEGIN\nSET\nROLLBACK\n"],
    ["empty plan", "1..0\n"],
    ["all skipped", "1..0 # SKIP missing fixture\n"],
    ["no plan", "ok 1 - allowed\n"],
    ["no assertions", "1..2\n"],
    ["truncated suite", "1..2\nok 1 - allowed\n"],
    ["extra assertion", "1..1\nok 1 - allowed\nok 2 - denied\n"],
    ["duplicate plans", "1..1\nok 1 - allowed\n1..1\n"],
    ["midstream plan", "ok 1 - allowed\n1..2\nok 2 - denied\n"],
    ["duplicate numbers", "1..2\nok 1 - allowed\nok 1 - denied\n"],
    ["missing number", "1..1\nok - allowed\n"],
    ["wrong number", "1..1\nok 2 - allowed\n"],
    ["malformed number", "1..1\nok 1invalid\n"],
    ["wrong plan start", "2..2\nok 1 - allowed\n"],
    ["malformed plan", "1..1invalid\nok 1 - allowed\n"],
    ["failed assertion", "1..1\nnot ok 1 - denied\n"],
    ["bailout after complete plan", "1..1\nok 1 - allowed\nBail out! setup failed\n"],
    ["skipped assertion", "1..1\nok 1 - allowed # SKIP unavailable\n"],
    ["todo assertion", "1..1\nok 1 - allowed # TODO implement\n"],
  ])("rejects %s even if psql exits zero", (_reason, stdout) => {
    expect(summarizeTap(stdout).valid).toBe(false);
  });
});
