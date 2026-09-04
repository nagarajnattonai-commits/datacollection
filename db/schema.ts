import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
// A bounded pilot aggregate. Revision-checked updates serialize workflow transitions.
export const workspace = sqliteTable('workspace', {
  id: text('id').primaryKey(),
  revision: integer('revision').notNull().default(0),
  body: text('body').notNull(),
});
