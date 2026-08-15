const DOCUMENT_BUCKET = "nestory-documents";

export async function cleanupPaidCostEvidenceOrphans({
  apply = false,
  client,
  graceSeconds = 86_400,
  onError = () => {},
}) {
  if (!client) {
    throw new Error("A Supabase service client is required.");
  }
  if (!Number.isSafeInteger(graceSeconds) || graceSeconds < 300) {
    throw new Error("The orphan grace period must be at least 300 seconds.");
  }

  const inventory = await client.rpc("list_paid_cost_evidence_orphans", {
    p_grace_seconds: graceSeconds,
  });
  if (inventory.error) {
    throw new Error(
      inventory.error.message ?? "Paid-cost orphan inventory failed.",
    );
  }

  const candidates = Array.isArray(inventory.data) ? inventory.data : [];
  const result = {
    candidates: candidates.length,
    claimed: 0,
    failed: 0,
    removed: 0,
    skipped: 0,
  };

  if (!apply) {
    return result;
  }

  for (const candidate of candidates) {
    const args = {
      p_organization_id: candidate.organization_id,
      p_storage_path: candidate.storage_path,
    };
    const claim = await client.rpc("begin_paid_cost_evidence_cleanup", args);
    if (claim.error) {
      result.failed += 1;
      onError({
        message: errorMessage(claim.error, "Cleanup claim failed."),
        stage: "cleanup-claim",
      });
      continue;
    }
    if (claim.data !== true) {
      result.skipped += 1;
      continue;
    }

    result.claimed += 1;
    let removalFailed = false;
    try {
      const removal = await client.storage
        .from(DOCUMENT_BUCKET)
        .remove([candidate.storage_path]);
      if (removal.error) {
        removalFailed = true;
        result.failed += 1;
        onError({
          message: errorMessage(removal.error, "Storage removal failed."),
          stage: "storage-remove",
        });
      } else {
        result.removed += 1;
      }
    } catch (error) {
      removalFailed = true;
      result.failed += 1;
      onError({
        message: errorMessage(error, "Storage removal failed."),
        stage: "storage-remove",
      });
    } finally {
      const release = await client.rpc(
        "finish_paid_cost_evidence_cleanup",
        args,
      );
      if (release.error && !removalFailed) {
        result.failed += 1;
        onError({
          message: errorMessage(release.error, "Cleanup claim release failed."),
          stage: "cleanup-release",
        });
      }
    }
  }

  return result;
}

function errorMessage(error, fallback) {
  return error && typeof error.message === "string" && error.message.length > 0
    ? error.message
    : fallback;
}
