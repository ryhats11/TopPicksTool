import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Link as LinkIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (urls: string[]) => void;
  websiteName: string;
}

export function BulkImportDialog({
  open,
  onOpenChange,
  onSubmit,
  websiteName,
}: BulkImportDialogProps) {
  const [urlText, setUrlText] = useState("");

  const parseUrls = (text: string): string[] => {
    if (!text.trim()) return [];
    
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  };

  const urls = parseUrls(urlText);
  const validUrlCount = urls.filter((url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }).length;

  const handleSubmit = () => {
    if (urls.length === 0) return;
    onSubmit(urls);
    setUrlText("");
    onOpenChange(false);
  };

  const handleCancel = () => {
    setUrlText("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Import URLs for {websiteName}</DialogTitle>
          <DialogDescription>
            Paste a list of URLs (one per line). Each URL will get a unique Sub-ID
            that cannot be deleted or modified once saved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url-list">URL List</Label>
            <Textarea
              id="url-list"
              placeholder="https://example.com/page1&#10;https://example.com/page2&#10;https://example.com/page3"
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              className="font-mono text-sm min-h-[300px]"
              data-testid="textarea-bulk-urls"
            />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LinkIcon className="h-4 w-4" />
              <span>
                {urls.length} URL{urls.length !== 1 ? "s" : ""} detected
                {validUrlCount < urls.length && (
                  <span className="text-destructive ml-2">
                    ({urls.length - validUrlCount} invalid)
                  </span>
                )}
              </span>
            </div>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Important:</strong> Once saved, Sub-ID/URL pairs become
              permanent and cannot be deleted or modified. Make sure your URLs are
              correct before submitting.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            data-testid="button-cancel-bulk-import"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={urls.length === 0}
            data-testid="button-submit-bulk-import"
          >
            Generate {urls.length} Sub-ID{urls.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
