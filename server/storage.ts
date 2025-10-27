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
  createSubId(subId: InsertSubId): Promise<SubId>;
  createSubIdsBulk(subIdList: InsertSubId[]): Promise<SubId[]>;
  deleteSubId(id: string): Promise<void>;
  updateSubIdClickupTask(id: string, clickupTaskId: string | null): Promise<SubId>;
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
    // Check if there are any immutable Sub-IDs for this website
    const immutableSubIds = await db
      .select()
      .from(subIds)
      .where(and(eq(subIds.websiteId, id), eq(subIds.isImmutable, true)));
    
    if (immutableSubIds.length > 0) {
      throw new Error(`Cannot delete website: it contains ${immutableSubIds.length} immutable Sub-ID(s)`);
    }
    
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

  async createSubId(insertSubId: InsertSubId): Promise<SubId> {
    const [subId] = await db.insert(subIds).values(insertSubId).returning();
    return subId;
  }

  async createSubIdsBulk(subIdList: InsertSubId[]): Promise<SubId[]> {
    if (subIdList.length === 0) return [];
    return await db.insert(subIds).values(subIdList).returning();
  }

  async deleteSubId(id: string): Promise<void> {
    // Check if the subId is immutable
    const [subId] = await db.select().from(subIds).where(eq(subIds.id, id));
    if (subId?.isImmutable) {
      throw new Error("Cannot delete immutable Sub-ID");
    }
    await db.delete(subIds).where(eq(subIds.id, id));
  }

  async updateSubIdClickupTask(id: string, clickupTaskId: string | null): Promise<SubId> {
    const [updatedSubId] = await db
      .update(subIds)
      .set({ clickupTaskId })
      .where(eq(subIds.id, id))
      .returning();
    
    if (!updatedSubId) {
      throw new Error("Sub-ID not found");
    }
    
    return updatedSubId;
  }
}

export const storage = new DbStorage();
