import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const requiredEvidencePaths = [
  "docs/verification/ips-production-readiness-report.md",
  "docs/verification/ips-pilot-reconciliation.md",
];

const invocation = parseArguments(process.argv.slice(2));

if (!invocation) {
  writeReport({ blockers: ["invalid_invocation"], ready: false, schemaVersion: 1 });
  process.exitCode = 2;
} else {
  try {
    const report = await inspectReleaseParity(invocation);
    writeReport(report);
    process.exitCode = report.ready ? 0 : 1;
  } catch {
    writeReport({ blockers: ["verification_error"], ready: false, schemaVersion: 1 });
    process.exitCode = 2;
  }
}

async function inspectReleaseParity({ branch, candidateSha, evidencePaths, remoteRef, sha }) {
  const repositoryRoot = git(process.cwd(), "rev-parse", "--show-toplevel");
  const actualBranch = git(repositoryRoot, "symbolic-ref", "--quiet", "--short", "HEAD");
  const headSha = git(repositoryRoot, "rev-parse", "--verify", "HEAD^{commit}");
  const remoteSha = git(
    repositoryRoot,
    "rev-parse",
    "--verify",
    `refs/remotes/${remoteRef}^{commit}`,
  );
  const [ahead, behind] = git(
    repositoryRoot,
    "rev-list",
    "--left-right",
    "--count",
    `HEAD...refs/remotes/${remoteRef}`,
  )
    .split(/\s+/)
    .map(Number);
  const trackedClean =
    git(repositoryRoot, "status", "--porcelain=v1", "--untracked-files=no") === "";
  const evidence = [];
  let evidenceMissing = false;
  let evidenceUnsafe = false;
  let evidenceEmpty = false;
  let evidenceIncomplete = false;
  let evidenceNotAtHead = false;
  let evidenceProvenanceMismatch = false;
  let evidenceUntracked = false;
  const evidencePathsMatch = hasExactEvidencePaths(evidencePaths);
  const candidateIsAncestor = isAncestor(repositoryRoot, candidateSha, headSha);
  const evidenceCommitScopeMatches = candidateIsAncestor && hasExactEvidencePaths(
    git(repositoryRoot, "diff", "--name-only", candidateSha, headSha, "--")
      .split(/\r?\n/)
      .filter(Boolean),
  );

  for (const evidencePath of evidencePathsMatch ? evidencePaths : []) {
    const safePath = safeRepositoryPath(repositoryRoot, evidencePath);
    if (!safePath) {
      evidenceUnsafe = true;
      continue;
    }
    if (!isTracked(repositoryRoot, safePath.relative)) {
      evidenceUntracked = true;
      continue;
    }

    try {
      const fileInfo = await stat(safePath.absolute);
      if (!fileInfo.isFile()) {
        evidenceMissing = true;
        continue;
      }
      const canonicalPath = await realpath(safePath.absolute);
      if (!isInside(repositoryRoot, canonicalPath)) {
        evidenceUnsafe = true;
        continue;
      }
      if (fileInfo.size === 0) {
        evidenceEmpty = true;
        continue;
      }
      const content = await readFile(canonicalPath);
      const headContent = readHeadFile(repositoryRoot, safePath.relative);
      if (!headContent || !content.equals(headContent)) {
        evidenceNotAtHead = true;
        continue;
      }
      const text = content.toString("utf8");
      if (text.trim() === "") {
        evidenceEmpty = true;
        continue;
      }
      if (isIncompleteReleaseEvidence(text)) {
        evidenceIncomplete = true;
        continue;
      }
      if (!evidenceProvenanceMatches(safePath.relative, text, {
        branch,
        candidateSha,
        headSha,
      })) {
        evidenceProvenanceMismatch = true;
        continue;
      }
      evidence.push({
        path: safePath.relative,
        sha256: createHash("sha256").update(content).digest("hex"),
      });
    } catch {
      evidenceMissing = true;
    }
  }

  const blockers = [];
  if (actualBranch !== branch) blockers.push("branch_mismatch");
  if (headSha !== sha.toLowerCase()) blockers.push("head_sha_mismatch");
  if (candidateSha === headSha || !candidateIsAncestor) {
    blockers.push("candidate_provenance_mismatch");
  }
  if (candidateIsAncestor && !evidenceCommitScopeMatches) {
    blockers.push("evidence_commit_scope_mismatch");
  }
  if (ahead !== 0 || behind !== 0 || remoteSha !== headSha) {
    blockers.push("remote_divergence");
  }
  if (!trackedClean) blockers.push("tracked_worktree_dirty");
  if (!evidencePathsMatch) blockers.push("evidence_paths_mismatch");
  if (evidenceUntracked) blockers.push("evidence_untracked");
  if (evidenceNotAtHead) blockers.push("evidence_not_at_head");
  if (evidenceMissing) blockers.push("evidence_missing");
  if (evidenceUnsafe) blockers.push("evidence_path_unsafe");
  if (evidenceEmpty) blockers.push("evidence_empty");
  if (evidenceIncomplete) blockers.push("evidence_incomplete");
  if (evidenceProvenanceMismatch) blockers.push("evidence_provenance_mismatch");

  return {
    blockers,
    evidence,
    git: {
      ahead,
      behind,
      branch: actualBranch,
      candidateSha,
      evidenceSha: headSha,
      headSha,
      remoteRef,
      remoteSha,
      trackedClean,
    },
    ready: blockers.length === 0,
    schemaVersion: 1,
  };
}

function isIncompleteReleaseEvidence(content) {
  if (/\bBLOCKED\b/i.test(content) || /\btemplate only\b/i.test(content)) {
    return true;
  }

  return content.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    if (/^-\s*$/.test(trimmed) || /^-\s*\[\s\]/.test(trimmed)) return true;
    if (/^-\s+[^:]+:\s*$/.test(trimmed)) return true;
    if (!trimmed.startsWith("|") || /^\|(?:\s*:?-+:?\s*\|)+$/.test(trimmed)) {
      return false;
    }
    const cells = trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
    return cells.some((cell) => cell === "");
  });
}

function hasExactEvidencePaths(evidencePaths) {
  return evidencePaths.length === requiredEvidencePaths.length &&
    requiredEvidencePaths.every((requiredPath) => evidencePaths.includes(requiredPath));
}

function evidenceProvenanceMatches(relativePath, content, provenance) {
  const expected = relativePath === requiredEvidencePaths[0]
    ? {
        "CI full SHA": provenance.candidateSha,
        "CI status": "success",
        "deployment full SHA": provenance.candidateSha,
        "runtime candidate full SHA": provenance.candidateSha,
        "target branch": provenance.branch,
      }
    : {
        "deployed full SHA": provenance.candidateSha,
        "runtime candidate full SHA": provenance.candidateSha,
      };

  return Object.entries(expected).every(([label, expectedValue]) => {
    const declared = readDeclaredField(content, label);
    if (label === "target branch" || label === "CI status") {
      return declared === expectedValue;
    }
    return resolveDeclaredSha(declared) === expectedValue;
  }) && (
    relativePath !== requiredEvidencePaths[0] ||
    (
      isSafeEvidenceUrl(readDeclaredField(content, "CI check URL")) &&
      isIsoUtcTimestamp(readDeclaredField(content, "CI checked at (UTC)"))
    )
  );
}

function isSafeEvidenceUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.search === "" &&
      parsed.hash === "";
  } catch {
    return false;
  }
}

function isIsoUtcTimestamp(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  ) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

function readDeclaredField(content, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^\\s*-\\s*${escapedLabel}:\\s*(.+?)\\s*$`, "im"));
  return match?.[1]?.replace(/^\*\*(.*?)\*\*$/, "$1").trim() ?? null;
}

function resolveDeclaredSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

function parseArguments(args) {
  const values = {
    branch: null,
    candidateSha: null,
    evidencePaths: [],
    remoteRef: null,
    sha: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value || value.startsWith("--")) return null;
    if (flag === "--evidence") values.evidencePaths.push(value);
    else if (flag === "--branch") values.branch = value;
    else if (flag === "--candidate-sha") values.candidateSha = value.toLowerCase();
    else if (flag === "--sha") values.sha = value;
    else if (flag === "--remote-ref") values.remoteRef = value;
    else return null;
    index += 1;
  }

  if (
    !values.branch ||
    !/^[0-9a-f]{40}$/i.test(values.candidateSha ?? "") ||
    !values.remoteRef ||
    !/^[0-9a-f]{40}$/i.test(values.sha ?? "") ||
    values.evidencePaths.length === 0 ||
    values.branch.startsWith("-") ||
    values.remoteRef.startsWith("-") ||
    values.remoteRef.includes("..") ||
    values.remoteRef.includes("@{")
  ) {
    return null;
  }
  return values;
}

function isAncestor(cwd, ancestor, descendant) {
  const result = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", ancestor, descendant],
    { cwd, encoding: "utf8", windowsHide: true },
  );
  return result.status === 0;
}

function safeRepositoryPath(repositoryRoot, candidate) {
  if (!candidate || path.isAbsolute(candidate)) return null;
  const absolute = path.resolve(repositoryRoot, candidate);
  if (!isInside(repositoryRoot, absolute)) return null;
  return {
    absolute,
    relative: path.relative(repositoryRoot, absolute).replaceAll(path.sep, "/"),
  };
}

function isInside(repositoryRoot, candidate) {
  const relative = path.relative(repositoryRoot, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function git(cwd, ...args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error("git check failed");
  return result.stdout.trim();
}

function isTracked(cwd, relativePath) {
  const result = spawnSync(
    "git",
    ["ls-files", "--error-unmatch", "--", relativePath],
    { cwd, encoding: "utf8", windowsHide: true },
  );
  return result.status === 0;
}

function readHeadFile(cwd, relativePath) {
  const result = spawnSync("git", ["show", `HEAD:${relativePath}`], {
    cwd,
    encoding: null,
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout : null;
}

function writeReport(report) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
