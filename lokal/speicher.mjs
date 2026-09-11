/** Local-only adapters for the ORIGINAL application's D1/R2 interfaces.
 * The business API, schema, validation and calculations are not replaced.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function openStorage(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const sqlite = new DatabaseSync(path.join(directory, 'aufmass-test.sqlite'));
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  sqlite.exec(`CREATE TABLE IF NOT EXISTS local_test_objects (
    key TEXT PRIMARY KEY, value BLOB NOT NULL, metadata TEXT NOT NULL, etag TEXT NOT NULL
  )`);
  class Statement {
    constructor(sql, values = []) { this.sql = sql; this.values = values; }
    bind(...values) { return new Statement(this.sql, values); }
    runSync() { return sqlite.prepare(this.sql).run(...this.values); }
    async run() { return this.runSync(); }
    async all() { return { results: sqlite.prepare(this.sql).all(...this.values) }; }
    async first() { return sqlite.prepare(this.sql).get(...this.values) ?? null; }
  }
  const DB = {
    prepare(sql) { return new Statement(sql); },
    async batch(statements) {
      // No await within the transaction: concurrent requests cannot interleave it.
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map((statement) => statement.runSync());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const BUCKET = {
    async get(key) {
      const object = sqlite.prepare('SELECT value, metadata, etag FROM local_test_objects WHERE key=?').get(key);
      if (!object) return null;
      const metadata = JSON.parse(object.metadata);
      return {
        body: new Blob([object.value]).stream(),
        httpEtag: object.etag,
        writeHttpMetadata(headers) {
          if (metadata.contentType) headers.set('Content-Type', metadata.contentType);
          if (metadata.contentDisposition) headers.set('Content-Disposition', metadata.contentDisposition);
        },
      };
    },
    async put(key, value, options = {}) {
      const data = value instanceof Blob ? Buffer.from(await value.arrayBuffer()) : Buffer.from(value);
      const etag = '"' + createHash('sha256').update(data).digest('hex') + '"';
      sqlite.prepare('INSERT OR REPLACE INTO local_test_objects(key,value,metadata,etag) VALUES (?,?,?,?)')
        .run(key, data, JSON.stringify(options.httpMetadata ?? {}), etag);
      return { key, httpEtag: etag };
    },
    async delete(keys) {
      const all = Array.isArray(keys) ? keys : [keys];
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        for (const key of all) sqlite.prepare('DELETE FROM local_test_objects WHERE key=?').run(key);
        sqlite.exec('COMMIT');
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    async list({ prefix = '', cursor = '', limit = 1000 } = {}) {
      const last = cursor ? Buffer.from(cursor, 'base64url').toString('utf8') : '';
      const size = Math.max(1, Math.min(1000, Math.floor(limit)));
      const rows = sqlite.prepare('SELECT key FROM local_test_objects WHERE key > ? ORDER BY key').all(last)
        .filter((row) => row.key.startsWith(prefix));
      const objects = rows.slice(0, size);
      const truncated = rows.length > size;
      return { objects, truncated, ...(truncated ? { cursor: Buffer.from(objects.at(-1).key).toString('base64url') } : {}) };
    },
  };
  return { DB, BUCKET, close() { sqlite.close(); } };
}
