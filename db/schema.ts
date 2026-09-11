import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  title: text("title").notNull(),
  customer: text("customer").notNull().default(""),
  address: text("address").notNull().default(""),
  reference: text("reference").notNull().default(""),
  fileName: text("file_name").notNull().default(""),
  pageCount: integer("page_count").notNull().default(0),
  positionCount: integer("position_count").notNull().default(0),
  status: text("status", { enum: ["draft", "completed"] }).notNull().default("draft"),
  stateJson: text("state_json").notNull(),
  pdfKey: text("pdf_key"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("projects_owner_updated_idx").on(table.ownerEmail, table.updatedAt),
]);

export const projectVersions = sqliteTable("project_versions", {
  projectId: text("project_id").notNull(),
  ownerEmail: text("owner_email").notNull(),
  revision: integer("revision").notNull(),
  status: text("status", { enum: ["draft", "completed"] }).notNull(),
  stateJson: text("state_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.ownerEmail, table.revision] }),
  index("project_versions_owner_project_idx").on(table.ownerEmail, table.projectId, table.revision),
]);

export const projectArchives = sqliteTable("project_archives", {
  projectId: text("project_id").notNull(),
  ownerEmail: text("owner_email").notNull(),
  archivedAt: text("archived_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.ownerEmail] }),
  index("project_archives_owner_date_idx").on(table.ownerEmail, table.archivedAt),
]);

export const projectTrash = sqliteTable("project_trash", {
  projectId: text("project_id").notNull(),
  ownerEmail: text("owner_email").notNull(),
  deletedAt: text("deleted_at").notNull(),
  deleteAfter: text("delete_after").notNull(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.ownerEmail] }),
  index("project_trash_owner_date_idx").on(table.ownerEmail, table.deletedAt),
]);

export const projectAuditLog = sqliteTable("project_audit_log", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  ownerEmail: text("owner_email").notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  changesJson: text("changes_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("project_audit_owner_project_date_idx").on(table.ownerEmail, table.projectId, table.createdAt),
]);
