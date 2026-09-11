import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createMobileProjectState } from "../lib/mobile-project";
import { handleProjectApi } from "../lib/server/project-api";
import type { D1DatabaseLike, D1Statement, ProjectStorageEnv, R2BucketLike } from "../lib/server/project-store";
import type { ProjectAuditEvent, ProjectSummary, StoredProjectResponse } from "../lib/project-storage-types";

class SqliteStatement implements D1Statement {
  private values: unknown[] = [];

  constructor(private readonly sqlite: DatabaseSync, private readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async all<T>() {
    return { results: this.sqlite.prepare(this.sql).all(...this.values) as T[] };
  }

  async first<T>() {
    return (this.sqlite.prepare(this.sql).get(...this.values) ?? null) as T | null;
  }

  async run() {
    return this.sqlite.prepare(this.sql).run(...this.values);
  }
}

const sqlite = new DatabaseSync(":memory:");
const d1: D1DatabaseLike = {
  prepare: (sql) => new SqliteStatement(sqlite, sql),
  batch: async (statements) => {
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  },
};

const deletedKeys: string[] = [];
const bucket: R2BucketLike = {
  get: async () => null,
  put: async () => ({}),
  delete: async (keys) => {
    deletedKeys.push(...(Array.isArray(keys) ? keys : [keys]));
    return {};
  },
};
const runtime: ProjectStorageEnv = { DB: d1, BUCKET: bucket };
const owner = "sqlite@example.com";
const headers = { "oai-authenticated-user-email": owner };

const initial = createMobileProjectState();
initial.meta.id = "project_sqlite_test";
initial.meta.title = "SQLite Integrationsprüfung";
initial.meta.customer = "Kunde A";

async function save(state: typeof initial, baseUpdatedAt = "") {
  const form = new FormData();
  form.append("state", JSON.stringify(state));
  form.append("baseUpdatedAt", baseUpdatedAt);
  const response = await handleProjectApi(new Request("https://example.com/api/projects", { method: "POST", headers, body: form }), runtime);
  assert.ok(response);
  return response!;
}

const createResponse = await save(initial);
assert.equal(createResponse.status, 201);
const created = await createResponse.json() as { project: ProjectSummary };
assert.equal(created.project.customer, "Kunde A");
assert.equal(created.project.trashedAt, null);

const changed = structuredClone(initial);
changed.meta.customer = "Kunde B";
const updateResponse = await save(changed, created.project.updatedAt);
assert.equal(updateResponse.status, 200);
const updated = await updateResponse.json() as { project: ProjectSummary };
assert.notEqual(updated.project.updatedAt, created.project.updatedAt, "Jeder Serverstand benötigt einen eindeutigen Konfliktzeitpunkt.");

const auditResponse = await handleProjectApi(new Request("https://example.com/api/projects/project_sqlite_test/audit", { headers }), runtime);
assert.equal(auditResponse?.status, 200);
const audit = await auditResponse?.json() as { events: ProjectAuditEvent[] };
assert.deepEqual(audit.events.map((event) => event.action), ["project.saved", "project.created"]);
assert.ok(audit.events[0].changes.some((change) => change.path === "meta.customer" && change.before === "Kunde A" && change.after === "Kunde B"));

const trashResponse = await handleProjectApi(new Request("https://example.com/api/projects/project_sqlite_test", { method: "DELETE", headers }), runtime);
assert.equal(trashResponse?.status, 200);
const trash = await trashResponse?.json() as { recoverable: boolean; trashedAt: string; deleteAfter: string };
assert.equal(trash.recoverable, true);
assert.ok(trash.trashedAt);
assert.ok(trash.deleteAfter);

const blockedChange = structuredClone(changed);
blockedChange.meta.customer = "Darf nicht gespeichert werden";
const blockedResponse = await save(blockedChange, updated.project.updatedAt);
assert.equal(blockedResponse.status, 410);
assert.equal((await blockedResponse.json() as { code: string }).code, "PROJECT_TRASHED");

const restoreResponse = await handleProjectApi(new Request("https://example.com/api/projects/project_sqlite_test", {
  method: "PATCH",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ trashed: false }),
}), runtime);
assert.equal(restoreResponse?.status, 200);

const openResponse = await handleProjectApi(new Request("https://example.com/api/projects/project_sqlite_test", { headers }), runtime);
assert.equal(openResponse?.status, 200);
const opened = await openResponse?.json() as StoredProjectResponse;
assert.equal(opened.state.meta.customer, "Kunde B", "Der während des Papierkorbs blockierte Stand darf die kanonische Projektakte nicht überschreiben.");
assert.equal(opened.project.trashedAt, null);

const versionCount = sqlite.prepare("SELECT COUNT(*) AS count FROM project_versions WHERE project_id = ?").get(initial.meta.id) as { count: number };
assert.equal(versionCount.count, 2);
assert.deepEqual(deletedKeys, []);
sqlite.close();

console.log(JSON.stringify({ create: true, update: true, auditEvents: audit.events.length, recoverableTrash: true, blockedTrashWrite: true, versions: versionCount.count }));
