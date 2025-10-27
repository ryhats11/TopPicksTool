import { Copy, Check, Download, Lock, ExternalLink, Link2, Trash2, MessageSquare } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import type { SubId } from "@shared/schema";
import { ClickUpTaskDialog } from "./clickup-task-dialog";

interface SubIdTableProps {
  subIds: SubId[];
  onCopy: (value: string) => void;
  onExportCSV: () => void;
  onDelete: (id: string) => void;
  onPostComment: (id: string) => void;
  duplicateSubIds: Set<string>;
  isLoading?: boolean;
  postingCommentId?: string | null;
}

export function SubIdTable({ subIds, onCopy, onExportCSV, onDelete, onPostComment, duplicateSubIds, isLoading, postingCommentId }: SubIdTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<SubId | null>(null);
  const [isClickUpDialogOpen, setIsClickUpDialogOpen] = useState(false);

  const handleCopy = (id: string, value: string) => {
    onCopy(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenClickUpDialog = (subId: SubId) => {
    setSelectedSubId(subId);
    setIsClickUpDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">Loading Sub-IDs...</p>
      </div>
    );
  }

  if (subIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <div className="h-8 w-8 text-muted-foreground">
            <svg
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
        </div>
        <h3 className="text-xl font-semibold mb-2">No Sub-IDs Generated</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-md">
          Start generating unique tracking codes for this website
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground font-medium">
          {subIds.length} Sub-ID{subIds.length !== 1 ? "s" : ""} generated
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onExportCSV}
          data-testid="button-export-csv"
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[25%]">Sub-ID</TableHead>
              <TableHead className="w-[30%]">URL</TableHead>
              <TableHead className="w-[20%]">ClickUp Task</TableHead>
              <TableHead className="w-[15%]">Timestamp</TableHead>
              <TableHead className="w-[10%] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subIds.map((subId) => {
              const isDuplicate = duplicateSubIds.has(subId.value);
              return (
                <TableRow key={subId.id} className={isDuplicate ? "bg-destructive/10" : ""}>
                  <TableCell className={`font-mono font-medium py-4 ${isDuplicate ? "text-destructive" : ""}`}>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="break-all">{subId.value}</span>
                        {subId.isImmutable && (
                          <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        )}
                      </div>
                      {subId.clickupTaskId && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-xs font-mono px-2 py-0.5">
                            <Link2 className="h-2.5 w-2.5 mr-1" />
                            {subId.clickupTaskId}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onPostComment(subId.id)}
                            disabled={postingCommentId === subId.id || subId.commentPosted}
                            data-testid={`button-comment-${subId.id}`}
                            className={`h-5 w-5 ${subId.commentPosted ? 'text-muted-foreground opacity-50' : ''}`}
                          >
                            <MessageSquare className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm py-4">
                    {subId.url ? (
                      <a 
                        href={subId.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1.5 group"
                      >
                        <span className="truncate max-w-xs">{subId.url}</span>
                        <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-4">
                    <Button
                      variant={subId.clickupTaskId ? "outline" : "outline"}
                      size="sm"
                      onClick={() => handleOpenClickUpDialog(subId)}
                      data-testid={`button-clickup-${subId.id}`}
                      className={subId.clickupTaskId ? "border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-950" : ""}
                    >
                      <Link2 className="h-3.5 w-3.5 mr-1.5" />
                      {subId.clickupTaskId ? "Linked" : "Link"}
                    </Button>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground py-4 whitespace-nowrap">
                    {format(new Date(subId.timestamp), "MMM d, yyyy h:mm a")}
                  </TableCell>
                  <TableCell className="text-right py-4">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopy(subId.id, subId.value)}
                        data-testid={`button-copy-${subId.id}`}
                      >
                        {copiedId === subId.id ? (
                          <Check className="h-4 w-4 text-primary" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(subId.id)}
                        data-testid={`button-delete-${subId.id}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {selectedSubId && (
        <ClickUpTaskDialog
          subId={selectedSubId}
          open={isClickUpDialogOpen}
          onOpenChange={setIsClickUpDialogOpen}
        />
      )}
    </div>
  );
}
