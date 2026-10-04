const targetVariables = ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "DOCKER_API_VERSION"];

export async function localRecoveryDocker({ execute, env = process.env, platform = process.platform }) {
  if (targetVariables.some(name => env[name] !== undefined && env[name] !== "")) {
    throw new Error("Synthetic recovery refuses Docker environment target/configuration overrides.");
  }
  const pinnedEnv = { ...env };
  for (const name of targetVariables) delete pinnedEnv[name];
  const context = (await execute("docker", ["context", "show"], undefined, { env: pinnedEnv })).trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(context)) throw new Error("Docker context identity is invalid.");
  const endpoint = JSON.parse(await execute("docker", ["context", "inspect", context, "--format", "{{json .Endpoints.docker.Host}}"], undefined, { env: pinnedEnv }));
  const allowed = platform === "win32"
    ? ["npipe:////./pipe/docker_engine", "npipe:////./pipe/dockerDesktopLinuxEngine"]
    : ["unix:///var/run/docker.sock"];
  if (!allowed.includes(endpoint)) throw new Error("Synthetic recovery requires a verified supported local Docker endpoint.");
  const docker = (args, input, options = {}) => execute("docker", ["--host", endpoint, ...args], input, { ...options, env: pinnedEnv });
  return { docker, endpoint };
}
