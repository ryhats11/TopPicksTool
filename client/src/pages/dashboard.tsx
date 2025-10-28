import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { TrendingUp, GitCompare } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { WebsiteHeader } from "@/components/website-header";
import { SubIdTable } from "@/components/subid-table";
import { AddWebsiteDialog } from "@/components/add-website-dialog";
import { BulkImportDialog } from "@/components/bulk-import-dialog";
import { BulkClickUpImportDialog } from "@/components/bulk-clickup-import-dialog";
import { EmptyState } from "@/components/empty-state";
import { WebsiteOverview } from "@/components/website-overview";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Website, SubId } from "@shared/schema";

interface WebsiteWithCount extends Website {
  subIdCount: number;
}

export default function Dashboard() {
  const { toast } = useToast();
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isBulkClickUpImportOpen, setIsBulkClickUpImportOpen] = useState(false);

  // Fetch websites
  const { data: websites = [], isLoading: isLoadingWebsites } = useQuery<WebsiteWithCount[]>({
    queryKey: ["/api/websites"],
  });

  // Fetch Sub-IDs for selected website
  const { data: subIds = [], isLoading: isLoadingSubIds } = useQuery<SubId[]>({
    queryKey: ["/api/websites", selectedWebsiteId, "subids"],
    enabled: !!selectedWebsiteId,
  });

  // Fetch all Sub-IDs for duplicate detection
  const { data: allSubIds = [] } = useQuery<SubId[]>({
    queryKey: ["/api/subids"],
  });

  // Find duplicate Sub-IDs
  const duplicateSubIds = useMemo(() => {
    const valueMap = new Map<string, number>();
    const duplicates = new Set<string>();
    
    allSubIds.forEach((subId) => {
      const count = valueMap.get(subId.value) || 0;
      valueMap.set(subId.value, count + 1);
      if (count >= 1) {
        duplicates.add(subId.value);
      }
    });
    
    return duplicates;
  }, [allSubIds]);

  const selectedWebsite = websites.find((w) => w.id === selectedWebsiteId);

  // Generate Sub-ID from pattern
  const generateSubId = (pattern: string): string => {
    let result = pattern;
    const now = new Date();
    
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
    result = result.replace(
      /\{uuidSegment\}/g,
      Math.random().toString(36).substring(2, 10).toUpperCase()
    );
    result = result.replace(/\{hex(\d+)\}/g, (_, num) =>
      Array.from({ length: parseInt(num) }, () =>
        Math.floor(Math.random() * 16).toString(16).toUpperCase()
      ).join("")
    );
    return result;
  };

  // Create website mutation
  const createWebsiteMutation = useMutation({
    mutationFn: async (data: { name: string; formatPattern: string }) => {
      const res = await apiRequest("POST", "/api/websites", data);
      return await res.json();
    },
    onSuccess: (newWebsite: WebsiteWithCount) => {
      queryClient.invalidateQueries({ queryKey: ["/api/websites"] });
      setSelectedWebsiteId(newWebsite.id);
      toast({
        title: "Website Added",
        description: `${newWebsite.name} has been created.`,
      });
    },
  });

  // Delete website mutation
  const deleteWebsiteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/websites/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/websites"] });
      setSelectedWebsiteId(null);
      toast({
        title: "Website Deleted",
        description: "The website and all its Sub-IDs have been deleted.",
      });
    },
  });

  // Generate single Sub-ID mutation
  const generateSubIdMutation = useMutation({
    mutationFn: async ({ websiteId, value }: { websiteId: string; value: string }) => {
      const res = await apiRequest("POST", `/api/websites/${websiteId}/subids`, {
        websiteId,
        value,
        timestamp: Date.now(),
        isImmutable: false,
      });
      return await res.json();
    },
    onSuccess: (newSubId: SubId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/websites", selectedWebsiteId, "subids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/websites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subids"] });

      const isDuplicate = allSubIds.some((s) => s.value === newSubId.value && s.id !== newSubId.id);
      
      if (isDuplicate) {
        toast({
          title: "⚠️ Duplicate Sub-ID Detected!",
          description: `${newSubId.value} already exists in another website. This is highlighted in red.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Sub-ID Generated",
          description: `Created: ${newSubId.value}`,
        });
      }
    },
  });

  // Bulk import Sub-IDs mutation
  const bulkImportMutation = useMutation({
    mutationFn: async ({ websiteId, urls }: { websiteId: string; urls: string[] }) => {
      const subIdList = urls.map((url) => ({
        websiteId,
        value: generateSubId(selectedWebsite!.formatPattern),
        url,
        timestamp: Date.now(),
        isImmutable: true,
      }));

      const res = await apiRequest("POST", `/api/websites/${websiteId}/subids/bulk`, { subIds: subIdList });
      return await res.json();
    },
    onSuccess: (createdSubIds: SubId[]) => {
      queryClient.invalidateQueries({ queryKey: ["/api/websites", selectedWebsiteId, "subids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/websites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subids"] });
      toast({
        title: "Bulk Import Complete",
        description: `Generated ${createdSubIds.length} immutable Sub-ID/URL pairs.`,
      });
    },
  });

  // Delete Sub-ID mutation
  const deleteSubIdMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/subids/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/websites", selectedWebsiteId, "subids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/websites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subids"] });
      toast({
        title: "Sub-ID Deleted",
        description: "The Sub-ID has been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Cannot Delete",
        description: error.message || "Failed to delete Sub-ID",
        variant: "destructive",
      });
    },
  });

  // Refresh URLs mutation
  const refreshUrlsMutation = useMutation({
    mutationFn: async (websiteId: string) => {
      const res = await apiRequest("POST", `/api/websites/${websiteId}/clickup/refresh-urls`);
      return await res.json();
    },
    onSuccess: (data: { updated: number; checked: number; errors?: any[] }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/websites", selectedWebsiteId, "subids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/websites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subids"] });
      
      if (data.updated > 0) {
        toast({
          title: "URLs Updated",
          description: `${data.updated} of ${data.checked} URL${data.updated !== 1 ? 's' : ''} found and updated from ClickUp.`,
        });
      } else {
        toast({
          title: "No New URLs",
          description: `Checked ${data.checked} task${data.checked !== 1 ? 's' : ''}, but no URLs were found in ClickUp.`,
          variant: "default",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Refresh Failed",
        description: error.message || "Failed to refresh URLs from ClickUp",
        variant: "destructive",
      });
    },
  });

  // Calculate missing URL count and linked task count
  const missingUrlCount = useMemo(() => {
    return subIds.filter(s => s.clickupTaskId && !s.url).length;
  }, [subIds]);

  const linkedTaskCount = useMemo(() => {
    return subIds.filter(s => s.clickupTaskId).length;
  }, [subIds]);

  // Post comment to ClickUp mutation
  const postCommentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/subids/${id}/clickup/comment`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/websites", selectedWebsiteId, "subids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subids"] });
      toast({
        title: "Comment Posted",
        description: "TOP PICKS LINEUP table posted to ClickUp task successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Post Failed",
        description: error.message || "Failed to post comment to ClickUp",
        variant: "destructive",
      });
    },
  });

  // Bulk post comments mutation
  const bulkPostCommentsMutation = useMutation({
    mutationFn: async (websiteId: string) => {
      const res = await apiRequest("POST", `/api/websites/${websiteId}/clickup/post-comments`);
      return await res.json();
    },
    onSuccess: (data: { posted: number; skipped: number; checked: number; errors?: any[] }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/websites", selectedWebsiteId, "subids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subids"] });
      if (data.posted > 0) {
        toast({
          title: "Comments Posted",
          description: `${data.posted} TOP PICKS LINEUP table${data.posted !== 1 ? 's' : ''} posted to ClickUp. ${data.skipped} already had comments.`,
        });
      } else {
        toast({
          title: "All Up to Date",
          description: `Checked ${data.checked} task${data.checked !== 1 ? 's' : ''}. All already have Sub-ID comments.`,
          variant: "default",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Bulk Post Failed",
        description: error.message || "Failed to post comments to ClickUp",
        variant: "destructive",
      });
    },
  });

  const handleAddWebsite = (data: { name: string; formatPattern: string }) => {
    createWebsiteMutation.mutate(data);
  };

  const handleGenerateId = () => {
    if (!selectedWebsite) return;
    const value = generateSubId(selectedWebsite.formatPattern);
    generateSubIdMutation.mutate({
      websiteId: selectedWebsite.id,
      value,
    });
  };

  const handleDeleteWebsite = () => {
    if (!selectedWebsite) return;
    deleteWebsiteMutation.mutate(selectedWebsite.id);
  };

  const handleBulkImport = (urls: string[]) => {
    if (!selectedWebsite) return;
    bulkImportMutation.mutate({
      websiteId: selectedWebsite.id,
      urls,
    });
  };

  const handleCopy = (value: string) => {
    navigator.clipboard.writeText(value);
    toast({
      title: "Copied!",
      description: `${value} copied to clipboard`,
    });
  };

  const handleDeleteSubId = (id: string) => {
    deleteSubIdMutation.mutate(id);
  };

  const handleRefreshUrls = () => {
    if (!selectedWebsite) return;
    refreshUrlsMutation.mutate(selectedWebsite.id);
  };

  const handlePostComment = (id: string) => {
    postCommentMutation.mutate(id);
  };

  const handleBulkPostComments = () => {
    if (!selectedWebsite) return;
    bulkPostCommentsMutation.mutate(selectedWebsite.id);
  };

  const handleExportCSV = () => {
    if (!selectedWebsite || subIds.length === 0) return;

    const headers = ["Sub-ID", "URL", "Timestamp", "Immutable"];
    const rows = subIds.map((subId) => [
      subId.value,
      subId.url || "",
      new Date(subId.timestamp).toISOString(),
      subId.isImmutable ? "Yes" : "No",
    ]);

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedWebsite.name}-subids.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "CSV Exported",
      description: `Exported ${subIds.length} Sub-IDs`,
    });
  };

  const sidebarStyle = {
    "--sidebar-width": "20rem",
    "--sidebar-width-icon": "4rem",
  } as React.CSSProperties;

  if (isLoadingWebsites) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex h-screen w-full">
        <AppSidebar
          websites={websites}
          selectedWebsiteId={selectedWebsiteId}
          onSelectWebsite={setSelectedWebsiteId}
          onAddWebsite={() => setIsAddDialogOpen(true)}
        />
        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between px-6 py-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center gap-4">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild data-testid="link-brand-rankings">
                  <Link href="/brand-rankings">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Brand Rankings
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="link-task-reconciliation">
                  <Link href="/task-reconciliation">
                    <GitCompare className="h-4 w-4 mr-2" />
                    Task Reconciliation
                  </Link>
                </Button>
              </div>
            </div>
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">
            {selectedWebsite ? (
              <div className="h-full flex flex-col">
                <div className="px-6 py-6 border-b bg-background">
                  <WebsiteHeader
                  websiteName={selectedWebsite.name}
                  formatPattern={selectedWebsite.formatPattern}
                  subIdCount={selectedWebsite.subIdCount}
                  missingUrlCount={missingUrlCount}
                  linkedTaskCount={linkedTaskCount}
                  onGenerateId={handleGenerateId}
                  onDeleteWebsite={handleDeleteWebsite}
                  onBulkImport={() => setIsBulkImportOpen(true)}
                  onBulkClickUpImport={() => setIsBulkClickUpImportOpen(true)}
                  onRefreshUrls={handleRefreshUrls}
                  onBulkPostComments={handleBulkPostComments}
                  isRefreshing={refreshUrlsMutation.isPending}
                  isPostingComments={bulkPostCommentsMutation.isPending}
                  />
                </div>
                <div className="flex-1 overflow-auto px-6 py-6">
                  <SubIdTable
                  subIds={subIds}
                  onCopy={handleCopy}
                  onExportCSV={handleExportCSV}
                  onDelete={handleDeleteSubId}
                  onPostComment={handlePostComment}
                  duplicateSubIds={duplicateSubIds}
                  isLoading={isLoadingSubIds}
                  postingCommentId={postCommentMutation.isPending ? postCommentMutation.variables : null}
                  />
                </div>
              </div>
            ) : websites.length > 0 ? (
              <WebsiteOverview
                websites={websites}
                onSelectWebsite={setSelectedWebsiteId}
                onAddWebsite={() => setIsAddDialogOpen(true)}
              />
            ) : (
              <EmptyState onAddWebsite={() => setIsAddDialogOpen(true)} />
            )}
          </main>
        </div>
      </div>

      <AddWebsiteDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSubmit={handleAddWebsite}
        existingPatterns={websites.map((w) => w.formatPattern)}
      />

      {selectedWebsite && (
        <>
          <BulkImportDialog
            open={isBulkImportOpen}
            onOpenChange={setIsBulkImportOpen}
            onSubmit={handleBulkImport}
            websiteName={selectedWebsite.name}
          />
          <BulkClickUpImportDialog
            websiteId={selectedWebsite.id}
            open={isBulkClickUpImportOpen}
            onOpenChange={setIsBulkClickUpImportOpen}
          />
        </>
      )}
    </SidebarProvider>
  );
}
