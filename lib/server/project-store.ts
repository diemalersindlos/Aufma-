type D1Result<T> = { results?: T[] };
export type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  all: <T>() => Promise<D1Result<T>>;
  first: <T>() => Promise<T | null>;
  run: () => Promise<unknown>;
};
export type D1DatabaseLike = {
  prepare: (sql: string) => D1Statement;
  batch: (statements: D1Statement[]) => Promise<unknown>;
};
export type R2ObjectLike = {
  body: ReadableStream;
  httpEtag?: string;
  writeHttpMetadata?: (headers: Headers) => void;
};
export type R2BucketLike = {
  get: (key: string) => Promise<R2ObjectLike | null>;
  put: (key: string, value: ArrayBuffer | Uint8Array | Blob, options?: { httpMetadata?: { contentType?: string; contentDisposition?: string }; customMetadata?: Record<string, string> }) => Promise<unknown>;
  delete: (keys: string | string[]) => Promise<unknown>;
  list?: (options?: { prefix?: string; cursor?: string; limit?: number }) => Promise<{ objects: Array<{ key: string }>; truncated: boolean; cursor?: string }>;
};

export type ProjectStorageEnv = {
  DB?: D1DatabaseLike;
  BUCKET?: R2BucketLike;
};

export type ProjectRow = {
  id: string;
  owner_email: string;
  title: string;
  customer: string;
  address: string;
  reference: string;
  file_name: string;
  page_count: number;
  position_count: number;
  status: "draft" | "completed";
  state_json: string;
  pdf_key: string | null;
  archived_at: string | null;
  trashed_at: string | null;
  delete_after: string | null;
  created_at: string;
  updated_at: string;
};

export function getProjectStorage(runtime: ProjectStorageEnv) {
  if (!runtime.DB || !runtime.BUCKET) {
    throw new Error("Die Projektablage ist noch nicht mit Datenbank und Dateispeicher verbunden.");
  }
  return { db: runtime.DB, bucket: runtime.BUCKET };
}

export async function ensureProjectSchema(db: D1DatabaseLike) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      owner_email TEXT NOT NULL,
      title TEXT NOT NULL,
      customer TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      reference TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL DEFAULT '',
      page_count INTEGER NOT NULL DEFAULT 0,
      position_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
      state_json TEXT NOT NULL,
      pdf_key TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS projects_owner_updated_idx ON projects (owner_email, updated_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS project_versions (
      project_id TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      revision INTEGER NOT NULL,
      status TEXT NOT NULL,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (project_id, owner_email, revision)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS project_versions_owner_project_idx ON project_versions (owner_email, project_id, revision DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS project_archives (
      project_id TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      archived_at TEXT NOT NULL,
      PRIMARY KEY (project_id, owner_email)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS project_archives_owner_date_idx ON project_archives (owner_email, archived_at DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS project_trash (
      project_id TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      delete_after TEXT NOT NULL,
      PRIMARY KEY (project_id, owner_email)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS project_trash_owner_date_idx ON project_trash (owner_email, deleted_at DESC)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS project_audit_log (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      changes_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS project_audit_owner_project_date_idx ON project_audit_log (owner_email, project_id, created_at DESC)"),
  ]);
}

export function projectOwner(request: Request) {
  const authenticatedEmail = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (authenticatedEmail) return authenticatedEmail;
  const hostname = new URL(request.url).hostname;
  return hostname === "terminal.local" || hostname === "localhost" ? "preview@local" : null;
}

export function projectActor(request: Request, owner: string) {
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  if (encoded && encoding === "percent-encoded-utf-8") {
    try {
      const decoded = decodeURIComponent(encoded).trim();
      if (decoded) return decoded.slice(0, 200);
    } catch {
      // Eine fehlerhafte optionale Namensangabe darf die Speicherung nicht verhindern.
    }
  }
  return owner.slice(0, 200);
}

export function safeProjectId(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{6,120}$/.test(value) ? value : null;
}

export function projectObjectPrefix(owner: string, projectId: string) {
  const safeOwner = owner.replace(/[^a-z0-9@._-]+/gi, "_").slice(0, 120);
  return `projects/${safeOwner}/${projectId}`;
}

export function projectPdfKey(owner: string, projectId: string) {
  return `${projectObjectPrefix(owner, projectId)}/source.pdf`;
}

export function projectPanoramaKey(owner: string, projectId: string, panoramaId: string) {
  return `${projectObjectPrefix(owner, projectId)}/panoramas/${panoramaId}`;
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function storageError(error: unknown) {
  console.error("Projektablage", error);
  const configurationMessage = error instanceof Error && error.message.startsWith("Die Projektablage ist noch nicht")
    ? error.message
    : null;
  return json({ error: configurationMessage ?? "Die Projektablage ist vorübergehend nicht erreichbar. Die Eingaben bleiben als Geräteentwurf erhalten; bitte später erneut speichern." }, 503);
}
