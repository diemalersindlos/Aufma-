import assert from "node:assert/strict";
import { calculateOpeningRule, VOB_RULESET, type OpeningRuleInput } from "../lib/vob-rules";

const threshold = 2.5;
const windowDimensions = [
  [0.5, 0.5, 1], [0.625, 0.8, 2], [0.8, 1.25, 1], [0.8, 2, 2], [1, 2, 1],
  [1, 2.49, 3], [1, 2.5, 1], [1.25, 2, 2], [2.5, 1, 1], [0.9, 2.8, 1],
  [1.26, 2, 2], [1.5, 1.8, 1], [1.5, 2, 3], [2, 1.5, 1], [2, 2, 2],
  [2.4, 1.2, 1], [3, 1, 2], [3.5, 1.5, 1], [4, 2, 1], [5, 2.5, 2],
] as const;
const modes: OpeningRuleInput["mode"][] = ["vob", "always", "never"];

let cases = 0;
for (const [width, height, quantity] of windowDimensions) {
  for (const mode of modes) {
    const result = calculateOpeningRule({
      name: `Fenster ${width} × ${height}`,
      openingKind: "window",
      width,
      height,
      quantity,
      mode,
      revealDepth: 0.18,
    }, threshold);
    const each = width * height;
    const gross = each * quantity;
    const expectedDeduction = mode === "always" ? gross : mode === "vob" && each > threshold ? gross : 0;
    assert.equal(result.ruleSetId, VOB_RULESET.id);
    assert.equal(result.determinate, true);
    assert.equal(result.each, each);
    assert.equal(result.gross, gross);
    assert.equal(result.deduct, expectedDeduction);
    assert.equal(result.overmeasured, mode === "vob" && each <= threshold);
    assert.equal(result.revealSeparate, mode === "always" || (mode === "vob" && each > threshold));
    assert.ok(Math.abs(result.revealGross - ((2 * height + width) * 0.18 * quantity)) < 1e-10);
    cases += 1;
  }
}

for (const [width, height, quantity] of windowDimensions.slice(0, 10)) {
  for (const mode of modes) {
    const result = calculateOpeningRule({
      name: "Tür",
      openingKind: "door",
      width,
      height,
      quantity,
      mode,
      revealDepth: 0.25,
    }, threshold);
    const each = width * height;
    assert.equal(result.determinate, true);
    assert.equal(result.effectiveMode, "vob");
    assert.equal(result.deduct, each > threshold ? each * quantity : 0);
    assert.equal(result.overmeasured, each <= threshold);
    assert.equal(result.revealDepth, 0);
    assert.equal(result.revealGross, 0);
    assert.equal(result.revealResult, 0);
    cases += 1;
  }
}

const exactBoundary = calculateOpeningRule({ name: "Fenster Grenzwert", openingKind: "window", width: 1.25, height: 2, quantity: 1, mode: "vob", revealDepth: 0.2 }, threshold);
assert.equal(exactBoundary.each, threshold);
assert.equal(exactBoundary.deduct, 0);
assert.equal(exactBoundary.overmeasured, true);

const invalid = calculateOpeningRule({ name: "Fehleingabe", width: Number.NaN, height: -1, quantity: 0, mode: "vob", revealDepth: -0.2 }, Number.NaN);
assert.equal(invalid.determinate, false);
assert.equal(invalid.deduct, 0);
assert.equal(invalid.overmeasured, false);
assert.match(invalid.explanation, /nicht eindeutig/);

assert.equal(cases, 90);
console.log(JSON.stringify({ cases, boundary: exactBoundary.each, invalidIssues: invalid.issues }));

