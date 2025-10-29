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
import type { GeoBrandRanking, Brand, BrandList } from "@shared/schema";

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
  const [postingBrands, setPostingBrands] = useState<Set<string>>(new Set());
  const [manualBrandSelections, setManualBrandSelections] = useState<Record<string, { position: number | null; brandName: string; brandId: string }>>({});
  const [manualGeoSelections, setManualGeoSelections] = useState<Record<string, string>>({}); // taskId -> geoId
  const [manualBrandListSelections, setManualBrandListSelections] = useState<Record<string, string>>({}); // taskId -> brandListId

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

  // Fetch brand lists for all GEOs
  const allBrandListsQueries = useQuery<Record<string, BrandList[]>>({
    queryKey: ["/api/all-geo-brand-lists"],
    queryFn: async () => {
      const brandListsByGeo: Record<string, BrandList[]> = {};
      
      for (const geo of allGeos) {
        const res = await fetch(`/api/geos/${geo.id}/brand-lists`);
        if (res.ok) {
          const geoBrandLists = await res.json();
          brandListsByGeo[geo.id] = geoBrandLists;
        }
      }
      
      return brandListsByGeo;
    },
    enabled: allGeos.length > 0,
  });

  // Fetch rankings for all brand lists
  const allRankingsQueries = useQuery<Record<string, GeoBrandRanking[]>>({
    queryKey: ["/api/all-brand-list-rankings"],
    queryFn: async () => {
      const rankingsByList: Record<string, GeoBrandRanking[]> = {};
      
      if (!allBrandListsQueries.data) return rankingsByList;
      
      for (const brandLists of Object.values(allBrandListsQueries.data)) {
        for (const list of brandLists) {
          const res = await fetch(`/api/brand-lists/${list.id}/rankings`);
          if (res.ok) {
            const listRankings = await res.json();
            rankingsByList[list.id] = listRankings;
          }
        }
      }
      
      return rankingsByList;
    },
    enabled: !!allBrandListsQueries.data && brands.length > 0,
  });

  // Helper to get all brands for a specific brand list (both featured and non-featured)
  const getAllBrandsForList = (listId: string): Array<{ position: number | null; brandName: string; brandId: string }> => {
    const listRankings = allRankingsQueries.data?.[listId] || [];
    
    return listRankings
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
      // Clear geo, brand list, and brand selection
      setManualGeoSelections(prev => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      setManualBrandListSelections(prev => {
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
    
    // Auto-select the first brand list for this GEO
    const brandLists = allBrandListsQueries.data?.[geoId] || [];
    if (brandLists.length > 0) {
      setManualBrandListSelections(prev => ({
        ...prev,
        [taskId]: brandLists[0].id,
      }));
    } else {
      // Clear brand list selection if no lists available
      setManualBrandListSelections(prev => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
    }
    
    // Clear brand selection when GEO changes
    setManualBrandSelections(prev => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  const handleManualBrandListSelection = (taskId: string, listId: string) => {
    if (!listId) {
      // Clear brand list and brand selection
      setManualBrandListSelections(prev => {
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

    setManualBrandListSelections(prev => ({
      ...prev,
      [taskId]: listId,
    }));
    
    // Clear brand selection when brand list changes
    setManualBrandSelections(prev => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  const handleManualBrandSelection = (taskId: string, brandValue: string) => {
    if (!brandValue || brandValue === "auto") {
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

  // Auto-select first brand list for detected GEOs when results come in
  useEffect(() => {
    if (!allBrandListsQueries.data || results.length === 0) return;

    results.forEach(result => {
      // Only auto-select for detected GEOs that don't have manual selections
      if (result.detectedGeo && !manualGeoSelections[result.taskId] && !manualBrandListSelections[result.taskId]) {
        const brandLists = allBrandListsQueries.data[result.detectedGeo.id] || [];
        if (brandLists.length > 0) {
          setManualBrandListSelections(prev => ({
            ...prev,
            [result.taskId]: brandLists[0].id,
          }));
        }
      }
    });
  }, [results, allBrandListsQueries.data]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handlePostBrands = async (taskId: string, listId: string) => {
    setPostingBrands(prev => new Set(prev).add(taskId));

    try {
      const res = await apiRequest("POST", `/api/reconcile-tasks/${taskId}/post-brands`, {
        listId,
      });

      await res.json();

      toast({
        title: "Brands Posted",
        description: "Brand rankings have been posted to ClickUp task.",
      });
    } catch (error: any) {
      toast({
        title: "Failed to Post Brands",
        description: error.message || "An error occurred.",
        variant: "destructive",
      });
    } finally {
      setPostingBrands(prev => {
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
        <div className="container mx-auto p-6 max-w-[95%]">
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
                    <TableHead>Create Sub-ID</TableHead>
                    <TableHead>Post Brands</TableHead>
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
                          // Get manual selections
                          const manualMatch = manualBrandSelections[result.taskId];
                          const manualGeoId = manualGeoSelections[result.taskId];
                          const manualListId = manualBrandListSelections[result.taskId];
                          
                          // Determine which GEO to use for brand matching
                          const effectiveGeoId = manualGeoId || result.detectedGeo?.id;
                          const effectiveGeo = manualGeoId 
                            ? allGeos.find(g => g.id === manualGeoId) 
                            : result.detectedGeo;
                          
                          // Get available brand lists for the effective GEO
                          const availableBrandLists = effectiveGeoId ? (allBrandListsQueries.data?.[effectiveGeoId] || []) : [];
                          
                          // Determine which brand list to use
                          const effectiveListId = manualListId || (availableBrandLists.length > 0 ? availableBrandLists[0]?.id : null);
                          
                          // Get the final match to display
                          let displayMatch: { position: number | null; brandName: string; brandId: string } | null = manualMatch;
                          
                          // If no manual brand selection, show #1 brand from the selected list
                          if (!displayMatch && effectiveListId) {
                            const allBrands = getAllBrandsForList(effectiveListId);
                            const topBrand = allBrands.find(b => b.position === 1);
                            if (topBrand) {
                              displayMatch = topBrand;
                            }
                          }

                          return (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                {/* GEO selector */}
                                <Select
                                  value={manualGeoId || result.detectedGeo?.id || ""}
                                  onValueChange={(value) => handleManualGeoSelection(result.taskId, value)}
                                  data-testid={`select-brand-geo-${index}`}
                                >
                                  <SelectTrigger className="h-7 text-xs w-[70px] px-2">
                                    <SelectValue placeholder="GEO">
                                      {(() => {
                                        const selectedGeoId = manualGeoId || result.detectedGeo?.id;
                                        const selectedGeo = allGeos.find(g => g.id === selectedGeoId);
                                        return selectedGeo?.code || "GEO";
                                      })()}
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    {allGeos.map((geo) => (
                                      <SelectItem key={geo.id} value={geo.id}>
                                        {geo.code} - {geo.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                {/* Brand List selector */}
                                {availableBrandLists.length > 0 ? (
                                  <Select
                                    value={effectiveListId || ""}
                                    onValueChange={(value) => handleManualBrandListSelection(result.taskId, value)}
                                    data-testid={`select-brand-list-${index}`}
                                  >
                                    <SelectTrigger className="h-7 text-xs w-[120px] px-2">
                                      <SelectValue placeholder="List">
                                        {(() => {
                                          const selectedList = availableBrandLists.find(l => l.id === effectiveListId);
                                          return selectedList?.name || "List";
                                        })()}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableBrandLists.map((list) => (
                                        <SelectItem key={list.id} value={list.id}>
                                          {list.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : effectiveGeoId ? (
                                  <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
                                    <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                                    <span>No brand lists</span>
                                  </div>
                                ) : null}
                                
                                {/* Brand badge display */}
                                {displayMatch ? (
                                  <Badge 
                                    variant="default" 
                                    className={effectiveGeo ? "gap-1 cursor-pointer hover-elevate active-elevate-2 whitespace-nowrap" : "gap-1 whitespace-nowrap"}
                                    onClick={effectiveGeo ? () => handleBrandBadgeClick(effectiveGeo) : undefined}
                                    onKeyDown={effectiveGeo ? (e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleBrandBadgeClick(effectiveGeo);
                                      }
                                    } : undefined}
                                    role={effectiveGeo ? "button" : undefined}
                                    tabIndex={effectiveGeo ? 0 : undefined}
                                    data-testid={`badge-brand-match-${index}`}
                                  >
                                    {displayMatch.position !== null && displayMatch.position !== undefined 
                                      ? `#${displayMatch.position} ` 
                                      : ''}{displayMatch.brandName}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground text-sm">No match</span>
                                )}
                              </div>
                            </div>
                          );
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
                      <TableCell data-testid={`cell-create-subid-${index}`}>
                        {/* Create Sub-ID Button */}
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
                      <TableCell data-testid={`cell-post-brands-${index}`}>
                        {/* Post Brands Button */}
                        {(() => {
                          const manualGeoId = manualGeoSelections[result.taskId];
                          const manualListId = manualBrandListSelections[result.taskId];
                          const effectiveGeoId = manualGeoId || result.detectedGeo?.id;
                          
                          // Get available brand lists for the effective GEO
                          const availableBrandLists = effectiveGeoId ? (allBrandListsQueries.data?.[effectiveGeoId] || []) : [];
                          
                          // Determine which brand list to use
                          const effectiveListId = manualListId || (availableBrandLists.length > 0 ? availableBrandLists[0]?.id : null);
                          
                          if (effectiveListId && !result.error) {
                            return (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handlePostBrands(result.taskId, effectiveListId)}
                                disabled={postingBrands.has(result.taskId)}
                                data-testid={`button-post-brands-${index}`}
                              >
                                {postingBrands.has(result.taskId) ? (
                                  <>
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    Posting...
                                  </>
                                ) : (
                                  "Post Brands"
                                )}
                              </Button>
                            );
                          }
                          return null;
                        })()}
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
