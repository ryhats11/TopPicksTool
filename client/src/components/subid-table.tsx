import { Copy, Check, Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";

interface SubId {
  id: string;
  value: string;
  timestamp: number;
}

interface SubIdTableProps {
  subIds: SubId[];
  onCopy: (value: string) => void;
  onExportCSV: () => void;
  duplicateSubIds: Set<string>;
}

export function SubIdTable({ subIds, onCopy, onExportCSV, duplicateSubIds }: SubIdTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, value: string) => {
    onCopy(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
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

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50%]">Sub-ID</TableHead>
              <TableHead className="w-[35%]">Timestamp</TableHead>
              <TableHead className="w-[15%] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subIds.map((subId) => {
              const isDuplicate = duplicateSubIds.has(subId.value);
              return (
                <TableRow key={subId.id} className={isDuplicate ? "bg-destructive/10" : ""}>
                  <TableCell className={`font-mono font-medium ${isDuplicate ? "text-destructive" : ""}`}>
                    {subId.value}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(subId.timestamp), "MMM d, yyyy h:mm a")}
                  </TableCell>
                  <TableCell className="text-right">
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
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
