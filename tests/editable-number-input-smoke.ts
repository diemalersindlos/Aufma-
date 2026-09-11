import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { numberToEditableDraft, parseEditableNumberDraft } from "../components/editable-number-input";

assert.equal(parseEditableNumberDraft(""), null, "Ein gelöschtes Zahlenfeld darf nicht zu 0 werden.");
assert.equal(parseEditableNumberDraft("   "), null);
assert.equal(parseEditableNumberDraft("2,90"), 2.9);
assert.equal(parseEditableNumberDraft("2.90"), 2.9);
assert.equal(parseEditableNumberDraft("0"), 0, "Eine bewusst eingegebene 0 bleibt von einem leeren Feld unterscheidbar.");
assert.equal(parseEditableNumberDraft("unbestimmt"), null);
assert.equal(numberToEditableDraft(0), "0");
assert.equal(numberToEditableDraft(2.5), "2.5");
assert.equal(numberToEditableDraft(Number.NaN), "");

for (const file of [
  "components/measure-app.tsx",
  "components/professional-suite.tsx",
  "components/insta360-measure.tsx",
]) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  assert.doesNotMatch(
    source,
    /<input[^>]*type="number"/,
    `${file} darf kein Zahlenfeld mehr direkt an einen number-State binden.`,
  );
  assert.match(source, /EditableNumberInput/, `${file} muss die löschbare Zahlenfeldeingabe verwenden.`);
}

console.log(JSON.stringify({ emptyDraft: "preserved", explicitZero: "preserved", checkedSurfaces: 3 }));
