import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertWebsiteSchema, 
  insertSubIdSchema,
  insertGeoSchema,
  insertBrandSchema,
  insertBrandListSchema,
  insertGeoBrandRankingSchema
} from "@shared/schema";

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

  // Create Sub-ID from Task Reconciliation
  app.post("/api/create-subid-from-task", async (req, res) => {
    try {
      const { taskId, websiteId } = req.body;
      
      if (!taskId || !websiteId) {
        return res.status(400).json({ error: "taskId and websiteId are required" });
      }

      // Get the website to retrieve format pattern
      const website = await storage.getWebsite(websiteId);
      if (!website) {
        return res.status(404).json({ error: "Website not found" });
      }

      const apiKey = process.env.CLICKUP_API_KEY;
      let liveUrl: string | undefined = undefined;

      // Fetch ClickUp task details to get URL
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
            
            // Look for "Live URL" custom field
            if (taskData.custom_fields && Array.isArray(taskData.custom_fields)) {
              const liveUrlField = taskData.custom_fields.find(
                (field: any) => {
                  const fieldName = (field.name || '').toLowerCase();
                  return (fieldName === '*live url' || fieldName === 'live url' || fieldName === 'liveurl' || fieldName === 'url') && field.value;
                }
              );
              
              if (liveUrlField && liveUrlField.value) {
                liveUrl = liveUrlField.value;
              }
            }
          }
        } catch (error) {
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
        isImmutable: true,
      });

      res.json(newSubId);
    } catch (error: any) {
      console.error("Error creating Sub-ID from task:", error);
      res.status(500).json({ error: error.message || "Failed to create Sub-ID" });
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

  // Helper function to generate TOP PICKS LINEUP comment with Sub-ID replacements
  // Returns ClickUp structured comment format (not plain text)
  async function generateTopPicksComment(apiKey: string, taskId: string, subIdValue: string): Promise<any> {
    // Fetch the task to get the description with TOP PICKS LINEUP table
    const taskResponse = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!taskResponse.ok) {
      throw new Error(`Failed to fetch task: ${taskResponse.statusText}`);
    }

    const taskData = await taskResponse.json();
    const taskDescription = taskData.description || taskData.text_content || '';

    // Extract TOP PICKS LINEUP section
    const topPicksMatch = taskDescription.match(/🥇\s*TOP PICKS LINEUP[\s\S]*?(?=\n#{1,2}\s[^#]|$)/i);
    
    if (!topPicksMatch) {
      console.log(`   ⚠️  No TOP PICKS LINEUP section found, using simple Sub-ID comment`);
      return `Sub-ID: ${subIdValue}`;
    }

    const topPicksSection = topPicksMatch[0];

    // Helper function to decode HTML entities in URLs
    const decodeHtmlEntities = (text: string): string => {
      return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    };

    // Helper function to replace tracking parameter in URL
    // ONLY replaces the parameter that contains the oldTaskId value
    const replaceTrackingParam = (url: string, oldTaskId: string, newValue: string): string => {
      // First decode HTML entities
      url = decodeHtmlEntities(url);
      
      const trackingParams = [
        // Core tracking parameters
        'payload', 'subid', 'sub_id', 'clickid', 'click_id', 'clickID',
        'campaign', 'campaign_id', 'affid', 'aff_id', 'affiliate_id',
        'tracking', 'tracker', 'ref', 'reference', 'source', 'source_id',
        'utm_campaign', 'utm_source', 'utm_medium', 'utm_term', 'utm_content',
        'pid', 'aid', 'sid', 'cid', 'tid', 'btag', 'tag', 'var',
        'raw', 'nci', 'nkw', 'lpid', 'bid', 'b', 'a', 's', 'c', 'dyn_id',
        // Extended affiliate parameters
        'partner_id', 'offer_id', 'creative_id', 'ad_id', 'aff_click_id',
        'transaction_id', 'payout', 'status', 'currency', 'event_type',
        'subid1', 'subid2', 'subid3', 'subid4', 'subid5',
        'aff_sub', 'aff_sub2', 'aff_sub3', 'aff_sub4', 'aff_sub5',
        'geo', 'country', 'lang', 'locale', 'device', 'os', 'browser', 'platform',
        'page_id', 'article_id', 'placement_id', 'cta_pos', 'test_variant', 'a_b_group',
        'traffic_source', 'ref_site', 'session_id', 'ref_url', 'campaign_hash',
        'content_id', 'site_id', 'user_id', 'timestamp', 'uuid',
        'adv1', 'adv2', 'a_aid', 'data1', 'data2', 'data3',
        // Additional tracking parameters
        'anid', 'afp', 'visitorId', 'zone_id', 'smc1', 'sub1', 'p1',
        'tdpeh', 'visit_id', 'pm_dv', 'dynamic', 'var1', 'zoneid'
      ];

      try {
        const urlObj = new URL(url);
        
        // Find which parameter contains the old task ID value
        for (const param of trackingParams) {
          const value = urlObj.searchParams.get(param);
          if (value === oldTaskId) {
            // Found it! Only replace this specific parameter
            urlObj.searchParams.set(param, newValue);
            return urlObj.toString();
          }
        }
        
        // Case-insensitive parameter name search with exact value match
        const allParams = Array.from(urlObj.searchParams.keys());
        for (const actualParam of allParams) {
          const value = urlObj.searchParams.get(actualParam);
          if (value === oldTaskId) {
            // Check if this is a known tracking parameter (case-insensitive)
            const isTrackingParam = trackingParams.some(
              knownParam => actualParam.toLowerCase() === knownParam.toLowerCase()
            );
            if (isTrackingParam) {
              urlObj.searchParams.set(actualParam, newValue);
              return urlObj.toString();
            }
          }
        }
      } catch (e) {
        // Parsing failed, fall through to regex
      }
      
      // Regex fallback for malformed URLs
      // Look for oldTaskId value in any tracking parameter
      for (const param of trackingParams) {
        const pattern = new RegExp(`(${param})=${oldTaskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=&|$)`, 'i');
        if (pattern.test(url)) {
          return url.replace(pattern, `$1=${newValue}`);
        }
      }
      
      // Check if task ID appears in URL path (e.g., /click/15/4204/13991/1/86aag6qjn)
      const escapedTaskId = oldTaskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Match task ID as a path segment (surrounded by / or at end of path)
      const pathPattern = new RegExp(`/${escapedTaskId}(?=/|$)`, 'i');
      if (pathPattern.test(url)) {
        return url.replace(pathPattern, `/${newValue}`);
      }
      
      // Match task ID at end of URL (no trailing slash)
      const endPattern = new RegExp(`/${escapedTaskId}$`, 'i');
      if (endPattern.test(url)) {
        return url.replace(endPattern, `/${newValue}`);
      }
      
      // If no match found, return original URL unchanged
      return url;
    };

    // Parse the table and reconstruct with updated links
    const lines = topPicksSection.split('\n');
    const updatedLines: string[] = [];
    
    for (const line of lines) {
      // Decode HTML entities in the line first
      const decodedLine = decodeHtmlEntities(line);
      
      // Extract all URLs from the decoded line
      const urlRegex = /https?:\/\/[^\s<>"'`|)]+/gi;
      const rawUrls = decodedLine.match(urlRegex) || [];
      
      // Handle URLs that end with "=" (incomplete parameter value with space after)
      const urls = rawUrls.map(url => {
        if (url.endsWith('=')) {
          // Find this URL in the line and look for the value after it
          const urlIndex = decodedLine.indexOf(url);
          if (urlIndex !== -1) {
            const afterUrl = decodedLine.substring(urlIndex + url.length);
            // Match the task ID that follows (might have a space before it)
            const valueMatch = afterUrl.match(/^\s*([a-zA-Z0-9]+)/);
            if (valueMatch) {
              return url + valueMatch[1];
            }
          }
        }
        return url;
      });
      
      let updatedLine = decodedLine;
      
      // Replace tracking links, remove cloaked links
      for (const url of urls) {
        if (url.includes('pokerology.com')) {
          // Remove cloaked link entirely
          updatedLine = updatedLine.replace(url, '');
        } else {
          // Replace ONLY the parameter that has the task ID with the Sub-ID
          const updatedUrl = replaceTrackingParam(url, taskId, subIdValue);
          
          // Debug log for troubleshooting
          if (url.includes('rbyc.fynkelto.com')) {
            console.log(`   🔍 DEBUG URL #15:`);
            console.log(`      Original: ${url}`);
            console.log(`      Updated:  ${updatedUrl}`);
          }
          
          updatedLine = updatedLine.replace(url, updatedUrl);
        }
      }
      
      // After all URL replacements, remove any trailing standalone task IDs
      // This catches task IDs that appear after URLs (common pattern in tables)
      updatedLine = updatedLine.replace(/\s+86a9[a-zA-Z0-9]+/g, '');
      
      updatedLines.push(updatedLine);
    }

    // ClickUp comments don't support markdown tables or triple backticks
    // Instead, use ClickUp's structured JSON format with a code block
    const tableContent = updatedLines.join('\n').trim();
    
    // Create structured JSON format for ClickUp code block
    const structuredComment = {
      comment: [
        {
          text: tableContent,
          attributes: {}
        },
        {
          text: "\n",
          attributes: {
            "code-block": {
              "code-block": "plain"
            }
          }
        }
      ]
    };
    
    // Debug: Log the exact comment being generated
    console.log(`   📝 Generated comment preview (first 500 chars):`);
    console.log(JSON.stringify(structuredComment, null, 2).substring(0, 500));
    
    return structuredComment;
  }

  app.post("/api/websites/:websiteId/clickup/post-comments", async (req, res) => {
    try {
      const apiKey = process.env.CLICKUP_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: "ClickUp API key not configured" });
      }

      const websiteId = req.params.websiteId;
      
      // Get all Sub-IDs for this website that have ClickUp tasks
      const allSubIds = await storage.getSubIdsByWebsite(websiteId);
      const subIdsWithTasks = allSubIds.filter(s => s.clickupTaskId);
      
      if (subIdsWithTasks.length === 0) {
        return res.json({ posted: 0, message: "No Sub-IDs with ClickUp tasks" });
      }

      console.log(`\n💬 Checking ${subIdsWithTasks.length} Sub-ID(s) for ClickUp comments...`);
      
      const posted: any[] = [];
      const skipped: any[] = [];
      const errors: any[] = [];

      for (const subId of subIdsWithTasks) {
        try {
          // First, fetch existing comments for the task
          const commentsResponse = await fetch(
            `https://api.clickup.com/api/v2/task/${subId.clickupTaskId}/comment`,
            {
              headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json',
              },
            }
          );

          if (commentsResponse.ok) {
            const commentsData = await commentsResponse.json();
            const comments = commentsData.comments || [];
            
            // Check if any comment contains the Sub-ID value
            const hasSubIdComment = comments.some((comment: any) => 
              comment.comment_text && comment.comment_text.includes(subId.value)
            );

            if (hasSubIdComment) {
              console.log(`   ⏭️  Task ${subId.clickupTaskId} already has Sub-ID comment`);
              // Mark as commented even if we didn't post it (it was already there)
              await storage.markCommentPosted(subId.id);
              skipped.push({ subId: subId.value, taskId: subId.clickupTaskId, reason: "Already commented" });
            } else {
              // Generate TOP PICKS LINEUP comment with Sub-ID replacements
              console.log(`   💬 Generating TOP PICKS LINEUP table for task ${subId.clickupTaskId}...`);
              const commentData = await generateTopPicksComment(apiKey, subId.clickupTaskId!, subId.value);
              
              const postResponse = await fetch(
                `https://api.clickup.com/api/v2/task/${subId.clickupTaskId}/comment`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': apiKey,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(commentData),
                }
              );

              if (postResponse.ok) {
                console.log(`   ✅ Posted TOP PICKS LINEUP table to task ${subId.clickupTaskId}`);
                // Mark comment as posted
                await storage.markCommentPosted(subId.id);
                posted.push({ subId: subId.value, taskId: subId.clickupTaskId });
              } else {
                const errorData = await postResponse.text();
                console.error(`   ❌ Failed to post comment to task ${subId.clickupTaskId}: ${postResponse.statusText}`);
                errors.push({ subId: subId.value, taskId: subId.clickupTaskId, error: postResponse.statusText });
              }
            }
          } else {
            console.warn(`   ❌ Could not fetch comments for task ${subId.clickupTaskId}: ${commentsResponse.statusText}`);
            errors.push({ subId: subId.value, taskId: subId.clickupTaskId, error: `Could not fetch comments: ${commentsResponse.statusText}` });
          }
        } catch (error: any) {
          console.error(`   Error processing task ${subId.clickupTaskId}:`, error);
          errors.push({ subId: subId.value, taskId: subId.clickupTaskId, error: error.message });
        }
      }

      console.log(`\n✅ Bulk Comment Complete: ${posted.length} new comments posted, ${skipped.length} skipped`);

      res.json({
        posted: posted.length,
        skipped: skipped.length,
        checked: subIdsWithTasks.length,
        postedDetails: posted,
        skippedDetails: skipped,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      console.error("Error posting bulk comments:", error);
      res.status(500).json({ error: error.message || "Failed to post bulk comments" });
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

      console.log(`\n💬 Generating TOP PICKS LINEUP table with Sub-ID ${subId.value} for task ${subId.clickupTaskId}...`);

      // Generate TOP PICKS LINEUP comment with Sub-ID replacements
      const commentData = await generateTopPicksComment(apiKey, subId.clickupTaskId, subId.value);
      
      const response = await fetch(
        `https://api.clickup.com/api/v2/task/${subId.clickupTaskId}/comment`,
        {
          method: 'POST',
          headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(commentData),
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        console.error(`   ❌ ClickUp API error: ${response.statusText}`, errorData);
        throw new Error(`ClickUp API error: ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`   ✅ TOP PICKS LINEUP table posted successfully`);

      // Mark comment as posted
      await storage.markCommentPosted(req.params.id);

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

  // Extract affiliate links from ClickUp task description and comments
  app.get("/api/clickup/task/:taskId/affiliate-links", async (req, res) => {
    try {
      const apiKey = process.env.CLICKUP_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: "ClickUp API key not configured" });
      }

      const taskId = req.params.taskId;
      
      // Fetch task details
      const taskResponse = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!taskResponse.ok) {
        return res.status(taskResponse.status).json({ error: "Failed to fetch ClickUp task" });
      }

      const taskData = await taskResponse.json();
      
      // Fetch comments
      const commentsResponse = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/comment`, {
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
        },
      });

      let comments: any[] = [];
      if (commentsResponse.ok) {
        const commentsData = await commentsResponse.json();
        comments = commentsData.comments || [];
      }

      // Helper function to extract URLs with brand info from "Tracking Link with ClickUp task ID" column
      const extractUrlsFromTopPicks = (text: string, taskId: string): Array<{url: string, brand: string, position: string, sourceTaskId: string}> => {
        if (!text) return [];
        
        const foundLinks: Array<{url: string, brand: string, position: string, sourceTaskId: string}> = [];
        
        // Look for "🥇 TOP PICKS LINEUP" section - be more generous with the ending
        const topPicksMatch = text.match(/🥇\s*TOP PICKS LINEUP[\s\S]*?(?=\n#{1,2}\s[^#]|$)/i);
        if (!topPicksMatch) {
          console.log(`   ⚠️  No TOP PICKS LINEUP section found`);
          return foundLinks;
        }
        
        const topPicksSection = topPicksMatch[0];
        console.log(`   🥇 Found TOP PICKS LINEUP section (${topPicksSection.length} chars)`);
        
        // Extract all URLs from the section - improved to handle URLs with spaces/line breaks
        // Split by lines to process each table row
        const lines = topPicksSection.split('\n');
        const trackingLinks: string[] = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          // Skip empty lines and header rows
          if (!line.trim() || line.includes('---') || line.toLowerCase().includes('brand name')) {
            continue;
          }
          
          // Extract URL more aggressively - get everything until we hit a delimiter
          // This captures the full URL including parts separated by spaces in the table
          const urlStartMatch = line.match(/https?:\/\/[^\s<>"'`|]+/);
          if (!urlStartMatch) continue;
          
          let url = urlStartMatch[0];
          
          // Skip pokerology.com URLs (these are cloaked links)
          if (url.includes('pokerology.com')) {
            console.log(`   ⏭️  Skipping cloaked link: ${url.substring(0, 60)}...`);
            continue;
          }
          
          // Get the position of this URL in the line
          const urlStartIndex = line.indexOf(url);
          const afterUrlStart = line.substring(urlStartIndex + url.length);
          
          // Build the complete URL by capturing everything until we hit a table delimiter (|)
          // This handles cases where parameters/values are separated by spaces in markdown tables
          let restOfCell = afterUrlStart.split('|')[0];
          
          // Debug logging for the first URL
          if (trackingLinks.length === 0) {
            console.log(`   🔍 DEBUG URL #1:`);
            console.log(`      Line: ${JSON.stringify(line)}`);
            console.log(`      Initial URL: ${url}`);
            console.log(`      Rest of cell: ${JSON.stringify(restOfCell)}`);
          }
          
          // If URL ends with "=" and there's nothing after it, check the next line
          if (url.endsWith('=') && !restOfCell.trim() && i + 1 < lines.length) {
            const nextLine = lines[i + 1];
            
            if (trackingLinks.length === 0) {
              console.log(`      Checking next line...`);
              console.log(`      Next line: ${JSON.stringify(nextLine)}`);
              console.log(`      Has http: ${nextLine && nextLine.includes('http')}`);
              console.log(`      Has ---: ${nextLine && nextLine.includes('---')}`);
              console.log(`      Is truthy: ${!!nextLine}`);
              console.log(`      Trimmed: ${nextLine && nextLine.trim()}`);
            }
            
            // Check if next line has the value (not a URL, not a separator)
            if (nextLine && !nextLine.includes('http') && !nextLine.includes('---') && nextLine.trim()) {
              const nextValue = nextLine.split('|')[0].trim();
              
              if (trackingLinks.length === 0) {
                console.log(`      Next value extracted: "${nextValue}"`);
                console.log(`      Matches pattern: ${nextValue.match(/^[a-zA-Z0-9_-]+$/)}`);
              }
              
              // If it looks like a parameter value, append it
              if (nextValue.match(/^[a-zA-Z0-9_-]+$/)) {
                url = url + nextValue;
                if (trackingLinks.length === 0) {
                  console.log(`      ✅ Found value on next line: "${nextValue}" → ${url}`);
                }
                // Skip the next line since we consumed it
                i++;
              }
            }
          }
          
          // Append any remaining URL parts (handling spaces in table cells)
          if (restOfCell.trim()) {
            // Remove extra whitespace and join parts that belong to the URL
            const parts = restOfCell.trim().split(/\s+/);
            
            if (trackingLinks.length === 0) {
              console.log(`      Parts: ${JSON.stringify(parts)}`);
            }
            
            for (const part of parts) {
              // Check if this part looks like it belongs to the URL
              if (
                part.startsWith('=') ||                           // Continuation of param: =value
                part.match(/^[a-zA-Z0-9_-]+$/) ||                // Value only: taskId
                part.match(/^&[a-zA-Z_]/) ||                      // New param: &param=value
                part.match(/^[a-zA-Z_][a-zA-Z0-9_]*=/) ||        // New param: param=value
                (!url.includes('?') && part.match(/^\?/))         // Query string start
              ) {
                // If URL ends with "=" and this is just a value, append it
                if (url.endsWith('=') && part.match(/^[a-zA-Z0-9_-]+$/)) {
                  url = url + part;
                  if (trackingLinks.length === 0) {
                    console.log(`      Appending value "${part}" → ${url}`);
                  }
                } 
                // If this is a new parameter with &, append it
                else if (part.startsWith('&')) {
                  url = url + part.replace(/\s+/g, '');
                }
                // If this starts with = (value part got separated), append it
                else if (part.startsWith('=')) {
                  url = url + part;
                }
                else {
                  url = url + part;
                  if (trackingLinks.length === 0) {
                    console.log(`      Appending part "${part}" → ${url}`);
                  }
                }
              } else {
                if (trackingLinks.length === 0) {
                  console.log(`      Skipping non-URL part: "${part}"`);
                }
              }
            }
          }
          
          // Clean up: remove any remaining spaces in parameters
          url = url.replace(/\s+&/g, '&').replace(/\s+=/g, '=').replace(/=\s+/g, '=');
          
          // Final cleanup: ensure proper URL format
          // Fix missing ? before first parameter if needed
          if (url.match(/https?:\/\/[^?]+[a-zA-Z0-9_-]+=/) && !url.includes('?')) {
            url = url.replace(/([a-zA-Z0-9_-]+=)/, '?$1');
          }
          
          trackingLinks.push(url);
          console.log(`   ✅ Tracking link ${trackingLinks.length}: ${url}`);
        }
        
        // Convert to the expected format with source task ID
        for (let i = 0; i < trackingLinks.length; i++) {
          foundLinks.push({
            url: trackingLinks[i],
            brand: '',
            position: (i + 1).toString(),
            sourceTaskId: taskId  // Preserve the original ClickUp task ID
          });
        }
        
        console.log(`   📋 Total extracted: ${foundLinks.length} tracking link(s)`);
        return foundLinks;
      };

      // Helper function to clean and validate URLs
      const cleanUrl = (url: string): string => {
        // Remove trailing punctuation and HTML tags
        let cleaned = url.replace(/[,;.!?]+$/, '').trim();
        // Remove any HTML tags that might have been captured
        cleaned = cleaned.replace(/<[^>]+>/g, '');
        // Remove markdown link wrapper if present
        cleaned = cleaned.replace(/^\[.*?\]\((.*?)\)$/, '$1');
        return cleaned.trim();
      };

      // ONLY use task description - this contains the TOP PICKS LINEUP table
      const taskDescription = taskData.description || taskData.text_content || '';
      
      // Extract URLs from the TOP PICKS LINEUP section
      const linksWithInfo = extractUrlsFromTopPicks(taskDescription, taskId);
      
      console.log(`   📋 Found ${linksWithInfo.length} affiliate link(s) from TOP PICKS section`);
      
      // Clean URLs and preserve brand/position info
      const affiliateLinksWithInfo: Array<{url: string, brand: string, position: string, sourceTaskId: string}> = [];
      
      // Debug: log all extracted links before filtering
      console.log(`   🔍 Raw extracted links:`, linksWithInfo.map((link: {url: string, brand: string, position: string, sourceTaskId: string}) => ({
        url: link.url.substring(0, 50) + '...',
        brand: link.brand,
        position: link.position,
        sourceTaskId: link.sourceTaskId
      })));
      
      for (const linkInfo of linksWithInfo) {
        const cleanedUrl = cleanUrl(linkInfo.url);
        
        // Include all links with source task ID preserved
        affiliateLinksWithInfo.push({
          url: cleanedUrl,
          brand: linkInfo.brand,
          position: linkInfo.position,
          sourceTaskId: linkInfo.sourceTaskId
        });
      }

      // Remove duplicates based on URL while preserving first occurrence's brand/position
      const seen = new Set<string>();
      const uniqueLinks = affiliateLinksWithInfo.filter(link => {
        if (seen.has(link.url)) return false;
        seen.add(link.url);
        return true;
      });

      console.log(`🔗 Found ${uniqueLinks.length} affiliate link(s) with brand info from TOP PICKS LINEUP table`);
      
      res.json({ links: uniqueLinks });
    } catch (error: any) {
      console.error("Error fetching affiliate links from ClickUp task:", error);
      res.status(500).json({ error: error.message || "Failed to fetch affiliate links" });
    }
  });

  // Post brand rankings to ClickUp task
  app.post("/api/reconcile-tasks/:taskId/post-brands", async (req, res) => {
    try {
      const apiKey = process.env.CLICKUP_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "ClickUp API key not configured" });
      }

      const { taskId } = req.params;
      const { listId } = req.body;

      if (!listId) {
        return res.status(400).json({ error: "listId is required" });
      }

      // Fetch brand list details
      const brandList = await storage.getBrandList(listId);
      if (!brandList) {
        return res.status(404).json({ error: "Brand list not found" });
      }

      // Fetch GEO details
      const geos = await storage.getGeos();
      const geo = geos.find((g: any) => g.id === brandList.geoId);
      if (!geo) {
        return res.status(404).json({ error: "GEO not found" });
      }

      // Fetch all brand rankings for this brand list
      const rankings = await storage.getRankingsByList(listId);
      const brands = await storage.getBrands();
      const brandsById = new Map(brands.map((b: any) => [b.id, b]));

      // Separate featured and non-featured brands
      const featuredRankings = rankings
        .filter((r: any) => r.position !== null)
        .sort((a: any, b: any) => a.position! - b.position!);

      // Validate that all featured brands have affiliate links
      const missingLinks = featuredRankings.filter((r: any) => !r.affiliateLink);
      if (missingLinks.length > 0) {
        const brandNames = missingLinks
          .map((r: any) => {
            const brand = brandsById.get(r.brandId);
            return brand ? `#${r.position} ${brand.name}` : `#${r.position}`;
          })
          .join(", ");
        return res.status(400).json({ 
          error: `Missing affiliate links for: ${brandNames}. Please add affiliate links in Brand Rankings before posting.` 
        });
      }

      // Look up Sub-ID for this task
      const allSubIds = await storage.getAllSubIds();
      const subId = allSubIds.find((s: any) => s.clickupTaskId === taskId);

      // Helper function to decode HTML entities in URLs
      const decodeHtmlEntities = (text: string): string => {
        return text
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
      };

      // Helper function to add or replace Sub-ID in tracking URL
      const addSubIdToUrl = (url: string, taskId: string, subIdValue: string): string => {
        url = decodeHtmlEntities(url);
        
        const trackingParams = [
          'payload', 'subid', 'sub_id', 'clickid', 'click_id', 'clickID',
          'campaign', 'campaign_id', 'affid', 'aff_id', 'affiliate_id',
          'tracking', 'tracker', 'ref', 'reference', 'source', 'source_id',
          'utm_campaign', 'utm_source', 'utm_medium', 'utm_term', 'utm_content',
          'pid', 'aid', 'sid', 'cid', 'tid', 'btag', 'tag', 'var',
          'raw', 'nci', 'nkw', 'lpid', 'bid', 'b', 'a', 's', 'c', 'dyn_id',
          'partner_id', 'offer_id', 'creative_id', 'ad_id', 'aff_click_id',
          'transaction_id', 'payout', 'status', 'currency', 'event_type',
          'subid1', 'subid2', 'subid3', 'subid4', 'subid5',
          'aff_sub', 'aff_sub2', 'aff_sub3', 'aff_sub4', 'aff_sub5',
          'geo', 'country', 'lang', 'locale', 'device', 'os', 'browser', 'platform',
          'page_id', 'article_id', 'placement_id', 'cta_pos', 'test_variant', 'a_b_group',
          'traffic_source', 'ref_site', 'session_id', 'ref_url', 'campaign_hash',
          'content_id', 'site_id', 'user_id', 'timestamp', 'uuid',
          'adv1', 'adv2', 'a_aid', 'data1', 'data2', 'data3',
          'anid', 'afp', 'visitorId', 'zone_id', 'smc1', 'sub1', 'p1',
          'tdpeh', 'visit_id', 'pm_dv', 'dynamic', 'var1', 'zoneid'
        ];

        try {
          const urlObj = new URL(url);
          
          // First, check if any tracking parameter already has the task ID - replace it
          let replaced = false;
          for (const param of trackingParams) {
            const value = urlObj.searchParams.get(param);
            if (value === taskId) {
              urlObj.searchParams.set(param, subIdValue);
              replaced = true;
              break;
            }
          }
          
          // If we didn't find the task ID to replace, add Sub-ID as a new parameter
          if (!replaced) {
            // Try common tracking params first, use the first one that doesn't exist
            const preferredParams = ['payload', 'subid', 'clickid'];
            let paramUsed = false;
            
            for (const param of preferredParams) {
              if (!urlObj.searchParams.has(param)) {
                urlObj.searchParams.set(param, subIdValue);
                paramUsed = true;
                break;
              }
            }
            
            // If all preferred params exist, just append as 'subid'
            if (!paramUsed) {
              urlObj.searchParams.set('subid', subIdValue);
            }
          }
          
          return urlObj.toString();
        } catch (e) {
          // If URL parsing fails, return original
          return url;
        }
      };

      // Build the brand list comment
      let commentText = `🥇 **Top Brands for ${geo.code}**\n\n`;
      
      // Add Task ID
      commentText += `**Task ID:** \`${taskId}\`\n`;
      
      // Add Sub-ID if it exists
      if (subId) {
        commentText += `**Sub-ID:** \`${subId.value}\`\n\n`;
      } else {
        commentText += '\n';
      }
      
      featuredRankings.forEach((ranking: any) => {
        const brand = brandsById.get(ranking.brandId);
        if (brand && ranking.affiliateLink) {
          let affiliateLink = ranking.affiliateLink;
          
          // If we have a Sub-ID, simply append it to the end of the affiliate link
          if (subId) {
            affiliateLink = affiliateLink + subId.value;
          }
          
          commentText += `${ranking.position}. **${brand.name}**\n`;
          commentText += `   ${affiliateLink}\n\n`;
        }
      });

      // Post comment to ClickUp
      const postResponse = await fetch(
        `https://api.clickup.com/api/v2/task/${taskId}/comment`,
        {
          method: 'POST',
          headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            comment_text: commentText,
            notify_all: false
          }),
        }
      );

      if (!postResponse.ok) {
        const errorText = await postResponse.text();
        throw new Error(`Failed to post comment: ${errorText}`);
      }

      const result = await postResponse.json();
      res.json({ success: true, comment: result });
    } catch (error: any) {
      console.error("Error posting brands to ClickUp:", error);
      res.status(500).json({ error: error.message || "Failed to post brands to ClickUp" });
    }
  });

  // GEO routes
  app.get("/api/geos", async (req, res) => {
    try {
      const geos = await storage.getGeos();
      res.json(geos);
    } catch (error) {
      console.error("Error fetching GEOs:", error);
      res.status(500).json({ error: "Failed to fetch GEOs" });
    }
  });

  app.post("/api/geos", async (req, res) => {
    let geo: any = null;
    try {
      const data = insertGeoSchema.parse(req.body);
      geo = await storage.createGeo(data);
      
      // Automatically create default brand lists: Casino, Sports, Crypto
      const defaultLists = ['Casino', 'Sports', 'Crypto'];
      for (let i = 0; i < defaultLists.length; i++) {
        await storage.createBrandList({
          geoId: geo.id,
          name: defaultLists[i],
          sortOrder: i,
        });
      }
      
      res.json(geo);
    } catch (error: any) {
      console.error("Error creating GEO:", error);
      
      // If GEO was created but list creation failed, roll back
      if (geo?.id) {
        try {
          await storage.deleteGeo(geo.id);
          console.log("Rolled back GEO creation due to list creation failure");
        } catch (rollbackError) {
          console.error("Failed to roll back GEO:", rollbackError);
        }
        // Return 500 for server-side failures after validation
        return res.status(500).json({ error: error.message || "Failed to create default brand lists" });
      }
      
      // Return 400 for validation errors
      res.status(400).json({ error: error.message || "Invalid GEO data" });
    }
  });

  app.put("/api/geos/:id", async (req, res) => {
    try {
      const data = insertGeoSchema.partial().parse(req.body);
      const geo = await storage.updateGeo(req.params.id, data);
      res.json(geo);
    } catch (error: any) {
      console.error("Error updating GEO:", error);
      res.status(400).json({ error: error.message || "Invalid GEO data" });
    }
  });

  app.delete("/api/geos/:id", async (req, res) => {
    try {
      await storage.deleteGeo(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting GEO:", error);
      res.status(500).json({ error: "Failed to delete GEO" });
    }
  });

  app.post("/api/geos/reorder", async (req, res) => {
    try {
      const { geoIds } = req.body;
      if (!Array.isArray(geoIds)) {
        return res.status(400).json({ error: "geoIds must be an array" });
      }
      
      // Update sortOrder for each GEO
      for (let i = 0; i < geoIds.length; i++) {
        await storage.updateGeo(geoIds[i], { sortOrder: i });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error reordering GEOs:", error);
      res.status(500).json({ error: error.message || "Failed to reorder GEOs" });
    }
  });

  // Brand routes
  app.get("/api/brands", async (req, res) => {
    try {
      const brands = await storage.getBrands();
      res.json(brands);
    } catch (error) {
      console.error("Error fetching brands:", error);
      res.status(500).json({ error: "Failed to fetch brands" });
    }
  });

  app.post("/api/brands", async (req, res) => {
    try {
      const data = insertBrandSchema.parse(req.body);
      const brand = await storage.createBrand(data);
      res.json(brand);
    } catch (error: any) {
      console.error("Error creating brand:", error);
      res.status(400).json({ error: error.message || "Invalid brand data" });
    }
  });

  app.put("/api/brands/:id", async (req, res) => {
    try {
      const data = insertBrandSchema.partial().parse(req.body);
      const brand = await storage.updateBrand(req.params.id, data);
      res.json(brand);
    } catch (error: any) {
      console.error("Error updating brand:", error);
      res.status(400).json({ error: error.message || "Invalid brand data" });
    }
  });

  app.delete("/api/brands/:id", async (req, res) => {
    try {
      await storage.deleteBrand(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting brand:", error);
      res.status(500).json({ error: "Failed to delete brand" });
    }
  });

  // Brand List routes
  app.get("/api/geos/:geoId/brand-lists", async (req, res) => {
    try {
      const brandLists = await storage.getBrandListsByGeo(req.params.geoId);
      res.json(brandLists);
    } catch (error) {
      console.error("Error fetching brand lists:", error);
      res.status(500).json({ error: "Failed to fetch brand lists" });
    }
  });

  app.post("/api/geos/:geoId/brand-lists", async (req, res) => {
    try {
      const data = insertBrandListSchema.parse({
        ...req.body,
        geoId: req.params.geoId,
      });
      const brandList = await storage.createBrandList(data);
      res.json(brandList);
    } catch (error: any) {
      console.error("Error creating brand list:", error);
      res.status(400).json({ error: error.message || "Invalid brand list data" });
    }
  });

  app.put("/api/brand-lists/:id", async (req, res) => {
    try {
      const data = insertBrandListSchema.partial().parse(req.body);
      const brandList = await storage.updateBrandList(req.params.id, data);
      res.json(brandList);
    } catch (error: any) {
      console.error("Error updating brand list:", error);
      res.status(400).json({ error: error.message || "Invalid brand list data" });
    }
  });

  app.delete("/api/brand-lists/:id", async (req, res) => {
    try {
      await storage.deleteBrandList(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting brand list:", error);
      res.status(500).json({ error: "Failed to delete brand list" });
    }
  });

  // Ranking routes
  app.get("/api/brand-lists/:listId/rankings", async (req, res) => {
    try {
      const rankings = await storage.getRankingsByList(req.params.listId);
      res.json(rankings);
    } catch (error) {
      console.error("Error fetching rankings:", error);
      res.status(500).json({ error: "Failed to fetch rankings" });
    }
  });
  app.get("/api/geos/:geoId/rankings", async (req, res) => {
    try {
      const rankings = await storage.getRankingsByGeo(req.params.geoId);
      res.json(rankings);
    } catch (error) {
      console.error("Error fetching rankings:", error);
      res.status(500).json({ error: "Failed to fetch rankings" });
    }
  });

  app.post("/api/geos/:geoId/rankings", async (req, res) => {
    try {
      const data = insertGeoBrandRankingSchema.parse({
        ...req.body,
        geoId: req.params.geoId,
      });
      const ranking = await storage.createRanking(data);
      res.json(ranking);
    } catch (error: any) {
      console.error("Error creating ranking:", error);
      res.status(400).json({ error: error.message || "Invalid ranking data" });
    }
  });

  app.put("/api/rankings/:id", async (req, res) => {
    try {
      const data = insertGeoBrandRankingSchema.partial().parse(req.body);
      const ranking = await storage.updateRanking(req.params.id, data);
      res.json(ranking);
    } catch (error: any) {
      console.error("Error updating ranking:", error);
      res.status(400).json({ error: error.message || "Invalid ranking data" });
    }
  });

  app.delete("/api/rankings/:id", async (req, res) => {
    try {
      await storage.deleteRanking(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting ranking:", error);
      res.status(500).json({ error: "Failed to delete ranking" });
    }
  });

  app.post("/api/brand-lists/:listId/rankings/bulk", async (req, res) => {
    try {
      const { rankings, geoId } = req.body;
      if (!Array.isArray(rankings)) {
        return res.status(400).json({ error: "rankings must be an array" });
      }
      if (!geoId) {
        return res.status(400).json({ error: "geoId is required" });
      }
      
      const validatedRankings = rankings.map((ranking) => 
        insertGeoBrandRankingSchema.parse({
          ...ranking,
          geoId: geoId,
          listId: req.params.listId,
        })
      );
      
      const updatedRankings = await storage.bulkUpsertRankings(
        req.params.listId,
        validatedRankings
      );
      res.json(updatedRankings);
    } catch (error: any) {
      console.error("Error bulk upserting rankings:", error);
      res.status(400).json({ error: error.message || "Invalid rankings data" });
    }
  });

  app.post("/api/rankings/bulk-update-positions", async (req, res) => {
    try {
      const { updates } = req.body;
      if (!Array.isArray(updates)) {
        return res.status(400).json({ error: "updates must be an array" });
      }
      
      // Validate all updates first
      for (const update of updates) {
        if (!update.id || typeof update.position !== 'number') {
          return res.status(400).json({ error: "Each update must have id and position" });
        }
      }
      
      // Use transactional bulk update to avoid conflicts
      await storage.bulkUpdatePositions(updates);
      
      res.json({ success: true, updated: updates.length });
    } catch (error: any) {
      console.error("Error bulk updating positions:", error);
      res.status(400).json({ error: error.message || "Failed to update positions" });
    }
  });

  app.post("/api/rankings/bulk-update-sort-order", async (req, res) => {
    try {
      const { updates } = req.body;
      if (!Array.isArray(updates)) {
        return res.status(400).json({ error: "updates must be an array" });
      }
      
      // Validate all updates first
      for (const update of updates) {
        if (!update.id || typeof update.sortOrder !== 'number') {
          return res.status(400).json({ error: "Each update must have id and sortOrder" });
        }
      }
      
      // Use transactional bulk update
      await storage.bulkUpdateSortOrder(updates);
      
      res.json({ success: true, updated: updates.length });
    } catch (error: any) {
      console.error("Error bulk updating sort order:", error);
      res.status(400).json({ error: error.message || "Failed to update sort order" });
    }
  });

  // Helper: Normalize GEO value from ClickUp dropdown to database code
  const normalizeGeoValue = (rawValue: string): string | null => {
    if (!rawValue) return null;
    
    // GEO alias map: maps various forms to canonical database codes
    const geoAliasMap: Record<string, string> = {
      // United States
      'US': 'USA',
      'USA': 'USA',
      'UNITEDSTATES': 'USA',
      '.US': 'USA',
      'US-UNITEDSTATES': 'USA',
      
      // United Kingdom
      'UK': 'UK',
      'GB': 'UK',
      'UNITEDKINGDOM': 'UK',
      '.UK': 'UK',
      'UK-UNITEDKINGDOM': 'UK',
      
      // Canada
      'CA': 'CA',
      'CAN': 'CA',
      'CANADA': 'CA',
      '.CA': 'CA',
      'CA-CANADA': 'CA',
      
      // Australia
      'AU': 'AU',
      'AUS': 'AU',
      'AUSTRALIA': 'AU',
      '.AU': 'AU',
      'AU-AUSTRALIA': 'AU',
      
      // Europe
      'EU': 'EU',
      '.EU': 'EU',
      'EUROPE': 'EU',
      'EUROPEANUNION': 'EU',
      
      'DE': 'DE',
      'DEU': 'DE',
      'GERMANY': 'DE',
      '.DE': 'DE',
      
      'FR': 'FR',
      'FRA': 'FR',
      'FRANCE': 'FR',
      '.FR': 'FR',
      
      'ES': 'ES',
      'ESP': 'ES',
      'SPAIN': 'ES',
      '.ES': 'ES',
      
      'IT': 'IT',
      'ITA': 'IT',
      'ITALY': 'IT',
      '.IT': 'IT',
      
      'SE': 'SE',
      'SWE': 'SE',
      'SWEDEN': 'SE',
      '.SE': 'SE',
      
      'NO': 'NO',
      'NOR': 'NO',
      'NORWAY': 'NO',
      '.NO': 'NO',
      
      'DK': 'DK',
      'DNK': 'DK',
      'DENMARK': 'DK',
      '.DK': 'DK',
      
      'FI': 'FI',
      'FIN': 'FI',
      'FINLAND': 'FI',
      '.FI': 'FI',
      
      'NL': 'NL',
      'NLD': 'NL',
      'NETHERLANDS': 'NL',
      '.NL': 'NL',
      
      'BE': 'BE',
      'BEL': 'BE',
      'BELGIUM': 'BE',
      '.BE': 'BE',
      
      'CH': 'CH',
      'CHE': 'CH',
      'SWITZERLAND': 'CH',
      '.CH': 'CH',
      
      'AT': 'AT',
      'AUT': 'AT',
      'AUSTRIA': 'AT',
      '.AT': 'AT',
      
      'IE': 'IE',
      'IRL': 'IE',
      'IRELAND': 'IE',
      '.IE': 'IE',
      
      'PT': 'PT',
      'PRT': 'PT',
      'PORTUGAL': 'PT',
      '.PT': 'PT',
      
      'PL': 'PL',
      'POL': 'PL',
      'POLAND': 'PL',
      '.PL': 'PL',
      
      'CZ': 'CZ',
      'CZE': 'CZ',
      'CZECHREPUBLIC': 'CZ',
      '.CZ': 'CZ',
      
      'SK': 'SK',
      'SVK': 'SK',
      'SLOVAKIA': 'SK',
      '.SK': 'SK',
      
      'HU': 'HU',
      'HUN': 'HU',
      'HUNGARY': 'HU',
      '.HU': 'HU',
      
      'RO': 'RO',
      'ROU': 'RO',
      'ROMANIA': 'RO',
      '.RO': 'RO',
      
      'BG': 'BG',
      'BGR': 'BG',
      'BULGARIA': 'BG',
      '.BG': 'BG',
      
      'GR': 'GR',
      'GRC': 'GR',
      'GREECE': 'GR',
      '.GR': 'GR',
      
      'HR': 'HR',
      'HRV': 'HR',
      'CROATIA': 'HR',
      '.HR': 'HR',
      
      'SI': 'SI',
      'SVN': 'SI',
      'SLOVENIA': 'SI',
      '.SI': 'SI',
      
      'RS': 'RS',
      'SRB': 'RS',
      'SERBIA': 'RS',
      '.RS': 'RS',
      
      'UA': 'UA',
      'UKR': 'UA',
      'UKRAINE': 'UA',
      '.UA': 'UA',
      
      'RU': 'RU',
      'RUS': 'RU',
      'RUSSIA': 'RU',
      '.RU': 'RU',
      
      'TR': 'TR',
      'TUR': 'TR',
      'TURKEY': 'TR',
      '.TR': 'TR',
      
      'IS': 'IS',
      'ISL': 'IS',
      'ICELAND': 'IS',
      '.IS': 'IS',
      
      'EE': 'EE',
      'EST': 'EE',
      'ESTONIA': 'EE',
      '.EE': 'EE',
      
      'LV': 'LV',
      'LVA': 'LV',
      'LATVIA': 'LV',
      '.LV': 'LV',
      
      'LT': 'LT',
      'LTU': 'LT',
      'LITHUANIA': 'LT',
      '.LT': 'LT',
      
      // Americas
      'MX': 'MX',
      'MEX': 'MX',
      'MEXICO': 'MX',
      '.MX': 'MX',
      
      'PR': 'PR',
      'PRI': 'PR',
      'PUERTORICO': 'PR',
      '.PR': 'PR',
      
      'JM': 'JM',
      'JAM': 'JM',
      'JAMAICA': 'JM',
      '.JM': 'JM',
      
      'BS': 'BS',
      'BHS': 'BS',
      'BAHAMAS': 'BS',
      '.BS': 'BS',
      
      'TT': 'TT',
      'TTO': 'TT',
      'TRINIDADANDTOBAGO': 'TT',
      '.TT': 'TT',
      
      // South America
      'BR': 'BR',
      'BRA': 'BR',
      'BRAZIL': 'BR',
      '.BR': 'BR',
      
      'AR': 'AR',
      'ARG': 'AR',
      'ARGENTINA': 'AR',
      '.AR': 'AR',
      
      'CL': 'CL',
      'CHL': 'CL',
      'CHILE': 'CL',
      '.CL': 'CL',
      
      'CO': 'CO',
      'COL': 'CO',
      'COLOMBIA': 'CO',
      '.CO': 'CO',
      
      'PE': 'PE',
      'PER': 'PE',
      'PERU': 'PE',
      '.PE': 'PE',
      
      'UY': 'UY',
      'URY': 'UY',
      'URUGUAY': 'UY',
      '.UY': 'UY',
      
      'PY': 'PY',
      'PRY': 'PY',
      'PARAGUAY': 'PY',
      '.PY': 'PY',
      
      'EC': 'EC',
      'ECU': 'EC',
      'ECUADOR': 'EC',
      '.EC': 'EC',
      
      'VE': 'VE',
      'VEN': 'VE',
      'VENEZUELA': 'VE',
      '.VE': 'VE',
      
      'BO': 'BO',
      'BOL': 'BO',
      'BOLIVIA': 'BO',
      '.BO': 'BO',
      
      // Asia
      'CN': 'CN',
      'CHN': 'CN',
      'CHINA': 'CN',
      '.CN': 'CN',
      
      'JP': 'JP',
      'JPN': 'JP',
      'JAPAN': 'JP',
      '.JP': 'JP',
      
      'KR': 'KR',
      'KOR': 'KR',
      'SOUTHKOREA': 'KR',
      '.KR': 'KR',
      
      'IN': 'IN',
      'IND': 'IN',
      'INDIA': 'IN',
      '.IN': 'IN',
      
      'ID': 'ID',
      'IDN': 'ID',
      'INDONESIA': 'ID',
      '.ID': 'ID',
      
      'MY': 'MY',
      'MYS': 'MY',
      'MALAYSIA': 'MY',
      '.MY': 'MY',
      
      'PH': 'PH',
      'PHL': 'PH',
      'PHILIPPINES': 'PH',
      '.PH': 'PH',
      
      'TH': 'TH',
      'THA': 'TH',
      'THAILAND': 'TH',
      '.TH': 'TH',
      
      'VN': 'VN',
      'VNM': 'VN',
      'VIETNAM': 'VN',
      '.VN': 'VN',
      
      'SG': 'SG',
      'SGP': 'SG',
      'SINGAPORE': 'SG',
      '.SG': 'SG',
      
      'HK': 'HK',
      'HKG': 'HK',
      'HONGKONG': 'HK',
      '.HK': 'HK',
      
      'TW': 'TW',
      'TWN': 'TW',
      'TAIWAN': 'TW',
      '.TW': 'TW',
      
      'PK': 'PK',
      'PAK': 'PK',
      'PAKISTAN': 'PK',
      '.PK': 'PK',
      
      'BD': 'BD',
      'BGD': 'BD',
      'BANGLADESH': 'BD',
      '.BD': 'BD',
      
      'LK': 'LK',
      'LKA': 'LK',
      'SRILANKA': 'LK',
      '.LK': 'LK',
      
      'NP': 'NP',
      'NPL': 'NP',
      'NEPAL': 'NP',
      '.NP': 'NP',
      
      'KZ': 'KZ',
      'KAZ': 'KZ',
      'KAZAKHSTAN': 'KZ',
      '.KZ': 'KZ',
      
      // Africa
      'ZA': 'ZA',
      'ZAF': 'ZA',
      'SOUTHAFRICA': 'ZA',
      '.ZA': 'ZA',
      
      'NG': 'NG',
      'NGA': 'NG',
      'NIGERIA': 'NG',
      '.NG': 'NG',
      
      'KE': 'KE',
      'KEN': 'KE',
      'KENYA': 'KE',
      '.KE': 'KE',
      
      'EG': 'EG',
      'EGY': 'EG',
      'EGYPT': 'EG',
      '.EG': 'EG',
      
      'MA': 'MA',
      'MAR': 'MA',
      'MOROCCO': 'MA',
      '.MA': 'MA',
      
      'DZ': 'DZ',
      'DZA': 'DZ',
      'ALGERIA': 'DZ',
      '.DZ': 'DZ',
      
      'TN': 'TN',
      'TUN': 'TN',
      'TUNISIA': 'TN',
      '.TN': 'TN',
      
      'GH': 'GH',
      'GHA': 'GH',
      'GHANA': 'GH',
      '.GH': 'GH',
      
      'TZ': 'TZ',
      'TZA': 'TZ',
      'TANZANIA': 'TZ',
      '.TZ': 'TZ',
      
      'UG': 'UG',
      'UGA': 'UG',
      'UGANDA': 'UG',
      '.UG': 'UG',
      
      'ZW': 'ZW',
      'ZWE': 'ZW',
      'ZIMBABWE': 'ZW',
      '.ZW': 'ZW',
      
      'ET': 'ET',
      'ETH': 'ET',
      'ETHIOPIA': 'ET',
      '.ET': 'ET',
      
      // Oceania
      'NZ': 'NZ',
      'NZL': 'NZ',
      'NEWZEALAND': 'NZ',
      '.NZ': 'NZ',
      
      'PG': 'PG',
      'PNG': 'PG',
      'PAPUANEWGUINEA': 'PG',
      '.PG': 'PG',
      
      'FJ': 'FJ',
      'FJI': 'FJ',
      'FIJI': 'FJ',
      '.FJ': 'FJ',
      
      'WS': 'WS',
      'WSM': 'WS',
      'SAMOA': 'WS',
      '.WS': 'WS',
      
      'TO': 'TO',
      'TON': 'TO',
      'TONGA': 'TO',
      '.TO': 'TO',
    };
    
    // Step 1: Normalize the raw value
    let normalized = rawValue
      .trim()
      .toUpperCase()
      .replace(/[^\w\s-]/g, '') // Remove punctuation except hyphens
      .replace(/\s+/g, '');      // Remove all whitespace
    
    // Step 2: Try exact match first
    if (geoAliasMap[normalized]) {
      return geoAliasMap[normalized];
    }
    
    // Step 3: Try splitting on common delimiters
    const parts = rawValue.split(/[-|]/).map(p => 
      p.trim()
        .toUpperCase()
        .replace(/[^\w]/g, '')
    );
    
    for (const part of parts) {
      if (geoAliasMap[part]) {
        return geoAliasMap[part];
      }
    }
    
    // Step 4: Return normalized value for direct lookup
    return normalized;
  };

  // Task Reconciliation: Cross-reference ClickUp tasks with featured brands and Sub-ID tracker
  app.post("/api/reconcile-tasks", async (req, res) => {
    try {
      const { taskIds } = req.body;
      
      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: "taskIds must be a non-empty array" });
      }

      const apiKey = process.env.CLICKUP_API_KEY;
      
      // Fetch all Sub-IDs to check for existing task IDs
      const allSubIds = await storage.getAllSubIds();
      const subIdsByTaskId = new Map(
        allSubIds
          .filter((s: any) => s.clickupTaskId)
          .map((s: any) => [s.clickupTaskId!, s])
      );

      // Fetch all websites to map task names to websites
      const websites = await storage.getWebsites();
      
      // Fetch all GEOs and brands to use for each task's individual GEO
      const allGeos = await storage.getGeos();
      const geosByCode = new Map(allGeos.map(g => [g.code.toUpperCase(), g]));
      const brands = await storage.getBrands();
      const brandsById = new Map(brands.map(b => [b.id, b]));

      const results = await Promise.all(
        taskIds.map(async (taskId: string) => {
          const result: any = {
            taskId,
            websiteName: null,
            websiteId: null,
            detectedGeo: null,
            brandMatch: null,
            subIdExists: false,
            subIdValue: null,
          };

          // Check if Sub-ID already exists for this task
          const existingSubId: any = subIdsByTaskId.get(taskId);
          if (existingSubId) {
            result.subIdExists = true;
            result.subIdValue = existingSubId.value;
            result.websiteId = existingSubId.websiteId;
          }

          // Fetch ClickUp task to get custom fields and task data
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
                
                // Log task data for debugging
                console.log(`[ClickUp Task ${taskId}] Name: ${taskData.name}`);
                console.log(`[ClickUp Task ${taskId}] Custom Fields:`, JSON.stringify(taskData.custom_fields, null, 2));
                
                // Extract custom fields
                let taskGeoId: string | null = null;
                let publisherValue: string | null = null;
                
                if (taskData.custom_fields && Array.isArray(taskData.custom_fields)) {
                  // Extract *Target GEO
                  const targetGeoField = taskData.custom_fields.find((field: any) => 
                    field.name === '*Target GEO'
                  );
                  
                  if (targetGeoField) {
                    console.log(`[ClickUp Task ${taskId}] *Target GEO field found, type: ${targetGeoField.type}, value:`, targetGeoField.value);
                    
                    let geoValue: string | null = null;
                    
                    if (targetGeoField.value !== null && targetGeoField.value !== undefined) {
                      // Handle dropdown/select fields (value is a numeric ID)
                      if (targetGeoField.type === 'drop_down' || targetGeoField.type === 'labels') {
                        // Value is an ID that references an option
                        const options = targetGeoField.type_config?.options || [];
                        const selectedOption = options.find((opt: any) => opt.id === targetGeoField.value || opt.orderindex === targetGeoField.value);
                        
                        if (selectedOption) {
                          geoValue = selectedOption.name || selectedOption.label || null;
                          console.log(`[ClickUp Task ${taskId}] GEO extracted from dropdown: "${geoValue}"`);
                        } else {
                          console.log(`[ClickUp Task ${taskId}] Could not find option for GEO value: ${targetGeoField.value}`);
                        }
                      } else {
                        // Handle text fields or other field types
                        geoValue = typeof targetGeoField.value === 'string' 
                          ? targetGeoField.value 
                          : targetGeoField.value.name || targetGeoField.value.value || null;
                        
                        console.log(`[ClickUp Task ${taskId}] GEO extracted: "${geoValue}"`);
                      }
                      
                      if (geoValue) {
                        // Normalize the GEO value to handle formats like ".us - United States"
                        const normalizedCode = normalizeGeoValue(geoValue);
                        console.log(`[ClickUp Task ${taskId}] Normalized GEO "${geoValue}" to "${normalizedCode}"`);
                        
                        if (normalizedCode) {
                          const matchedGeo = geosByCode.get(normalizedCode);
                          if (matchedGeo) {
                            taskGeoId = matchedGeo.id;
                            result.detectedGeo = {
                              id: matchedGeo.id,
                              code: matchedGeo.code,
                              name: matchedGeo.name,
                            };
                            console.log(`[ClickUp Task ${taskId}] Matched to database GEO: ${matchedGeo.code}`);
                          } else {
                            // GEO detected from ClickUp but not found in database
                            result.unmatchedGeoValue = geoValue;
                            console.log(`[ClickUp Task ${taskId}] Could not match normalized GEO "${normalizedCode}" to database. Available codes:`, Array.from(geosByCode.keys()));
                          }
                        }
                      }
                    } else {
                      console.log(`[ClickUp Task ${taskId}] *Target GEO field has no value`);
                    }
                  } else {
                    console.log(`[ClickUp Task ${taskId}] *Target GEO field not found`);
                  }
                  
                  // Extract *Publisher
                  const publisherField = taskData.custom_fields.find((field: any) => 
                    field.name === '*Publisher'
                  );
                  
                  if (publisherField) {
                    console.log(`[ClickUp Task ${taskId}] *Publisher field found, type: ${publisherField.type}, value:`, publisherField.value);
                    
                    if (publisherField.value !== null && publisherField.value !== undefined) {
                      // Handle dropdown/select fields (value is a numeric ID)
                      if (publisherField.type === 'drop_down' || publisherField.type === 'labels') {
                        // Value is an ID that references an option
                        const options = publisherField.type_config?.options || [];
                        const selectedOption = options.find((opt: any) => opt.id === publisherField.value || opt.orderindex === publisherField.value);
                        
                        if (selectedOption) {
                          publisherValue = selectedOption.name || selectedOption.label || null;
                          console.log(`[ClickUp Task ${taskId}] Publisher extracted from dropdown: "${publisherValue}"`);
                        } else {
                          console.log(`[ClickUp Task ${taskId}] Could not find option for value: ${publisherField.value}`);
                        }
                      } else {
                        // Handle text fields or other field types
                        publisherValue = typeof publisherField.value === 'string' 
                          ? publisherField.value 
                          : publisherField.value.name || publisherField.value.label || publisherField.value.value || null;
                        
                        console.log(`[ClickUp Task ${taskId}] Publisher extracted: "${publisherValue}"`);
                      }
                    } else {
                      console.log(`[ClickUp Task ${taskId}] *Publisher field has no value`);
                    }
                  } else {
                    console.log(`[ClickUp Task ${taskId}] *Publisher field not found`);
                  }
                  
                  // Extract *Subniche
                  const subnicheField = taskData.custom_fields.find((field: any) => 
                    field.name === '*Subniche'
                  );
                  
                  if (subnicheField && subnicheField.value !== null && subnicheField.value !== undefined) {
                    // Handle dropdown/select fields (value is a numeric ID)
                    if (subnicheField.type === 'drop_down' || subnicheField.type === 'labels') {
                      const options = subnicheField.type_config?.options || [];
                      const selectedOption = options.find((opt: any) => opt.id === subnicheField.value || opt.orderindex === subnicheField.value);
                      
                      if (selectedOption) {
                        result.subniche = selectedOption.name || selectedOption.label || null;
                        console.log(`[ClickUp Task ${taskId}] Subniche extracted from dropdown: "${result.subniche}"`);
                      }
                    } else {
                      // Handle text fields or other field types
                      result.subniche = typeof subnicheField.value === 'string' 
                        ? subnicheField.value 
                        : subnicheField.value.name || subnicheField.value.label || subnicheField.value.value || null;
                      
                      console.log(`[ClickUp Task ${taskId}] Subniche extracted: "${result.subniche}"`);
                    }
                  }
                }
                
                const taskName = taskData.name || '';
                
                // Helper function to normalize text for matching
                const normalizeForMatching = (text: string): string => {
                  return text
                    .toLowerCase()
                    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
                    .replace(/\s+/g, ' ')      // Normalize whitespace
                    .trim();
                };
                
                // Always use *Publisher custom field for website display
                if (publisherValue) {
                  // Set the display name to the raw *Publisher value
                  result.websiteName = publisherValue;
                  
                  // Try to match to a website in our database for the websiteId
                  if (!result.websiteId) {
                    // Remove *pm- prefix if present for matching
                    const cleanedPublisher = publisherValue.replace(/^\*pm-\s*/i, '');
                    const publisherNormalized = normalizeForMatching(cleanedPublisher);
                    
                    // First, try exact match (most reliable)
                    const exactMatch = websites.find(w => 
                      normalizeForMatching(w.name) === publisherNormalized
                    );
                    
                    if (exactMatch) {
                      result.websiteId = exactMatch.id;
                    } else {
                      // If no exact match, look for word-boundary matches
                      // Common filler words to ignore
                      const fillerWords = new Set(['publisher', 'site', 'casino', 'poker', 'betting', 'the', 'a', 'an', 'pm']);
                      
                      const publisherWords = publisherNormalized.split(/\s+/).filter(w => !fillerWords.has(w));
                      const potentialMatches = websites.filter(w => {
                        const websiteNormalized = normalizeForMatching(w.name);
                        const websiteWords = websiteNormalized.split(/\s+/).filter(w => !fillerWords.has(w));
                        
                        // Skip if no meaningful words
                        if (websiteWords.length === 0 || publisherWords.length === 0) return false;
                        
                        // Check if all website words appear exactly in publisher words (in order)
                        let publisherIdx = 0;
                        for (const websiteWord of websiteWords) {
                          const found = publisherWords.slice(publisherIdx).findIndex(pw => pw === websiteWord);
                          if (found === -1) return false;
                          publisherIdx += found + 1;
                        }
                        return true;
                      });
                      
                      // Only accept if exactly one unambiguous match
                      if (potentialMatches.length === 1) {
                        result.websiteId = potentialMatches[0].id;
                      }
                    }
                  }
                }
                
                // Fallback: Try to match website from task name if not already matched
                if (!result.websiteName) {
                  const taskNameNormalized = normalizeForMatching(taskName);
                  const matchedWebsite = websites.find(w => {
                    const websiteNormalized = normalizeForMatching(w.name);
                    return taskNameNormalized.includes(websiteNormalized);
                  });
                  
                  if (matchedWebsite) {
                    result.websiteName = matchedWebsite.name;
                    result.websiteId = matchedWebsite.id;
                  }
                }

                // Try to match against featured brands for this task's specific GEO
                if (taskGeoId) {
                  const rankings = await storage.getRankingsByGeo(taskGeoId);
                  const featuredRankings = rankings
                    .filter(r => r.position !== null && r.position >= 1 && r.position <= 10)
                    .sort((a, b) => (a.position || 0) - (b.position || 0));
                  
                  for (let i = 0; i < featuredRankings.length; i++) {
                    const ranking = featuredRankings[i];
                    const brand = brandsById.get(ranking.brandId);
                    if (brand) {
                      const brandNameLower = brand.name.toLowerCase();
                      const taskNameLower = taskName.toLowerCase();
                      const taskDescLower = (taskData.description || '').toLowerCase();
                      
                      if (taskNameLower.includes(brandNameLower) || taskDescLower.includes(brandNameLower)) {
                        result.brandMatch = {
                          position: i + 1, // Use position in sorted list (1-indexed)
                          brandName: brand.name,
                        };
                        break; // Use first match
                      }
                    }
                  }
                }
              } else {
                result.error = `ClickUp API: ${response.statusText}`;
              }
            } catch (error: any) {
              result.error = error.message || "Failed to fetch ClickUp task";
            }
          }

          return result;
        })
      );

      res.json({ results });
    } catch (error: any) {
      console.error("Error reconciling tasks:", error);
      res.status(500).json({ error: error.message || "Failed to reconcile tasks" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
