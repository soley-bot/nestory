// Read-only GitHub inventory. This module never imports a reset executor, reads
// credentials/private artifacts, dispatches a workflow, or authorizes mutation.
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = 'soley-bot/nestory';
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const labels = ['self-hosted', 'linux', 'x64', 'nestory-reset-protected'];
export const RESET_REQUIRED_CI = Object.freeze(['Repository secrets', 'Dependency audit', 'Lint', 'Type check',
  'Unit tests', 'UI tests', 'Contract tests', 'Build', 'Application', 'Database']);
const fail = code => { throw new Error(`reset_readiness_${code}`); };

export function parseReadinessArguments(args) {
  if (args.length !== 4 || args[0] !== '--pr' || !/^[1-9][0-9]{0,5}$/.test(args[1]) ||
    args[2] !== '--expected-head' || !sha(args[3])) fail('arguments_invalid');
  return { pullRequest: Number(args[1]), expectedHead: args[3] };
}

export function summarizeResetReadiness(input) {
  const { expectedHead, pullRequest, main, runners, environment, branches, branchPolicies, checks, runs } = input;
  if (!sha(expectedHead) || !sha(main?.sha) || !sha(pullRequest?.head?.sha) ||
    !['open', 'closed'].includes(pullRequest?.state) || !Number.isInteger(pullRequest?.number) ||
    !Array.isArray(runners?.runners) || !Number.isSafeInteger(runners?.total_count) || runners.total_count < 0 ||
    runners.runners.length > runners.total_count || !Array.isArray(branches) ||
    !Array.isArray(environment?.protection_rules) || environment.name !== 'production-database' ||
    !Array.isArray(checks?.check_runs) || !Number.isSafeInteger(checks?.total_count) || checks.total_count < 0 ||
    checks.check_runs.length > checks.total_count || !Number.isSafeInteger(runs?.total_count) || runs.total_count < 0) fail('observation_invalid');
  if (branches.some(branch => typeof branch?.name !== 'string') || runners.runners.some(runner =>
    !Number.isSafeInteger(runner?.id) || !['online', 'offline'].includes(runner?.status) || typeof runner.busy !== 'boolean' ||
    !Array.isArray(runner.labels) || runner.labels.some(label => typeof label?.name !== 'string')) ||
    checks.check_runs.some(check => typeof check?.name !== 'string' || !sha(check.head_sha) || typeof check.status !== 'string')) fail('observation_invalid');
  const inventoryComplete = runners.total_count === runners.runners.length;
  const protectedBranchesComplete = branches.length < 100;
  const policy = environment.deployment_branch_policy;
  const mainOnly = environment.protection_rules.some(rule => rule.type === 'branch_policy') && (
    policy?.protected_branches === true && policy.custom_branch_policies === false && protectedBranchesComplete &&
      branches.length === 1 && branches[0].name === 'main' ||
    policy?.protected_branches === false && policy.custom_branch_policies === true && branchPolicies?.total_count === 1 &&
      branchPolicies.branch_policies?.length === 1 && branchPolicies.branch_policies[0].name === 'main' &&
      branchPolicies.branch_policies[0].type === 'branch');
  const matching = runners.runners.filter(runner => labels.every(label => runner.labels.some(item => item.name.toLowerCase() === label)));
  const checksComplete = checks.total_count === checks.check_runs.length && checks.check_runs.every(check => check.head_sha === expectedHead);
  const ci = RESET_REQUIRED_CI.map(name => {
    const found = checks.check_runs.filter(check => check.name === name);
    const check = found.length === 1 ? found[0] : null;
    const status = ['queued', 'in_progress', 'completed', 'waiting', 'requested', 'pending'].includes(check?.status) ? check.status : 'unverified';
    const conclusion = ['success', 'failure', 'cancelled', 'timed_out', 'skipped', 'neutral', 'action_required', 'stale', 'startup_failure']
      .includes(check?.conclusion) ? check.conclusion : null;
    return { name, status, conclusion, passed: checksComplete && status === 'completed' && conclusion === 'success' };
  });
  const blockers = [];
  if (pullRequest.head.sha !== expectedHead) blockers.push('pull_request_head_changed');
  if (main.sha !== expectedHead) blockers.push('candidate_is_not_current_main');
  if (!inventoryComplete) blockers.push('runner_inventory_incomplete');
  if (!matching.some(runner => runner.status === 'online')) blockers.push('matching_online_runner_missing');
  if (!mainOnly) blockers.push('main_only_environment_policy_unverified');
  if (!checksComplete) blockers.push('candidate_check_inventory_incomplete');
  if (ci.some(check => !check.passed)) blockers.push('required_candidate_ci_not_all_successful');
  return {
    format: 'nestory-reset-readiness-inventory-v1', repository, expectedHead, observedMain: main.sha,
    pullRequest: { number: pullRequest.number, state: pullRequest.state, headMatches: pullRequest.head.sha === expectedHead },
    github: { runnerInventoryComplete: inventoryComplete, registeredRunnerCount: runners.total_count,
      matchingRunnerCount: matching.length, matchingOnlineRunnerCount: matching.filter(runner => runner.status === 'online').length,
      matchingIdleRunnerCount: matching.filter(runner => runner.status === 'online' && !runner.busy).length,
      mainOnlyEnvironmentPolicy: Boolean(mainOnly), requiredReviewerRulePresent: environment.protection_rules.some(rule => rule.type === 'required_reviewers'),
      resetWorkflowRunCount: runs.total_count, checksComplete, requiredCi: ci },
    githubBlockers: blockers,
    unverifiedOperationalPrerequisites: ['protected_host_and_private_persistent_mount', 'pinned_psql_ca_and_database_access',
      'private_access_retention_key_recovery_and_cross_run_durability', 'exact_operation_packet_and_current_actor_authority',
      'contained_customer_database_and_storage_recovery_proof', 'complete_protected_path_review_and_database_proof'],
    executionAuthorized: false, mutationAllowed: false,
  };
}

export async function collectResetReadiness({ pullRequest, expectedHead }, runGh = runReadOnlyGh) {
  if (!Number.isInteger(pullRequest) || pullRequest < 1 || pullRequest > 999999 || !sha(expectedHead)) fail('arguments_invalid');
  const get = async resource => {
    try {
      const result = await runGh(['api', '--hostname', 'github.com', '--method', 'GET', `repos/${repository}/${resource}`]);
      if (typeof result !== 'string' || Buffer.byteLength(result) > 2 * 1024 * 1024) fail('response_invalid');
      return JSON.parse(result);
    } catch { fail('github_read_unavailable'); }
  };
  const [pr, main, runners, environment, branches, checks, runs] = await Promise.all([
    get(`pulls/${pullRequest}`), get('commits/main'), get('actions/runners?per_page=100'),
    get('environments/production-database'), get('branches?protected=true&per_page=100'),
    get(`commits/${expectedHead}/check-runs?filter=latest&per_page=100`),
    get('actions/workflows/pilot-financial-reset.yml/runs?per_page=1'),
  ]);
  const branchPolicies = environment?.deployment_branch_policy?.custom_branch_policies === true
    ? await get('environments/production-database/deployment-branch-policies?per_page=100') : null;
  if (pr?.number !== pullRequest) fail('pull_request_observation_mismatch');
  return summarizeResetReadiness({ expectedHead, pullRequest: pr, main, runners, environment, branches, branchPolicies, checks, runs });
}

function runReadOnlyGh(args) {
  return new Promise((resolve, reject) => {
    execFile('gh', args, { windowsHide: true, timeout: 20000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(new Error('GitHub read unavailable')); else resolve(stdout);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await collectResetReadiness(parseReadinessArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    // This is a readiness inventory, never a successful dispatch preflight.
    process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${/^reset_readiness_[a-z_]+$/.test(error.message) ? error.message : 'reset_readiness_failed'}\n`);
    process.exitCode = 1;
  }
}
