import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  topic: text('topic').notNull(),
  brief: text('brief').notNull(),
  createdAt: text('created_at').notNull(),
});

export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  url: text('url').notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_sources_workspace_id').on(table.workspaceId)]);

export const chunks = sqliteTable('chunks', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  sourceId: text('source_id'),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_chunks_workspace_id').on(table.workspaceId)]);
