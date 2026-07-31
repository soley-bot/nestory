export type ImportValidationSummary = {
  blocked: number;
  ready: number;
  total: number;
  warnings: number;
};

export type ImportCommitSummary = {
  created: number;
  failed: number;
  skipped: number;
  updated: number;
};

export type ImportRunStatus =
  | "staged"
  | "committing"
  | "committed"
  | "committed_with_errors"
  | "failed";

export type ImportReadyRowsState = {
  commitSummary?: ImportCommitSummary;
  draftKey?: string;
  message?: string;
  runId?: string;
  runStatus?: ImportRunStatus;
  sourceFileName?: string;
  status?: "error" | "success";
  validationSummary?: ImportValidationSummary;
};

type StageResult = {
  draftKey?: string;
  message?: string;
  runId?: string;
  runStatus?: ImportRunStatus;
  sourceFileName?: string;
  status?: "error" | "success";
  summary?: ImportValidationSummary;
};

type CommitResult = {
  message?: string;
  runId?: string;
  runStatus?: ImportRunStatus;
  status?: "error" | "success";
  summary?: ImportCommitSummary;
};

type RunImportReadyRowsFlowOptions = {
  commit: (
    state: CommitResult,
    formData: FormData,
  ) => Promise<CommitResult>;
  formData: FormData;
  stage: (
    state: StageResult,
    formData: FormData,
  ) => Promise<StageResult>;
};

export async function runImportReadyRowsFlow({
  commit,
  formData,
  stage,
}: RunImportReadyRowsFlowOptions): Promise<ImportReadyRowsState> {
  const staged = await stage({}, formData);

  if (staged.status !== "success") {
    return {
      ...(staged.message ? { message: staged.message } : {}),
      status: "error",
    };
  }

  const identity = {
    ...(staged.draftKey ? { draftKey: staged.draftKey } : {}),
    ...(staged.runId ? { runId: staged.runId } : {}),
    ...(staged.runStatus ? { runStatus: staged.runStatus } : {}),
    ...(staged.sourceFileName
      ? { sourceFileName: staged.sourceFileName }
      : {}),
  };

  if (!staged.summary || !staged.runId) {
    return {
      ...identity,
      message: "The staged import could not be prepared for commit.",
      status: "error",
    };
  }

  if (staged.summary.ready === 0) {
    return {
      ...identity,
      message:
        "No rows are ready to import. Fix the rows that need attention and try again.",
      status: "error",
      validationSummary: staged.summary,
    };
  }

  return commitStagedRun({
    commit,
    identity: { ...identity, runId: staged.runId },
    validationSummary: staged.summary,
  });
}

async function commitStagedRun({
  commit,
  identity,
  validationSummary,
}: {
  commit: RunImportReadyRowsFlowOptions["commit"];
  identity: Pick<
    ImportReadyRowsState,
    "draftKey" | "runId" | "runStatus" | "sourceFileName"
  > & { runId: string };
  validationSummary: ImportValidationSummary;
}): Promise<ImportReadyRowsState> {
  const commitFormData = new FormData();
  commitFormData.set("runId", identity.runId);
  const committed = await commit({}, commitFormData);
  const runStatus = committed.runStatus ?? identity.runStatus;

  return {
    ...(identity.draftKey ? { draftKey: identity.draftKey } : {}),
    runId: identity.runId,
    ...(runStatus ? { runStatus } : {}),
    ...(identity.sourceFileName
      ? { sourceFileName: identity.sourceFileName }
      : {}),
    ...(committed.summary ? { commitSummary: committed.summary } : {}),
    message:
      committed.message ??
      (committed.status === "success"
        ? "Ready rows imported."
        : "The staged import could not be committed."),
    status: committed.status ?? "error",
    validationSummary,
  };
}
