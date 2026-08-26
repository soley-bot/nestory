import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const policies = [
  {
    args: ["--omit=dev"],
    label: "Production dependencies",
    message: "moderate-or-higher",
    threshold: "moderate",
  },
  {
    args: ["--include=dev"],
    label: "Complete dependency tree",
    message: "high-or-critical",
    threshold: "high",
  },
];
const severityOrder = ["info", "low", "moderate", "high", "critical"];

try {
  assertNode24();
  await assertProjectNpmConfigHasNoCredentials();

  const isolatedConfigRoot = await mkdtemp(join(tmpdir(), "nestory-npm-audit-"));
  try {
    const userConfig = join(isolatedConfigRoot, "user.npmrc");
    const globalConfig = join(isolatedConfigRoot, "global.npmrc");
    await Promise.all([writeFile(userConfig, ""), writeFile(globalConfig, "")]);
    const childEnvironment = createAuditEnvironment({
      cache: join(isolatedConfigRoot, "cache"),
      globalConfig,
      userConfig,
    });

    let failed = false;
    for (const policy of policies) {
      const report = await runNpmAudit(policy.args, childEnvironment);
      const counts = normalizeCounts(report);
      const blocking = countAtOrAbove(counts, policy.threshold);
      console.log(
        `${policy.label}: ${blocking} ${policy.message} (${counts.total} total).`,
      );
      failed ||= blocking > 0;
    }

    if (failed) {
      console.error("Dependency audit policy failed.");
      process.exitCode = 1;
    }
  } finally {
    await rm(isolatedConfigRoot, { force: true, recursive: true });
  }
} catch (error) {
  console.error(`Dependency audit failed closed: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
}

function assertNode24() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (major !== 24) {
    throw new Error(`Node 24 is required; received Node ${major}`);
  }
}

async function assertProjectNpmConfigHasNoCredentials() {
  try {
    const config = await readFile(join(repositoryRoot, ".npmrc"), "utf8");
    const lines = config.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const key = lines[index].split("=", 1)[0]?.trim().toLowerCase() ?? "";
      if (/(?:auth|token|password|username|cert|key)/.test(key)) {
        throw new Error(
          `.npmrc contains credential configuration at line ${index + 1}`,
        );
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

function createAuditEnvironment({ cache, globalConfig, userConfig }) {
  const allowedKeys = new Set([
    "APPDATA",
    "CI",
    "ComSpec",
    "HOME",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "LOCALAPPDATA",
    "NO_PROXY",
    "NODE_EXTRA_CA_CERTS",
    "PATH",
    "PATHEXT",
    "Path",
    "RUNNER_TEMP",
    "SSL_CERT_DIR",
    "SSL_CERT_FILE",
    "SystemRoot",
    "TEMP",
    "TMP",
    "TMPDIR",
    "USERPROFILE",
    "WINDIR",
    "http_proxy",
    "https_proxy",
    "no_proxy",
  ]);
  const environment = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (allowedKeys.has(key) && value !== undefined) {
      environment[key] = value;
    }
  }
  return {
    ...environment,
    NPM_CONFIG_AUDIT: "true",
    NPM_CONFIG_CACHE: cache,
    NPM_CONFIG_COLOR: "false",
    NPM_CONFIG_FUND: "false",
    NPM_CONFIG_GLOBALCONFIG: globalConfig,
    NPM_CONFIG_IGNORE_SCRIPTS: "true",
    NPM_CONFIG_LOGLEVEL: "silent",
    NPM_CONFIG_REGISTRY: "https://registry.npmjs.org/",
    NPM_CONFIG_USERCONFIG: userConfig,
    NO_UPDATE_NOTIFIER: "1",
  };
}

async function runNpmAudit(policyArgs, environment) {
  const auditArgs = [
    "audit",
    "--json",
    "--package-lock-only",
    "--ignore-scripts",
    "--audit-level=none",
    "--registry=https://registry.npmjs.org/",
    ...policyArgs,
  ];
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath
    ? { args: [npmExecPath, ...auditArgs], executable: process.execPath }
    : {
        args: auditArgs,
        executable: process.platform === "win32" ? "npm.cmd" : "npm",
      };
  const result = await runProcess(command.executable, command.args, environment);
  if (result.code !== 0) {
    throw new Error("npm audit could not obtain a valid advisory response");
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("npm audit returned malformed JSON");
  }
}

function runProcess(executable, args, environment) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      cwd: repositoryRoot,
      env: environment,
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", () => reject(new Error("unable to start npm audit")));
    child.on("close", (code) => resolvePromise({ code, stdout }));
  });
}

function normalizeCounts(report) {
  const raw = report?.metadata?.vulnerabilities;
  if (!raw || typeof raw !== "object") {
    throw new Error("npm audit response omitted vulnerability metadata");
  }
  const counts = {};
  for (const severity of severityOrder) {
    const count = raw[severity];
    if (!Number.isInteger(count) || count < 0) {
      throw new Error("npm audit response contained invalid vulnerability counts");
    }
    counts[severity] = count;
  }
  counts.total = severityOrder.reduce(
    (total, severity) => total + counts[severity],
    0,
  );
  return counts;
}

function countAtOrAbove(counts, threshold) {
  const thresholdIndex = severityOrder.indexOf(threshold);
  return severityOrder
    .slice(thresholdIndex)
    .reduce((total, severity) => total + counts[severity], 0);
}

function safeErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message.replace(/[\r\n]+/g, " ");
  }
  return "unknown error";
}
