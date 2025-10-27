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
      console.error("Error fetching websites:", error);
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
    } catch (error: any) {
      if (error.message?.includes("immutable Sub-ID")) {
        res.status(403).json({ error: error.message });
      } else {
        console.error("Error deleting website:", error);
        res.status(500).json({ error: "Failed to delete website" });
      }
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
      
      // Validate and enforce immutability for bulk imports with URLs
      const validatedSubIds = subIds.map((subId) => {
        const validated = insertSubIdSchema.parse(subId);
        
        // Enforce immutability and URL presence for bulk imports
        if (!validated.url) {
          throw new Error("Bulk imports must include a URL for each Sub-ID");
        }
        
        // Force isImmutable to true for URL-linked Sub-IDs (server-side enforcement)
        return {
          ...validated,
          isImmutable: true,
        };
      });
      
      const createdSubIds = await storage.createSubIdsBulk(validatedSubIds);
      res.json(createdSubIds);
    } catch (error: any) {
      console.error("Error in bulk import:", error);
      res.status(400).json({ error: error.message || "Invalid bulk sub-ID data" });
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
      console.error("Error fetching all sub-IDs:", error);
      res.status(500).json({ error: "Failed to fetch all sub-IDs" });
    }
  });

  // ClickUp integration routes
  app.patch("/api/subids/:id/clickup", async (req, res) => {
    try {
      const { clickupTaskId } = req.body;
      
      if (!clickupTaskId || typeof clickupTaskId !== 'string') {
        return res.status(400).json({ error: "Invalid ClickUp task ID" });
      }
      
      const updatedSubId = await storage.updateSubIdClickupTask(req.params.id, clickupTaskId);
      res.json(updatedSubId);
    } catch (error: any) {
      console.error("Error linking ClickUp task:", error);
      res.status(500).json({ error: error.message || "Failed to link ClickUp task" });
    }
  });

  app.delete("/api/subids/:id/clickup", async (req, res) => {
    try {
      const updatedSubId = await storage.updateSubIdClickupTask(req.params.id, null);
      res.json(updatedSubId);
    } catch (error: any) {
      console.error("Error unlinking ClickUp task:", error);
      res.status(500).json({ error: error.message || "Failed to unlink ClickUp task" });
    }
  });

  app.get("/api/clickup/task/:taskId", async (req, res) => {
    try {
      const apiKey = process.env.CLICKUP_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: "ClickUp API key not configured" });
      }

      const response = await fetch(`https://api.clickup.com/api/v2/task/${req.params.taskId}`, {
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).json({ error: "Task not found" });
        }
        throw new Error(`ClickUp API error: ${response.statusText}`);
      }

      const taskData = await response.json();
      res.json(taskData);
    } catch (error: any) {
      console.error("Error fetching ClickUp task:", error);
      res.status(500).json({ error: error.message || "Failed to fetch ClickUp task" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
