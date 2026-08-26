import { spawn } from "node:child_process";
import { lstat, readFile, readlink } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { formatRedactedFinding, scanText } from "./secret-scan-core.mjs";

try {
  const root = parseRoot(process.argv.slice(2));
  const trackedFiles = await listTrackedFiles(root);
  const findings = [];

  for (const trackedPath of trackedFiles) {
    const fullPath = resolve(root, trackedPath);
    const relativePath = relative(root, fullPath);
    if (
      relativePath === "" ||
      relativePath.startsWith("..") ||
      isAbsolute(relativePath)
    ) {
      throw new Error("Git returned a path outside the repository");
    }

    let stat;
    try {
      stat = await lstat(fullPath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }
      throw error;
    }

    if (stat.isDirectory()) {
      continue;
    }

    const buffer = stat.isSymbolicLink()
      ? Buffer.from(await readlink(fullPath))
      : await readFile(fullPath);
    const textOnly = !buffer.includes(0);
    findings.push(
      ...scanText({
        path: trackedPath.replaceAll("\\", "/"),
        text: buffer.toString("utf8"),
        textOnly,
      }),
    );
  }

  findings.sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.line - right.line ||
      left.ruleId.localeCompare(right.ruleId),
  );

  if (findings.length > 0) {
    console.error(
      `Repository secret scan failed with ${findings.length} potential secret(s).`,
    );
    for (const finding of findings) {
      console.error(formatRedactedFinding(finding));
    }
    process.exitCode = 1;
  } else {
    console.log(
      `Repository secret scan passed: ${trackedFiles.length} tracked files checked.`,
    );
  }
} catch (error) {
  console.error(`Repository secret scan failed closed: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
}

function parseRoot(args) {
  if (args.length === 0) {
    return process.cwd();
  }
  if (args.length === 2 && args[0] === "--root") {
    return resolve(args[1]);
  }
  throw new Error("usage: verify-repository-secrets.mjs [--root <repository>]");
}

async function listTrackedFiles(root) {
  const output = await runGit(root, ["ls-files", "-z", "--cached"]);
  return output
    .toString("utf8")
    .split("\0")
    .filter((path) => path.length > 0);
}

function runGit(root, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("git", ["-C", root, ...args], {
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    const output = [];
    child.stdout.on("data", (chunk) => output.push(chunk));
    child.on("error", () => reject(new Error("unable to start Git")));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("Git could not enumerate tracked files"));
        return;
      }
      resolvePromise(Buffer.concat(output));
    });
  });
}

function safeErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message.replace(/[\r\n]+/g, " ");
  }
  return "unknown error";
}
