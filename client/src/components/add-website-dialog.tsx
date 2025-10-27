import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface AddWebsiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; formatPattern: string }) => void;
  existingPatterns: string[];
}

const formatVariables = [
  { label: "{random4digits}", description: "Random 4-digit number" },
  { label: "{random3letters}", description: "Random 3 uppercase letters" },
  { label: "{timestamp}", description: "Current Unix timestamp" },
  { label: "{uuidSegment}", description: "First 8 chars of UUID" },
  { label: "{rand6chars}", description: "Random 6 alphanumeric chars" },
];

export function AddWebsiteDialog({
  open,
  onOpenChange,
  onSubmit,
  existingPatterns,
}: AddWebsiteDialogProps) {
  const [name, setName] = useState("");
  const [formatPattern, setFormatPattern] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [patternError, setPatternError] = useState("");

  const generatePreview = (pattern: string) => {
    let preview = pattern;
    preview = preview.replace(/\{random(\d+)digits\}/g, (_, num) =>
      Math.floor(Math.random() * Math.pow(10, parseInt(num)))
        .toString()
        .padStart(parseInt(num), "0")
    );
    preview = preview.replace(/\{random(\d+)letters\}/g, (_, num) =>
      Array.from({ length: parseInt(num) }, () =>
        String.fromCharCode(65 + Math.floor(Math.random() * 26))
      ).join("")
    );
    preview = preview.replace(/\{timestamp\}/g, Date.now().toString());
    preview = preview.replace(
      /\{uuidSegment\}/g,
      Math.random().toString(36).substring(2, 10).toUpperCase()
    );
    preview = preview.replace(/\{rand(\d+)chars\}/g, (_, num) =>
      Array.from({ length: parseInt(num) }, () =>
        Math.random().toString(36).charAt(2).toUpperCase()
      ).join("")
    );
    return preview;
  };

  const handlePatternChange = (value: string) => {
    setFormatPattern(value);
    
    if (existingPatterns.includes(value)) {
      setPatternError("This format pattern is already used by another website. Please use a unique pattern.");
    } else {
      setPatternError("");
    }
    
    if (value) {
      setPreviewId(generatePreview(value));
    } else {
      setPreviewId("");
    }
  };

  const handleSubmit = () => {
    if (name && formatPattern && !patternError) {
      onSubmit({ name, formatPattern });
      setName("");
      setFormatPattern("");
      setPreviewId("");
      setPatternError("");
      onOpenChange(false);
    }
  };

  const insertVariable = (variable: string) => {
    const newPattern = formatPattern + variable;
    handlePatternChange(newPattern);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add New Website</DialogTitle>
          <DialogDescription>
            Create a new website with a custom Sub-ID format pattern
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="website-name">Website Name</Label>
            <Input
              id="website-name"
              placeholder="e.g., My E-commerce Store"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-website-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="format-pattern">Format Pattern</Label>
            <Input
              id="format-pattern"
              placeholder="e.g., ABC-{random4digits}-{random3letters}"
              value={formatPattern}
              onChange={(e) => handlePatternChange(e.target.value)}
              className="font-mono"
              data-testid="input-format-pattern"
            />
            {patternError ? (
              <p className="text-xs text-destructive">
                {patternError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Click variables below to insert them into your pattern
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Available Variables</Label>
            <div className="flex flex-wrap gap-2">
              {formatVariables.map((variable) => (
                <Badge
                  key={variable.label}
                  variant="secondary"
                  className="cursor-pointer hover-elevate active-elevate-2"
                  onClick={() => insertVariable(variable.label)}
                  data-testid={`badge-variable-${variable.label}`}
                >
                  {variable.label}
                </Badge>
              ))}
            </div>
          </div>

          {previewId && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="p-4 rounded-md bg-muted border border-border">
                <p className="text-sm font-mono" data-testid="text-preview-id">
                  {previewId}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name || !formatPattern || !!patternError}
            data-testid="button-submit-website"
          >
            Add Website
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
