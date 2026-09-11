export type AiMeasureTarget = "room" | "sketch" | "special" | "opening";
export type AiSpecialShape = "rectangle" | "triangle" | "trapezoid" | "gable" | "circle" | "semicircle";

export type AiMeasureCommand = {
  target: AiMeasureTarget;
  transcript: string;
  name?: string;
  roomName?: string;
  length?: number;
  width?: number;
  height?: number;
  quantity?: number;
  referenceSide?: number;
  referenceMeters?: number;
  exactArea?: number;
  exactPerimeter?: number;
  shape?: AiSpecialShape;
  a?: number;
  b?: number;
  radius?: number;
  includeWalls?: boolean;
  includeCeiling?: boolean;
  includeFloor?: boolean;
  includeSkirting?: boolean;
  confidence: number;
  understood: string[];
  missing: string[];
};

const numberWords: Record<string, string> = {
  null: "0", ein: "1", eins: "1", eine: "1", einen: "1", einer: "1",
  zwei: "2", drei: "3", vier: "4", fünf: "5", sechs: "6", sieben: "7",
  acht: "8", neun: "9", zehn: "10", elf: "11", zwölf: "12", dreizehn: "13",
  vierzehn: "14", fünfzehn: "15", sechzehn: "16", siebzehn: "17", achtzehn: "18",
  neunzehn: "19", zwanzig: "20",
};

const roomNames = [
  "wohnzimmer", "schlafzimmer", "kinderzimmer", "arbeitszimmer", "esszimmer",
  "treppenhaus", "abstellraum", "hauswirtschaftsraum", "küche", "badezimmer",
  "bad", "flur", "diele", "büro", "wc", "keller", "garage",
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTranscript(input: string) {
  let value = input.trim().toLocaleLowerCase("de-DE").replaceAll("×", " x ").replaceAll("·", " ");
  const words = Object.keys(numberWords).sort((left, right) => right.length - left.length).join("|");
  value = value.replace(new RegExp(`\\b(${words})\\s+komma\\s+(${words})\\b`, "gi"), (_, whole: string, decimal: string) => `${numberWords[whole]}\.${numberWords[decimal]}`);
  value = value.replace(new RegExp(`\\b(${words})\\b`, "gi"), (word: string) => numberWords[word] ?? word);
  return value
    .replace(/(\d)\s*,\s*(\d)/g, "$1.$2")
    .replace(/quadratmeter|qm|m²/g, "m2")
    .replace(/fußleiste|sockelleiste/g, "fußleiste")
    .replace(/fußleisten|sockelleisten/g, "fußleisten")
    .replace(/\s+/g, " ")
    .trim();
}

function numberAfter(text: string, labels: string[]) {
  const labelPattern = labels.map(escapeRegExp).join("|");
  const match = text.match(new RegExp(`(?:${labelPattern})\\s*(?:ist|sind|beträgt|von|=|:)?\\s*(\\d+(?:\\.\\d+)?)`, "i"));
  const value = match ? Number(match[1]) : undefined;
  return Number.isFinite(value) && Number(value) > 0 ? value : undefined;
}

function numberBefore(text: string, labels: string[]) {
  const labelPattern = labels.map(escapeRegExp).join("|");
  const match = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:m2|m|meter)?\\s*(?:${labelPattern})`, "i"));
  const value = match ? Number(match[1]) : undefined;
  return Number.isFinite(value) && Number(value) > 0 ? value : undefined;
}

function dimensionChain(text: string) {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:m|meter)?\s*(?:x|mal)\s*(\d+(?:\.\d+)?)\s*(?:m|meter)?(?:\s*(?:x|mal)\s*(\d+(?:\.\d+)?)\s*(?:m|meter)?)?/i);
  if (!match) return [];
  return [Number(match[1]), Number(match[2]), match[3] ? Number(match[3]) : undefined].filter((value): value is number => Number.isFinite(value));
}

function titleCase(value: string) {
  return value.charAt(0).toLocaleUpperCase("de-DE") + value.slice(1);
}

function detectedRoomName(text: string) {
  return roomNames.find((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(text));
}

function includesNegated(text: string, pattern: string) {
  return new RegExp(`(?:ohne|kein|keine|nicht)\\s+(?:die\\s+|den\\s+|der\\s+)?${pattern}`, "i").test(text);
}

function detectedQuantities(text: string) {
  const patterns = {
    includeWalls: "(?:wand|wände|wandflächen)",
    includeCeiling: "(?:decke|decken|deckenflächen)",
    includeFloor: "(?:boden|böden|bodenflächen)",
    includeSkirting: "(?:fußleiste|fußleisten)",
  } as const;
  const all = /\b(?:alles|alle flächen|komplett)\b/i.test(text);
  const hasMention = all || Object.values(patterns).some((pattern) => new RegExp(`\\b${pattern}\\b`, "i").test(text));
  if (!hasMention) return {};
  return Object.fromEntries(Object.entries(patterns).map(([key, pattern]) => [
    key,
    all ? !includesNegated(text, pattern) : new RegExp(`\\b${pattern}\\b`, "i").test(text) && !includesNegated(text, pattern),
  ])) as Pick<AiMeasureCommand, "includeWalls" | "includeCeiling" | "includeFloor" | "includeSkirting">;
}

function inferredTarget(text: string, fallback: AiMeasureTarget): AiMeasureTarget {
  if (/\b(?:tür|fenster|öffnung|durchgang)\b/i.test(text)) return "opening";
  if (/\b(?:freihand|skizze|skizzenraum|kontrollmaß|seite\s*\d+|s\s*\d+)\b/i.test(text)) return "sketch";
  if (/\b(?:giebel|dreieck|trapez|kreis|halbkreis|sonderfläche|nische|leibung)\b/i.test(text)) return "special";
  if (/\b(?:raum|zimmer|küche|bad|flur|diele|büro|keller|garage)\b/i.test(text)) return "room";
  return fallback;
}

function inferredShape(text: string): AiSpecialShape {
  if (/\bhalbkreis\b/i.test(text)) return "semicircle";
  if (/\bkreis\b/i.test(text)) return "circle";
  if (/\btrapez\b/i.test(text)) return "trapezoid";
  if (/\b(?:giebel|spitzgiebel)\b/i.test(text)) return "gable";
  if (/\bdreieck\b/i.test(text)) return "triangle";
  return "rectangle";
}

function addUnderstood(command: AiMeasureCommand, label: string, value: number | string | boolean | undefined) {
  if (value === undefined || value === "") return;
  command.understood.push(label);
}

export function parseAiMeasureInput(input: string, fallback: AiMeasureTarget = "room"): AiMeasureCommand {
  const text = normalizeTranscript(input);
  const target = inferredTarget(text, fallback);
  const chain = dimensionChain(text);
  const commonRoom = detectedRoomName(text);
  const quantities = detectedQuantities(text);
  const command: AiMeasureCommand = {
    target,
    transcript: input.trim(),
    confidence: 0.35,
    understood: [],
    missing: [],
    ...quantities,
  };

  const explicitHeight = numberAfter(text, ["raumhöhe", "wandhöhe", "höhe", "hoch"]) ?? numberBefore(text, ["hoch"]);
  const explicitQuantity = numberAfter(text, ["anzahl", "menge", "stück"]);
  const explicitLength = numberAfter(text, ["länge", "lang"]) ?? numberBefore(text, ["lang"]);
  const explicitWidth = numberAfter(text, ["breite", "breit"]) ?? numberBefore(text, ["breit"]);
  const exactArea = numberAfter(text, ["grundfläche", "bodenfläche", "fläche"]);
  const exactPerimeter = numberAfter(text, ["umfang"]);

  if (target === "room") {
    command.name = commonRoom ? titleCase(commonRoom) : undefined;
    command.length = explicitLength ?? chain[0];
    command.width = explicitWidth ?? chain[1];
    command.height = explicitHeight ?? chain[2];
    command.quantity = explicitQuantity;
    if (!command.length) command.missing.push("Länge");
    if (!command.width) command.missing.push("Breite");
  } else if (target === "sketch") {
    const sideMatch = text.match(/(?:seite|s)\s*(\d+)\s*(?:ist|=|hat|mit)?\s*(\d+(?:\.\d+)?)/i);
    const controlMeasure = numberAfter(text, ["kontrollmaß", "seitenlänge"]);
    command.name = commonRoom ? `${titleCase(commonRoom)} Skizze` : undefined;
    command.referenceSide = sideMatch ? Math.max(0, Number(sideMatch[1]) - 1) : undefined;
    command.referenceMeters = sideMatch ? Number(sideMatch[2]) : controlMeasure ?? explicitLength ?? chain[0];
    command.height = explicitHeight ?? (chain.length >= 2 ? chain.at(-1) : undefined);
    command.quantity = explicitQuantity;
    command.exactArea = exactArea;
    command.exactPerimeter = exactPerimeter;
    if (!command.referenceMeters) command.missing.push("Kontrollmaß einer Seite");
    command.missing.push("Raumkontur zeichnen oder prüfen");
  } else if (target === "opening") {
    const isWindow = /\bfenster\b/i.test(text);
    command.name = isWindow ? "Fenster" : /\bdurchgang\b/i.test(text) ? "Durchgang" : "Tür";
    command.roomName = commonRoom ? titleCase(commonRoom) : undefined;
    command.width = explicitWidth ?? chain[0];
    command.height = explicitHeight ?? chain[1];
    command.quantity = explicitQuantity;
    if (!command.width) command.missing.push("Breite");
    if (!command.height) command.missing.push("Höhe");
  } else {
    command.shape = inferredShape(text);
    command.name = command.shape === "gable" ? "Giebel" : command.shape === "triangle" ? "Dreieck" : command.shape === "trapezoid" ? "Trapez" : command.shape === "circle" ? "Kreisfläche" : command.shape === "semicircle" ? "Halbkreisfläche" : "Sonderfläche";
    const sideA = numberAfter(text, ["seite a", "a"]);
    const sideB = numberAfter(text, ["seite b", "b"]);
    const diameter = numberAfter(text, ["durchmesser"]);
    command.radius = numberAfter(text, ["radius"]) ?? (diameter ? diameter / 2 : undefined);
    command.a = sideA ?? explicitWidth ?? explicitLength ?? chain[0];
    command.b = sideB ?? (command.shape === "rectangle" || command.shape === "trapezoid" ? chain[1] : undefined);
    command.height = explicitHeight ?? (command.shape !== "rectangle" ? chain[1] : undefined);
    command.quantity = explicitQuantity;
    if ((command.shape === "circle" || command.shape === "semicircle") && !command.radius) command.missing.push("Radius");
    if (!(command.shape === "circle" || command.shape === "semicircle") && !command.a) command.missing.push("Breite / Seite a");
    if ((command.shape === "rectangle" || command.shape === "trapezoid") && !command.b) command.missing.push("Seite b");
    if ((command.shape === "triangle" || command.shape === "trapezoid" || command.shape === "gable") && !command.height) command.missing.push("Höhe");
  }

  addUnderstood(command, "Bereich", target);
  addUnderstood(command, "Bezeichnung", command.name);
  addUnderstood(command, "Länge", command.length);
  addUnderstood(command, "Breite", command.width);
  addUnderstood(command, "Höhe", command.height);
  addUnderstood(command, "Anzahl", command.quantity);
  addUnderstood(command, "Kontrollseite", command.referenceSide === undefined ? undefined : command.referenceSide + 1);
  addUnderstood(command, "Kontrollmaß", command.referenceMeters);
  addUnderstood(command, "Fläche", command.exactArea);
  addUnderstood(command, "Umfang", command.exactPerimeter);
  addUnderstood(command, "Form", command.shape);
  addUnderstood(command, "Seite a", command.a);
  addUnderstood(command, "Seite b", command.b);
  addUnderstood(command, "Radius", command.radius);
  if (Object.keys(quantities).length) command.understood.push("gewünschte Mengen");
  command.confidence = Math.max(0.35, Math.min(0.97, 0.48 + command.understood.length * 0.055 - command.missing.length * 0.025));
  return command;
}

function format(value: number | undefined, unit = "m") {
  return value === undefined ? "" : `${value.toLocaleString("de-DE", { maximumFractionDigits: 3 })} ${unit}`;
}

export function describeAiMeasureCommand(command: AiMeasureCommand) {
  const rows: Array<{ label: string; value: string }> = [];
  const targetLabel = command.target === "room" ? "Raum" : command.target === "sketch" ? "Freihandskizze" : command.target === "opening" ? "Tür / Fenster" : "Sonderfläche";
  rows.push({ label: "Bereich", value: targetLabel });
  if (command.name) rows.push({ label: "Bezeichnung", value: command.name });
  if (command.length !== undefined) rows.push({ label: "Länge", value: format(command.length) });
  if (command.width !== undefined) rows.push({ label: "Breite", value: format(command.width) });
  if (command.height !== undefined) rows.push({ label: "Höhe", value: format(command.height) });
  if (command.referenceMeters !== undefined) rows.push({ label: `Seite S${(command.referenceSide ?? 0) + 1}`, value: format(command.referenceMeters) });
  if (command.exactArea !== undefined) rows.push({ label: "Fläche", value: format(command.exactArea, "m²") });
  if (command.exactPerimeter !== undefined) rows.push({ label: "Umfang", value: format(command.exactPerimeter) });
  if (command.a !== undefined) rows.push({ label: "Seite a", value: format(command.a) });
  if (command.b !== undefined) rows.push({ label: "Seite b", value: format(command.b) });
  if (command.radius !== undefined) rows.push({ label: "Radius", value: format(command.radius) });
  if (command.quantity !== undefined) rows.push({ label: "Anzahl", value: `${command.quantity.toLocaleString("de-DE")} ×` });
  return rows;
}
