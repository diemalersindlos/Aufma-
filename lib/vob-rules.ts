/**
 * Versioniertes Regelmodul für Öffnungen und Laibungen.
 *
 * Die konkrete Vertrags-/ATV-Ausgabe und der Schwellenwert müssen je Projekt
 * fachlich bestätigt werden. Das Modul bildet ausschließlich die vom Benutzer
 * bestätigte Projekteinstellung nachvollziehbar ab.
 */
export const VOB_RULESET = {
  id: "vob-openings-2019-09-project-rule-v1",
  label: "Öffnungen und dreiseitige Laibungen",
  standardReferences: ["ATV DIN 18363:2019-09", "ATV DIN 18366:2019-09"],
  requiresProjectConfirmation: true,
} as const;

export type OpeningRuleInput = {
  name: string;
  width: number;
  height: number;
  quantity: number;
  mode: "vob" | "always" | "never";
  openingKind?: "door" | "window" | "other";
  revealDepth?: number;
};

export type OpeningRuleIssueCode =
  | "INVALID_THRESHOLD"
  | "INVALID_WIDTH"
  | "INVALID_HEIGHT"
  | "INVALID_QUANTITY"
  | "INVALID_REVEAL_DEPTH";

export type OpeningRuleResult = {
  ruleSetId: string;
  determinate: boolean;
  issues: OpeningRuleIssueCode[];
  each: number;
  gross: number;
  deduct: number;
  overmeasured: boolean;
  isDoor: boolean;
  effectiveMode: OpeningRuleInput["mode"];
  threshold: number;
  revealDepth: number;
  revealSides: 3;
  revealLength: number;
  revealGross: number;
  revealSeparate: boolean;
  revealResult: number;
  explanation: string;
};

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function calculateOpeningRule(opening: OpeningRuleInput, threshold: number): OpeningRuleResult {
  const issues: OpeningRuleIssueCode[] = [];
  if (!isFiniteNonNegative(threshold)) issues.push("INVALID_THRESHOLD");
  if (!isFinitePositive(opening.width)) issues.push("INVALID_WIDTH");
  if (!isFinitePositive(opening.height)) issues.push("INVALID_HEIGHT");
  if (!isFinitePositive(opening.quantity)) issues.push("INVALID_QUANTITY");
  if (opening.revealDepth !== undefined && !isFiniteNonNegative(opening.revealDepth)) issues.push("INVALID_REVEAL_DEPTH");

  const width = isFinitePositive(opening.width) ? opening.width : 0;
  const height = isFinitePositive(opening.height) ? opening.height : 0;
  const quantity = isFinitePositive(opening.quantity) ? opening.quantity : 0;
  const safeThreshold = isFiniteNonNegative(threshold) ? threshold : 0;
  const isDoor = opening.openingKind === "door"
    || (opening.openingKind === undefined && /^tür\b/i.test(opening.name.trim()));
  const effectiveMode = isDoor ? "vob" : opening.mode;
  const determinate = issues.length === 0;
  const each = width * height;
  const gross = each * quantity;

  let deduct = 0;
  let overmeasured = false;
  if (determinate) {
    if (effectiveMode === "always") deduct = gross;
    else if (effectiveMode === "vob") {
      deduct = each > safeThreshold ? gross : 0;
      overmeasured = each <= safeThreshold;
    }
  }

  // Türen werden als Zargenöffnung geführt und erhalten in diesem Projektsatz
  // keine Laibungszulage. Andere Öffnungen werden links, rechts und oben erfasst.
  const revealDepth = isDoor || !isFiniteNonNegative(opening.revealDepth) ? 0 : opening.revealDepth;
  const revealLength = 2 * height + width;
  const revealGross = revealLength * revealDepth * quantity;
  const revealSeparate = determinate
    && !isDoor
    && (opening.mode === "always" || (opening.mode === "vob" && each > safeThreshold));
  const revealResult = revealSeparate ? revealGross : 0;

  const explanation = !determinate
    ? "Berechnung konnte nicht eindeutig durchgeführt werden. Bitte Eingabe kontrollieren."
    : effectiveMode === "never"
      ? "Öffnung wird gemäß Projekteinstellung nicht abgezogen."
      : overmeasured
        ? `Einzelöffnung ${each.toFixed(3)} m² liegt bis einschließlich der bestätigten Projektgrenze ${safeThreshold.toFixed(3)} m² und wird übermessen.`
        : `Einzelöffnung ${each.toFixed(3)} m² wird gemäß bestätigter Projekteinstellung vollständig abgezogen.`;

  return {
    ruleSetId: VOB_RULESET.id,
    determinate,
    issues,
    each,
    gross,
    deduct,
    overmeasured,
    isDoor,
    effectiveMode,
    threshold: safeThreshold,
    revealDepth,
    revealSides: 3,
    revealLength,
    revealGross,
    revealSeparate,
    revealResult,
    explanation,
  };
}

