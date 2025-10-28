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
    const replaceTrackingParam = (url: string, newValue: string): string => {
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

      let wasReplaced = false;

      try {
        const urlObj = new URL(url);
        
        // Find which tracking parameter exists
        for (const param of trackingParams) {
          if (urlObj.searchParams.has(param)) {
            urlObj.searchParams.set(param, newValue);
            wasReplaced = true;
            return urlObj.toString();
          }
        }
        
        // Case-insensitive search
        const allParams = Array.from(urlObj.searchParams.keys());
        for (const actualParam of allParams) {
          for (const knownParam of trackingParams) {
            if (actualParam.toLowerCase() === knownParam.toLowerCase()) {
              urlObj.searchParams.set(actualParam, newValue);
              wasReplaced = true;
              return urlObj.toString();
            }
          }
        }
      } catch (e) {
        // Parsing failed, fall through to regex
      }
      
      // If URL parsing didn't find a tracked parameter, try regex fallback
      // This handles malformed URLs like "?s=valuea=valueb=oldTaskId"
      if (!wasReplaced) {
        for (const param of trackingParams) {
          const match = url.match(new RegExp(`(${param})=([^&\\s]+)`, 'i'));
          if (match) {
            return url.replace(
              new RegExp(`${match[1]}=[^&\\s]+`, 'i'),
              `${match[1]}=${newValue}`
            );
          }
        }
      }
      
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
          // Replace task ID with Sub-ID in tracking link
          const updatedUrl = replaceTrackingParam(url, subIdValue);
          
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
        
        for (const line of lines) {
          // Skip empty lines and header rows
          if (!line.trim() || line.includes('---') || line.toLowerCase().includes('brand name')) {
            continue;
          }
          
          // If this line contains a URL, extract it
          const urlMatch = line.match(/https?:\/\/[^\s<>"'`|]+/);
          if (!urlMatch) continue;
          
          let url = urlMatch[0];
          
          // Skip pokerology.com URLs (these are cloaked links)
          if (url.includes('pokerology.com')) {
            console.log(`   ⏭️  Skipping cloaked link: ${url.substring(0, 60)}...`);
            continue;
          }
          
          // Find where this URL appears in the line
          const urlIndex = line.indexOf(url);
          if (urlIndex !== -1) {
            // Get everything after the initial URL match (might contain more params separated by spaces)
            const afterUrl = line.substring(urlIndex + url.length);
            
            // Look for continuation: parameter names followed by = (across spaces)
            // Match patterns like: " &param=value" or " param=value" or "=value"
            const continuationMatch = afterUrl.match(/^([^|]*?)(?=\s*\||$)/);
            if (continuationMatch) {
              const continuation = continuationMatch[1].trim();
              
              // If it starts with = or contains parameter patterns, append it
              if (continuation && (
                continuation.startsWith('=') ||
                continuation.match(/^[&\s]*[a-zA-Z_]+=/) ||
                // Handle case where parameters are separated by spaces in table
                continuation.match(/^[a-zA-Z0-9_-]+(?=[&=\s]|$)/)
              )) {
                // Clean up the continuation - remove extra spaces between params
                const cleanedContinuation = continuation.replace(/\s+&/g, '&').replace(/\s+=/g, '=');
                url = url + cleanedContinuation;
              }
            }
          }
          
          // Final cleanup: ensure proper URL format
          // Fix missing ? before first parameter
          if (url.match(/https?:\/\/[^?]+[a-zA-Z0-9_-]+=/) && !url.includes('?')) {
            url = url.replace(/([a-zA-Z0-9_-]+=)/, '?$1');
          }
          
          trackingLinks.push(url);
          console.log(`   ✅ Tracking link ${trackingLinks.length}: ${url.substring(0, 80)}...`);
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

  const httpServer = createServer(app);
  return httpServer;
}
