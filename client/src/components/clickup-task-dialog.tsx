import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, X, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SubId } from "@shared/schema";

interface ClickUpTaskDialogProps {
  subId: SubId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ClickUpTask {
  id: string;
  name: string;
  status: {
    status: string;
    color: string;
  };
  url: string;
  priority?: {
    priority: string;
    color: string;
  };
}

export function ClickUpTaskDialog({ subId, open, onOpenChange }: ClickUpTaskDialogProps) {
  const [taskId, setTaskId] = useState(subId.clickupTaskId || "");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Sync taskId state whenever subId changes or dialog opens
  useEffect(() => {
    if (open) {
      setTaskId(subId.clickupTaskId || "");
    }
  }, [subId.id, subId.clickupTaskId, open]);

  // Fetch ClickUp task details if task ID exists
  const { data: taskData, isLoading: isLoadingTask } = useQuery<ClickUpTask>({
    queryKey: ["/api/clickup/task", subId.clickupTaskId],
    enabled: !!subId.clickupTaskId && open,
  });

  const linkTaskMutation = useMutation({
    mutationFn: async (clickupTaskId: string) => {
      const response = await apiRequest("PATCH", `/api/subids/${subId.id}/clickup`, { clickupTaskId });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/subids"] });
      queryClient.invalidateQueries({ queryKey: [`/api/websites/${subId.websiteId}/subids`] });
      
      const urlWasPopulated = data.url && !subId.url;
      
      toast({
        title: "ClickUp Task Linked",
        description: urlWasPopulated 
          ? "Task linked successfully! Live URL from ClickUp has been auto-populated."
          : "The task has been successfully linked to this Sub-ID.",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Link Task",
        description: error.message || "Could not link the ClickUp task. Please verify the task ID.",
        variant: "destructive",
      });
    },
  });

  const unlinkTaskMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/subids/${subId.id}/clickup`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subids"] });
      queryClient.invalidateQueries({ queryKey: [`/api/websites/${subId.websiteId}/subids`] });
      setTaskId("");
      toast({
        title: "ClickUp Task Unlinked",
        description: "The task has been successfully unlinked from this Sub-ID.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Unlink Task",
        description: error.message || "Could not unlink the ClickUp task.",
        variant: "destructive",
      });
    },
  });

  const handleLinkTask = () => {
    if (!taskId.trim()) {
      toast({
        title: "Invalid Task ID",
        description: "Please enter a valid ClickUp task ID.",
        variant: "destructive",
      });
      return;
    }
    linkTaskMutation.mutate(taskId.trim());
  };

  const handleUnlinkTask = () => {
    unlinkTaskMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-clickup-task">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Link ClickUp Task
          </DialogTitle>
          <DialogDescription>
            Connect this Sub-ID to a ClickUp task. If the task has a "Live URL" custom field, it will automatically populate the URL.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="subid">Sub-ID</Label>
            <Input
              id="subid"
              value={subId.value}
              disabled
              className="font-mono"
              data-testid="input-subid-readonly"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              value={subId.url || "—"}
              disabled
              data-testid="input-url-readonly"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="taskId">ClickUp Task ID</Label>
            <Input
              id="taskId"
              placeholder="e.g., 86bq2um3g"
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              disabled={!!subId.clickupTaskId}
              data-testid="input-clickup-task-id"
            />
            <p className="text-xs text-muted-foreground">
              Find the task ID in your ClickUp task URL: clickup.com/t/<span className="font-mono">TASK_ID</span>
            </p>
          </div>

          {subId.clickupTaskId && (
            <div className="rounded-md border p-4 space-y-3">
              {isLoadingTask ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading task details...</span>
                </div>
              ) : taskData ? (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{taskData.name}</h4>
                      <a
                        href={taskData.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                      >
                        View in ClickUp
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Badge 
                      variant="outline"
                      style={{ 
                        borderColor: taskData.status.color,
                        color: taskData.status.color 
                      }}
                    >
                      {taskData.status.status}
                    </Badge>
                    {taskData.priority && (
                      <Badge 
                        variant="outline"
                        style={{ 
                          borderColor: taskData.priority.color,
                          color: taskData.priority.color 
                        }}
                      >
                        {taskData.priority.priority}
                      </Badge>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Unable to load task details
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            {subId.clickupTaskId ? (
              <Button
                variant="destructive"
                onClick={handleUnlinkTask}
                disabled={unlinkTaskMutation.isPending}
                data-testid="button-unlink-task"
              >
                {unlinkTaskMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Unlinking...
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4 mr-2" />
                    Unlink Task
                  </>
                )}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleLinkTask}
                  disabled={linkTaskMutation.isPending || !taskId.trim()}
                  data-testid="button-link-task"
                >
                  {linkTaskMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Linking...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4 mr-2" />
                      Link Task
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
