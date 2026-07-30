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

export type ImportReadyRowsState = {
  commitSummary?: ImportCommitSummary;
  draftKey?: string;
  message?: string;
  runId?: string;
  sourceFileName?: string;
  status?: "error" | "success";
  validationSummary?: ImportValidationSummary;
};

type StageResult = {
  draftKey?: string;
  message?: string;
  runId?: string;
  sourceFileName?: string;
  status?: "error" | "success";
  summary?: ImportValidationSummary;
};

type CommitResult = {
  message?: string;
  runId?: string;
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

  const commitFormData = new FormData();
  commitFormData.set("runId", staged.runId);
  const committed = await commit({}, commitFormData);

  return {
    ...identity,
    ...(committed.summary ? { commitSummary: committed.summary } : {}),
    message:
      committed.message ??
      (committed.status === "success"
        ? "Ready rows imported."
        : "The staged import could not be committed."),
    status: committed.status ?? "error",
    validationSummary: staged.summary,
  };
}
