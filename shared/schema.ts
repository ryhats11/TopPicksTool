import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, bigint, boolean, unique } from "drizzle-orm/pg-core";
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
  commentPosted: boolean("comment_posted").notNull().default(false),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
  isImmutable: boolean("is_immutable").notNull().default(false),
});

// Brand Rankings feature tables
export const geos = pgTable("geos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 10 }).notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const brands = pgTable("brands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  defaultUrl: text("default_url"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
});

export const geoBrandRankings = pgTable("geo_brand_rankings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  geoId: varchar("geo_id").notNull().references(() => geos.id, { onDelete: "cascade" }),
  brandId: varchar("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  position: integer("position"), // Nullable: null = not featured, 1-10 = featured ranking
  rpcInCents: integer("rpc_in_cents").notNull().default(0),
  affiliateLink: text("affiliate_link"),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
}, (table) => ({
  // Only enforce unique position when position is not null (featured brands)
  uniqueGeoPosition: unique().on(table.geoId, table.position),
  // Each brand can only appear once per GEO
  uniqueGeoBrand: unique().on(table.geoId, table.brandId),
}));

export const insertWebsiteSchema = createInsertSchema(websites).omit({
  id: true,
});

export const insertSubIdSchema = createInsertSchema(subIds).omit({
  id: true,
});

export const insertGeoSchema = createInsertSchema(geos).omit({
  id: true,
});

export const insertBrandSchema = createInsertSchema(brands).omit({
  id: true,
});

export const insertGeoBrandRankingSchema = createInsertSchema(geoBrandRankings).omit({
  id: true,
}).extend({
  position: z.number().int().min(1).max(10).nullable().optional(),
  rpcInCents: z.number().int().min(0),
});

export type InsertWebsite = z.infer<typeof insertWebsiteSchema>;
export type Website = typeof websites.$inferSelect;
export type InsertSubId = z.infer<typeof insertSubIdSchema>;
export type SubId = typeof subIds.$inferSelect;
export type InsertGeo = z.infer<typeof insertGeoSchema>;
export type Geo = typeof geos.$inferSelect;
export type InsertBrand = z.infer<typeof insertBrandSchema>;
export type Brand = typeof brands.$inferSelect;
export type InsertGeoBrandRanking = z.infer<typeof insertGeoBrandRankingSchema>;
export type GeoBrandRanking = typeof geoBrandRankings.$inferSelect;
