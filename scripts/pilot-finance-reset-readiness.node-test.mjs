import assert from 'node:assert/strict';
import test from 'node:test';
import { collectResetReadiness, parseReadinessArguments, RESET_REQUIRED_CI, summarizeResetReadiness } from './pilot-finance-reset-readiness.mjs';

const head = 'a'.repeat(40);
function fixture() {
  return { expectedHead: head, pullRequest: { number: 266, state: 'open', head: { sha: head } }, main: { sha: head },
    runners: { total_count: 1, runners: [{ id: 17, status: 'online', busy: false,
      labels: ['self-hosted', 'Linux', 'X64', 'nestory-reset-protected'].map(name => ({ name })) }] },
    environment: { name: 'production-database', protection_rules: [{ type: 'branch_policy' }],
      deployment_branch_policy: { protected_branches: true, custom_branch_policies: false } },
    branches: [{ name: 'main' }], branchPolicies: null,
    checks: { total_count: RESET_REQUIRED_CI.length, check_runs: RESET_REQUIRED_CI.map(name => ({ name, head_sha: head, status: 'completed', conclusion: 'success' })) },
    runs: { total_count: 0 } };
}
test('even complete GitHub metadata cannot establish protected execution or customer recovery', () => {
  const result = summarizeResetReadiness(fixture());
  assert.deepEqual(result.githubBlockers, []);
  assert.equal(result.executionAuthorized, false); assert.equal(result.mutationAllowed, false);
  assert.ok(result.unverifiedOperationalPrerequisites.includes('contained_customer_database_and_storage_recovery_proof'));
  assert.equal(result.github.requiredReviewerRulePresent, false);
});
test('absent, offline and wrong-label runners block the actual workflow route', () => {
  for (const runners of [{ total_count: 0, runners: [] }, { total_count: 1, runners: [{ ...fixture().runners.runners[0], status: 'offline' }] },
    { total_count: 1, runners: [{ ...fixture().runners.runners[0], labels: [{ name: 'self-hosted' }] }] }]) {
    assert.ok(summarizeResetReadiness({ ...fixture(), runners }).githubBlockers.includes('matching_online_runner_missing'));
  }
});
test('partial metadata, stale heads and skipped required CI fail closed', () => {
  const input = fixture(); input.runners.total_count = 101; input.main.sha = 'b'.repeat(40);
  input.pullRequest.head.sha = 'c'.repeat(40); input.checks.check_runs[0].conclusion = 'skipped';
  input.branches.push({ name: 'another-protected-branch' });
  assert.deepEqual(summarizeResetReadiness(input).githubBlockers, ['pull_request_head_changed', 'candidate_is_not_current_main',
    'runner_inventory_incomplete', 'main_only_environment_policy_unverified', 'required_candidate_ci_not_all_successful']);
  input.checks.check_runs[0].head_sha = 'b'.repeat(40);
  assert.ok(summarizeResetReadiness(input).githubBlockers.includes('candidate_check_inventory_incomplete'));
});
test('custom branch policy accepts only the exact main branch', () => {
  const input = fixture(); input.environment.deployment_branch_policy = { protected_branches: false, custom_branch_policies: true };
  input.branchPolicies = { total_count: 1, branch_policies: [{ name: 'main', type: 'branch' }] };
  assert.equal(summarizeResetReadiness(input).github.mainOnlyEnvironmentPolicy, true);
  input.branchPolicies.branch_policies[0].type = 'tag';
  assert.equal(summarizeResetReadiness(input).github.mainOnlyEnvironmentPolicy, false);
});
test('collector only issues fixed GET requests and omits provider/private fields from output', async () => {
  const input = fixture(), calls = [];
  const responses = [input.pullRequest, input.main, input.runners, input.environment, input.branches, input.checks, input.runs];
  responses[0].body = 'PRIVATE_SENTINEL'; input.runners.runners[0].name = 'PRIVATE_HOST';
  const result = await collectResetReadiness({ pullRequest: 266, expectedHead: head }, async args => {
    calls.push(args); return JSON.stringify(responses[calls.length - 1]);
  });
  assert.equal(calls.length, 7);
  for (const args of calls) { assert.deepEqual(args.slice(0, 5), ['api', '--hostname', 'github.com', '--method', 'GET']); assert.match(args[5], /^repos\/soley-bot\/nestory\//); }
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SENTINEL|PRIVATE_HOST/);
  assert.ok(calls.every(args => !/secrets|variables|dispatches|registration-token/.test(args[5])));
});
test('malformed observations and failures never expose raw provider errors', async () => {
  assert.throws(() => summarizeResetReadiness({ ...fixture(), runners: {} }), /reset_readiness_observation_invalid/);
  await assert.rejects(collectResetReadiness({ pullRequest: 266, expectedHead: head }, async () => { throw Error('PRIVATE_TOKEN'); }),
    { message: 'reset_readiness_github_read_unavailable' });
  assert.deepEqual(parseReadinessArguments(['--pr', '266', '--expected-head', head]), { pullRequest: 266, expectedHead: head });
  for (const args of [[], ['--pr', '1/dispatches', '--expected-head', head], ['--pr', '266', '--expected-head', head, '--execute']]) {
    assert.throws(() => parseReadinessArguments(args), /reset_readiness_arguments_invalid/);
  }
});
