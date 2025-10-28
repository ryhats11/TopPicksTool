import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Search, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import type { Geo } from "@shared/schema";

interface ReconciliationResult {
  taskId: string;
  websiteName: string | null;
  websiteId: string | null;
  brandMatch: {
    position: number;
    brandName: string;
  } | null;
  subIdExists: boolean;
  subIdValue: string | null;
  error?: string;
}

export default function TaskReconciliation() {
  const { toast } = useToast();
  const [taskIds, setTaskIds] = useState("");
  const [selectedGeoId, setSelectedGeoId] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<ReconciliationResult[]>([]);

  // Fetch GEOs
  const { data: geos = [] } = useQuery<Geo[]>({
    queryKey: ["/api/geos"],
  });

  const handleAnalyze = async () => {
    if (!taskIds.trim()) {
      toast({
        title: "No Task IDs",
        description: "Please enter at least one ClickUp task ID.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedGeoId) {
      toast({
        title: "No GEO Selected",
        description: "Please select a GEO to analyze against.",
        variant: "destructive",
      });
      return;
    }

    // Parse task IDs from textarea
    const taskIdList = taskIds
      .split(/[,\n]+/)
      .map(id => id.trim())
      .filter(id => id.length > 0);

    if (taskIdList.length === 0) {
      toast({
        title: "Invalid Input",
        description: "No valid task IDs found.",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    setResults([]);

    try {
      const res = await apiRequest("POST", "/api/reconcile-tasks", {
        taskIds: taskIdList,
        geoId: selectedGeoId,
      });

      const data = await res.json();
      setResults(data.results || []);

      toast({
        title: "Analysis Complete",
        description: `Analyzed ${taskIdList.length} task${taskIdList.length > 1 ? 's' : ''}.`,
      });
    } catch (error: any) {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze tasks.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const selectedGeo = geos.find(g => g.id === selectedGeoId);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Task Reconciliation</h1>
        <p className="text-muted-foreground">
          Cross-reference ClickUp tasks with featured brands and Sub-ID tracker
        </p>
      </div>

      <Card className="p-6 mb-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              ClickUp Task IDs
            </label>
            <Textarea
              placeholder="Paste task IDs (one per line or comma-separated)&#10;Example:&#10;86c2bmpk6&#10;86c2bmq8z&#10;86c2bn0kw"
              value={taskIds}
              onChange={(e) => setTaskIds(e.target.value)}
              className="min-h-32 font-mono text-sm"
              data-testid="textarea-task-ids"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Enter one task ID per line or separate with commas
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Select GEO (Featured Brands)
            </label>
            <Select value={selectedGeoId} onValueChange={setSelectedGeoId}>
              <SelectTrigger data-testid="select-geo-trigger">
                <SelectValue placeholder="Select a GEO..." />
              </SelectTrigger>
              <SelectContent data-testid="select-geo-content">
                {geos.map((geo) => (
                  <SelectItem key={geo.id} value={geo.id} data-testid={`select-geo-${geo.code}`}>
                    {geo.name} ({geo.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Tasks will be matched against the top 10 featured brands for this region
            </p>
          </div>

          <Button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !taskIds.trim() || !selectedGeoId}
            className="w-full"
            data-testid="button-analyze"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Analyze Tasks
              </>
            )}
          </Button>
        </div>
      </Card>

      {results.length > 0 && (
        <Card>
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4">
              Reconciliation Results
              {selectedGeo && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({selectedGeo.name})
                </span>
              )}
            </h2>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task ID</TableHead>
                    <TableHead>Website</TableHead>
                    <TableHead>Brand Match</TableHead>
                    <TableHead>Sub-ID Status</TableHead>
                    <TableHead>Sub-ID Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result, index) => (
                    <TableRow key={index} data-testid={`result-row-${index}`}>
                      <TableCell className="font-mono text-sm" data-testid={`cell-task-id-${index}`}>
                        {result.taskId}
                      </TableCell>
                      <TableCell data-testid={`cell-website-${index}`}>
                        {result.error ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Error
                          </Badge>
                        ) : result.websiteName ? (
                          <span>{result.websiteName}</span>
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell data-testid={`cell-brand-match-${index}`}>
                        {result.brandMatch ? (
                          <Badge variant="default" className="gap-1">
                            #{result.brandMatch.position} {result.brandMatch.brandName}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">No match</span>
                        )}
                      </TableCell>
                      <TableCell data-testid={`cell-subid-status-${index}`}>
                        {result.subIdExists ? (
                          <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
                            <CheckCircle2 className="h-3 w-3" />
                            Exists
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <XCircle className="h-3 w-3" />
                            Not Found
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm" data-testid={`cell-subid-value-${index}`}>
                        {result.subIdValue || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>
                  {results.filter(r => r.subIdExists).length} with Sub-ID
                </span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                <span>
                  {results.filter(r => !r.subIdExists && !r.error).length} without Sub-ID
                </span>
              </div>
              {results.some(r => r.error) && (
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span>
                    {results.filter(r => r.error).length} errors
                  </span>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {results.length === 0 && !isAnalyzing && (
        <Card className="p-12">
          <div className="text-center text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No results yet</p>
            <p className="text-sm">Enter task IDs and select a GEO to begin analysis</p>
          </div>
        </Card>
      )}
    </div>
  );
}
