export type LaserMeasureTarget = "length" | "width" | "height";
export type LaserMeasurementSource = "bluetooth" | "native" | "manual-correction";

export type LaserMeasurementRecord = {
  target: LaserMeasureTarget;
  meters: number;
  receivedAt: string;
  source: LaserMeasurementSource;
  raw?: string;
  originalMeters?: number;
};

export type DecodedLaserMeasurement = {
  meters: number;
  raw: string;
  encoding: "text" | "float32-le" | "float32-be";
};

export const LASER_SEQUENCE: Array<{ target: LaserMeasureTarget; label: string }> = [
  { target: "length", label: "Länge" },
  { target: "width", label: "Breite" },
  { target: "height", label: "Höhe" },
];

export const LASER_BLE_PROFILES = [
  {
    id: "nordic-uart",
    label: "Bluetooth UART",
    service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
    characteristic: "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
  },
  {
    id: "hm10-uart",
    label: "BLE Serial",
    service: "0000ffe0-0000-1000-8000-00805f9b34fb",
    characteristic: "0000ffe1-0000-1000-8000-00805f9b34fb",
  },
] as const;

function plausibleMeters(value: number) {
  return Number.isFinite(value) && value >= 0.02 && value <= 250;
}

function byteView(input: ArrayBuffer | ArrayBufferView) {
  return input instanceof ArrayBuffer
    ? new Uint8Array(input)
    : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

function textMeasurement(raw: string): DecodedLaserMeasurement | null {
  const matches = [...raw.matchAll(/(?:^|[^\d])(-?\d{1,6}(?:[.,]\d{1,6})?)\s*(mm|cm|m)?(?=$|[^a-z\d])/gi)];
  for (const match of matches.reverse()) {
    const numeric = Number(match[1].replace(",", "."));
    const unit = match[2]?.toLocaleLowerCase("de-DE");
    const meters = unit === "mm" ? numeric / 1000 : unit === "cm" ? numeric / 100 : !unit && numeric > 250 ? numeric / 1000 : numeric;
    if (plausibleMeters(meters)) return { meters, raw: raw.trim(), encoding: "text" };
  }
  return null;
}

/**
 * Decodes the common payload formats used by Bluetooth serial laser adapters:
 * readable values with m/cm/mm and raw 32-bit floating point metre values.
 * Manufacturer-specific profiles can feed the same decoder after unwrapping
 * their protocol packet.
 */
export function decodeLaserMeasurement(input: ArrayBuffer | ArrayBufferView | string): DecodedLaserMeasurement | null {
  if (typeof input === "string") return textMeasurement(input);
  const bytes = byteView(input);
  const readable = new TextDecoder().decode(bytes).replace(/[\u0000-\u001f]+/g, " ").trim();
  const decodedText = textMeasurement(readable);
  if (decodedText) return decodedText;

  if (bytes.byteLength >= 4) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 0; offset <= bytes.byteLength - 4; offset += 1) {
      const littleEndian = view.getFloat32(offset, true);
      if (plausibleMeters(littleEndian)) return { meters: littleEndian, raw: [...bytes].map((value) => value.toString(16).padStart(2, "0")).join(" "), encoding: "float32-le" };
      if (plausibleMeters(littleEndian / 1000)) return { meters: littleEndian / 1000, raw: [...bytes].map((value) => value.toString(16).padStart(2, "0")).join(" "), encoding: "float32-le" };
      const bigEndian = view.getFloat32(offset, false);
      if (plausibleMeters(bigEndian)) return { meters: bigEndian, raw: [...bytes].map((value) => value.toString(16).padStart(2, "0")).join(" "), encoding: "float32-be" };
      if (plausibleMeters(bigEndian / 1000)) return { meters: bigEndian / 1000, raw: [...bytes].map((value) => value.toString(16).padStart(2, "0")).join(" "), encoding: "float32-be" };
    }
  }
  return null;
}

export function hasCompleteLaserSequence(records: LaserMeasurementRecord[]) {
  return LASER_SEQUENCE.every(({ target }) => records.some((record) => record.target === target && (record.source !== "manual-correction" || record.originalMeters !== undefined)));
}

export function nextLaserTarget(current: LaserMeasureTarget) {
  const index = LASER_SEQUENCE.findIndex((step) => step.target === current);
  return LASER_SEQUENCE[Math.min(index + 1, LASER_SEQUENCE.length - 1)]?.target ?? "height";
}

export function laserValue(value: number) {
  return value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}
