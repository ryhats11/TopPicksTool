import { Plus, Trash2, Upload, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface WebsiteHeaderProps {
  websiteName: string;
  formatPattern: string;
  subIdCount: number;
  onGenerateId: () => void;
  onDeleteWebsite: () => void;
  onBulkImport: () => void;
  onBulkClickUpImport: () => void;
}

export function WebsiteHeader({
  websiteName,
  formatPattern,
  subIdCount,
  onGenerateId,
  onDeleteWebsite,
  onBulkImport,
  onBulkClickUpImport,
}: WebsiteHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{websiteName}</h1>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs">
              {formatPattern}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {subIdCount} Sub-ID{subIdCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={onDeleteWebsite}
            data-testid="button-delete-website"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={onBulkImport}
            data-testid="button-bulk-import"
          >
            <Upload className="h-4 w-4 mr-2" />
            Bulk Import URLs
          </Button>
          <Button
            variant="outline"
            onClick={onBulkClickUpImport}
            data-testid="button-bulk-clickup-import"
          >
            <FileUp className="h-4 w-4 mr-2" />
            Bulk Import ClickUp
          </Button>
          <Button onClick={onGenerateId} data-testid="button-generate-id">
            <Plus className="h-4 w-4 mr-2" />
            Generate Sub-ID
          </Button>
        </div>
      </div>
    </div>
  );
}
