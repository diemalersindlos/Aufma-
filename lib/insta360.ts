import { createId, type Measurement, type Opening } from "@/lib/measurements";

export type PanoramaAsset = {
  id: string;
  fileName: string;
  width: number;
  height: number;
  cameraModel: string;
  roomName: string;
  createdAt: string;
};

export type RoomShape = "rectangle" | "free";
export type ReferenceMethod = "laser" | "known" | "manual";

export type Insta360OpeningInput = {
  id: string;
  name: string;
  width: number;
  height: number;
  quantity: number;
  mode: Opening["mode"];
};

export type Insta360RoomInput = {
  panorama: PanoramaAsset;
  page: number;
  roomName: string;
  shape: RoomShape;
  length: number;
  width: number;
  area: number;
  perimeter: number;
  height: number;
  quantity: number;
  factor: number;
  includeFloor: boolean;
  includeCeiling: boolean;
  includeWalls: boolean;
  includeSkirting: boolean;
  referenceMethod: ReferenceMethod;
  openings: Insta360OpeningInput[];
  color: string;
};

function positive(value: number) {
  return Number.isFinite(value) && value > 0;
}

export function panoramaAspectStatus(width: number, height: number) {
  if (!positive(width) || !positive(height)) return "unknown" as const;
  const ratio = width / height;
  if (ratio >= 1.86 && ratio <= 2.14) return "equirectangular" as const;
  return "flat" as const;
}

export function calculateInsta360RoomGeometry(input: Pick<Insta360RoomInput, "shape" | "length" | "width" | "area" | "perimeter" | "height">) {
  const area = input.shape === "rectangle" ? input.length * input.width : input.area;
  const perimeter = input.shape === "rectangle" ? 2 * (input.length + input.width) : input.perimeter;
  return {
    area: positive(area) ? area : 0,
    perimeter: positive(perimeter) ? perimeter : 0,
    wallArea: positive(perimeter) && positive(input.height) ? perimeter * input.height : 0,
  };
}

export function referenceMethodLabel(method: ReferenceMethod) {
  if (method === "laser") return "Laser-Kontrollmaß";
  if (method === "known") return "bekanntes Kontrollmaß";
  return "manuelle Maßeingabe";
}

export function buildInsta360RoomMeasurement(input: Insta360RoomInput): Measurement {
  const geometry = calculateInsta360RoomGeometry(input);
  if (!input.roomName.trim() || !positive(geometry.area) || !positive(geometry.perimeter) || !positive(input.height)) {
    throw new Error("Raumbezeichnung, Grundfläche, Umfang und Höhe müssen vollständig sein.");
  }

  const points = input.shape === "rectangle"
    ? [
        { x: 0, y: 0 },
        { x: input.length, y: 0 },
        { x: input.length, y: input.width },
        { x: 0, y: input.width },
      ]
    : [
        { x: 0, y: 0 },
        { x: geometry.area, y: 0 },
        { x: geometry.area, y: 1 },
        { x: 0, y: 1 },
      ];

  return {
    id: createId("room360"),
    kind: "room",
    name: input.roomName.trim(),
    page: Math.max(1, Math.trunc(input.page || 1)),
    points,
    color: input.color,
    height: input.height,
    heightSource: "manual",
    heightNote: "Raumhöhe beim 360°-Aufmaß eingetragen.",
    quantity: input.quantity,
    factor: input.factor,
    includeFloor: input.includeFloor,
    includeCeiling: input.includeCeiling,
    includeWalls: input.includeWalls,
    includeSkirting: input.includeSkirting,
    openings: input.openings.map((opening) => ({
      id: opening.id || createId("opening360"),
      name: opening.name.trim() || "Öffnung",
      width: opening.width,
      height: opening.height,
      quantity: opening.quantity,
      mode: opening.mode,
    })),
    source: "manual",
    areaOverride: geometry.area,
    perimeterOverride: geometry.perimeter,
    areaSource: "insta360-reference",
    captureSource: {
      type: "insta360",
      panoramaId: input.panorama.id,
      fileName: input.panorama.fileName,
      cameraModel: input.panorama.cameraModel,
      referenceMethod: input.referenceMethod,
      shape: input.shape,
      length: input.shape === "rectangle" ? input.length : undefined,
      width: input.shape === "rectangle" ? input.width : undefined,
    },
    visible: true,
    createdAt: new Date().toISOString(),
  };
}
