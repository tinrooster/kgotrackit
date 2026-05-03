"use client";

import * as React from 'react';
import { useState } from 'react';
import { InventoryItem } from "@/types/inventory";
import { getSettings } from "@/lib/storageService";
import { resolveLocationDisplay } from "@/lib/resolveLocationLabel";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Pencil,
  Trash2,
  ExternalLink,
  Barcode,
  Calendar,
  MapPin,
  Tag,
  Package,
  Info,
  FileText,
  DollarSign,
  Building2,
} from "lucide-react";
import { InventoryAdjustment } from "@/components/InventoryAdjustment";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface ItemDetailsProps {
  item: InventoryItem;
  onEdit: (item: InventoryItem) => void;
  onDelete: (itemId: string) => void;
  onAdjust: (itemId: string, newQuantity: number, reason: string) => void;
}

// Helper to format currency
const formatCurrency = (value: number | undefined) => {
  if (value === undefined || value === null) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

export function ItemDetails({ item, onEdit, onDelete, onAdjust }: ItemDetailsProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const handleDelete = () => {
    setIsDeleteDialogOpen(false);
    onDelete(item.id);
  };

  const openSupplierWebsite = () => {
    if (item.supplierWebsite) {
      window.open(item.supplierWebsite, '_blank');
    }
  };

  const totalValue = item.costPerUnit !== undefined ? item.quantity * item.costPerUnit : undefined;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex justify-between items-start">
            <span>{item.name}</span>
            <div className="flex space-x-2">
              <Button variant="outline" size="icon" onClick={() => onEdit(item)} title="Edit Item">
                <Pencil className="h-4 w-4" />
              </Button>
              <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive" title="Delete Item">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete Item</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to delete "{item.name}"? This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={handleDelete}>Delete</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardTitle>
          <CardDescription>{item.description || "No description provided"}</CardDescription>
          {item.photoUrl ? (
            <div className="pt-2">
              <img
                src={item.photoUrl}
                alt=""
                className="max-h-48 max-w-full rounded-md border object-contain"
              />
            </div>
          ) : null}
          {item.recordId ? (
            <p className="text-xs text-muted-foreground/90 pt-1">
              <span className="font-medium text-muted-foreground">Record ID:</span> {item.recordId}
            </p>
          ) : null}
          {item.assetId ? (
            <p className="text-xs text-muted-foreground/90">
              <span className="font-medium text-muted-foreground">Asset tag:</span>{" "}
              {item.assetId}
              {item.assetTagEnd ? ` – ${item.assetTagEnd}` : ""}
            </p>
          ) : null}
          {item.companyAssetTag ? (
            <p className="text-xs text-muted-foreground/90">
              <span className="font-medium text-muted-foreground">Company asset tag:</span>{" "}
              {item.companyAssetTag}
            </p>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Column 1 */}
            <div className="space-y-4">
              <div className="flex items-center">
                <Tag className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium mr-2">Category:</span>
                <span>{item.category || "Uncategorized"}</span>
              </div>
              <div className="flex items-center">
                <Package className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium mr-2">Quantity:</span>
                <span className="font-bold">{item.quantity} {item.unit}</span>
              </div>
              <div className="flex items-center">
                <DollarSign className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium mr-2">Cost/Unit:</span>
                <span>{formatCurrency(item.costPerUnit)}</span>
              </div>
              <div className="flex items-center">
                <DollarSign className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium mr-2">Total Value:</span>
                <span className="font-bold">{formatCurrency(totalValue)}</span>
              </div>
              <div className="flex items-center">
                <Info className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium mr-2">Reorder Level:</span>
                <span>{item.reorderLevel !== undefined ? `${item.reorderLevel} ${item.unit}` : "Not set"}</span>
              </div>
            </div>

            {/* Column 2 */}
            <div className="space-y-4">
              <div className="flex items-center">
                <MapPin className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium mr-2">Location:</span>
                <span>
                  {item.location
                    ? resolveLocationDisplay(item.location, getSettings().locations || [])
                    : "Not specified"}
                </span>
              </div>
              {item.rackLocation ? (
                <div className="flex items-center">
                  <Package className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium mr-2">Rack:</span>
                  <span className="font-mono text-sm">{item.rackLocation}</span>
                </div>
              ) : null}
              {(item.decomEOLDate ||
                item.decomCutoverDate ||
                item.decomLastAuditAt ||
                item.decomNotes ||
                item.assetStatus === "ready_decommission" ||
                item.assetStatus === "slated_removal" ||
                item.assetStatus === "cut_over_pending" ||
                item.assetStatus === "ewaste") ? (
                <div className="rounded-md border border-border/60 bg-muted/15 p-3 text-sm">
                  <p className="mb-2 font-medium text-foreground">EOL (decommissioning)</p>
                  {item.decomEOLDate ? (
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">EOL target:</span> {item.decomEOLDate}
                    </p>
                  ) : null}
                  {item.decomCutoverDate ? (
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">Cut-over:</span> {item.decomCutoverDate}
                    </p>
                  ) : null}
                  {item.decomLastAuditAt ? (
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">Last audit:</span> {item.decomLastAuditAt}
                    </p>
                  ) : null}
                  {item.decomNotes ? (
                    <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{item.decomNotes}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="flex items-center">
                <Barcode className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium mr-2">Barcode:</span>
                <span>{item.barcode || "None"}</span>
              </div>
              <div className="rounded-md border border-border/60 bg-muted/15 p-3 text-sm">
                <p className="mb-2 flex items-center gap-2 font-medium text-foreground">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Supplier
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Name:</span>{" "}
                  {item.supplier || "Not specified"}
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Website:</span>{" "}
                  {item.supplierWebsite ? (
                    <Button
                      variant="link"
                      className="h-auto p-0 align-baseline text-primary"
                      onClick={openSupplierWebsite}
                      title={item.supplierWebsite}
                    >
                      <span className="inline-flex items-center gap-1">
                        Open link
                        <ExternalLink className="h-3.5 w-3.5" />
                      </span>
                    </Button>
                  ) : (
                    "Not provided"
                  )}
                </p>
                {item.supplierWebsite ? (
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{item.supplierWebsite}</p>
                ) : null}
              </div>
              <div className="flex items-center">
                <FileText className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium mr-2">Project:</span>
                <span>{item.project || "None"}</span>
              </div>
              <div className="flex items-center">
                <Calendar className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium mr-2">Last Updated:</span>
                <span>{item.lastUpdated ? format(item.lastUpdated, 'PPp') : "Unknown"}</span>
              </div>
            </div>
          </div>

          {item.notes && (
            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium mb-2">Notes:</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <InventoryAdjustment item={item} onAdjust={onAdjust} />
      </div>
    </div>
  );
}