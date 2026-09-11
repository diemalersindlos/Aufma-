import { defaultMaterialSettings } from "@/lib/excel-export";
import { createId, normalizeLegacyPdfRoomGeometry } from "@/lib/measurements";
import { emptyProjectReview } from "@/lib/pro-workflow";
import type { StoredProjectState } from "@/lib/project-storage-types";
import { VOB_RULESET } from "@/lib/vob-rules";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createMobileProjectState(): StoredProjectState {
  return {
    version: 3,
    status: "draft",
    meta: {
      id: createId("project"),
      title: "",
      customer: "",
      address: "",
      estimator: "",
      reference: "",
      standard: "VOB/C · ATV DIN 18363 / DIN 18366:2019-09",
      deductionThreshold: 2.5,
      vobRuleSetId: VOB_RULESET.id,
      vobRuleConfirmed: false,
      vobRuleConfirmedBy: "",
      vobRuleConfirmedAt: "",
      rounding: 2,
      updatedAt: new Date().toISOString(),
    },
    fileName: "",
    pageCount: 1,
    includedPages: [1],
    scales: {},
    measurements: [],
    materials: clone(defaultMaterialSettings),
    panoramas: [],
    professional: { review: clone(emptyProjectReview) },
    autoSettings: {
      roomHeight: 2.5,
      minRoomArea: 1,
      includeWalls: true,
      includeCeiling: true,
      includeFloor: false,
      includeSkirting: false,
    },
  };
}

export function normalizeMobileProjectState(state: StoredProjectState): StoredProjectState {
  return {
    ...state,
    version: 3,
    status: state.status ?? "draft",
    fileName: state.fileName ?? "",
    pageCount: Math.max(1, state.pageCount || 1),
    includedPages: state.includedPages?.length ? state.includedPages : [1],
    scales: state.scales ?? {},
    measurements: normalizeLegacyPdfRoomGeometry(Array.isArray(state.measurements) ? state.measurements : []),
    materials: state.materials ? clone(state.materials) : clone(defaultMaterialSettings),
    panoramas: state.panoramas ?? [],
    professional: state.professional ?? { review: clone(emptyProjectReview) },
    autoSettings: state.autoSettings ?? createMobileProjectState().autoSettings,
  };
}
