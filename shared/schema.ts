import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, bigint, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const websites = pgTable("websites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  formatPattern: text("format_pattern").notNull(),
});

export const subIds = pgTable("sub_ids", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  websiteId: varchar("website_id").notNull().references(() => websites.id, { onDelete: "cascade" }),
  value: text("value").notNull(),
  url: text("url"),
  clickupTaskId: text("clickup_task_id"),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
  isImmutable: boolean("is_immutable").notNull().default(false),
});

export const insertWebsiteSchema = createInsertSchema(websites).omit({
  id: true,
});

export const insertSubIdSchema = createInsertSchema(subIds).omit({
  id: true,
});

export type InsertWebsite = z.infer<typeof insertWebsiteSchema>;
export type Website = typeof websites.$inferSelect;
export type InsertSubId = z.infer<typeof insertSubIdSchema>;
export type SubId = typeof subIds.$inferSelect;
