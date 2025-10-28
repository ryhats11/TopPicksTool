import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Edit2, Trash2, Save, X, Home, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { SidebarProvider, Sidebar, SidebarContent, SidebarTrigger } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Geo, Brand, GeoBrandRanking } from "@shared/schema";

interface RankingWithBrand extends GeoBrandRanking {
  brand?: Brand;
}

// Sortable GEO Item Component
function SortableGeoItem({
  geo,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}: {
  geo: Geo;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: geo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-3 rounded-md cursor-pointer hover-elevate ${
        isSelected ? "bg-accent" : ""
      }`}
      data-testid={`geo-item-${geo.id}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
        data-testid={`geo-drag-handle-${geo.id}`}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0" onClick={onSelect}>
        <div className="font-medium text-sm truncate">{geo.name}</div>
        <div className="text-xs text-muted-foreground font-mono">{geo.code}</div>
      </div>
      <div className="flex gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          data-testid={`button-edit-geo-${geo.id}`}
        >
          <Edit2 className="h-3 w-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          data-testid={`button-delete-geo-${geo.id}`}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export default function BrandRankings() {
  const { toast } = useToast();
  const [selectedGeoId, setSelectedGeoId] = useState<string | null>(null);
  const [isGeoDialogOpen, setIsGeoDialogOpen] = useState(false);
  const [isBrandDialogOpen, setIsBrandDialogOpen] = useState(false);
  const [editingGeo, setEditingGeo] = useState<Geo | null>(null);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [editingRankings, setEditingRankings] = useState<Map<number, RankingWithBrand>>(new Map());
  const [isEditMode, setIsEditMode] = useState(false);
  const [geoSearchQuery, setGeoSearchQuery] = useState("");
  const [brandSearchQuery, setBrandSearchQuery] = useState("");

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch GEOs
  const { data: geos = [], isLoading: isLoadingGeos } = useQuery<Geo[]>({
    queryKey: ["/api/geos"],
  });

  // Fetch Brands
  const { data: brands = [], isLoading: isLoadingBrands } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
  });

  // Fetch rankings for selected GEO
  const { data: rankings = [], isLoading: isLoadingRankings } = useQuery<GeoBrandRanking[]>({
    queryKey: ["/api/geos", selectedGeoId, "rankings"],
    enabled: !!selectedGeoId,
  });

  const selectedGeo = geos.find((g) => g.id === selectedGeoId);

  // Filter GEOs by search query
  const filteredGeos = geos.filter((geo) => {
    const query = geoSearchQuery.toLowerCase();
    return (
      geo.name.toLowerCase().includes(query) ||
      geo.code.toLowerCase().includes(query)
    );
  });

  // Filter brands by search query
  const filteredBrands = brands.filter((brand) => {
    const query = brandSearchQuery.toLowerCase();
    return brand.name.toLowerCase().includes(query);
  });

  // Separate featured (position 1-10) from other brands (position null)
  const featuredRankings: RankingWithBrand[] = rankings
    .filter((r) => r.position != null)
    .map((ranking) => ({
      ...ranking,
      brand: brands.find((b) => b.id === ranking.brandId),
    }))
    .sort((a, b) => (a.position || 0) - (b.position || 0));

  const otherBrands: RankingWithBrand[] = rankings
    .filter((r) => r.position == null)
    .map((ranking) => ({
      ...ranking,
      brand: brands.find((b) => b.id === ranking.brandId),
    }))
    .sort((a, b) => (a.brand?.name || "").localeCompare(b.brand?.name || ""));

  // Create GEO mutation
  const createGeoMutation = useMutation({
    mutationFn: async (data: { name: string; code: string; sortOrder?: number }) => {
      const res = await apiRequest("POST", "/api/geos", data);
      return await res.json();
    },
    onSuccess: (newGeo: Geo) => {
      queryClient.invalidateQueries({ queryKey: ["/api/geos"] });
      setSelectedGeoId(newGeo.id);
      setIsGeoDialogOpen(false);
      toast({
        title: "GEO Added",
        description: `${newGeo.name} has been created.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create GEO",
        variant: "destructive",
      });
    },
  });

  // Update GEO mutation
  const updateGeoMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Geo> }) => {
      const res = await apiRequest("PUT", `/api/geos/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/geos"] });
      setIsGeoDialogOpen(false);
      setEditingGeo(null);
      toast({
        title: "GEO Updated",
        description: "GEO has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update GEO",
        variant: "destructive",
      });
    },
  });

  // Delete GEO mutation
  const deleteGeoMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/geos/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/geos"] });
      setSelectedGeoId(null);
      toast({
        title: "GEO Deleted",
        description: "GEO has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete GEO",
        variant: "destructive",
      });
    },
  });

  // Create Brand mutation
  const createBrandMutation = useMutation({
    mutationFn: async (data: { name: string; defaultUrl?: string; status?: string }) => {
      const res = await apiRequest("POST", "/api/brands", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      setIsBrandDialogOpen(false);
      toast({
        title: "Brand Added",
        description: "Brand has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create brand",
        variant: "destructive",
      });
    },
  });

  // Update Brand mutation
  const updateBrandMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Brand> }) => {
      const res = await apiRequest("PUT", `/api/brands/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      setIsBrandDialogOpen(false);
      setEditingBrand(null);
      toast({
        title: "Brand Updated",
        description: "Brand has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update brand",
        variant: "destructive",
      });
    },
  });

  // Delete Brand mutation
  const deleteBrandMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/brands/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      toast({
        title: "Brand Deleted",
        description: "Brand has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete brand",
        variant: "destructive",
      });
    },
  });

  // Reorder GEOs mutation
  const reorderGeosMutation = useMutation({
    mutationFn: async (geoIds: string[]) => {
      const res = await apiRequest("POST", "/api/geos/reorder", { geoIds });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/geos"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reorder GEOs",
        variant: "destructive",
      });
    },
  });

  // Add other brand (non-featured) mutation
  const addOtherBrandMutation = useMutation({
    mutationFn: async (brandId: string) => {
      const res = await apiRequest("POST", `/api/geos/${selectedGeoId}/rankings`, {
        brandId,
        position: null,
        rpcInCents: 0,
        timestamp: Date.now(),
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/geos", selectedGeoId, "rankings"] });
      toast({
        title: "Brand Added",
        description: "Brand has been added to this GEO.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add brand",
        variant: "destructive",
      });
    },
  });

  // Remove brand from GEO mutation
  const removeBrandMutation = useMutation({
    mutationFn: async (rankingId: string) => {
      const res = await apiRequest("DELETE", `/api/rankings/${rankingId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/geos", selectedGeoId, "rankings"] });
      toast({
        title: "Brand Removed",
        description: "Brand has been removed from this GEO.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove brand",
        variant: "destructive",
      });
    },
  });

  // Bulk upsert rankings mutation
  const bulkUpsertRankingsMutation = useMutation({
    mutationFn: async ({ geoId, rankings }: { geoId: string; rankings: any[] }) => {
      const res = await apiRequest("POST", `/api/geos/${geoId}/rankings/bulk`, { rankings });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/geos", selectedGeoId, "rankings"] });
      setIsEditMode(false);
      setEditingRankings(new Map());
      toast({
        title: "Rankings Saved",
        description: "Brand rankings have been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save rankings",
        variant: "destructive",
      });
    },
  });

  const handleStartEdit = () => {
    const editMap = new Map<number, RankingWithBrand>();
    for (let i = 1; i <= 10; i++) {
      const existing = featuredRankings.find((r) => r.position === i);
      if (existing) {
        editMap.set(i, existing);
      } else {
        // Create placeholder for empty position
        editMap.set(i, {
          id: `temp-${i}`,
          geoId: selectedGeoId!,
          brandId: "",
          position: i,
          rpcInCents: 0,
          affiliateLink: null,
          timestamp: Date.now(),
        });
      }
    }
    setEditingRankings(editMap);
    setIsEditMode(true);
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditingRankings(new Map());
  };

  const handleSaveRankings = () => {
    if (!selectedGeoId) return;

    const rankingsToSave = Array.from(editingRankings.values())
      .filter((r) => r.brandId) // Only save rankings with a brand selected
      .map((r) => ({
        brandId: r.brandId,
        position: r.position,
        rpcInCents: r.rpcInCents,
        affiliateLink: r.affiliateLink || null,
        timestamp: Date.now(),
      }));
    
    bulkUpsertRankingsMutation.mutate({
      geoId: selectedGeoId,
      rankings: rankingsToSave,
    });
  };

  const updateEditingRanking = (position: number, field: string, value: any) => {
    const ranking = editingRankings.get(position);
    if (!ranking) return;

    const updated = { ...ranking, [field]: value };
    setEditingRankings(new Map(editingRankings.set(position, updated)));
  };

  // Handle drag end for GEOs
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = filteredGeos.findIndex((g) => g.id === active.id);
      const newIndex = filteredGeos.findIndex((g) => g.id === over.id);

      const reorderedGeos = arrayMove(filteredGeos, oldIndex, newIndex);
      const allGeoIds = reorderedGeos.map((g) => g.id);

      // Update the order in the backend
      reorderGeosMutation.mutate(allGeoIds);
    }
  };

  // Sidebar width
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <Sidebar data-testid="sidebar-geos">
          <SidebarContent>
            <div className="flex flex-col h-full">
              <div className="p-6 border-b">
                <h2 className="text-lg font-semibold">Brand Rankings</h2>
                <p className="text-xs text-muted-foreground mt-1">Manage top 10 brands by GEO</p>
              </div>

              <div className="p-4 border-b">
                <Input
                  type="text"
                  placeholder="Search GEOs..."
                  value={geoSearchQuery}
                  onChange={(e) => setGeoSearchQuery(e.target.value)}
                  className="w-full"
                  data-testid="input-search-geos"
                />
              </div>

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-2">
                  {isLoadingGeos ? (
                    <div className="text-sm text-muted-foreground p-4">Loading GEOs...</div>
                  ) : filteredGeos.length === 0 && geoSearchQuery ? (
                    <div className="text-sm text-muted-foreground p-4">
                      No GEOs match "{geoSearchQuery}"
                    </div>
                  ) : filteredGeos.length === 0 ? (
                    <div className="text-sm text-muted-foreground p-4">
                      No GEOs yet. Add your first GEO below.
                    </div>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={filteredGeos.map((g) => g.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {filteredGeos.map((geo) => (
                          <SortableGeoItem
                            key={geo.id}
                            geo={geo}
                            isSelected={selectedGeoId === geo.id}
                            onSelect={() => setSelectedGeoId(geo.id)}
                            onEdit={() => {
                              setEditingGeo(geo);
                              setIsGeoDialogOpen(true);
                            }}
                            onDelete={() => {
                              if (confirm(`Delete ${geo.name}?`)) {
                                deleteGeoMutation.mutate(geo.id);
                              }
                            }}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              </ScrollArea>

              <div className="p-4 border-t">
                <Button
                  className="w-full"
                  onClick={() => {
                    setEditingGeo(null);
                    setIsGeoDialogOpen(true);
                  }}
                  data-testid="button-add-geo"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add GEO
                </Button>
              </div>
            </div>
          </SidebarContent>
        </Sidebar>

        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-4">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <Button variant="outline" size="sm" asChild data-testid="link-dashboard">
                <Link href="/">
                  <Home className="h-4 w-4 mr-2" />
                  Sub-ID Tracker
                </Link>
              </Button>
              {selectedGeo && (
                <div>
                  <h1 className="text-xl font-semibold">{selectedGeo.name}</h1>
                  <p className="text-sm text-muted-foreground">Top 10 Brand Rankings</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setIsBrandDialogOpen(true)}
                data-testid="button-manage-brands"
              >
                Manage Brands
              </Button>
              <ThemeToggle />
            </div>
          </header>

          <main className="flex-1 overflow-auto">
            {!selectedGeoId ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                  <h2 className="text-xl font-semibold mb-2">Select a GEO</h2>
                  <p className="text-sm text-muted-foreground mb-6">
                    Choose a geographic region from the sidebar to view and manage brand rankings.
                  </p>
                  {geos.length === 0 && (
                    <Button
                      onClick={() => setIsGeoDialogOpen(true)}
                      data-testid="button-add-first-geo"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Your First GEO
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8">
                <Card>
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h2 className="text-lg font-semibold">Brand Rankings</h2>
                        <p className="text-sm text-muted-foreground">
                          Top 10 brands ranked by performance
                        </p>
                      </div>
                      {!isEditMode ? (
                        <Button onClick={handleStartEdit} data-testid="button-edit-rankings">
                          <Edit2 className="h-4 w-4 mr-2" />
                          Edit Rankings
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={handleCancelEdit}
                            data-testid="button-cancel-edit"
                          >
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                          </Button>
                          <Button onClick={handleSaveRankings} data-testid="button-save-rankings">
                            <Save className="h-4 w-4 mr-2" />
                            Save Rankings
                          </Button>
                        </div>
                      )}
                    </div>

                    {isLoadingRankings || isLoadingBrands ? (
                      <div className="text-sm text-muted-foreground p-4">Loading rankings...</div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-20">Position</TableHead>
                            <TableHead>Brand</TableHead>
                            <TableHead className="w-32">RPC (€)</TableHead>
                            <TableHead>Affiliate Link</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!isEditMode ? (
                            featuredRankings.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                  No rankings yet. Click "Edit Rankings" to add brands.
                                </TableCell>
                              </TableRow>
                            ) : (
                              featuredRankings.map((ranking) => (
                                <TableRow key={ranking.id} data-testid={`ranking-row-${ranking.position}`}>
                                  <TableCell className="font-semibold" data-testid={`cell-position-${ranking.position}`}>#{ranking.position}</TableCell>
                                  <TableCell data-testid={`cell-brand-${ranking.position}`}>{ranking.brand?.name || "Unknown Brand"}</TableCell>
                                  <TableCell className="font-mono" data-testid={`cell-rpc-${ranking.position}`}>
                                    €{(ranking.rpcInCents / 100).toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground truncate max-w-xs" data-testid={`cell-affiliate-link-${ranking.position}`}>
                                    {ranking.affiliateLink ? (
                                      <a href={ranking.affiliateLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                        {ranking.affiliateLink}
                                      </a>
                                    ) : "-"}
                                  </TableCell>
                                </TableRow>
                              ))
                            )
                          ) : (
                            Array.from({ length: 10 }, (_, i) => i + 1).map((position) => {
                              const ranking = editingRankings.get(position);
                              return (
                                <TableRow key={position} data-testid={`edit-row-${position}`}>
                                  <TableCell className="font-semibold" data-testid={`cell-edit-position-${position}`}>#{position}</TableCell>
                                  <TableCell data-testid={`cell-edit-brand-${position}`}>
                                    <Select
                                      value={ranking?.brandId || ""}
                                      onValueChange={(value) =>
                                        updateEditingRanking(position, "brandId", value)
                                      }
                                    >
                                      <SelectTrigger data-testid={`select-brand-trigger-${position}`}>
                                        <SelectValue placeholder="Select brand..." />
                                      </SelectTrigger>
                                      <SelectContent data-testid={`select-brand-content-${position}`}>
                                        {brands.map((brand) => (
                                          <SelectItem key={brand.id} value={brand.id} data-testid={`select-brand-item-${brand.id}-${position}`}>
                                            {brand.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell data-testid={`cell-edit-rpc-${position}`}>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      placeholder="0.00"
                                      value={
                                        ranking?.rpcInCents
                                          ? (ranking.rpcInCents / 100).toFixed(2)
                                          : ""
                                      }
                                      onChange={(e) => {
                                        const euros = parseFloat(e.target.value) || 0;
                                        updateEditingRanking(position, "rpcInCents", Math.round(euros * 100));
                                      }}
                                      className="font-mono"
                                      data-testid={`input-edit-rpc-${position}`}
                                    />
                                  </TableCell>
                                  <TableCell data-testid={`cell-edit-affiliate-link-${position}`}>
                                    <Input
                                      type="url"
                                      placeholder="https://example.com/affiliate-link"
                                      value={ranking?.affiliateLink || ""}
                                      onChange={(e) =>
                                        updateEditingRanking(position, "affiliateLink", e.target.value)
                                      }
                                      data-testid={`input-edit-affiliate-link-${position}`}
                                    />
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </Card>

                {/* Other Brands Section */}
                <Card className="mt-6">
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h2 className="text-lg font-semibold">Other Brands</h2>
                        <p className="text-sm text-muted-foreground">
                          Additional brands for this GEO (not in top 10)
                        </p>
                      </div>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" data-testid="button-add-other-brand">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Brand
                          </Button>
                        </DialogTrigger>
                        <DialogContent data-testid="dialog-add-other-brand">
                          <DialogHeader>
                            <DialogTitle>Add Brand to GEO</DialogTitle>
                            <DialogDescription>
                              Select a brand to add to {selectedGeo?.name}. It will not be featured in the top 10 rankings.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="py-4">
                            <Label htmlFor="brand-search">Search Brands</Label>
                            <Input
                              id="brand-search"
                              placeholder="Type to search..."
                              value={brandSearchQuery}
                              onChange={(e) => setBrandSearchQuery(e.target.value)}
                              className="mb-4"
                              data-testid="input-brand-search-other"
                            />
                            <div className="max-h-[300px] overflow-y-auto space-y-2">
                              {filteredBrands
                                .filter((brand) => !otherBrands.some((r) => r.brandId === brand.id) && !featuredRankings.some((r) => r.brandId === brand.id))
                                .map((brand) => (
                                  <Button
                                    key={brand.id}
                                    variant="outline"
                                    className="w-full justify-start"
                                    onClick={() => {
                                      addOtherBrandMutation.mutate(brand.id);
                                      setBrandSearchQuery("");
                                    }}
                                    data-testid={`button-add-brand-${brand.id}`}
                                  >
                                    {brand.name}
                                  </Button>
                                ))}
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>

                    {isLoadingRankings || isLoadingBrands ? (
                      <div className="text-sm text-muted-foreground p-4">Loading brands...</div>
                    ) : otherBrands.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8 border rounded-lg">
                        No other brands added yet.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {otherBrands.map((ranking) => (
                          <div
                            key={ranking.id}
                            className="flex items-center justify-between p-3 border rounded-lg"
                            data-testid={`other-brand-${ranking.brandId}`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{ranking.brand?.name || "Unknown"}</p>
                              {ranking.affiliateLink && (
                                <a
                                  href={ranking.affiliateLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary hover:underline truncate block"
                                >
                                  {ranking.affiliateLink}
                                </a>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeBrandMutation.mutate(ranking.id)}
                              data-testid={`button-remove-brand-${ranking.brandId}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* GEO Dialog */}
      <Dialog open={isGeoDialogOpen} onOpenChange={setIsGeoDialogOpen}>
        <DialogContent data-testid="dialog-geo">
          <DialogHeader>
            <DialogTitle>{editingGeo ? "Edit GEO" : "Add GEO"}</DialogTitle>
            <DialogDescription>
              {editingGeo
                ? "Update the geographic region details."
                : "Add a new geographic region for brand rankings."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const data = {
                name: formData.get("name") as string,
                code: formData.get("code") as string,
              };

              if (editingGeo) {
                updateGeoMutation.mutate({ id: editingGeo.id, data });
              } else {
                createGeoMutation.mutate(data);
              }
            }}
          >
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="e.g., United States"
                  defaultValue={editingGeo?.name || ""}
                  required
                  data-testid="input-geo-name"
                />
              </div>
              <div>
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  name="code"
                  placeholder="e.g., US"
                  defaultValue={editingGeo?.code || ""}
                  required
                  data-testid="input-geo-code"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsGeoDialogOpen(false);
                  setEditingGeo(null);
                }}
                data-testid="button-cancel-geo"
              >
                Cancel
              </Button>
              <Button type="submit" data-testid="button-submit-geo">
                {editingGeo ? "Update" : "Add"} GEO
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Brand Management Dialog */}
      <Dialog open={isBrandDialogOpen} onOpenChange={setIsBrandDialogOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-brands">
          <DialogHeader>
            <DialogTitle>Manage Brands</DialogTitle>
            <DialogDescription>Add, edit, or remove brands from your global directory.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                id="newBrandName"
                placeholder="Brand name"
                data-testid="input-new-brand-name"
              />
              <Input
                id="newBrandUrl"
                placeholder="Website URL (optional)"
                data-testid="input-new-brand-url"
              />
              <Button
                onClick={() => {
                  const nameInput = document.getElementById("newBrandName") as HTMLInputElement;
                  const urlInput = document.getElementById("newBrandUrl") as HTMLInputElement;
                  if (nameInput.value.trim()) {
                    createBrandMutation.mutate({
                      name: nameInput.value.trim(),
                      defaultUrl: urlInput.value.trim() || undefined,
                    });
                    nameInput.value = "";
                    urlInput.value = "";
                  }
                }}
                data-testid="button-add-brand"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </div>

            <Input
              type="text"
              placeholder="Search brands..."
              value={brandSearchQuery}
              onChange={(e) => setBrandSearchQuery(e.target.value)}
              className="w-full"
              data-testid="input-search-brands"
            />

            <ScrollArea className="h-96 border rounded-md p-4">
              {isLoadingBrands ? (
                <div className="text-sm text-muted-foreground">Loading brands...</div>
              ) : filteredBrands.length === 0 && brandSearchQuery ? (
                <div className="text-sm text-muted-foreground">
                  No brands match "{brandSearchQuery}"
                </div>
              ) : filteredBrands.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No brands yet. Add your first brand above.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredBrands.map((brand) => (
                    <div
                      key={brand.id}
                      className="flex items-center justify-between p-3 rounded-md border"
                      data-testid={`brand-item-${brand.id}`}
                    >
                      <div>
                        <div className="font-medium">{brand.name}</div>
                        {brand.defaultUrl && (
                          <div className="text-xs text-muted-foreground">{brand.defaultUrl}</div>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Delete ${brand.name}?`)) {
                            deleteBrandMutation.mutate(brand.id);
                          }
                        }}
                        data-testid={`button-delete-brand-${brand.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
