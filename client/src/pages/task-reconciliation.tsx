import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageNav } from "@/components/page-nav";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, CheckCircle2, XCircle, AlertCircle, Globe, GripVertical, Plus, AlertTriangle } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { GeoBrandRanking, Brand } from "@shared/schema";

interface ReconciliationResult {
  taskId: string;
  subniche?: string | null;
  websiteName: string | null;
  websiteId: string | null;
  detectedGeo: {
    code: string;
    name: string;
    id: string;
  } | null;
  unmatchedGeoValue?: string;
  brandMatch: {
    position: number;
    brandName: string;
  } | null;
  subIdExists: boolean;
  subIdValue: string | null;
  error?: string;
}

interface RankingWithBrand extends GeoBrandRanking {
  brand?: Brand;
}

interface SortableBrandItemProps {
  brand: RankingWithBrand;
  index: number;
}

function SortableBrandItem({ brand, index }: SortableBrandItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: brand.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 bg-card border rounded-md hover-elevate"
      data-testid={`sortable-brand-${index}`}
    >
      <div className="flex items-center gap-2 cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary font-semibold text-sm">
        {index + 1}
      </div>
      <div className="flex-1">
        <div className="font-medium">{brand.brand?.name || "Unknown Brand"}</div>
        {brand.affiliateLink && (
          <div className="text-xs text-muted-foreground truncate">{brand.affiliateLink}</div>
        )}
      </div>
    </div>
  );
}

export default function TaskReconciliation() {
  const { toast } = useToast();
  const [taskIds, setTaskIds] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<ReconciliationResult[]>([]);
  const [selectedGeoForBrands, setSelectedGeoForBrands] = useState<{ id: string; code: string; name: string } | null>(null);
  const [localBrands, setLocalBrands] = useState<RankingWithBrand[]>([]);
  const [creatingSubIds, setCreatingSubIds] = useState<Set<string>>(new Set());
  const [manualBrandSelections, setManualBrandSelections] = useState<Record<string, { position: number | null; brandName: string; brandId: string }>>({});
  const [manualGeoSelections, setManualGeoSelections] = useState<Record<string, string>>({}); // taskId -> geoId

  // Fetch all GEOs to get rankings for each
  const { data: allGeos = [] } = useQuery<Array<{ id: string; code: string; name: string }>>({
    queryKey: ["/api/geos"],
  });

  // Fetch rankings for the selected GEO
  const { data: rankings = [], isLoading: rankingsLoading } = useQuery<GeoBrandRanking[]>({
    queryKey: ["/api/geos", selectedGeoForBrands?.id, "rankings"],
    enabled: !!selectedGeoForBrands?.id,
  });

  // Fetch all brands
  const { data: brands = [], isLoading: brandsLoading } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
  });

  // Fetch all rankings for all GEOs (for manual brand selection)
  const allRankingsQueries = useQuery<Record<string, GeoBrandRanking[]>>({
    queryKey: ["/api/all-geo-rankings"],
    queryFn: async () => {
      const rankingsByGeo: Record<string, GeoBrandRanking[]> = {};
      
      for (const geo of allGeos) {
        const res = await fetch(`/api/geos/${geo.id}/rankings`);
        if (res.ok) {
          const geoRankings = await res.json();
          rankingsByGeo[geo.id] = geoRankings;
        }
      }
      
      return rankingsByGeo;
    },
    enabled: allGeos.length > 0 && brands.length > 0,
  });

  // Helper to get all brands for a specific GEO (both featured and non-featured)
  const getAllBrandsForGeo = (geoId: string): Array<{ position: number | null; brandName: string; brandId: string }> => {
    const geoRankings = allRankingsQueries.data?.[geoId] || [];
    
    return geoRankings
      .map(r => {
        const brand = brands.find(b => b.id === r.brandId);
        return {
          position: r.position,
          brandName: brand?.name || "Unknown",
          brandId: r.brandId,
        };
      })
      .sort((a, b) => {
        // Sort featured brands (1-10) first, then non-featured brands alphabetically
        if (a.position !== null && b.position !== null) {
          return a.position - b.position;
        }
        if (a.position !== null) return -1;
        if (b.position !== null) return 1;
        return a.brandName.localeCompare(b.brandName);
      });
  };

  // Setup drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setLocalBrands((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleBrandBadgeClick = (geo: { id: string; code: string; name: string }) => {
    setSelectedGeoForBrands(geo);
  };

  const handleManualGeoSelection = (taskId: string, geoId: string) => {
    if (!geoId) {
      // Clear both geo and brand selection
      setManualGeoSelections(prev => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      setManualBrandSelections(prev => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      return;
    }

    setManualGeoSelections(prev => ({
      ...prev,
      [taskId]: geoId,
    }));
    
    // Clear brand selection when GEO changes
    setManualBrandSelections(prev => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  const handleManualBrandSelection = (taskId: string, brandValue: string) => {
    if (!brandValue) {
      // Clear brand selection
      setManualBrandSelections(prev => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      return;
    }

    // Parse the value which is in format "position|null:brandName:brandId"
    const [positionStr, brandName, brandId] = brandValue.split(":");
    const position = positionStr === "null" ? null : parseInt(positionStr, 10);

    setManualBrandSelections(prev => ({
      ...prev,
      [taskId]: { position, brandName, brandId },
    }));
  };

  // When dialog opens or GEO changes, initialize local brands
  useEffect(() => {
    if (!selectedGeoForBrands) {
      return;
    }

    // Wait for both queries to finish loading
    if (rankingsLoading || brandsLoading) {
      return;
    }

    // Combine rankings with brands
    const rankingsWithBrands: RankingWithBrand[] = rankings
      .map((ranking) => ({
        ...ranking,
        brand: brands.find((b) => b.id === ranking.brandId),
      }))
      .sort((a, b) => (a.position || 999) - (b.position || 999));
    
    setLocalBrands(rankingsWithBrands);
  }, [selectedGeoForBrands?.id, rankingsLoading, brandsLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper function to clean website name - removes *pm- prefix
  const cleanWebsiteName = (name: string | null): string | null => {
    if (!name) return null;
    
    // Remove *pm- or *pm - prefix (case-insensitive, with optional space)
    const cleaned = name.replace(/^\*pm\s*-\s*/i, '');
    return cleaned;
  };

  const handleAnalyze = async () => {
    if (!taskIds.trim()) {
      toast({
        title: "No Task IDs",
        description: "Please enter at least one ClickUp task ID.",
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

  const handleCreateSubId = async (taskId: string, websiteId: string) => {
    setCreatingSubIds(prev => new Set(prev).add(taskId));

    try {
      const res = await apiRequest("POST", "/api/create-subid-from-task", {
        taskId,
        websiteId,
      });

      const newSubId = await res.json();

      // Update the results to reflect the new Sub-ID
      setResults(prevResults =>
        prevResults.map(result =>
          result.taskId === taskId
            ? {
                ...result,
                subIdExists: true,
                subIdValue: newSubId.value,
              }
            : result
        )
      );

      // Invalidate queries so Sub-ID Tracker updates
      queryClient.invalidateQueries({ queryKey: ["/api/websites", websiteId, "subids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subids"] });

      toast({
        title: "Sub-ID Created",
        description: `Created Sub-ID: ${newSubId.value}`,
      });
    } catch (error: any) {
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create Sub-ID.",
        variant: "destructive",
      });
    } finally {
      setCreatingSubIds(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <PageNav />
      
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto p-6 max-w-7xl">
          <div className="mb-6">
            <h1 className="text-3xl font-bold mb-2">Top Picks Tool</h1>
            <p className="text-muted-foreground">
              Auto-detects Target GEO from each task and cross-references with featured brands and Sub-ID tracker
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
              Enter one task ID per line or separate with commas. Each task's *Target GEO custom field will be used for brand matching.
            </p>
          </div>

          <Button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !taskIds.trim()}
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
            </h2>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task ID</TableHead>
                    <TableHead>Subniche</TableHead>
                    <TableHead>Target GEO</TableHead>
                    <TableHead>Website</TableHead>
                    <TableHead>Brand Match</TableHead>
                    <TableHead>Sub-ID Status</TableHead>
                    <TableHead>Sub-ID Value</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result, index) => (
                    <TableRow key={index} data-testid={`result-row-${index}`}>
                      <TableCell className="font-mono text-sm" data-testid={`cell-task-id-${index}`}>
                        {result.taskId}
                      </TableCell>
                      <TableCell className="text-sm" data-testid={`cell-subniche-${index}`}>
                        {result.subniche ? (
                          <Badge variant="secondary" className="text-xs">
                            {result.subniche}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell data-testid={`cell-geo-${index}`}>
                        {result.detectedGeo ? (
                          <Badge variant="outline" className="gap-1">
                            <Globe className="h-3 w-3" />
                            {result.detectedGeo.code}
                          </Badge>
                        ) : result.unmatchedGeoValue ? (
                          <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-500">
                            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                            <span>Add "{result.unmatchedGeoValue}" to Brand Rankings</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">Not set</span>
                        )}
                      </TableCell>
                      <TableCell data-testid={`cell-website-${index}`}>
                        {result.error ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Error
                          </Badge>
                        ) : result.websiteName ? (
                          <span>{cleanWebsiteName(result.websiteName)}</span>
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell data-testid={`cell-brand-match-${index}`}>
                        {(() => {
                          // Check if there's an automatic match
                          const autoMatch = result.brandMatch;
                          // Check if there's a manual selection
                          const manualMatch = manualBrandSelections[result.taskId];
                          const manualGeoId = manualGeoSelections[result.taskId];
                          // Get the final match to display (manual overrides auto)
                          let displayMatch = manualMatch || autoMatch;

                          // If no match yet, try to get #1 brand from detected GEO
                          if (!displayMatch && result.detectedGeo) {
                            const allBrands = getAllBrandsForGeo(result.detectedGeo.id);
                            const topBrand = allBrands.find(b => b.position === 1);
                            if (topBrand) {
                              displayMatch = topBrand;
                            }
                          }

                          // If we have a match, display it as a badge
                          if (displayMatch) {
                            const displayGeo = result.detectedGeo || (manualGeoId ? allGeos.find(g => g.id === manualGeoId) : null);
                            const positionText = displayMatch.position !== null && displayMatch.position !== undefined 
                              ? `#${displayMatch.position} ` 
                              : '';

                            return (
                              <div className="flex items-center gap-2">
                                <Badge 
                                  variant="default" 
                                  className={displayGeo ? "gap-1 cursor-pointer hover-elevate active-elevate-2" : "gap-1"}
                                  onClick={displayGeo ? () => handleBrandBadgeClick(displayGeo) : undefined}
                                  onKeyDown={displayGeo ? (e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      handleBrandBadgeClick(displayGeo);
                                    }
                                  } : undefined}
                                  role={displayGeo ? "button" : undefined}
                                  tabIndex={displayGeo ? 0 : undefined}
                                  data-testid={`badge-brand-match-${index}`}
                                >
                                  {positionText}{displayMatch.brandName}
                                </Badge>
                              </div>
                            );
                          }

                          // No match and no GEO detected - show "No match"
                          return <span className="text-muted-foreground text-sm">No match</span>;
                        })()}
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
                      <TableCell data-testid={`cell-actions-${index}`}>
                        {!result.subIdExists && !result.error && !result.unmatchedGeoValue && (
                          result.websiteId ? (
                            <Button
                              size="sm"
                              onClick={() => handleCreateSubId(result.taskId, result.websiteId!)}
                              disabled={creatingSubIds.has(result.taskId)}
                              data-testid={`button-create-subid-${index}`}
                            >
                              {creatingSubIds.has(result.taskId) ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Creating...
                                </>
                              ) : (
                                <>
                                  <Plus className="h-3 w-3 mr-1" />
                                  Create Sub-ID
                                </>
                              )}
                            </Button>
                          ) : result.websiteName ? (
                            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-500">
                              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                              <span>Add "{cleanWebsiteName(result.websiteName)}" to Sub-ID Tracker first</span>
                            </div>
                          ) : null
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
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
              {results.some(r => r.unmatchedGeoValue) && (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-amber-600 dark:text-amber-500">
                    {results.filter(r => r.unmatchedGeoValue).length} need GEO setup
                  </span>
                </div>
              )}
              {results.some(r => r.websiteName && !r.websiteId && !r.error) && (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-amber-600 dark:text-amber-500">
                    {results.filter(r => r.websiteName && !r.websiteId && !r.error).length} need website setup
                  </span>
                </div>
              )}
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
                <p className="text-sm">Enter task IDs to begin analysis</p>
              </div>
            </Card>
          )}
        </div>
      </main>

      <Dialog open={!!selectedGeoForBrands} onOpenChange={(open) => !open && setSelectedGeoForBrands(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" data-testid="dialog-brand-list">
          <DialogHeader>
            <DialogTitle>
              Brand Rankings - {selectedGeoForBrands?.code} ({selectedGeoForBrands?.name})
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Drag and drop to reorder (temporary view only - changes are not saved)
            </p>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto pr-2">
            {(rankingsLoading || brandsLoading) ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : localBrands.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={localBrands.map(b => b.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {localBrands.map((brand, index) => (
                      <SortableBrandItem key={brand.id} brand={brand} index={index} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No brands found for this GEO</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
