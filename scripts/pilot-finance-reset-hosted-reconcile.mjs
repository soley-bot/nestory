// Read-only historical outcome inspection on the already provisioned private
// execution host. The v2 route needs no archive or encryption key and uses only
// fresh read authority plus retained original intents. Neither route writes.
import { canonicalJson } from './pilot-finance-reset-operator-core.mjs';
import { runHistoricalReadOnlyReconciliation } from './pilot-finance-reset-hosted-runner.mjs';

try { console.log(canonicalJson(await runHistoricalReadOnlyReconciliation(process.argv.slice(2)))); }
catch (error) {
  const code = typeof error?.message === 'string' && /^(?:hosted_workflow|hosted_transport|hosted_actor|operator|artifact|reset_store|reset_recovery_artifact|no_backup_runtime|no_backup_reader|no_backup|current_session|reset_reopening)_[a-z0-9_]+$/.test(error.message)
    ? error.message : 'hosted_workflow_failed';
  console.error(canonicalJson({ status: 'stopped', code, automaticRetryAllowed: false, preserveOriginalIntent: true }));
  process.exitCode = 1;
}
