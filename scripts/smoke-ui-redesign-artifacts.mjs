import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  assertEvidenceSummary,
  readPngDimensions,
  validateEvidenceSummary,
} from "./smoke-ui-redesign-policy.mjs";

export async function validateEvidenceArtifacts(
  summary,
  manifest,
  { workspaceRoot = process.cwd() } = {},
) {
  const structuralFailures = validateEvidenceSummary(summary, manifest);
  if (structuralFailures.length > 0) {
    return structuralFailures;
  }

  const failures = [];
  const artifactRoot = resolve(workspaceRoot, "artifacts", "ui-redesign");
  const runDirectory = resolve(workspaceRoot, summary.runDirectory);

  if (hasParentTraversal(summary.runDirectory)) {
    return ["runDirectory contains parent traversal"];
  }
  if (
    isAbsolute(summary.runDirectory) ||
    dirname(runDirectory) !== artifactRoot
  ) {
    return ["runDirectory escapes the expected artifacts/ui-redesign root"];
  }

  let realArtifactRoot;
  let realRunDirectory;
  try {
    [realArtifactRoot, realRunDirectory] = await Promise.all([
      realpath(artifactRoot),
      realpath(runDirectory),
    ]);
  } catch (error) {
    return [
      `runDirectory could not be read: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }

  if (!isWithin(realArtifactRoot, realRunDirectory)) {
    return ["runDirectory escapes the expected artifacts/ui-redesign root"];
  }

  const seenArtifactPaths = new Set();
  const seenRealArtifactPaths = new Set();
  const screenshotResults = [
    ...summary.results,
    ...summary.maintenanceBoardResults,
    ...summary.keyboardZoomAudits,
  ];

  for (const result of screenshotResults) {
    await validateScreenshotArtifact({
      failures,
      realRunDirectory,
      result,
      runDirectory,
      seenArtifactPaths,
      seenRealArtifactPaths,
      workspaceRoot,
    });
  }

  return failures;
}

export async function assertEvidenceArtifacts(
  summary,
  manifest,
  options,
) {
  assertEvidenceSummary(summary, manifest);
  const failures = await validateEvidenceArtifacts(summary, manifest, options);

  if (failures.length > 0) {
    throw new Error(
      `Refusing to generate tracked UI evidence from invalid artifacts:\n${failures
        .map((failure) => `- ${failure}`)
        .join("\n")}`,
    );
  }
}

async function validateScreenshotArtifact({
  failures,
  realRunDirectory,
  result,
  runDirectory,
  seenArtifactPaths,
  seenRealArtifactPaths,
  workspaceRoot,
}) {
  const claimedPath = result.screenshot.path;
  const expectedDimensions = `${result.viewportWidth}x${result.viewportHeight}`;
  const absolutePath = resolve(workspaceRoot, claimedPath);

  if (hasParentTraversal(claimedPath)) {
    failures.push(`${claimedPath} contains parent traversal`);
    return;
  }
  if (isAbsolute(claimedPath) || !isWithin(runDirectory, absolutePath)) {
    failures.push(`${claimedPath} escapes the evidence run directory`);
    return;
  }
  if (seenArtifactPaths.has(absolutePath)) {
    failures.push(`duplicate screenshot artifact path: ${claimedPath}`);
    return;
  }
  seenArtifactPaths.add(absolutePath);

  if (!basename(absolutePath).endsWith(`${expectedDimensions}.png`)) {
    failures.push(
      `${claimedPath} filename must include ${expectedDimensions} before .png`,
    );
  }

  let png;
  let realScreenshotPath;
  try {
    [png, realScreenshotPath] = await Promise.all([
      readFile(absolutePath),
      realpath(absolutePath),
    ]);
  } catch (error) {
    failures.push(
      `${claimedPath} could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  if (!isWithin(realRunDirectory, realScreenshotPath)) {
    failures.push(`${claimedPath} escapes the evidence run directory`);
    return;
  }
  if (seenRealArtifactPaths.has(realScreenshotPath)) {
    failures.push(
      `duplicate canonical screenshot artifact path: ${claimedPath}`,
    );
    return;
  }
  seenRealArtifactPaths.add(realScreenshotPath);

  let dimensions;
  try {
    dimensions = readPngDimensions(png);
  } catch {
    failures.push(`${claimedPath} is not a readable PNG with a valid IHDR`);
    return;
  }

  if (
    dimensions.width !== result.viewportWidth ||
    dimensions.height !== result.viewportHeight
  ) {
    failures.push(
      `${claimedPath} PNG dimensions ${dimensions.width}x${dimensions.height} do not match viewport ${expectedDimensions}`,
    );
  }
  if (
    dimensions.width !== result.screenshot.width ||
    dimensions.height !== result.screenshot.height
  ) {
    failures.push(`${claimedPath} PNG dimensions do not match summary metadata`);
  }
}

function isWithin(parent, candidate) {
  const relation = relative(parent, candidate);
  return (
    relation !== "" &&
    relation !== ".." &&
    !relation.startsWith(`..${sep}`) &&
    !isAbsolute(relation)
  );
}

function hasParentTraversal(value) {
  return String(value).split(/[\\/]+/).includes("..");
}
