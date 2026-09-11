import { buildProjectChanges, lifecycleChange } from "../project-audit";
import type { ProjectAuditChange, ProjectAuditEvent, ProjectSummary, StoredProjectResponse, StoredProjectState } from "../project-storage-types";
import { parseStoredProjectState } from "../project-state-validation";
import {
  ensureProjectSchema,
  getProjectStorage,
  json,
  projectActor,
  projectOwner,
  projectObjectPrefix,
  projectPanoramaKey,
  safeProjectId,
  storageError,
  type D1DatabaseLike,
  type ProjectRow,
  type ProjectStorageEnv,
} from "./project-store";

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_PANORAMA_BYTES = 80 * 1024 * 1024;
const TRASH_RETENTION_DAYS = 30;
const PROJECT_SELECT = `SELECT p.id, p.owner_email, p.title, p.customer, p.address, p.reference,
  p.file_name, p.page_count, p.position_count, p.status, p.state_json, p.pdf_key, p.created_at, p.updated_at,
  (SELECT a.archived_at FROM project_archives a WHERE a.project_id = p.id AND a.owner_email = p.owner_email) AS archived_at,
  (SELECT t.deleted_at FROM project_trash t WHERE t.project_id = p.id AND t.owner_email = p.owner_email) AS trashed_at,
  (SELECT t.delete_after FROM project_trash t WHERE t.project_id = p.id AND t.owner_email = p.owner_email) AS delete_after
  FROM projects p`;

function nextProjectTimestamp(previous: string | undefined) {
  const current = Date.now();
  const previousTime = previous ? Date.parse(previous) : Number.NaN;
  return new Date(Number.isFinite(previousTime) && current <= previousTime ? previousTime + 1 : current).toISOString();
}

function auditStatement(db: D1DatabaseLike, input: {
  id?: string;
  projectId: string;
  owner: string;
  actor: string;
  action: string;
  changes: ProjectAuditChange[];
  createdAt: string;
  guardUpdatedAt?: string;
}) {
  const values = [input.id ?? crypto.randomUUID(), input.projectId, input.owner, input.actor, input.action, JSON.stringify(input.changes), input.createdAt];
  if (input.guardUpdatedAt) {
    return db.prepare(`INSERT INTO project_audit_log (id, project_id, owner_email, actor, action, changes_json, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM projects p WHERE p.id = ? AND p.owner_email = ? AND p.updated_at = ?)
        AND NOT EXISTS (SELECT 1 FROM project_trash t WHERE t.project_id = ? AND t.owner_email = ?)`)
      .bind(...values, input.projectId, input.owner, input.guardUpdatedAt, input.projectId, input.owner);
  }
  return db.prepare("INSERT INTO project_audit_log (id, project_id, owner_email, actor, action, changes_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(...values);
}

function summary(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    title: row.title,
    customer: row.customer,
    address: row.address,
    reference: row.reference,
    fileName: row.file_name,
    pageCount: row.page_count,
    positionCount: row.position_count,
    status: row.status,
    hasPdf: Boolean(row.pdf_key),
    archivedAt: row.archived_at ?? null,
    trashedAt: row.trashed_at ?? null,
    deleteAfter: row.delete_after ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function decodedProjectId(value: string | undefined) {
  if (!value) return null;
  try {
    return safeProjectId(decodeURIComponent(value));
  } catch {
    return null;
  }
}

async function listProjects(request: Request, runtime: ProjectStorageEnv) {
  const owner = projectOwner(request);
  if (!owner) return json({ error: "Anmeldung erforderlich." }, 401);
  try {
    const { db } = getProjectStorage(runtime);
    await ensureProjectSchema(db);
    const result = await db.prepare(`${PROJECT_SELECT} WHERE p.owner_email = ? ORDER BY (trashed_at IS NOT NULL), (archived_at IS NOT NULL), COALESCE(trashed_at, archived_at, p.updated_at) DESC LIMIT 200`)
      .bind(owner)
      .all<ProjectRow>();
    return json({ projects: (result.results ?? []).map(summary) });
  } catch (error) {
    return storageError(error);
  }
}

async function saveProject(request: Request, runtime: ProjectStorageEnv) {
  const owner = projectOwner(request);
  if (!owner) return json({ error: "Anmeldung erforderlich." }, 401);
  let stagedPdfKey: string | null = null;
  try {
    const form = await request.formData();
    const rawState = form.get("state");
    if (typeof rawState !== "string") return json({ error: "Projektdaten fehlen." }, 400);

    const validation = parseStoredProjectState(rawState);
    if (!validation.ok) return json({ error: validation.error }, 400);
    const state = validation.state;
    const projectId = safeProjectId(state.meta.id)!;
    const baseUpdatedAtEntry = form.get("baseUpdatedAt");
    const baseUpdatedAt = typeof baseUpdatedAtEntry === "string" ? baseUpdatedAtEntry.trim() : "";

    const { db, bucket } = getProjectStorage(runtime);
    await ensureProjectSchema(db);
    const existing = await db.prepare(`SELECT p.pdf_key, p.created_at, p.updated_at, p.state_json,
      (SELECT t.deleted_at FROM project_trash t WHERE t.project_id = p.id AND t.owner_email = p.owner_email) AS trashed_at
      FROM projects p WHERE p.id = ? AND p.owner_email = ?`)
      .bind(projectId, owner)
      .first<{ pdf_key: string | null; created_at: string; updated_at: string; state_json: string; trashed_at: string | null }>();

    if (existing?.trashed_at) {
      return json({ code: "PROJECT_TRASHED", error: "Dieses Projekt liegt im Papierkorb. Bitte zuerst wiederherstellen; der lokale Entwurf bleibt erhalten." }, 410);
    }

    if (existing) {
      let storedClientTimestamp = "";
      let storedServerTimestamp = "";
      try {
        const storedState = JSON.parse(existing.state_json) as StoredProjectState;
        storedClientTimestamp = storedState.meta?.updatedAt ?? "";
        storedServerTimestamp = storedState.meta?.serverUpdatedAt ?? "";
      } catch {
        // Der kanonische Datenbankzeitpunkt bleibt als sichere Vergleichsbasis erhalten.
      }
      const acceptedBases = new Set([existing.updated_at, storedClientTimestamp, storedServerTimestamp].filter(Boolean));
      if (!baseUpdatedAt || !acceptedBases.has(baseUpdatedAt)) {
        return json({
          code: "PROJECT_CONFLICT",
          error: "Dieses Projekt wurde seit dem Öffnen auf einem anderen Gerät geändert. Der lokale Entwurf bleibt erhalten. Bitte den Serverstand neu laden und die Änderungen bewusst zusammenführen.",
          serverUpdatedAt: existing.updated_at,
        }, 409);
      }
    }

    const pdfEntry = form.get("pdf");
    let pdfKey = existing?.pdf_key ?? null;
    if (pdfEntry instanceof File && pdfEntry.size > 0) {
      if (pdfEntry.size > MAX_PDF_BYTES) return json({ error: "Die PDF darf höchstens 50 MB groß sein." }, 413);
      if (pdfEntry.type && pdfEntry.type !== "application/pdf" && !pdfEntry.name.toLowerCase().endsWith(".pdf")) {
        return json({ error: "Als Plananlage ist nur eine PDF-Datei zulässig." }, 400);
      }
      stagedPdfKey = `${projectObjectPrefix(owner, projectId)}/source-${crypto.randomUUID()}.pdf`;
      pdfKey = stagedPdfKey;
      await bucket.put(pdfKey, await pdfEntry.arrayBuffer(), {
        httpMetadata: {
          contentType: "application/pdf",
          contentDisposition: `inline; filename="${state.fileName.replace(/["\\\r\n]/g, "_") || "grundriss.pdf"}`,
        },
        customMetadata: { projectId, owner, originalName: state.fileName.slice(0, 500) },
      });
    }

    const now = nextProjectTimestamp(existing?.updated_at);
    const createdAt = existing?.created_at ?? now;
    const canonicalState: StoredProjectState = {
      ...state,
      meta: { ...state.meta, updatedAt: now, serverUpdatedAt: now },
    };
    const canonicalJson = JSON.stringify(canonicalState);
    const expectedUpdatedAt = existing?.updated_at ?? "";
    let previousState: StoredProjectState | null = null;
    if (existing) {
      try {
        previousState = JSON.parse(existing.state_json) as StoredProjectState;
      } catch {
        // Der neue, validierte Stand bleibt speicherbar; die beschädigte Vorgeschichte wird nicht als Feldvergleich ausgegeben.
      }
    }
    const changes = buildProjectChanges(previousState, canonicalState);
    const statements = [db.prepare(`INSERT INTO projects (
      id, owner_email, title, customer, address, reference, file_name, page_count,
      position_count, status, state_json, pdf_key, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      customer = excluded.customer,
      address = excluded.address,
      reference = excluded.reference,
      file_name = excluded.file_name,
      page_count = excluded.page_count,
      position_count = excluded.position_count,
      status = excluded.status,
      state_json = excluded.state_json,
      pdf_key = COALESCE(excluded.pdf_key, projects.pdf_key),
      updated_at = excluded.updated_at
    WHERE projects.owner_email = excluded.owner_email AND projects.updated_at = ?
      AND NOT EXISTS (SELECT 1 FROM project_trash t WHERE t.project_id = projects.id AND t.owner_email = projects.owner_email)`)
      .bind(
        projectId,
        owner,
        state.meta.title.trim().slice(0, 300),
        (state.meta.customer ?? "").slice(0, 300),
        (state.meta.address ?? "").slice(0, 600),
        (state.meta.reference ?? "").slice(0, 200),
        (state.fileName ?? "").slice(0, 500),
        Math.max(0, Math.trunc(state.pageCount || 0)),
        state.measurements.length,
        state.status,
        canonicalJson,
        pdfKey,
        createdAt,
        now,
        expectedUpdatedAt,
      )
      , db.prepare(`INSERT INTO project_versions (project_id, owner_email, revision, status, state_json, created_at)
        SELECT ?, ?, COALESCE(MAX(v.revision), 0) + 1, ?, ?, ?
        FROM project_versions v
        WHERE v.project_id = ? AND v.owner_email = ?
        HAVING EXISTS (SELECT 1 FROM projects p WHERE p.id = ? AND p.owner_email = ? AND p.updated_at = ?)
          AND NOT EXISTS (SELECT 1 FROM project_trash t WHERE t.project_id = ? AND t.owner_email = ?)`)
        .bind(projectId, owner, state.status, canonicalJson, now, projectId, owner, projectId, owner, now, projectId, owner),
    ];
    if (changes.length) statements.push(auditStatement(db, {
      projectId,
      owner,
      actor: projectActor(request, owner),
      action: existing ? "project.saved" : "project.created",
      changes,
      createdAt: now,
      guardUpdatedAt: now,
    }));
    await db.batch(statements);

    const saved = await db.prepare(`${PROJECT_SELECT} WHERE p.id = ? AND p.owner_email = ?`)
      .bind(projectId, owner)
      .first<ProjectRow>();
    if (!saved) return json({ error: "Das Projekt konnte nicht gespeichert werden." }, 500);
    if (saved.trashed_at) {
      if (stagedPdfKey) await bucket.delete(stagedPdfKey).catch(() => undefined);
      return json({ code: "PROJECT_TRASHED", error: "Das Projekt wurde während der Bearbeitung in den Papierkorb verschoben. Der lokale Entwurf bleibt erhalten; bitte zuerst wiederherstellen." }, 410);
    }
    if (saved.updated_at !== now) {
      if (stagedPdfKey) await bucket.delete(stagedPdfKey).catch(() => undefined);
      return json({
        code: "PROJECT_CONFLICT",
        error: "Zeitgleiche Änderung erkannt. Der lokale Entwurf wurde nicht überschrieben. Bitte den Serverstand neu laden und die Änderungen bewusst zusammenführen.",
        serverUpdatedAt: saved.updated_at,
      }, 409);
    }
    if (stagedPdfKey && existing?.pdf_key && existing.pdf_key !== stagedPdfKey) {
      await bucket.delete(existing.pdf_key).catch(() => undefined);
    }
    return json({ project: summary(saved) }, existing ? 200 : 201);
  } catch (error) {
    if (stagedPdfKey && runtime.BUCKET) await runtime.BUCKET.delete(stagedPdfKey).catch(() => undefined);
    return storageError(error);
  }
}

async function listProjectVersions(request: Request, runtime: ProjectStorageEnv, projectId: string) {
  const owner = projectOwner(request);
  if (!owner) return json({ error: "Anmeldung erforderlich." }, 401);
  try {
    const { db } = getProjectStorage(runtime);
    await ensureProjectSchema(db);
    const project = await db.prepare(`SELECT p.id, p.updated_at,
      (SELECT t.deleted_at FROM project_trash t WHERE t.project_id = p.id AND t.owner_email = p.owner_email) AS trashed_at
      FROM projects p WHERE p.id = ? AND p.owner_email = ?`).bind(projectId, owner).first<{ id: string; updated_at: string; trashed_at: string | null }>();
    if (!project) return json({ error: "Projekt nicht gefunden." }, 404);
    if (project.trashed_at) return json({ error: "Dieses Projekt liegt im Papierkorb. Bitte zuerst wiederherstellen." }, 410);
    const result = await db.prepare("SELECT revision, status, created_at FROM project_versions WHERE project_id = ? AND owner_email = ? ORDER BY revision DESC LIMIT 50")
      .bind(projectId, owner)
      .all<{ revision: number; status: string; created_at: string }>();
    return json({ versions: (result.results ?? []).map((version) => ({ revision: version.revision, status: version.status, createdAt: version.created_at })) });
  } catch (error) {
    return storageError(error);
  }
}

async function restoreProjectVersion(request: Request, runtime: ProjectStorageEnv, projectId: string, revision: number) {
  const owner = projectOwner(request);
  if (!owner) return json({ error: "Anmeldung erforderlich." }, 401);
  try {
    const { db } = getProjectStorage(runtime);
    await ensureProjectSchema(db);
    const project = await db.prepare(`SELECT p.id, p.updated_at,
      (SELECT t.deleted_at FROM project_trash t WHERE t.project_id = p.id AND t.owner_email = p.owner_email) AS trashed_at
      FROM projects p WHERE p.id = ? AND p.owner_email = ?`)
      .bind(projectId, owner)
      .first<{ id: string; updated_at: string; trashed_at: string | null }>();
    if (!project) return json({ error: "Projekt nicht gefunden." }, 404);
    if (project.trashed_at) return json({ error: "Dieses Projekt liegt im Papierkorb. Bitte zuerst wiederherstellen." }, 410);
    const version = await db.prepare("SELECT state_json FROM project_versions WHERE project_id = ? AND owner_email = ? AND revision = ?")
      .bind(projectId, owner, revision)
      .first<{ state_json: string }>();
    if (!version) return json({ error: "Projektversion nicht gefunden." }, 404);
    const state = JSON.parse(version.state_json) as StoredProjectState;
    return json({ state: { ...state, meta: { ...state.meta, serverUpdatedAt: project.updated_at } }, revision });
  } catch (error) {
    return storageError(error);
  }
}

async function getProject(request: Request, runtime: ProjectStorageEnv, projectId: string) {
  const owner = projectOwner(request);
  if (!owner) return json({ error: "Anmeldung erforderlich." }, 401);
  try {
    const { db } = getProjectStorage(runtime);
    await ensureProjectSchema(db);
    const row = await db.prepare(`${PROJECT_SELECT} WHERE p.id = ? AND p.owner_email = ?`)
      .bind(projectId, owner)
      .first<ProjectRow>();
    if (!row) return json({ error: "Projekt nicht gefunden." }, 404);
    if (row.trashed_at) return json({ error: "Dieses Projekt liegt im Papierkorb. Bitte zuerst wiederherstellen." }, 410);
    let state: StoredProjectState;
    try {
      state = JSON.parse(row.state_json) as StoredProjectState;
    } catch {
      return json({ error: "Die gespeicherten Aufmaßdaten sind beschädigt." }, 500);
    }
    state = { ...state, meta: { ...state.meta, serverUpdatedAt: row.updated_at } };
    const response: StoredProjectResponse = { project: summary(row), state };
    return json(response);
  } catch (error) {
    return storageError(error);
  }
}

async function setProjectLifecycle(request: Request, runtime: ProjectStorageEnv, projectId: string) {
  const owner = projectOwner(request);
  if (!owner) return json({ error: "Anmeldung erforderlich." }, 401);
  try {
    const body = await request.json().catch(() => null) as { archived?: unknown; trashed?: unknown } | null;
    const hasArchiveCommand = typeof body?.archived === "boolean";
    const hasTrashCommand = typeof body?.trashed === "boolean";
    if (Number(hasArchiveCommand) + Number(hasTrashCommand) !== 1) return json({ error: "Genau ein gültiger Archiv- oder Papierkorbstatus ist erforderlich." }, 400);
    const { db } = getProjectStorage(runtime);
    await ensureProjectSchema(db);
    const project = await db.prepare(`SELECT p.id,
      (SELECT a.archived_at FROM project_archives a WHERE a.project_id = p.id AND a.owner_email = p.owner_email) AS archived_at,
      (SELECT t.deleted_at FROM project_trash t WHERE t.project_id = p.id AND t.owner_email = p.owner_email) AS trashed_at
      FROM projects p WHERE p.id = ? AND p.owner_email = ?`)
      .bind(projectId, owner)
      .first<{ id: string; archived_at: string | null; trashed_at: string | null }>();
    if (!project) return json({ error: "Projekt nicht gefunden." }, 404);
    const actor = projectActor(request, owner);

    if (hasArchiveCommand) {
      if (project.trashed_at) return json({ error: "Ein Projekt im Papierkorb kann nicht archiviert werden. Bitte zuerst wiederherstellen." }, 409);
      const archived = body!.archived as boolean;
      if (archived) {
        if (project.archived_at) return json({ archived: true, archivedAt: project.archived_at });
        const archivedAt = new Date().toISOString();
        await db.batch([
          db.prepare("INSERT INTO project_archives (project_id, owner_email, archived_at) VALUES (?, ?, ?) ON CONFLICT(project_id, owner_email) DO UPDATE SET archived_at = excluded.archived_at")
            .bind(projectId, owner, archivedAt),
          auditStatement(db, { projectId, owner, actor, action: "project.archived", changes: lifecycleChange("Projektablage", project.archived_at ? "Archiv" : "Aktiv", "Archiv"), createdAt: archivedAt }),
        ]);
        return json({ archived: true, archivedAt });
      }
      if (!project.archived_at) return json({ archived: false, archivedAt: null });
      const restoredAt = new Date().toISOString();
      await db.batch([
        db.prepare("DELETE FROM project_archives WHERE project_id = ? AND owner_email = ?").bind(projectId, owner),
        auditStatement(db, { projectId, owner, actor, action: "project.unarchived", changes: lifecycleChange("Projektablage", project.archived_at ? "Archiv" : "Aktiv", "Aktiv"), createdAt: restoredAt }),
      ]);
      return json({ archived: false, archivedAt: null });
    }

    if (body!.trashed !== false) return json({ error: "Zum Wiederherstellen muss der Papierkorbstatus auf false gesetzt werden." }, 400);
    if (!project.trashed_at) return json({ trashed: false, trashedAt: null, deleteAfter: null });
    const restoredAt = new Date().toISOString();
    await db.batch([
      db.prepare("DELETE FROM project_trash WHERE project_id = ? AND owner_email = ?").bind(projectId, owner),
      auditStatement(db, { projectId, owner, actor, action: "project.restored", changes: lifecycleChange("Projektablage", "Papierkorb", "Aktiv"), createdAt: restoredAt }),
    ]);
    return json({ trashed: false, trashedAt: null, deleteAfter: null });
  } catch (error) {
    return storageError(error);
  }
}

async function moveProjectToTrash(request: Request, runtime: ProjectStorageEnv, projectId: string) {
  const owner = projectOwner(request);
  if (!owner) return json({ error: "Anmeldung erforderlich." }, 401);
  try {
    const { db } = getProjectStorage(runtime);
    await ensureProjectSchema(db);
    const project = await db.prepare(`SELECT p.id,
      (SELECT a.archived_at FROM project_archives a WHERE a.project_id = p.id AND a.owner_email = p.owner_email) AS archived_at,
      (SELECT t.deleted_at FROM project_trash t WHERE t.project_id = p.id AND t.owner_email = p.owner_email) AS trashed_at,
      (SELECT t.delete_after FROM project_trash t WHERE t.project_id = p.id AND t.owner_email = p.owner_email) AS delete_after
      FROM projects p WHERE p.id = ? AND p.owner_email = ?`)
      .bind(projectId, owner)
      .first<{ id: string; archived_at: string | null; trashed_at: string | null; delete_after: string | null }>();
    if (!project) return json({ error: "Projekt nicht gefunden." }, 404);
    if (project.trashed_at) return json({ deleted: true, recoverable: true, trashedAt: project.trashed_at, deleteAfter: project.delete_after });

    const deletedAt = new Date();
    const deleteAfter = new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const deletedAtIso = deletedAt.toISOString();
    const deleteAfterIso = deleteAfter.toISOString();
    await db.batch([
      db.prepare("INSERT INTO project_trash (project_id, owner_email, deleted_at, delete_after) VALUES (?, ?, ?, ?) ON CONFLICT(project_id, owner_email) DO UPDATE SET deleted_at = excluded.deleted_at, delete_after = excluded.delete_after")
        .bind(projectId, owner, deletedAtIso, deleteAfterIso),
      db.prepare("DELETE FROM project_archives WHERE project_id = ? AND owner_email = ?").bind(projectId, owner),
      auditStatement(db, {
        projectId,
        owner,
        actor: projectActor(request, owner),
        action: "project.trashed",
        changes: lifecycleChange("Projektablage", project.archived_at ? "Archiv" : "Aktiv", "Papierkorb"),
        createdAt: deletedAtIso,
      }),
    ]);
    return json({ deleted: true, recoverable: true, trashedAt: deletedAtIso, deleteAfter: deleteAfterIso });
  } catch (error) {
    return storageError(error);
  }
}

async function listProjectAudit(request: Request, runtime: ProjectStorageEnv, projectId: string) {
  const owner = projectOwner(request);
  if (!owner) return json({ error: "Anmeldung erforderlich." }, 401);
  try {
    const { db } = getProjectStorage(runtime);
    await ensureProjectSchema(db);
    const project = await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_email = ?")
      .bind(projectId, owner)
      .first<{ id: string }>();
    if (!project) return json({ error: "Projekt nicht gefunden." }, 404);
    const result = await db.prepare("SELECT id, project_id, actor, action, changes_json, created_at FROM project_audit_log WHERE project_id = ? AND owner_email = ? ORDER BY created_at DESC LIMIT 100")
      .bind(projectId, owner)
      .all<{ id: string; project_id: string; actor: string; action: string; changes_json: string; created_at: string }>();
    const events: ProjectAuditEvent[] = (result.results ?? []).map((row) => {
      let changes: ProjectAuditChange[] = [];
      try {
        const parsed = JSON.parse(row.changes_json);
        if (Array.isArray(parsed)) changes = parsed.slice(0, 501) as ProjectAuditChange[];
      } catch {
        changes = [{ path: "audit.invalid", label: "Protokolleintrag", before: null, after: "Änderungsdetails konnten nicht gelesen werden" }];
      }
      return { id: row.id, projectId: row.project_id, actor: row.actor, action: row.action, changes, createdAt: row.created_at };
    });
    return json({ events });
  } catch (error) {
    return storageError(error);
  }
}

async function getProjectPdf(request: Request, runtime: ProjectStorageEnv, projectId: string) {
  const owner = projectOwner(request);
  if (!owner) return json({ error: "Anmeldung erforderlich." }, 401);
  try {
    const { db, bucket } = getProjectStorage(runtime);
    await ensureProjectSchema(db);
    const row = await db.prepare(`SELECT p.pdf_key, p.file_name,
      (SELECT t.deleted_at FROM project_trash t WHERE t.project_id = p.id AND t.owner_email = p.owner_email) AS trashed_at
      FROM projects p WHERE p.id = ? AND p.owner_email = ?`)
      .bind(projectId, owner)
      .first<{ pdf_key: string | null; file_name: string; trashed_at: string | null }>();
    if (row?.trashed_at) return json({ error: "Dieses Projekt liegt im Papierkorb. Bitte zuerst wiederherstellen." }, 410);
    if (!row?.pdf_key) return json({ error: "Zu diesem Projekt ist keine PDF gespeichert." }, 404);
    const object = await bucket.get(row.pdf_key);
    if (!object) return json({ error: "Die gespeicherte PDF wurde nicht gefunden." }, 404);
    const headers = new Headers({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${row.file_name.replace(/["\\\r\n]/g, "_") || "grundriss.pdf"}`,
      "Cache-Control": "private, no-store",
    });
    object.writeHttpMetadata?.(headers);
    if (object.httpEtag) headers.set("ETag", object.httpEtag);
    return new Response(object.body, { headers });
  } catch (error) {
    return storageError(error);
  }
}

function originalFileName(request: Request) {
  const value = request.headers.get("x-original-filename") || "insta360-panorama.jpg";
  try {
    return decodeURIComponent(value).replace(/["\\\r\n]/g, "_").slice(0, 500) || "insta360-panorama.jpg";
  } catch {
    return "insta360-panorama.jpg";
  }
}

async function handleProjectPanorama(request: Request, runtime: ProjectStorageEnv, projectId: string, panoramaId: string) {
  const owner = projectOwner(request);
  if (!owner) return json({ error: "Anmeldung erforderlich." }, 401);
  try {
    const { db, bucket } = getProjectStorage(runtime);
    await ensureProjectSchema(db);
    const project = await db.prepare(`SELECT p.id,
      (SELECT t.deleted_at FROM project_trash t WHERE t.project_id = p.id AND t.owner_email = p.owner_email) AS trashed_at
      FROM projects p WHERE p.id = ? AND p.owner_email = ?`)
      .bind(projectId, owner)
      .first<{ id: string; trashed_at: string | null }>();
    if (!project) return json({ error: "Projekt nicht gefunden. Bitte das Projekt zuerst speichern." }, 404);
    if (project.trashed_at) return json({ error: "Dieses Projekt liegt im Papierkorb. Bitte zuerst wiederherstellen." }, 410);
    const key = projectPanoramaKey(owner, projectId, panoramaId);

    if (request.method === "PUT") {
      const contentType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
        return json({ error: "Als 360°-Aufnahme sind nur JPG, PNG oder WebP zulässig." }, 400);
      }
      const declaredLength = Number(request.headers.get("content-length") || 0);
      if (declaredLength > MAX_PANORAMA_BYTES) return json({ error: "Die 360°-Aufnahme darf höchstens 80 MB groß sein." }, 413);
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength) return json({ error: "Die 360°-Aufnahme ist leer." }, 400);
      if (bytes.byteLength > MAX_PANORAMA_BYTES) return json({ error: "Die 360°-Aufnahme darf höchstens 80 MB groß sein." }, 413);
      const fileName = originalFileName(request);
      await bucket.put(key, bytes, {
        httpMetadata: {
          contentType,
          contentDisposition: `inline; filename="${fileName}"`,
        },
        customMetadata: { projectId, owner, panoramaId, originalName: fileName },
      });
      return json({ stored: true }, 201);
    }

    if (request.method === "GET") {
      const object = await bucket.get(key);
      if (!object) return json({ error: "Die gespeicherte 360°-Aufnahme wurde nicht gefunden." }, 404);
      const headers = new Headers({
        "Content-Type": "image/jpeg",
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=300",
      });
      object.writeHttpMetadata?.(headers);
      if (object.httpEtag) headers.set("ETag", object.httpEtag);
      return new Response(object.body, { headers });
    }

    return json({ error: "Methode nicht zulässig." }, 405);
  } catch (error) {
    return storageError(error);
  }
}

export async function handleProjectApi(request: Request, runtime: ProjectStorageEnv): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (pathname === "/api/projects") {
    if (request.method === "GET") return listProjects(request, runtime);
    if (request.method === "POST") return saveProject(request, runtime);
    return json({ error: "Methode nicht zulässig." }, 405);
  }

  const panoramaMatch = pathname.match(/^\/api\/projects\/([^/]+)\/panoramas\/([^/]+)$/);
  if (panoramaMatch) {
    const projectId = decodedProjectId(panoramaMatch[1]);
    const panoramaId = decodedProjectId(panoramaMatch[2]);
    if (!projectId || !panoramaId) return json({ error: "Ungültige Projekt- oder Aufnahme-ID." }, 400);
    return handleProjectPanorama(request, runtime, projectId, panoramaId);
  }

  const versionMatch = pathname.match(/^\/api\/projects\/([^/]+)\/versions(?:\/(\d+))?$/);
  if (versionMatch) {
    const projectId = decodedProjectId(versionMatch[1]);
    if (!projectId) return json({ error: "Ungültige Projekt-ID." }, 400);
    if (request.method !== "GET") return json({ error: "Methode nicht zulässig." }, 405);
    return versionMatch[2]
      ? restoreProjectVersion(request, runtime, projectId, Number(versionMatch[2]))
      : listProjectVersions(request, runtime, projectId);
  }

  const auditMatch = pathname.match(/^\/api\/projects\/([^/]+)\/audit$/);
  if (auditMatch) {
    const projectId = decodedProjectId(auditMatch[1]);
    if (!projectId) return json({ error: "Ungültige Projekt-ID." }, 400);
    if (request.method !== "GET") return json({ error: "Methode nicht zulässig." }, 405);
    return listProjectAudit(request, runtime, projectId);
  }

  const match = pathname.match(/^\/api\/projects\/([^/]+)(\/pdf)?$/);
  if (!match) return pathname.startsWith("/api/projects/") ? json({ error: "Nicht gefunden." }, 404) : null;
  const projectId = decodedProjectId(match[1]);
  if (!projectId) return json({ error: "Ungültige Projekt-ID." }, 400);
  if (!match[2] && request.method === "PATCH") return setProjectLifecycle(request, runtime, projectId);
  if (!match[2] && request.method === "DELETE") return moveProjectToTrash(request, runtime, projectId);
  if (request.method !== "GET") return json({ error: "Methode nicht zulässig." }, 405);
  return match[2] ? getProjectPdf(request, runtime, projectId) : getProject(request, runtime, projectId);
}
