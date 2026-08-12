import type {
  ImportReadyRowsState,
  ImportRunStatus,
} from "@/features/imports/import-ready-rows";

export type StageImportRunState = {
  draftKey?: string;
  message?: string;
  runId?: string;
  runStatus?: ImportRunStatus;
  sourceFileName?: string;
  status?: "error" | "success";
  summary?: {
    blocked: number;
    ready: number;
    total: number;
    warnings: number;
  };
};

export type CommitImportRunState = {
  message?: string;
  runId?: string;
  runStatus?: ImportRunStatus;
  status?: "error" | "success";
  summary?: {
    created: number;
    failed: number;
    skipped: number;
    updated: number;
  };
};

export type CutoverActionState = {
  batchId?: string;
  manifestSha256?: string;
  message?: string;
  reconciliationId?: string;
  status?: "error" | "success";
};

export type { ImportReadyRowsState };
