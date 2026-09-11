import assert from "node:assert/strict";
import { isAutoReplaceInputType } from "../components/auto-replace-inputs";

for (const supportedType of ["text", "number", "search", "email", "tel", "url", "password", "TEXT"]) {
  assert.equal(isAutoReplaceInputType(supportedType), true, `${supportedType} muss automatisch ersetzbar sein.`);
}

for (const protectedType of ["checkbox", "radio", "file", "range", "date", "color", "hidden", "button"]) {
  assert.equal(isAutoReplaceInputType(protectedType), false, `${protectedType} darf nicht automatisch markiert werden.`);
}

console.log(JSON.stringify({ autoReplaceTypes: 7, protectedControls: 8 }));
