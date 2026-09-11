import assert from "node:assert/strict";
import { extractSpokenNumber, normalizeVoiceFieldValue } from "../lib/voice-field";

assert.equal(normalizeVoiceFieldValue("fünf Komma zwanzig Meter", "measurement"), "5,2");
assert.equal(normalizeVoiceFieldValue("zwei Meter fünfzig", "measurement"), "2,5");
assert.equal(normalizeVoiceFieldValue("zweihundertfünfzig Zentimeter", "measurement"), "2,5");
assert.equal(normalizeVoiceFieldValue("250 Zentimeter", "measurement"), "2,5");
assert.equal(normalizeVoiceFieldValue("drei Stück", "quantity"), "3");
assert.equal(normalizeVoiceFieldValue("wohnzimmer links", "text"), "Wohnzimmer links");
assert.equal(extractSpokenNumber("Höhe 2,65 Meter"), 2.65);

console.log(JSON.stringify({ decimal: "5,2", colloquial: "2,5", centimeters: "2,5", quantity: "3" }));
