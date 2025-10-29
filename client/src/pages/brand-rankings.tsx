import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Plus, Edit2, Trash2, Save, X, GripVertical, ArrowDown, ArrowUp, List } from "lucide-react";
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
import { SidebarProvider, Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageNav } from "@/components/page-nav";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Geo, Brand, BrandList, GeoBrandRanking } from "@shared/schema";

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

// Sortable Featured Brand Row Component
function SortableFeaturedBrand({
  ranking,
  onMoveToOther,
  onDelete,
}: {
  ranking: RankingWithBrand;
  onMoveToOther: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ranking.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style} data-testid={`ranking-row-${ranking.position}`}>
      <TableCell className="font-semibold" data-testid={`cell-position-${ranking.position}`}>
        <div className="flex items-center gap-2">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing"
            data-testid={`brand-drag-handle-${ranking.position}`}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          #{ranking.position}
        </div>
      </TableCell>
      <TableCell data-testid={`cell-brand-${ranking.position}`}>{ranking.brand?.name || "Unknown Brand"}</TableCell>
      <TableCell className="text-sm text-muted-foreground truncate max-w-xs" data-testid={`cell-affiliate-link-${ranking.position}`}>
        {ranking.affiliateLink ? (
          <a href={ranking.affiliateLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            {ranking.affiliateLink}
          </a>
        ) : "-"}
      </TableCell>
      <TableCell data-testid={`cell-actions-${ranking.position}`}>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={onMoveToOther}
            data-testid={`button-move-to-other-${ranking.position}`}
            title="Move to Other Brands"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onDelete}
            data-testid={`button-delete-ranking-${ranking.position}`}
            title="Remove from List"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// Sortable Other Brand Card Component
function SortableOtherBrand({
  ranking,
  onPromote,
  onRemove,
}: {
  ranking: RankingWithBrand;
  onPromote: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ranking.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-3 border rounded-lg"
      data-testid={`other-brand-${ranking.brandId}`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing"
          data-testid={`other-brand-drag-handle-${ranking.brandId}`}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
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
      </div>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPromote}
          data-testid={`button-promote-brand-${ranking.brandId}`}
          title="Promote to Featured Brands"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          data-testid={`button-remove-brand-${ranking.brandId}`}
          title="Remove from List"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function BrandRankings() {
  const { toast } = useToast();
  const [location] = useLocation();
  const [selectedGeoId, setSelectedGeoId] = useState<string | null>(null);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [isGeoDialogOpen, setIsGeoDialogOpen] = useState(false);
  const [isBrandDialogOpen, setIsBrandDialogOpen] = useState(false);
  const [isListDialogOpen, setIsListDialogOpen] = useState(false);
  const [editingGeo, setEditingGeo] = useState<Geo | null>(null);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [editingRankings, setEditingRankings] = useState<Map<number, RankingWithBrand>>(new Map());
  const [isEditMode, setIsEditMode] = useState(false);
  const [geoSearchQuery, setGeoSearchQuery] = useState("");
  const [brandSearchQuery, setBrandSearchQuery] = useState("");
  const [editBrandSearchQuery, setEditBrandSearchQuery] = useState("");
  const [isBulkAddDialogOpen, setIsBulkAddDialogOpen] = useState(false);
  const [bulkBrandText, setBulkBrandText] = useState("");
  const [bulkAddTarget, setBulkAddTarget] = useState<"featured" | "other">("other");

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

  // Fetch brand lists for selected GEO
  const { data: brandLists = [], isLoading: isLoadingLists } = useQuery<BrandList[]>({
    queryKey: ["/api/geos", selectedGeoId, "brand-lists"],
    enabled: !!selectedGeoId,
  });

  // Fetch rankings for selected brand list
  const { data: rankings = [], isLoading: isLoadingRankings } = useQuery<GeoBrandRanking[]>({
    queryKey: ["/api/brand-lists", selectedListId, "rankings"],
    enabled: !!selectedListId,
  });

  const selectedGeo = geos.find((g) => g.id === selectedGeoId);
  const selectedList = brandLists.find((l) => l.id === selectedListId);

  // Auto-select GEO from URL parameter (only when no GEO is currently selected)
  useEffect(() => {
    const searchParams = new URLSearchParams(location.split('?')[1] || '');
    const geoParam = searchParams.get('geo');
    
    // Only auto-select if no GEO is currently selected
    if (geoParam && geos.length > 0 && !selectedGeoId) {
      // Check if the GEO exists
      const geoExists = geos.some(g => g.id === geoParam);
      if (geoExists) {
        setSelectedGeoId(geoParam);
      }
    }
  }, [location, geos, selectedGeoId]);

  // Auto-select first brand list when GEO changes
  useEffect(() => {
    if (selectedGeoId && brandLists.length > 0) {
      // Always select the first brand list for the selected GEO
      // This ensures that switching GEOs loads the default list
      setSelectedListId(brandLists[0].id);
    } else if (selectedGeoId && brandLists.length === 0 && !isLoadingLists) {
      // No brand lists for this GEO - clear selected list
      setSelectedListId(null);
    } else if (!selectedGeoId) {
      // GEO was deselected - clear list selection
      setSelectedListId(null);
    }
  }, [selectedGeoId, brandLists, isLoadingLists]);

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

  // Create GEO mutation with default brand list
  const createGeoMutation = useMutation({
    mutationFn: async (data: { name: string; code: string; sortOrder?: number }) => {
      const res = await apiRequest("POST", "/api/geos", data);
      return await res.json();
    },
    onSuccess: async (newGeo: Geo) => {
      // Create default brand list for the new GEO
      try {
        const listRes = await apiRequest("POST", `/api/geos/${newGeo.id}/brand-lists`, {
          name: "Casino",
          sortOrder: 0,
        });
        const newList = await listRes.json();
        
        queryClient.invalidateQueries({ queryKey: ["/api/geos"] });
        queryClient.invalidateQueries({ queryKey: ["/api/geos", newGeo.id, "brand-lists"] });
        
        setSelectedGeoId(newGeo.id);
        setSelectedListId(newList.id);
        setIsGeoDialogOpen(false);
        
        toast({
          title: "GEO Added",
          description: `${newGeo.name} has been created with a Casino brand list.`,
        });
      } catch (error) {
        console.error("Failed to create default brand list:", error);
        toast({
          title: "Warning",
          description: "GEO created but failed to create default brand list.",
          variant: "destructive",
        });
      }
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
      setSelectedListId(null);
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

  // Create Brand List mutation
  const createBrandListMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      if (!selectedGeoId) throw new Error("No GEO selected");
      const res = await apiRequest("POST", `/api/geos/${selectedGeoId}/brand-lists`, {
        ...data,
        sortOrder: brandLists.length,
      });
      return await res.json();
    },
    onSuccess: (newList: BrandList) => {
      queryClient.invalidateQueries({ queryKey: ["/api/geos", selectedGeoId, "brand-lists"] });
      setSelectedListId(newList.id);
      setIsListDialogOpen(false);
      toast({
        title: "Brand List Created",
        description: `${newList.name} has been created.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create brand list",
        variant: "destructive",
      });
    },
  });

  // Delete Brand List mutation
  const deleteBrandListMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/brand-lists/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/geos", selectedGeoId, "brand-lists"] });
      // If we deleted the selected list, clear selection
      if (selectedListId === deleteBrandListMutation.variables) {
        setSelectedListId(null);
      }
      toast({
        title: "Brand List Deleted",
        description: "Brand list has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete brand list",
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

  // Delete Ranking mutation
  const deleteRankingMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/rankings/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brand-lists", selectedListId, "rankings"] });
      toast({
        title: "Brand Removed",
        description: "Brand has been removed from rankings.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove brand from rankings",
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
      if (!selectedGeoId || !selectedListId) throw new Error("No GEO or list selected");
      const res = await apiRequest("POST", `/api/geos/${selectedGeoId}/rankings`, {
        brandId,
        listId: selectedListId,
        position: null,
        timestamp: Date.now(),
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brand-lists", selectedListId, "rankings"] });
      toast({
        title: "Brand Added",
        description: "Brand has been added to this list.",
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
      queryClient.invalidateQueries({ queryKey: ["/api/brand-lists", selectedListId, "rankings"] });
      toast({
        title: "Brand Removed",
        description: "Brand has been removed from this list.",
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

  // Move brand to other brands (set position to null)
  const moveToOtherBrandsMutation = useMutation({
    mutationFn: async (rankingId: string) => {
      const res = await apiRequest("PUT", `/api/rankings/${rankingId}`, {
        position: null,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brand-lists", selectedListId, "rankings"] });
      toast({
        title: "Brand Moved",
        description: "Brand moved to Other Brands section.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to move brand",
        variant: "destructive",
      });
    },
  });

  // Promote brand to featured (assign next available position)
  const promoteToFeaturedMutation = useMutation({
    mutationFn: async (rankingId: string) => {
      // Find next available position in top 10
      const occupiedPositions = new Set(featuredRankings.map((r) => r.position).filter((p) => p !== null));
      let nextPosition = 1;
      while (occupiedPositions.has(nextPosition) && nextPosition <= 10) {
        nextPosition++;
      }
      
      if (nextPosition > 10) {
        throw new Error("All top 10 positions are occupied. Remove a brand first.");
      }

      const res = await apiRequest("PUT", `/api/rankings/${rankingId}`, {
        position: nextPosition,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brand-lists", selectedListId, "rankings"] });
      toast({
        title: "Brand Promoted",
        description: "Brand moved to Featured Brands.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to promote brand",
        variant: "destructive",
      });
    },
  });

  // Bulk upsert rankings mutation
  const bulkUpsertRankingsMutation = useMutation({
    mutationFn: async ({ listId, geoId, rankings }: { listId: string; geoId: string; rankings: any[] }) => {
      const res = await apiRequest("POST", `/api/brand-lists/${listId}/rankings/bulk`, { 
        rankings,
        geoId,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brand-lists", selectedListId, "rankings"] });
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
          listId: selectedListId!,
          brandId: "",
          position: i,
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
    if (!selectedGeoId || !selectedListId) return;

    const rankingsToSave = Array.from(editingRankings.values())
      .filter((r) => r.brandId) // Only save rankings with a brand selected
      .map((r) => ({
        brandId: r.brandId,
        position: r.position,
        affiliateLink: r.affiliateLink || null,
        timestamp: Date.now(),
      }));
    
    bulkUpsertRankingsMutation.mutate({
      listId: selectedListId,
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
          <PageNav 
            showSidebarToggle 
            title={selectedGeo ? `${selectedGeo.name} (${selectedGeo.code})` : undefined}
          />

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
                {/* Brand List Selector */}
                {brandLists.length === 0 && !isLoadingLists ? (
                  <Card className="mb-6">
                    <div className="p-6 text-center">
                      <h3 className="text-lg font-semibold mb-2">No Brand Lists</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Create your first brand list for {selectedGeo?.name} to start managing rankings.
                      </p>
                      <Button onClick={() => setIsListDialogOpen(true)} data-testid="button-create-first-list">
                        <List className="h-4 w-4 mr-2" />
                        Create Brand List
                      </Button>
                    </div>
                  </Card>
                ) : (
                  <div className="mb-6 flex items-center gap-4">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground mb-2 block">Brand List</Label>
                      <Select value={selectedListId || ""} onValueChange={setSelectedListId}>
                        <SelectTrigger className="w-full max-w-xs" data-testid="select-brand-list">
                          <SelectValue placeholder="Select brand list..." />
                        </SelectTrigger>
                        <SelectContent>
                          {brandLists.map((list) => (
                            <SelectItem key={list.id} value={list.id} data-testid={`select-list-${list.id}`}>
                              {list.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2 mt-6">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsListDialogOpen(true)}
                        data-testid="button-add-list"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        New List
                      </Button>
                      {selectedListId && brandLists.length > 1 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Delete ${selectedList?.name}? All rankings in this list will be removed.`)) {
                              deleteBrandListMutation.mutate(selectedListId);
                            }
                          }}
                          data-testid="button-delete-list"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {selectedListId && (
                  <>
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
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                onClick={() => setIsBrandDialogOpen(true)}
                                data-testid="button-manage-brands"
                              >
                                Manage Brands
                              </Button>
                              <Button 
                                variant="outline" 
                                onClick={() => {
                                  setBulkAddTarget("featured");
                                  setIsBulkAddDialogOpen(true);
                                }} 
                                data-testid="button-bulk-add-brands"
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Bulk Add
                              </Button>
                              <Button onClick={handleStartEdit} data-testid="button-edit-rankings">
                                <Edit2 className="h-4 w-4 mr-2" />
                                Edit Rankings
                              </Button>
                            </div>
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
                                <TableHead>Affiliate Link</TableHead>
                                {!isEditMode && <TableHead className="w-20">Actions</TableHead>}
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
                                      <TableCell className="text-sm text-muted-foreground truncate max-w-xs" data-testid={`cell-affiliate-link-${ranking.position}`}>
                                        {ranking.affiliateLink ? (
                                          <a href={ranking.affiliateLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                            {ranking.affiliateLink}
                                          </a>
                                        ) : "-"}
                                      </TableCell>
                                      <TableCell data-testid={`cell-actions-${ranking.position}`}>
                                        <div className="flex gap-1">
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => moveToOtherBrandsMutation.mutate(ranking.id)}
                                            data-testid={`button-move-to-other-${ranking.position}`}
                                            title="Move to Other Brands"
                                          >
                                            <ArrowDown className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => {
                                              if (confirm(`Remove ${ranking.brand?.name || 'this brand'} from this list completely?`)) {
                                                deleteRankingMutation.mutate(ranking.id);
                                              }
                                            }}
                                            data-testid={`button-delete-ranking-${ranking.position}`}
                                            title="Remove from List"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
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
                                            <div className="p-2 border-b">
                                              <Input
                                                placeholder="Search brands..."
                                                value={editBrandSearchQuery}
                                                onChange={(e) => setEditBrandSearchQuery(e.target.value)}
                                                className="h-8"
                                                data-testid={`input-brand-search-${position}`}
                                                onClick={(e) => e.stopPropagation()}
                                                onKeyDown={(e) => e.stopPropagation()}
                                              />
                                            </div>
                                            <div className="max-h-[300px] overflow-y-auto">
                                              {brands
                                                .filter((brand) => 
                                                  brand.name.toLowerCase().includes(editBrandSearchQuery.toLowerCase())
                                                )
                                                .map((brand) => (
                                                  <SelectItem key={brand.id} value={brand.id} data-testid={`select-brand-item-${brand.id}-${position}`}>
                                                    {brand.name}
                                                  </SelectItem>
                                                ))}
                                              {brands.filter((brand) => 
                                                brand.name.toLowerCase().includes(editBrandSearchQuery.toLowerCase())
                                              ).length === 0 && (
                                                <div className="p-2 text-sm text-muted-foreground text-center">
                                                  No brands found
                                                </div>
                                              )}
                                            </div>
                                          </SelectContent>
                                        </Select>
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
                              Additional brands for this list (not in top 10)
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => {
                                setBulkAddTarget("other");
                                setIsBulkAddDialogOpen(true);
                              }} 
                              data-testid="button-bulk-add-other-brands"
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Bulk Add
                            </Button>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" data-testid="button-add-other-brand">
                                  <Plus className="h-4 w-4 mr-2" />
                                  Add Brand
                                </Button>
                              </DialogTrigger>
                            <DialogContent data-testid="dialog-add-other-brand">
                              <DialogHeader>
                                <DialogTitle>Add Brand to List</DialogTitle>
                                <DialogDescription>
                                  Select a brand to add to {selectedList?.name}. It will not be featured in the top 10 rankings.
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
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => promoteToFeaturedMutation.mutate(ranking.id)}
                                    data-testid={`button-promote-brand-${ranking.brandId}`}
                                    title="Promote to Featured Brands"
                                  >
                                    <ArrowUp className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      if (confirm(`Remove ${ranking.brand?.name || 'this brand'} from this list completely?`)) {
                                        removeBrandMutation.mutate(ranking.id);
                                      }
                                    }}
                                    data-testid={`button-remove-brand-${ranking.brandId}`}
                                    title="Remove from List"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </Card>
                  </>
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Bulk Add Brands Dialog */}
      <Dialog open={isBulkAddDialogOpen} onOpenChange={setIsBulkAddDialogOpen}>
        <DialogContent data-testid="dialog-bulk-add-brands" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {bulkAddTarget === "featured" 
                ? "Bulk Add Brands to Featured Rankings" 
                : "Bulk Add Brands to Other Brands"}
            </DialogTitle>
            <DialogDescription>
              {bulkAddTarget === "featured" 
                ? `Paste a list of brand names (one per line or comma-separated) to add them to ${selectedList?.name}. Brands will fill empty positions in the top 10 rankings.`
                : `Paste a list of brand names (one per line or comma-separated) to add them to ${selectedList?.name}. Brands will be added to the "Other Brands" section (not featured in top 10).`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="bulk-brands">Brand Names</Label>
              <Textarea
                id="bulk-brands"
                placeholder="1Bet&#10;1Red&#10;20bet&#10;&#10;or&#10;&#10;1Bet, 1Red, 20bet"
                value={bulkBrandText}
                onChange={(e) => setBulkBrandText(e.target.value)}
                rows={12}
                className="font-mono"
                data-testid="textarea-bulk-brands"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Tip: Separate brand names with commas or new lines. Names are case-insensitive.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsBulkAddDialogOpen(false);
                setBulkBrandText("");
              }}
              data-testid="button-cancel-bulk-add"
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!selectedGeoId || !selectedListId || !bulkBrandText.trim()) return;

                // Parse brand names from textarea
                const brandNames = bulkBrandText
                  .split(/[,\n]+/)
                  .map(name => name.trim())
                  .filter(name => name.length > 0);

                if (brandNames.length === 0) {
                  toast({
                    title: "No Brands",
                    description: "Please enter at least one brand name.",
                    variant: "destructive",
                  });
                  return;
                }

                // Find or create brands
                const matchedBrands: Brand[] = [];
                const createdBrands: string[] = [];
                const alreadyAdded: string[] = [];

                for (const name of brandNames) {
                  // Check if brand already exists (case-insensitive)
                  let brand = brands.find(b => 
                    b.name.toLowerCase() === name.toLowerCase()
                  );
                  
                  if (!brand) {
                    // Create the brand if it doesn't exist
                    try {
                      const res = await apiRequest("POST", "/api/brands", {
                        name: name,
                      });
                      const newBrand = await res.json();
                      brand = newBrand as Brand;
                      brands.push(newBrand as Brand); // Add to local cache
                      createdBrands.push(newBrand.name);
                    } catch (error) {
                      console.error(`Failed to create brand ${name}:`, error);
                      continue;
                    }
                  }
                  
                  if (brand) {
                    // Check if already in featured or other brands
                    const inFeatured = featuredRankings.some(r => r.brandId === brand.id);
                    const inOther = otherBrands.some(r => r.brandId === brand.id);
                    
                    if (inFeatured || inOther) {
                      alreadyAdded.push(brand.name);
                    } else {
                      matchedBrands.push(brand);
                    }
                  }
                }

                // Add all matched brands
                let addedCount = 0;
                
                if (bulkAddTarget === "featured") {
                  // For featured: find empty positions and fill them
                  const occupiedPositions = new Set(featuredRankings.map(r => r.position));
                  const emptyPositions = Array.from({ length: 10 }, (_, i) => i + 1)
                    .filter(pos => !occupiedPositions.has(pos));
                  
                  const brandsToAdd = matchedBrands.slice(0, emptyPositions.length);
                  
                  for (let i = 0; i < brandsToAdd.length; i++) {
                    const brand = brandsToAdd[i];
                    const position = emptyPositions[i];
                    try {
                      await apiRequest("POST", `/api/geos/${selectedGeoId}/rankings`, {
                        brandId: brand.id,
                        listId: selectedListId,
                        position: position,
                        timestamp: Date.now(),
                      });
                      addedCount++;
                    } catch (error) {
                      console.error(`Failed to add ${brand.name}:`, error);
                    }
                  }
                  
                  if (matchedBrands.length > emptyPositions.length) {
                    toast({
                      title: "Some Brands Skipped",
                      description: `Only ${emptyPositions.length} positions available. ${matchedBrands.length - emptyPositions.length} brands were not added.`,
                      variant: "destructive",
                    });
                  }
                } else {
                  // For other brands: add without position
                  for (const brand of matchedBrands) {
                    try {
                      await apiRequest("POST", `/api/geos/${selectedGeoId}/rankings`, {
                        brandId: brand.id,
                        listId: selectedListId,
                        position: null,
                        timestamp: Date.now(),
                      });
                      addedCount++;
                    } catch (error) {
                      console.error(`Failed to add ${brand.name}:`, error);
                    }
                  }
                }

                // Refresh the rankings
                queryClient.invalidateQueries({ queryKey: ["/api/brand-lists", selectedListId, "rankings"] });

                // Refresh brands list if new brands were created
                if (createdBrands.length > 0) {
                  queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
                }

                // Show results
                const messages: string[] = [];
                if (addedCount > 0) {
                  messages.push(`✓ Added ${addedCount} brand${addedCount > 1 ? 's' : ''} to ${bulkAddTarget === "featured" ? "featured rankings" : "other brands"}`);
                }
                if (createdBrands.length > 0) {
                  messages.push(`✓ Created ${createdBrands.length} new brand${createdBrands.length > 1 ? 's' : ''}: ${createdBrands.slice(0, 3).join(", ")}${createdBrands.length > 3 ? "..." : ""}`);
                }
                if (alreadyAdded.length > 0) {
                  messages.push(`⚠ ${alreadyAdded.length} already added: ${alreadyAdded.slice(0, 3).join(", ")}${alreadyAdded.length > 3 ? "..." : ""}`);
                }

                toast({
                  title: addedCount > 0 ? "Bulk Add Complete" : "No Brands Added",
                  description: messages.join("\n"),
                  variant: addedCount > 0 ? "default" : "destructive",
                });

                setIsBulkAddDialogOpen(false);
                setBulkBrandText("");
              }}
              data-testid="button-submit-bulk-add"
            >
              Add Brands
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GEO Dialog */}
      <Dialog open={isGeoDialogOpen} onOpenChange={setIsGeoDialogOpen}>
        <DialogContent data-testid="dialog-geo">
          <DialogHeader>
            <DialogTitle>{editingGeo ? "Edit GEO" : "Add GEO"}</DialogTitle>
            <DialogDescription>
              {editingGeo
                ? "Update the geographic region details."
                : "Add a new geographic region for brand rankings. A Casino brand list will be created automatically."}
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

      {/* Brand List Dialog */}
      <Dialog open={isListDialogOpen} onOpenChange={setIsListDialogOpen}>
        <DialogContent data-testid="dialog-brand-list">
          <DialogHeader>
            <DialogTitle>Create Brand List</DialogTitle>
            <DialogDescription>
              Add a new brand list for {selectedGeo?.name}.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const data = {
                name: formData.get("name") as string,
              };
              createBrandListMutation.mutate(data);
            }}
          >
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="list-name">List Name</Label>
                <Input
                  id="list-name"
                  name="name"
                  placeholder="e.g., November 2024, Holiday Picks"
                  required
                  data-testid="input-list-name"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsListDialogOpen(false)}
                data-testid="button-cancel-list"
              >
                Cancel
              </Button>
              <Button type="submit" data-testid="button-submit-list">
                Create List
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
