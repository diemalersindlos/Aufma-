import type { MaterialSettings } from "@/lib/excel-export";
import type { PanoramaAsset } from "@/lib/insta360";
import type { ProjectData } from "@/lib/measurements";
import type { ProjectReviewState } from "@/lib/pro-workflow";

export type ProjectStatus = "draft" | "completed";

export type StoredProjectState = ProjectData & {
  version: 2 | 3;
  status: ProjectStatus;
  materials: MaterialSettings;
  panoramas?: PanoramaAsset[];
  professional?: {
    review: ProjectReviewState;
  };
  autoSettings: {
    roomHeight: number;
    minRoomArea: number;
    includeWalls: boolean;
    includeCeiling: boolean;
    includeFloor: boolean;
    includeSkirting: boolean;
  };
};

export type ProjectSummary = {
  id: string;
  title: string;
  customer: string;
  address: string;
  reference: string;
  fileName: string;
  pageCount: number;
  positionCount: number;
  status: ProjectStatus;
  hasPdf: boolean;
  archivedAt: string | null;
  trashedAt: string | null;
  deleteAfter: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectAuditValue = string | number | boolean | null;

export type ProjectAuditChange = {
  path: string;
  label: string;
  before: ProjectAuditValue;
  after: ProjectAuditValue;
};

export type ProjectAuditEvent = {
  id: string;
  projectId: string;
  actor: string;
  action: string;
  changes: ProjectAuditChange[];
  createdAt: string;
};

export type StoredProjectResponse = {
  project: ProjectSummary;
  state: StoredProjectState;
};
