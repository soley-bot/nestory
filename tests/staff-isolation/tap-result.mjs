// Validate the flat, numbered pgTAP output emitted by these psql suites.
// psql command tags and SELECT results may be mixed with the TAP stream.
// This gate requires every planned assertion to run; SKIP/TODO are not passes.
export function summarizeTap(stdout) {
  let planned = null;
  let planAfter = null;
  let assertions = 0;
  let passed = 0;
  let failed = 0;
  const errors = [];

  for (const line of stdout.split(/\r?\n/)) {
    if (/^\s*Bail out!/i.test(line)) {
      errors.push("TAP bailed out");
      continue;
    }
    if (/^\s*\d+\.\./.test(line)) {
      const plan = /^1\.\.(\d+)\s*(?:#.*)?$/.exec(line);
      if (!plan || !Number.isSafeInteger(Number(plan[1])) || Number(plan[1]) < 1) {
        errors.push("Invalid or empty TAP plan");
      } else if (planned !== null) {
        errors.push("Duplicate TAP plan");
      } else {
        planned = Number(plan[1]);
        planAfter = assertions;
      }
      if (/#\s*(?:SKIP|TODO)\b/i.test(line)) errors.push("TAP plan was skipped");
      continue;
    }
    if (!/^\s*(?:not )?ok\b/.test(line)) continue;

    const assertion = /^(not )?ok (\d+)(?:\s.*)?$/.exec(line);
    assertions += 1;
    if (!assertion || Number(assertion[2]) !== assertions) {
      errors.push(`Invalid TAP assertion number at ${assertions}`);
    }
    if (planAfter !== null && planAfter > 0) errors.push("TAP assertion follows a trailing plan");
    if (/#\s*(?:SKIP|TODO)\b/i.test(line)) errors.push(`TAP assertion ${assertions} was not an unconditional pass`);
    if (assertion && !assertion[1]) passed += 1;
    else failed += 1;
  }

  if (planned === null) errors.push("Missing TAP plan");
  if (assertions === 0) errors.push("No TAP assertions ran");
  if (planned !== null && planned !== assertions) {
    errors.push(`TAP plan expected ${planned} assertions but received ${assertions}`);
  }
  return { planned, assertions, passed, failed, valid: errors.length === 0 && failed === 0, errors };
}
