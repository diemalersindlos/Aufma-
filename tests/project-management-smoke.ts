import assert from "node:assert/strict";
import { handleProjectApi } from "../lib/server/project-api";
import type { D1DatabaseLike, D1Statement, ProjectStorageEnv, R2BucketLike } from "../lib/server/project-store";

const projectId = "project_archive_test";
const owner = "test@example.com";
const storage = {
  projectExists: true,
  archivedAt: null as string | null,
  trashedAt: null as string | null,
  deleteAfter: null as string | null,
  versionStates: ["revision-1", "revision-2"],
  auditRows: [] as Array<{ id: string; project_id: string; actor: string; action: string; changes_json: string; created_at: string }>,
  deletedObjectKeys: [] as string[],
};

class FakeStatement implements D1Statement {
  private values: unknown[] = [];

  constructor(private readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async all<T>() {
    if (this.sql.startsWith("SELECT id, project_id, actor, action, changes_json")) {
      return { results: [...storage.auditRows].reverse() as T[] };
    }
    return { results: [] as T[] };
  }

  async first<T>() {
    if (!storage.projectExists) return null;
    if (this.values[0] !== projectId || this.values[1] !== owner) return null;
    if (this.sql.startsWith("SELECT id FROM projects")) return { id: projectId } as T;
    if (this.sql.startsWith("SELECT p.id, p.owner_email")) return { trashed_at: storage.trashedAt } as T;
    if (this.sql.startsWith("SELECT p.id,")) {
      return {
        id: projectId,
        archived_at: storage.archivedAt,
        trashed_at: storage.trashedAt,
        delete_after: storage.deleteAfter,
      } as T;
    }
    return null;
  }

  async run() {
    if (this.sql.startsWith("INSERT INTO project_archives")) storage.archivedAt = String(this.values[2]);
    if (this.sql.startsWith("DELETE FROM project_archives")) storage.archivedAt = null;
    if (this.sql.startsWith("INSERT INTO project_trash")) {
      storage.trashedAt = String(this.values[2]);
      storage.deleteAfter = String(this.values[3]);
    }
    if (this.sql.startsWith("DELETE FROM project_trash")) {
      storage.trashedAt = null;
      storage.deleteAfter = null;
    }
    if (this.sql.startsWith("INSERT INTO project_audit_log")) {
      storage.auditRows.push({
        id: String(this.values[0]),
        project_id: String(this.values[1]),
        actor: String(this.values[3]),
        action: String(this.values[4]),
        changes_json: String(this.values[5]),
        created_at: String(this.values[6]),
      });
    }
    return {};
  }
}

const db: D1DatabaseLike = {
  prepare: (sql) => new FakeStatement(sql),
  batch: async (statements) => Promise.all(statements.map((statement) => statement.run())),
};

const bucket: R2BucketLike = {
  get: async () => null,
  put: async () => ({}),
  delete: async (keys) => {
    storage.deletedObjectKeys.push(...(Array.isArray(keys) ? keys : [keys]));
    return {};
  },
};

const runtime: ProjectStorageEnv = { DB: db, BUCKET: bucket };
const headers = {
  "Content-Type": "application/json",
  "oai-authenticated-user-email": owner,
  "oai-authenticated-user-full-name": encodeURIComponent("Marcel Bening"),
  "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
};

const archiveResponse = await handleProjectApi(new Request(`https://example.com/api/projects/${projectId}`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ archived: true }),
}), runtime);
assert.equal(archiveResponse?.status, 200);
const archiveBody = await archiveResponse?.json() as { archived: boolean; archivedAt: string };
assert.equal(archiveBody.archived, true);
assert.ok(archiveBody.archivedAt);
assert.equal(storage.archivedAt, archiveBody.archivedAt);

const archiveRestoreResponse = await handleProjectApi(new Request(`https://example.com/api/projects/${projectId}`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ archived: false }),
}), runtime);
assert.equal(archiveRestoreResponse?.status, 200);
assert.equal(storage.archivedAt, null);

const invalidResponse = await handleProjectApi(new Request(`https://example.com/api/projects/${projectId}`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ archived: "ja" }),
}), runtime);
assert.equal(invalidResponse?.status, 400);

const trashResponse = await handleProjectApi(new Request(`https://example.com/api/projects/${projectId}`, {
  method: "DELETE",
  headers,
}), runtime);
assert.equal(trashResponse?.status, 200);
const trashBody = await trashResponse?.json() as { deleted: boolean; recoverable: boolean; trashedAt: string; deleteAfter: string };
assert.equal(trashBody.deleted, true);
assert.equal(trashBody.recoverable, true);
assert.equal(storage.trashedAt, trashBody.trashedAt);
assert.equal(storage.deleteAfter, trashBody.deleteAfter);
assert.ok(Date.parse(trashBody.deleteAfter) - Date.parse(trashBody.trashedAt) >= 29 * 24 * 60 * 60 * 1000);
assert.equal(storage.projectExists, true, "Die kanonische Projektakte darf beim Verschieben in den Papierkorb nicht gelöscht werden.");
assert.equal(storage.versionStates.length, 2, "Projektversionen müssen im Papierkorb erhalten bleiben.");
assert.deepEqual(storage.deletedObjectKeys, [], "PDF und 360°-Dateien dürfen im Papierkorb nicht aus R2 gelöscht werden.");

const blockedOpenResponse = await handleProjectApi(new Request(`https://example.com/api/projects/${projectId}`, {
  headers: { "oai-authenticated-user-email": owner },
}), runtime);
assert.equal(blockedOpenResponse?.status, 410);

const trashRestoreResponse = await handleProjectApi(new Request(`https://example.com/api/projects/${projectId}`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ trashed: false }),
}), runtime);
assert.equal(trashRestoreResponse?.status, 200);
assert.deepEqual(await trashRestoreResponse?.json(), { trashed: false, trashedAt: null, deleteAfter: null });
assert.equal(storage.trashedAt, null);

const auditResponse = await handleProjectApi(new Request(`https://example.com/api/projects/${projectId}/audit`, {
  headers: { "oai-authenticated-user-email": owner },
}), runtime);
assert.equal(auditResponse?.status, 200);
const auditBody = await auditResponse?.json() as { events: Array<{ actor: string; action: string; changes: unknown[] }> };
assert.deepEqual(auditBody.events.map((event) => event.action), ["project.restored", "project.trashed", "project.unarchived", "project.archived"]);
assert.ok(auditBody.events.every((event) => event.actor === "Marcel Bening"));
assert.ok(auditBody.events.every((event) => event.changes.length === 1));

console.log(JSON.stringify({ archived: true, archiveRestored: true, recoverableTrash: true, trashRestored: true, auditEvents: auditBody.events.length }));
