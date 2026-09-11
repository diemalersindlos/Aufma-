import assert from "node:assert/strict";
import { USER_MANUAL_UPDATED, USER_MANUAL_VERSION, userManualSections } from "../lib/user-manual";

assert.match(USER_MANUAL_VERSION, /^\d+$/);
assert.match(USER_MANUAL_UPDATED, /^\d{2}\.\d{2}\.\d{4}$/);
assert.ok(userManualSections.length >= 12);

const manualText = userManualSections.flatMap((section) => [section.title, section.summary, ...section.steps, ...(section.tips ?? []), ...section.keywords]).join(" ").toLocaleLowerCase("de-DE");
for (const requiredTopic of ["pdf", "maßstab", "vob", "laibung", "bluetooth", "sprache", "apple pencil", "insta360", "tapete", "prüfcode", "gaeb", "version", "archiv", "löschen", "synchron", "fehler"]) {
  assert.ok(manualText.includes(requiredTopic), `Handbuchthema fehlt: ${requiredTopic}`);
}

assert.ok(userManualSections.some((section) => section.platform === "PC"));
assert.ok(userManualSections.some((section) => section.platform === "Mobil"));
assert.ok(userManualSections.some((section) => section.platform === "Alle"));

console.log(JSON.stringify({ version: USER_MANUAL_VERSION, updated: USER_MANUAL_UPDATED, sections: userManualSections.length }));
