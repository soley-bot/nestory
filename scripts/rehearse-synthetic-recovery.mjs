import { execFile } from "node:child_process";
import { statfs } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { rehearseSyntheticRecovery } from "./synthetic-recovery-core.mjs";
import { localRecoveryDocker } from "./local-recovery-docker.mjs";

function execute(file, args, input, { timeoutMs = 15_000, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { timeout: timeoutMs, env, maxBuffer: 1_048_576, windowsHide: true }, (error, stdout) => {
      if (error) reject(new Error(`${file === "docker" ? "Docker" : "Disk inspection"} command failed.`));
      else resolve(stdout);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input ?? "");
  });
}

try {
  if (process.argv.length > 2) throw new Error("Synthetic recovery accepts no target, credential or backup input arguments.");
  const readFreeBytes = async (options) => process.platform === "win32"
    ? Number((await execute("powershell.exe", ["-NoProfile", "-Command", `(Get-PSDrive -Name '${process.cwd()[0]}').Free`], undefined, options)).trim())
    : await statfs(process.cwd()).then(stat => stat.bavail * stat.bsize);
  const freeBytes = await readFreeBytes();
  const { docker, endpoint } = await localRecoveryDocker({ execute });
  const result = await rehearseSyntheticRecovery({ docker, dockerEndpoint: endpoint, freeBytes, readFreeBytes, pause: setTimeout });
  const freeBytesAfter = await readFreeBytes();
  process.stdout.write(`${JSON.stringify({ observedAt: new Date().toISOString(), freeBytesAfter, ...result })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify(error.diagnostics ?? { message: error.message })}\n`);
  process.exitCode = 1;
}
