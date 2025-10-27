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

  // Helper function to generate Sub-ID from pattern (matches frontend logic exactly)
  function generateSubId(pattern: string): string {
    let result = pattern;
    const now = new Date();
    
    // Match frontend patterns exactly - NO shorthand patterns
    result = result.replace(/\{random(\d+)digits\}/g, (_, num) =>
      Math.floor(Math.random() * Math.pow(10, parseInt(num)))
        .toString()
        .padStart(parseInt(num), "0")
    );
    result = result.replace(/\{random(\d+)letters\}/g, (_, num) =>
      Array.from({ length: parseInt(num) }, () =>
        String.fromCharCode(65 + Math.floor(Math.random() * 26))
      ).join("")
    );
    result = result.replace(/\{rand(\d+)chars\}/g, (_, num) =>
      Array.from({ length: parseInt(num) }, () =>
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".charAt(Math.floor(Math.random() * 36))
      ).join("")
    );
    result = result.replace(/\{timestamp\}/g, Date.now().toString());
    result = result.replace(/\{date\}/g, 
      `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`
    );
    result = result.replace(/\{year\}/g, now.getFullYear().toString());
    result = result.replace(/\{month\}/g, String(now.getMonth() + 1).padStart(2, "0"));
    result = result.replace(/\{day\}/g, String(now.getDate()).padStart(2, "0"));
    result = result.replace(/\{uuidSegment\}/g, 
      Math.random().toString(36).substring(2, 10).toUpperCase()
    );
    result = result.replace(/\{hex(\d+)\}/g, (_, num) =>
      Array.from({ length: parseInt(num) }, () =>
        Math.floor(Math.random() * 16).toString(16).toUpperCase()
      ).join("")
    );
    return result;
  }

  // Bulk import from ClickUp task IDs
  app.post("/api/websites/:websiteId/clickup/bulk", async (req, res) => {
    try {
      const { taskIds } = req.body;
      const websiteId = req.params.websiteId;
      
      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: "taskIds must be a non-empty array" });
      }

      // Get the website to retrieve format pattern
      const website = await storage.getWebsite(websiteId);
      if (!website) {
        return res.status(404).json({ error: "Website not found" });
      }

      const apiKey = process.env.CLICKUP_API_KEY;
      const createdSubIds = [];
      const errors = [];

      // Process each task ID
      for (const taskId of taskIds) {
        if (!taskId || typeof taskId !== 'string') {
          console.warn(`Skipping invalid task ID: ${taskId}`);
          errors.push({ taskId, error: "Invalid task ID format" });
          continue;
        }

        let liveUrl: string | undefined = undefined;
        let fetchError: string | undefined = undefined;

        // Fetch ClickUp task details
        if (apiKey) {
          try {
            const response = await fetch(`https://api.clickup.com/api/v2/task/${taskId.trim()}`, {
              headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json',
              },
            });

            if (response.ok) {
              const taskData = await response.json();
              console.log(`✅ ClickUp task ${taskId} fetched successfully`);
              
              // Look for "Live URL" custom field
              if (taskData.custom_fields && Array.isArray(taskData.custom_fields)) {
                console.log(`   Found ${taskData.custom_fields.length} custom field(s) in task`);
                
                // Debug: Show all custom field names
                console.log(`   Custom field names:`, taskData.custom_fields.map((f: any) => f.name).join(', '));
                
                // Try multiple possible field names (case-insensitive)
                const liveUrlField = taskData.custom_fields.find(
                  (field: any) => {
                    const fieldName = (field.name || '').toLowerCase();
                    return (fieldName === '*live url' || fieldName === 'live url' || fieldName === 'liveurl' || fieldName === 'url') && field.value;
                  }
                );
                
                if (liveUrlField && liveUrlField.value) {
                  liveUrl = liveUrlField.value;
                  console.log(`   ✅ Live URL extracted from field "${liveUrlField.name}": ${liveUrl}`);
                } else {
                  console.log(`   ⚠️  No "Live URL" custom field found with a value`);
                  // Show fields with values for debugging
                  const fieldsWithValues = taskData.custom_fields.filter((f: any) => f.value);
                  if (fieldsWithValues.length > 0) {
                    console.log(`   Fields with values: ${fieldsWithValues.map((f: any) => f.name).slice(0, 10).join(', ')}`);
                  }
                }
              } else {
                console.log(`   ⚠️  Task has no custom_fields array`);
              }
            } else {
              fetchError = response.statusText;
              console.warn(`❌ Could not fetch ClickUp task ${taskId}: ${response.statusText}`);
            }
          } catch (error) {
            fetchError = error instanceof Error ? error.message : "Unknown error";
            console.warn(`Error fetching ClickUp task ${taskId}:`, error);
          }
        }

        // Generate Sub-ID value using website's format pattern
        const subIdValue = generateSubId(website.formatPattern);

        // Create the Sub-ID with ClickUp task linked
        const newSubId = await storage.createSubId({
          websiteId: websiteId,
          value: subIdValue,
          url: liveUrl || null,
          clickupTaskId: taskId.trim(),
          timestamp: Date.now(),
          isImmutable: true, // Bulk imported from ClickUp are immutable
        });

        console.log(`   Created Sub-ID: ${subIdValue}${liveUrl ? ` with URL: ${liveUrl}` : ' (no URL)'}`);
        createdSubIds.push(newSubId);
        
        // Track if there was a fetch error
        if (fetchError) {
          errors.push({ taskId, error: `ClickUp API: ${fetchError}` });
        }
      }

      res.json({
        success: createdSubIds.length,
        created: createdSubIds,
        errors: errors,
        urlsPopulated: createdSubIds.filter(s => s.url).length,
      });
    } catch (error: any) {
      console.error("Error in bulk ClickUp import:", error);
      res.status(500).json({ error: error.message || "Failed to import ClickUp tasks" });
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

      const apiKey = process.env.CLICKUP_API_KEY;
      let liveUrl: string | undefined = undefined;

      // Fetch ClickUp task to get custom fields
      if (apiKey) {
        try {
          const response = await fetch(`https://api.clickup.com/api/v2/task/${clickupTaskId}`, {
            headers: {
              'Authorization': apiKey,
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            const taskData = await response.json();
            
            // Look for "*Live URL" or "Live URL" custom field
            if (taskData.custom_fields && Array.isArray(taskData.custom_fields)) {
              const liveUrlField = taskData.custom_fields.find(
                (field: any) => {
                  const fieldName = (field.name || '').toLowerCase();
                  return (fieldName === '*live url' || fieldName === 'live url') && field.value;
                }
              );
              
              if (liveUrlField && liveUrlField.value) {
                liveUrl = liveUrlField.value;
                console.log(`Found Live URL in ClickUp task ${clickupTaskId}: ${liveUrl}`);
              }
            }
          }
        } catch (fetchError) {
          console.warn("Could not fetch ClickUp task details:", fetchError);
          // Continue with linking even if we can't fetch task details
        }
      }
      
      // Only pass liveUrl if it was actually found
      const updatedSubId = await storage.updateSubIdClickupTask(
        req.params.id, 
        clickupTaskId, 
        liveUrl !== undefined ? liveUrl : undefined
      );
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

  app.post("/api/subids/:id/clickup/comment", async (req, res) => {
    try {
      const apiKey = process.env.CLICKUP_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: "ClickUp API key not configured" });
      }

      const subId = await storage.getSubIdById(req.params.id);
      
      if (!subId) {
        return res.status(404).json({ error: "Sub-ID not found" });
      }

      if (!subId.clickupTaskId) {
        return res.status(400).json({ error: "Sub-ID is not linked to a ClickUp task" });
      }

      const commentText = req.body.comment || `Sub-ID: ${subId.value}`;

      console.log(`\n💬 Posting comment to ClickUp task ${subId.clickupTaskId}: "${commentText}"`);

      const response = await fetch(
        `https://api.clickup.com/api/v2/task/${subId.clickupTaskId}/comment`,
        {
          method: 'POST',
          headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            comment_text: commentText,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        console.error(`   ❌ ClickUp API error: ${response.statusText}`, errorData);
        throw new Error(`ClickUp API error: ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`   ✅ Comment posted successfully`);

      res.json({
        success: true,
        comment: result,
      });
    } catch (error: any) {
      console.error("Error posting ClickUp comment:", error);
      res.status(500).json({ error: error.message || "Failed to post comment to ClickUp" });
    }
  });

  app.post("/api/websites/:websiteId/clickup/refresh-urls", async (req, res) => {
    try {
      const apiKey = process.env.CLICKUP_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: "ClickUp API key not configured" });
      }

      const websiteId = req.params.websiteId;
      
      // Get all Sub-IDs for this website that have ClickUp tasks but no URL
      const allSubIds = await storage.getSubIdsByWebsite(websiteId);
      const subIdsWithoutUrl = allSubIds.filter(s => s.clickupTaskId && !s.url);
      
      if (subIdsWithoutUrl.length === 0) {
        return res.json({ updated: 0, message: "No Sub-IDs with missing URLs" });
      }

      console.log(`\n🔄 Refreshing URLs for ${subIdsWithoutUrl.length} Sub-ID(s) with ClickUp tasks...`);
      
      const updated: any[] = [];
      const errors: any[] = [];

      for (const subId of subIdsWithoutUrl) {
        try {
          const response = await fetch(`https://api.clickup.com/api/v2/task/${subId.clickupTaskId}`, {
            headers: {
              'Authorization': apiKey,
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            const taskData = await response.json();
            
            // Look for "*Live URL" or "Live URL" custom field
            if (taskData.custom_fields && Array.isArray(taskData.custom_fields)) {
              const liveUrlField = taskData.custom_fields.find(
                (field: any) => {
                  const fieldName = (field.name || '').toLowerCase();
                  return (fieldName === '*live url' || fieldName === 'live url') && field.value;
                }
              );
              
              if (liveUrlField && liveUrlField.value) {
                const liveUrl = liveUrlField.value;
                console.log(`   ✅ Found URL for task ${subId.clickupTaskId}: ${liveUrl}`);
                
                // Update the Sub-ID with the URL
                const updatedSubId = await storage.updateSubIdClickupTask(
                  subId.id,
                  subId.clickupTaskId,
                  liveUrl
                );
                updated.push(updatedSubId);
              } else {
                console.log(`   ⚠️  Task ${subId.clickupTaskId} still has no URL`);
              }
            }
          } else {
            console.warn(`   ❌ Could not fetch task ${subId.clickupTaskId}: ${response.statusText}`);
            errors.push({ taskId: subId.clickupTaskId, error: response.statusText });
          }
        } catch (error: any) {
          console.error(`   Error fetching task ${subId.clickupTaskId}:`, error);
          errors.push({ taskId: subId.clickupTaskId, error: error.message });
        }
      }

      console.log(`\n✅ URL Refresh Complete: ${updated.length} URLs found and updated`);

      res.json({
        updated: updated.length,
        checked: subIdsWithoutUrl.length,
        updatedSubIds: updated,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      console.error("Error refreshing URLs:", error);
      res.status(500).json({ error: error.message || "Failed to refresh URLs" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
