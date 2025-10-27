import { 
  type Website, 
  type InsertWebsite, 
  type SubId, 
  type InsertSubId,
  websites,
  subIds
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

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
}

export const storage = new DbStorage();
