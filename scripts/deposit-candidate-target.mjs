// Pure guards shared by the disposable deposit harness and its workers.
export function configuredDepositContainer(config) {
  const matches = [...String(config).matchAll(/^\s*project_id\s*=\s*"([A-Za-z0-9_-]+)"\s*$/gm)];
  if (matches.length !== 1) throw Error('Could not verify one local Supabase project_id in supabase/config.toml.');
  return `supabase_db_${matches[0][1]}`;
}

export function selectDepositContainer(config, runningContainers, explicitContainer) {
  const configured = configuredDepositContainer(config);
  if (explicitContainer && explicitContainer !== configured) {
    throw Error(`Explicit database target does not match the configured local Supabase project (${configured}).`);
  }
  if (!runningContainers.includes(configured)) {
    throw Error(`Configured local Supabase database container is not running: ${configured}`);
  }
  return configured;
}

export function assertDepositCandidateTarget({ config, container, db, endpoint }, platform = process.platform) {
  const localEndpoints = platform === 'win32'
    ? ['npipe:////./pipe/docker_engine', 'npipe:////./pipe/dockerDesktopLinuxEngine']
    : ['unix:///var/run/docker.sock'];
  if (!localEndpoints.includes(endpoint)) throw Error('Deposit harness requires a verified supported local Docker endpoint.');
  if (container !== configuredDepositContainer(config)) throw Error('Deposit harness container does not match the configured local Supabase project.');
  if (!/^deposit_candidate_[0-9]+$/.test(db)) throw Error('Deposit harness requires a process-owned synthetic database.');
}
