import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface BulkClickUpImportDialogProps {
  websiteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BulkClickUpImportDialog({
  websiteId,
  open,
  onOpenChange,
}: BulkClickUpImportDialogProps) {
  const [taskIds, setTaskIds] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: async (taskIdList: string[]) => {
      const response = await apiRequest("POST", `/api/websites/${websiteId}/clickup/bulk`, {
        taskIds: taskIdList,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/subids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/websites", websiteId, "subids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/websites"] });

      const urlsPopulated = data.filter((subId: any) => subId.url).length;
      
      toast({
        title: "ClickUp Tasks Imported",
        description: `Successfully created ${data.length} Sub-ID(s) linked to ClickUp tasks.${
          urlsPopulated > 0 ? ` ${urlsPopulated} Live URL(s) auto-populated.` : ""
        }`,
      });
      
      setTaskIds("");
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import ClickUp tasks. Please check the task IDs and try again.",
        variant: "destructive",
      });
    },
  });

  const handleImport = () => {
    const lines = taskIds.split("\n").map((line) => line.trim()).filter(Boolean);
    
    if (lines.length === 0) {
      toast({
        title: "No Task IDs",
        description: "Please paste at least one ClickUp task ID.",
        variant: "destructive",
      });
      return;
    }

    importMutation.mutate(lines);
  };

  const taskIdCount = taskIds.split("\n").filter((line) => line.trim()).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]" data-testid="dialog-bulk-clickup-import">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            Bulk Import ClickUp Tasks
          </DialogTitle>
          <DialogDescription>
            Paste multiple ClickUp task IDs (one per line) to automatically create Sub-IDs linked to your tasks.
            If tasks have a "Live URL" custom field, it will be auto-populated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Enter one task ID per line. Find task IDs in your ClickUp task URLs: clickup.com/t/<span className="font-mono">TASK_ID</span>
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="taskIds">ClickUp Task IDs</Label>
            <Textarea
              id="taskIds"
              placeholder={`86bq2um3g\n86bq2um3h\n86bq2um3i`}
              value={taskIds}
              onChange={(e) => setTaskIds(e.target.value)}
              className="font-mono text-sm min-h-[200px]"
              disabled={importMutation.isPending}
              data-testid="textarea-clickup-task-ids"
            />
            {taskIdCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {taskIdCount} task ID{taskIdCount !== 1 ? "s" : ""} ready to import
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={importMutation.isPending}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={importMutation.isPending || taskIdCount === 0}
              data-testid="button-import-clickup-tasks"
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing {taskIdCount} Task{taskIdCount !== 1 ? "s" : ""}...
                </>
              ) : (
                <>
                  <FileUp className="h-4 w-4 mr-2" />
                  Import {taskIdCount} Task{taskIdCount !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
