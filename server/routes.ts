import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertWebsiteSchema, insertSubIdSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Website routes
  app.get("/api/websites", async (req, res) => {
    try {
      const websites = await storage.getWebsites();
      // Calculate subId count for each website
      const websitesWithCount = await Promise.all(
        websites.map(async (website) => {
          const subIdList = await storage.getSubIdsByWebsite(website.id);
          return {
            ...website,
            subIdCount: subIdList.length,
          };
        })
      );
      res.json(websitesWithCount);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch websites" });
    }
  });

  app.post("/api/websites", async (req, res) => {
    try {
      const data = insertWebsiteSchema.parse(req.body);
      const website = await storage.createWebsite(data);
      res.json({ ...website, subIdCount: 0 });
    } catch (error) {
      res.status(400).json({ error: "Invalid website data" });
    }
  });

  app.delete("/api/websites/:id", async (req, res) => {
    try {
      await storage.deleteWebsite(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete website" });
    }
  });

  // SubId routes
  app.get("/api/websites/:websiteId/subids", async (req, res) => {
    try {
      const subIdList = await storage.getSubIdsByWebsite(req.params.websiteId);
      res.json(subIdList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sub-IDs" });
    }
  });

  app.post("/api/websites/:websiteId/subids", async (req, res) => {
    try {
      const data = insertSubIdSchema.parse(req.body);
      const subId = await storage.createSubId(data);
      res.json(subId);
    } catch (error) {
      res.status(400).json({ error: "Invalid sub-ID data" });
    }
  });

  app.post("/api/websites/:websiteId/subids/bulk", async (req, res) => {
    try {
      const { subIds } = req.body;
      if (!Array.isArray(subIds)) {
        return res.status(400).json({ error: "subIds must be an array" });
      }
      const validatedSubIds = subIds.map((subId) => insertSubIdSchema.parse(subId));
      const createdSubIds = await storage.createSubIdsBulk(validatedSubIds);
      res.json(createdSubIds);
    } catch (error) {
      res.status(400).json({ error: "Invalid bulk sub-ID data" });
    }
  });

  app.delete("/api/subids/:id", async (req, res) => {
    try {
      await storage.deleteSubId(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      if (error.message === "Cannot delete immutable Sub-ID") {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to delete sub-ID" });
      }
    }
  });

  app.get("/api/subids", async (req, res) => {
    try {
      const allSubIds = await storage.getAllSubIds();
      res.json(allSubIds);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch all sub-IDs" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
