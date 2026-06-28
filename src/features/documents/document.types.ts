import type { RecentChange } from "@/features/activity/activity.types";

export type LinkedDocument = {
  category: string;
  fileName: string;
  id: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  url?: string;
};

export type DocumentArchiveState = "active" | "archived" | "all";

export type DocumentViewQuery = {
  archiveState: DocumentArchiveState;
  page: number;
  pageSize: number;
  propertyId: string;
  query: string;
  taskId: string;
  unitId: string;
};

export type DocumentPagination = {
  from: number;
  page: number;
  pageSize: number;
  to: number;
  totalCount: number;
  totalPages: number;
};

export type DocumentPropertyOption = {
  id: string;
  label: string;
};

export type DocumentUnitOption = {
  id: string;
  label: string;
  propertyId: string;
};

export type DocumentFormValues = {
  category: string;
  propertyId: string;
  taskId?: string | null;
  unitId?: string | null;
};

export type DocumentLinkedRecord = {
  href: string;
  label: string;
  type: string;
};

export type DocumentRiskIndicator = {
  description: string;
  id: string;
  label: string;
  tone: "neutral" | "success" | "warning" | "danger" | "accent";
};

export type DocumentNextAction = {
  description: string;
  href: string;
  label: string;
  tone: DocumentRiskIndicator["tone"];
};

export type DocumentDetailHrefs = {
  document: string;
  ledger?: string;
  lease?: string;
  maintenance?: string;
  property?: string;
  timeline?: string;
  unit?: string;
};

export type DocumentSummary = LinkedDocument & {
  activity: RecentChange[];
  archivedAt?: string;
  formValues: DocumentFormValues;
  hrefs: DocumentDetailHrefs;
  isArchived: boolean;
  linkedRecords: DocumentLinkedRecord[];
  nextAction: DocumentNextAction;
  riskIndicators: DocumentRiskIndicator[];
  storagePath: string;
};

export type DocumentScreenData = {
  documents: DocumentSummary[];
  pagination: DocumentPagination;
  propertyOptions: DocumentPropertyOption[];
  unitOptions: DocumentUnitOption[];
};
