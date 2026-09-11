import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../components/measure-app.tsx", import.meta.url), "utf8");

assert.doesNotMatch(source, /const\s+initialMeta\s*=\s*createInitialMeta\s*\(/, "Die Projekt-ID darf nicht beim Laden des Worker-Moduls erzeugt werden.");
assert.match(source, /useState<ProjectMeta>\(\(\)\s*=>\s*createInitialMeta\(\)\)/, "Die Projekt-ID muss erst innerhalb des React-Aufrufs erzeugt werden.");

console.log(JSON.stringify({ globalScopeRandomId: false, requestScopedInitialState: true }));
