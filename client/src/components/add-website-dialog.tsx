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
  { label: "{random2digits}", description: "Random 2-digit number" },
  { label: "{random3digits}", description: "Random 3-digit number" },
  { label: "{random4digits}", description: "Random 4-digit number" },
  { label: "{random5digits}", description: "Random 5-digit number" },
  { label: "{random6digits}", description: "Random 6-digit number" },
  { label: "{random8digits}", description: "Random 8-digit number" },
  { label: "{random2letters}", description: "Random 2 uppercase letters" },
  { label: "{random3letters}", description: "Random 3 uppercase letters" },
  { label: "{random4letters}", description: "Random 4 uppercase letters" },
  { label: "{random5letters}", description: "Random 5 uppercase letters" },
  { label: "{random6letters}", description: "Random 6 uppercase letters" },
  { label: "{rand4chars}", description: "Random 4 alphanumeric chars" },
  { label: "{rand6chars}", description: "Random 6 alphanumeric chars" },
  { label: "{rand8chars}", description: "Random 8 alphanumeric chars" },
  { label: "{rand10chars}", description: "Random 10 alphanumeric chars" },
  { label: "{rand12chars}", description: "Random 12 alphanumeric chars" },
  { label: "{timestamp}", description: "Current Unix timestamp" },
  { label: "{date}", description: "Date in YYYYMMDD format" },
  { label: "{year}", description: "Current year (4 digits)" },
  { label: "{month}", description: "Current month (2 digits)" },
  { label: "{day}", description: "Current day (2 digits)" },
  { label: "{uuidSegment}", description: "First 8 chars of UUID" },
  { label: "{hex4}", description: "Random 4-char hex string" },
  { label: "{hex6}", description: "Random 6-char hex string" },
  { label: "{hex8}", description: "Random 8-char hex string" },
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

  const generateSuggestedPattern = () => {
    const patternTemplates = [
      "{random3letters}-{random5digits}-{random2letters}",
      "{hex6}-{random4digits}",
      "{date}-{rand6chars}",
      "{random4letters}{random6digits}",
      "{uuidSegment}-{random3digits}",
      "{year}{month}-{rand8chars}",
      "{random2letters}{random4digits}{random3letters}",
      "{hex8}-{random2letters}",
      "{random5letters}-{timestamp}",
      "{rand10chars}",
      "{random3digits}-{hex6}-{random2digits}",
      "{date}-{random4letters}-{random3digits}",
    ];

    const unusedPatterns = patternTemplates.filter(
      (template) => !existingPatterns.includes(template)
    );

    if (unusedPatterns.length > 0) {
      return unusedPatterns[0];
    }

    return `{rand8chars}-${Math.random().toString(36).substring(2, 5)}`;
  };

  const handleUseSuggestion = () => {
    const suggested = generateSuggestedPattern();
    handlePatternChange(suggested);
  };

  const generatePreview = (pattern: string) => {
    let preview = pattern;
    const now = new Date();
    
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
    preview = preview.replace(/\{rand(\d+)chars\}/g, (_, num) =>
      Array.from({ length: parseInt(num) }, () =>
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".charAt(Math.floor(Math.random() * 36))
      ).join("")
    );
    preview = preview.replace(/\{timestamp\}/g, Date.now().toString());
    preview = preview.replace(/\{date\}/g, 
      `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`
    );
    preview = preview.replace(/\{year\}/g, now.getFullYear().toString());
    preview = preview.replace(/\{month\}/g, String(now.getMonth() + 1).padStart(2, "0"));
    preview = preview.replace(/\{day\}/g, String(now.getDate()).padStart(2, "0"));
    preview = preview.replace(
      /\{uuidSegment\}/g,
      Math.random().toString(36).substring(2, 10).toUpperCase()
    );
    preview = preview.replace(/\{hex(\d+)\}/g, (_, num) =>
      Array.from({ length: parseInt(num) }, () =>
        Math.floor(Math.random() * 16).toString(16).toUpperCase()
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
            <div className="flex items-center justify-between">
              <Label htmlFor="format-pattern">Format Pattern</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleUseSuggestion}
                data-testid="button-use-suggestion"
              >
                Use Suggested Pattern
              </Button>
            </div>
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
            <div className="max-h-48 overflow-y-auto border rounded-md p-3">
              <div className="flex flex-wrap gap-2">
                {formatVariables.map((variable) => (
                  <Badge
                    key={variable.label}
                    variant="secondary"
                    className="cursor-pointer hover-elevate active-elevate-2 text-xs"
                    onClick={() => insertVariable(variable.label)}
                    data-testid={`badge-variable-${variable.label}`}
                    title={variable.description}
                  >
                    {variable.label}
                  </Badge>
                ))}
              </div>
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
