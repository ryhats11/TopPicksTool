import { 
  type Website, 
  type InsertWebsite, 
  type SubId, 
  type InsertSubId,
  type Geo,
  type InsertGeo,
  type Brand,
  type InsertBrand,
  type GeoBrandRanking,
  type InsertGeoBrandRanking,
  websites,
  subIds,
  geos,
  brands,
  geoBrandRankings
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, asc } from "drizzle-orm";

export interface IStorage {
  // Website methods
  getWebsites(): Promise<Website[]>;
  getWebsite(id: string): Promise<Website | undefined>;
  createWebsite(website: InsertWebsite): Promise<Website>;
  deleteWebsite(id: string): Promise<void>;
  
  // SubId methods
  getSubIdsByWebsite(websiteId: string): Promise<SubId[]>;
  getAllSubIds(): Promise<SubId[]>;
  getSubIdById(id: string): Promise<SubId | undefined>;
  createSubId(subId: InsertSubId): Promise<SubId>;
  createSubIdsBulk(subIdList: InsertSubId[]): Promise<SubId[]>;
  deleteSubId(id: string): Promise<void>;
  updateSubIdClickupTask(id: string, clickupTaskId: string | null, url?: string | null): Promise<SubId>;
  markCommentPosted(id: string): Promise<SubId>;
  
  // GEO methods
  getGeos(): Promise<Geo[]>;
  getGeo(id: string): Promise<Geo | undefined>;
  createGeo(geo: InsertGeo): Promise<Geo>;
  updateGeo(id: string, geo: Partial<InsertGeo>): Promise<Geo>;
  deleteGeo(id: string): Promise<void>;
  
  // Brand methods
  getBrands(): Promise<Brand[]>;
  getBrand(id: string): Promise<Brand | undefined>;
  createBrand(brand: InsertBrand): Promise<Brand>;
  updateBrand(id: string, brand: Partial<InsertBrand>): Promise<Brand>;
  deleteBrand(id: string): Promise<void>;
  
  // GeoBrandRanking methods
  getRankingsByGeo(geoId: string): Promise<GeoBrandRanking[]>;
  getRanking(id: string): Promise<GeoBrandRanking | undefined>;
  createRanking(ranking: InsertGeoBrandRanking): Promise<GeoBrandRanking>;
  updateRanking(id: string, ranking: Partial<InsertGeoBrandRanking>): Promise<GeoBrandRanking>;
  deleteRanking(id: string): Promise<void>;
  bulkUpsertRankings(geoId: string, rankings: InsertGeoBrandRanking[]): Promise<GeoBrandRanking[]>;
}

export class DbStorage implements IStorage {
  // Website methods
  async getWebsites(): Promise<Website[]> {
    return await db.select().from(websites);
  }

  async getWebsite(id: string): Promise<Website | undefined> {
    const [website] = await db.select().from(websites).where(eq(websites.id, id));
    return website;
  }

  async createWebsite(insertWebsite: InsertWebsite): Promise<Website> {
    const [website] = await db.insert(websites).values(insertWebsite).returning();
    return website;
  }

  async deleteWebsite(id: string): Promise<void> {
    // Immutability check temporarily disabled - user can delete any website
    await db.delete(websites).where(eq(websites.id, id));
  }

  // SubId methods
  async getSubIdsByWebsite(websiteId: string): Promise<SubId[]> {
    return await db
      .select()
      .from(subIds)
      .where(eq(subIds.websiteId, websiteId))
      .orderBy(desc(subIds.timestamp));
  }

  async getAllSubIds(): Promise<SubId[]> {
    return await db.select().from(subIds);
  }

  async getSubIdById(id: string): Promise<SubId | undefined> {
    const [subId] = await db.select().from(subIds).where(eq(subIds.id, id));
    return subId;
  }

  async createSubId(insertSubId: InsertSubId): Promise<SubId> {
    const [subId] = await db.insert(subIds).values(insertSubId).returning();
    return subId;
  }

  async createSubIdsBulk(subIdList: InsertSubId[]): Promise<SubId[]> {
    if (subIdList.length === 0) return [];
    return await db.insert(subIds).values(subIdList).returning();
  }

  async deleteSubId(id: string): Promise<void> {
    // Immutability check temporarily disabled - user can delete any Sub-ID
    await db.delete(subIds).where(eq(subIds.id, id));
  }

  async updateSubIdClickupTask(id: string, clickupTaskId: string | null, url?: string | null): Promise<SubId> {
    const updateData: { clickupTaskId: string | null; url?: string | null } = { clickupTaskId };
    
    // Only update URL if explicitly provided
    if (url !== undefined) {
      updateData.url = url;
    }
    
    const [updatedSubId] = await db
      .update(subIds)
      .set(updateData)
      .where(eq(subIds.id, id))
      .returning();
    
    if (!updatedSubId) {
      throw new Error("Sub-ID not found");
    }
    
    return updatedSubId;
  }

  async markCommentPosted(id: string): Promise<SubId> {
    const [updatedSubId] = await db
      .update(subIds)
      .set({ commentPosted: true })
      .where(eq(subIds.id, id))
      .returning();
    
    if (!updatedSubId) {
      throw new Error("Sub-ID not found");
    }
    
    return updatedSubId;
  }

  // GEO methods
  async getGeos(): Promise<Geo[]> {
    return await db.select().from(geos).orderBy(asc(geos.sortOrder), asc(geos.name));
  }

  async getGeo(id: string): Promise<Geo | undefined> {
    const [geo] = await db.select().from(geos).where(eq(geos.id, id));
    return geo;
  }

  async createGeo(insertGeo: InsertGeo): Promise<Geo> {
    const [geo] = await db.insert(geos).values(insertGeo).returning();
    return geo;
  }

  async updateGeo(id: string, updateData: Partial<InsertGeo>): Promise<Geo> {
    const [updatedGeo] = await db
      .update(geos)
      .set(updateData)
      .where(eq(geos.id, id))
      .returning();
    
    if (!updatedGeo) {
      throw new Error("GEO not found");
    }
    
    return updatedGeo;
  }

  async deleteGeo(id: string): Promise<void> {
    await db.delete(geos).where(eq(geos.id, id));
  }

  // Brand methods
  async getBrands(): Promise<Brand[]> {
    return await db.select().from(brands).orderBy(asc(brands.name));
  }

  async getBrand(id: string): Promise<Brand | undefined> {
    const [brand] = await db.select().from(brands).where(eq(brands.id, id));
    return brand;
  }

  async createBrand(insertBrand: InsertBrand): Promise<Brand> {
    const [brand] = await db.insert(brands).values(insertBrand).returning();
    return brand;
  }

  async updateBrand(id: string, updateData: Partial<InsertBrand>): Promise<Brand> {
    const [updatedBrand] = await db
      .update(brands)
      .set(updateData)
      .where(eq(brands.id, id))
      .returning();
    
    if (!updatedBrand) {
      throw new Error("Brand not found");
    }
    
    return updatedBrand;
  }

  async deleteBrand(id: string): Promise<void> {
    await db.delete(brands).where(eq(brands.id, id));
  }

  // GeoBrandRanking methods
  async getRankingsByGeo(geoId: string): Promise<GeoBrandRanking[]> {
    return await db
      .select()
      .from(geoBrandRankings)
      .where(eq(geoBrandRankings.geoId, geoId))
      .orderBy(asc(geoBrandRankings.position));
  }

  async getRanking(id: string): Promise<GeoBrandRanking | undefined> {
    const [ranking] = await db
      .select()
      .from(geoBrandRankings)
      .where(eq(geoBrandRankings.id, id));
    return ranking;
  }

  async createRanking(insertRanking: InsertGeoBrandRanking): Promise<GeoBrandRanking> {
    const [ranking] = await db
      .insert(geoBrandRankings)
      .values(insertRanking)
      .returning();
    return ranking;
  }

  async updateRanking(id: string, updateData: Partial<InsertGeoBrandRanking>): Promise<GeoBrandRanking> {
    const [updatedRanking] = await db
      .update(geoBrandRankings)
      .set(updateData)
      .where(eq(geoBrandRankings.id, id))
      .returning();
    
    if (!updatedRanking) {
      throw new Error("Ranking not found");
    }
    
    return updatedRanking;
  }

  async deleteRanking(id: string): Promise<void> {
    await db.delete(geoBrandRankings).where(eq(geoBrandRankings.id, id));
  }

  async bulkUpsertRankings(geoId: string, rankings: InsertGeoBrandRanking[]): Promise<GeoBrandRanking[]> {
    // Wrap delete + insert in a transaction for atomicity
    return await db.transaction(async (tx) => {
      // Delete existing rankings for this GEO
      await tx.delete(geoBrandRankings).where(eq(geoBrandRankings.geoId, geoId));
      
      // Insert new rankings
      if (rankings.length === 0) return [];
      return await tx.insert(geoBrandRankings).values(rankings).returning();
    });
  }
}

export const storage = new DbStorage();
