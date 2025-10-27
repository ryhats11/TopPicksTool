import { useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { WebsiteHeader } from "@/components/website-header";
import { SubIdTable } from "@/components/subid-table";
import { AddWebsiteDialog } from "@/components/add-website-dialog";
import { EmptyState } from "@/components/empty-state";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useToast } from "@/hooks/use-toast";

interface Website {
  id: string;
  name: string;
  formatPattern: string;
  subIdCount: number;
}

interface SubId {
  id: string;
  value: string;
  timestamp: number;
}

export default function Dashboard() {
  const { toast } = useToast();
  const [websites, setWebsites] = useState<Website[]>([]);

  const [subIds, setSubIds] = useState<Record<string, SubId[]>>({});

  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string | null>(
    null
  );
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const selectedWebsite = websites.find((w) => w.id === selectedWebsiteId);
  const selectedSubIds = selectedWebsiteId ? subIds[selectedWebsiteId] || [] : [];

  const findDuplicateSubIds = (): Set<string> => {
    const allSubIds: string[] = [];
    const duplicates = new Set<string>();
    
    Object.values(subIds).forEach((websiteSubIds) => {
      websiteSubIds.forEach((subId) => {
        if (allSubIds.includes(subId.value)) {
          duplicates.add(subId.value);
        } else {
          allSubIds.push(subId.value);
        }
      });
    });
    
    return duplicates;
  };

  const duplicateSubIds = findDuplicateSubIds();

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

  const handleGenerateId = () => {
    if (!selectedWebsite) return;

    const newSubId: SubId = {
      id: Math.random().toString(36).substring(7),
      value: generateSubId(selectedWebsite.formatPattern),
      timestamp: Date.now(),
    };

    const allExistingSubIds = Object.values(subIds)
      .flat()
      .map((s) => s.value);
    
    const isDuplicate = allExistingSubIds.includes(newSubId.value);

    setSubIds((prev) => ({
      ...prev,
      [selectedWebsite.id]: [newSubId, ...(prev[selectedWebsite.id] || [])],
    }));

    setWebsites((prev) =>
      prev.map((w) =>
        w.id === selectedWebsite.id ? { ...w, subIdCount: w.subIdCount + 1 } : w
      )
    );

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
  };

  const handleAddWebsite = (data: { name: string; formatPattern: string }) => {
    const newWebsite: Website = {
      id: Math.random().toString(36).substring(7),
      name: data.name,
      formatPattern: data.formatPattern,
      subIdCount: 0,
    };

    setWebsites((prev) => [...prev, newWebsite]);
    setSubIds((prev) => ({ ...prev, [newWebsite.id]: [] }));
    setSelectedWebsiteId(newWebsite.id);

    toast({
      title: "Website Added",
      description: `${data.name} has been added successfully`,
    });
  };

  const handleDeleteWebsite = () => {
    if (!selectedWebsite) return;

    setWebsites((prev) => prev.filter((w) => w.id !== selectedWebsite.id));
    setSubIds((prev) => {
      const newSubIds = { ...prev };
      delete newSubIds[selectedWebsite.id];
      return newSubIds;
    });
    setSelectedWebsiteId(websites.length > 1 ? websites[0].id : null);

    toast({
      title: "Website Deleted",
      description: `${selectedWebsite.name} has been removed`,
    });
  };

  const handleCopy = (value: string) => {
    navigator.clipboard.writeText(value);
    toast({
      title: "Copied!",
      description: "Sub-ID copied to clipboard",
    });
  };

  const handleExportCSV = () => {
    if (!selectedWebsite || selectedSubIds.length === 0) return;

    const csv = [
      ["Sub-ID", "Timestamp"],
      ...selectedSubIds.map((subId) => [
        subId.value,
        new Date(subId.timestamp).toISOString(),
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedWebsite.name.toLowerCase().replace(/\s+/g, "-")}-subids-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "CSV Exported",
      description: "Sub-IDs have been exported successfully",
    });
  };

  const style = {
    "--sidebar-width": "20rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar
          websites={websites}
          selectedWebsiteId={selectedWebsiteId}
          onSelectWebsite={setSelectedWebsiteId}
          onAddWebsite={() => setIsAddDialogOpen(true)}
        />

        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between p-4 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>

          <main className="flex-1 overflow-auto p-8">
            {websites.length === 0 ? (
              <EmptyState onAddWebsite={() => setIsAddDialogOpen(true)} />
            ) : selectedWebsite ? (
              <div className="max-w-6xl mx-auto space-y-8">
                <WebsiteHeader
                  websiteName={selectedWebsite.name}
                  formatPattern={selectedWebsite.formatPattern}
                  subIdCount={selectedWebsite.subIdCount}
                  onGenerateId={handleGenerateId}
                  onDeleteWebsite={handleDeleteWebsite}
                />
                <SubIdTable
                  subIds={selectedSubIds}
                  onCopy={handleCopy}
                  onExportCSV={handleExportCSV}
                  duplicateSubIds={duplicateSubIds}
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
    </SidebarProvider>
  );
}
