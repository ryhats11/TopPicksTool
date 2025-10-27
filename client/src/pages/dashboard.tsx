import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppSidebar } from "@/components/app-sidebar";
import { WebsiteHeader } from "@/components/website-header";
import { SubIdTable } from "@/components/subid-table";
import { AddWebsiteDialog } from "@/components/add-website-dialog";
import { BulkImportDialog } from "@/components/bulk-import-dialog";
import { BulkClickUpImportDialog } from "@/components/bulk-clickup-import-dialog";
import { EmptyState } from "@/components/empty-state";
import { ThemeToggle } from "@/components/theme-toggle";
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
    
    // Check if there are immutable Sub-IDs
    const hasImmutableSubIds = subIds.some((s) => s.isImmutable);
    
    if (hasImmutableSubIds) {
      toast({
        title: "Cannot Delete Website",
        description: "This website contains immutable Sub-ID/URL pairs that cannot be deleted.",
        variant: "destructive",
      });
      return;
    }
    
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
          <header className="flex items-center justify-between p-2 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-hidden">
            {selectedWebsite ? (
              <div className="h-full flex flex-col">
                <WebsiteHeader
                  websiteName={selectedWebsite.name}
                  formatPattern={selectedWebsite.formatPattern}
                  subIdCount={selectedWebsite.subIdCount}
                  onGenerateId={handleGenerateId}
                  onDeleteWebsite={handleDeleteWebsite}
                  onBulkImport={() => setIsBulkImportOpen(true)}
                  onBulkClickUpImport={() => setIsBulkClickUpImportOpen(true)}
                />
                <SubIdTable
                  subIds={subIds}
                  onCopy={handleCopy}
                  onExportCSV={handleExportCSV}
                  duplicateSubIds={duplicateSubIds}
                  isLoading={isLoadingSubIds}
                />
              </div>
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
