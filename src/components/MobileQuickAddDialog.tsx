"use client";

import * as React from "react";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DraggableDialogContent } from "@/components/ui/draggable-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InventoryItem, OrderStatus, ItemWithSubcategories, CategoryNode } from "@/types/inventory";
import { SettingsService } from "@/lib/settingsService";
import { getTodayDateInputValue, resolveDefaultUnitName } from "@/lib/inventoryFormDefaults";
import { cn } from "@/lib/utils";
import { collapsibleSectionSurfaceClass } from "@/lib/ui/collapsibleSectionSurface";
import {
  Briefcase,
  Camera,
  ChevronDown,
  History,
  ImagePlus,
  Layers,
  LayoutList,
  MapPin,
  Mic,
  Minus,
  Plus,
  ScanLine,
  Sparkles,
  Tag,
  Trash2,
  Warehouse,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { SimpleBarcodeScanner } from "@/components/SimpleBarcodeScanner";
import { QuickCapturePhotoDialog } from "@/components/QuickCapturePhotoDialog";
import {
  getRackOptionsForFlatLocationLabel,
  getRackOptionsForSubLocationKey,
  RACK_LOCATIONS_UPDATED_EVENT,
} from "@/lib/rackLocationsConfig";
import { findLocationByFlatId } from "@/lib/locationOptions";
import { estimateDataUrlBytes, normalizeImageFileToDataUrl } from "@/lib/imageNormalization";

const PREFS_KEY = "trackit:quickAddPrefs";
const LAST_KEY = "trackit:quickAddLast";
const USAGE_KEY = "trackit:quickAddUsage";
const TARGET_PHOTO_BYTES = 1_800_000;
const FAVORITES_TOP = 5;

// ─── persistence helpers ──────────────────────────────────────────────────────

interface QuickPrefs {
  location?: string;
  category?: string;
  unit?: string;
  unitSubcategory?: string;
  project?: string;
  rackLocation?: string;
}
interface LastSnapshot {
  location: string;
  category: string;
  unit: string;
  project: string;
  unitSubcategory?: string;
  rackLocation?: string;
  name?: string;
}
interface UsageCounts {
  cat: Record<string, number>;
  loc: Record<string, number>;
}

function loadPrefs(): QuickPrefs {
  try { return JSON.parse(sessionStorage.getItem(PREFS_KEY) ?? "{}") as QuickPrefs; }
  catch { return {}; }
}
function savePrefs(p: QuickPrefs) {
  try { sessionStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
function loadLast(): LastSnapshot | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as LastSnapshot;
    return (o.location && o.category && o.unit) ? o : null;
  } catch { return null; }
}
function saveLast(s: LastSnapshot) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
function loadUsage(): UsageCounts {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return { cat: {}, loc: {} };
    const o = JSON.parse(raw) as UsageCounts;
    return { cat: o.cat ?? {}, loc: o.loc ?? {} };
  } catch { return { cat: {}, loc: {} }; }
}
function bumpUsage(category: string, locationId: string) {
  const u = loadUsage();
  u.cat[category] = (u.cat[category] || 0) + 1;
  u.loc[locationId] = (u.loc[locationId] || 0) + 1;
  try { localStorage.setItem(USAGE_KEY, JSON.stringify(u)); } catch { /* ignore */ }
}
function topKeys(counts: Record<string, number>, limit: number): string[] {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, limit);
}

// ─── utility ─────────────────────────────────────────────────────────────────

function flattenCategoryPaths(nodes: CategoryNode[], parentPath = ""): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    const path = parentPath ? `${parentPath}/${n.name}` : n.name;
    out.push(path);
    if (n.children?.length) out.push(...flattenCategoryPaths(n.children, path));
  }
  return out.sort();
}

function findParentForLocationValue(value: string, locations: ItemWithSubcategories[]): ItemWithSubcategories | null {
  if (!value) return null;
  const parentId = value.includes("/") ? value.split("/")[0]! : value;
  return locations.find((l) => l.id === parentId) ?? null;
}

function resolveLocationLabel(id: string, locations: ItemWithSubcategories[]): string {
  if (!id) return "";
  for (const loc of locations) {
    if (loc.id === id) return loc.name;
    for (const sub of loc.children || []) {
      if (`${loc.id}/${sub.id}` === id) return `${loc.name} / ${sub.name}`;
    }
  }
  return id;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ASSET_STATUSES: { value: string; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "hot_spare", label: "Hot Spare" },
  { value: "cold_spare", label: "Cold Spare" },
  { value: "in_service", label: "In Service" },
  { value: "ready_decommission", label: "Decommission" },
  { value: "slated_removal", label: "Slated Removal" },
  { value: "cut_over_pending", label: "Cut-over" },
  { value: "ewaste", label: "E-Waste" },
  { value: "other", label: "Other" },
];

// ─── props ────────────────────────────────────────────────────────────────────

export interface MobileQuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryNode[];
  locations: ItemWithSubcategories[];
  units: ItemWithSubcategories[];
  suppliers: ItemWithSubcategories[];
  projects: ItemWithSubcategories[];
  onSubmit: (
    payload: Omit<InventoryItem, "id" | "lastUpdated">,
    mode: "once" | "next"
  ) => Promise<void>;
}

// ─── component ───────────────────────────────────────────────────────────────

export function MobileQuickAddDialog({
  open,
  onOpenChange,
  categories,
  locations,
  units,
  suppliers,
  projects,
  onSubmit,
}: MobileQuickAddDialogProps) {
  const nameRef = React.useRef<HTMLInputElement>(null);
  const galleryInputRef = React.useRef<HTMLInputElement>(null);
  const customRackRef = React.useRef<HTMLInputElement>(null);

  const [name, setName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [photoUrl, setPhotoUrl] = React.useState("");
  const [quantity, setQuantity] = React.useState(1);
  const [category, setCategory] = React.useState("");
  const [locationId, setLocationId] = React.useState("");
  const [unit, setUnit] = React.useState("");
  const [unitSubcategory, setUnitSubcategory] = React.useState("");
  const [unitSubPickerParent, setUnitSubPickerParent] = React.useState<ItemWithSubcategories | null>(null);
  const [project, setProject] = React.useState("");
  const [barcode, setBarcode] = React.useState("");
  const [assetStatus, setAssetStatus] = React.useState<string>("active");
  const [assetTrackingMode, setAssetTrackingMode] = React.useState<"line_item" | "per_unit">("line_item");
  const [rackLocation, setRackLocation] = React.useState("");
  const [rackCfgEpoch, setRackCfgEpoch] = React.useState(0);
  const [subPickerParent, setSubPickerParent] = React.useState<ItemWithSubcategories | null>(null);
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const [captureOpen, setCaptureOpen] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const recognitionRef = React.useRef<SpeechRecognition | null>(null);
  const [usageTick, setUsageTick] = React.useState(0);
  const [openSection, setOpenSection] = React.useState<
    "details" | "location" | "category" | "unit" | "project" | null
  >(null);

  // refs for scroll-into-view
  const sectionNameRef = React.useRef<HTMLDivElement>(null);
  const sectionAllLocRef = React.useRef<HTMLDivElement>(null);
  const sectionAllCatRef = React.useRef<HTMLDivElement>(null);
  const sectionUnitRef = React.useRef<HTMLDivElement>(null);
  const sectionProjectRef = React.useRef<HTMLDivElement>(null);
  const sectionRackInLocRef = React.useRef<HTMLDivElement>(null);
  const sectionMetaRef = React.useRef<HTMLDivElement>(null);

  type JumpHighlight = "name" | "details" | "location" | "category" | "unit" | "project";
  const [jumpHighlight, setJumpHighlight] = React.useState<JumpHighlight | null>(null);
  const jumpTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasHydratedForOpenRef = React.useRef(false);

  const flashJump = React.useCallback((id: JumpHighlight) => {
    if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
    setJumpHighlight(id);
    jumpTimerRef.current = setTimeout(() => { setJumpHighlight(null); jumpTimerRef.current = null; }, 1800);
  }, []);

  React.useEffect(() => () => { if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current); }, []);

  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
    requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  // ── derived data ────────────────────────────────────────────────────────────

  const categoryPaths = React.useMemo(() => flattenCategoryPaths(categories), [categories]);
  const defaultUnitName = React.useMemo(() => resolveDefaultUnitName(units), [units]);
  const usage = React.useMemo(() => loadUsage(), [usageTick, open]);

  const favoriteCategories = React.useMemo(() => {
    const top = topKeys(usage.cat, FAVORITES_TOP);
    return top.filter((p) => categoryPaths.includes(p));
  }, [usage.cat, categoryPaths]);

  const favoriteLocationIds = React.useMemo(() => {
    const top = topKeys(usage.loc, FAVORITES_TOP);
    const valid = new Set<string>();
    for (const loc of locations) {
      valid.add(loc.id);
      for (const sub of loc.children || []) valid.add(`${loc.id}/${sub.id}`);
    }
    return top.filter((id) => valid.has(id));
  }, [usage.loc, locations]);

  const locationStripLabel = React.useMemo(
    () => resolveLocationLabel(locationId, locations),
    [locationId, locations]
  );

  React.useEffect(() => {
    const onRackCfg = () => setRackCfgEpoch((n) => n + 1);
    window.addEventListener(RACK_LOCATIONS_UPDATED_EVENT, onRackCfg);
    return () => window.removeEventListener(RACK_LOCATIONS_UPDATED_EVENT, onRackCfg);
  }, []);

  const flatLocationLabelForRack = React.useMemo(() => {
    const resolved = resolveLocationLabel(locationId, locations);
    return resolved ? resolved.replace(/\s*\/\s*/g, "/") : "";
  }, [locationId, locations]);

  const selectedLocationRow = React.useMemo(
    () => findLocationByFlatId(locations, locationId),
    [locations, locationId]
  );

  const presetRackOptionsFromConfig = React.useMemo(() => {
    let opts = getRackOptionsForFlatLocationLabel(flatLocationLabelForRack);
    if (opts.length > 0) return opts;
    if (locationId.includes("/")) {
      const subId = locationId.split("/").pop() ?? "";
      opts = getRackOptionsForSubLocationKey(subId);
    }
    return opts;
  }, [flatLocationLabelForRack, locationId, rackCfgEpoch]);

  const useCustomRacks = selectedLocationRow?.rackLocationEnabled === true;
  const customRackSlots = React.useMemo(() => {
    if (!useCustomRacks || !Array.isArray(selectedLocationRow?.rackSlots)) return null as string[] | null;
    return selectedLocationRow!.rackSlots!.map((s) => String(s).trim()).filter(Boolean);
  }, [useCustomRacks, selectedLocationRow]);

  const quickRackOptions = React.useMemo(() => {
    if (useCustomRacks) return customRackSlots ?? [];
    return presetRackOptionsFromConfig;
  }, [useCustomRacks, customRackSlots, presetRackOptionsFromConfig]);

  const showRackLocationRow = useCustomRacks || presetRackOptionsFromConfig.length > 0;

  const projectStripLabel = React.useMemo(() => {
    if (!project) return "";
    return projects.find((x) => x.id === project || x.name === project)?.name ?? project;
  }, [project, projects]);

  const unitStripLabel = React.useMemo(() => {
    if (!unit) return "";
    const parent = units.find((u) => u.name === unit);
    if (parent?.children?.length && unitSubcategory) return `${parent.name} / ${unitSubcategory}`;
    return unit;
  }, [unit, unitSubcategory, units]);

  // ── actions ─────────────────────────────────────────────────────────────────

  const applyLocationId = React.useCallback((loc: string) => {
    setLocationId(loc);
    setRackLocation("");
    const parent = findParentForLocationValue(loc, locations);
    setSubPickerParent(parent?.children?.length ? parent : null);
  }, [locations]);

  const selectParentLocation = (loc: ItemWithSubcategories) => {
    if (loc.children?.length) {
      setSubPickerParent(loc);
      const firstSub = loc.children[0];
      if (firstSub) setLocationId(`${loc.id}/${firstSub.id}`);
    } else {
      setSubPickerParent(null);
      setLocationId(loc.id);
    }
    setRackLocation("");
  };

  const selectSubLocation = (parent: ItemWithSubcategories, subId: string) => {
    setLocationId(`${parent.id}/${subId}`);
    setRackLocation("");
  };

  const selectParentUnit = React.useCallback((u: ItemWithSubcategories) => {
    setUnit(u.name);
    if (u.children?.length) {
      setUnitSubPickerParent(u);
      setUnitSubcategory(u.children[0].name);
    } else {
      setUnitSubPickerParent(null);
      setUnitSubcategory("");
    }
  }, []);

  const hydrate = React.useCallback(() => {
    const prefs = loadPrefs();
    const ds = SettingsService.loadDefaultSettings();
    const paths = flattenCategoryPaths(categories);
    const cat =
      prefs.category ||
      (ds.defaultCategory && paths.includes(ds.defaultCategory) ? ds.defaultCategory : "") ||
      paths[0] || "";
    let loc = prefs.location || ds.defaultLocation || locations[0]?.id || "";
    if (loc && !loc.includes("/")) {
      const top = locations.find((l) => l.id === loc);
      if (top?.children?.length) loc = `${top.id}/${top.children[0].id}`;
    }
    let u = prefs.unit || ds.defaultUnit || defaultUnitName || units[0]?.name || "";
    const unitParent = units.find((x) => x.name === u);
    let uSub = prefs.unitSubcategory || "";
    if (unitParent?.children?.length) {
      if (!uSub || !unitParent.children.some((c) => c.name === uSub)) uSub = unitParent.children[0].name;
    } else {
      uSub = "";
    }
    const proj =
      prefs.project ||
      (ds.defaultProject
        ? projects.find((p) => p.id === ds.defaultProject || p.name === ds.defaultProject)?.id ?? ""
        : "");

    setCategory(cat);
    applyLocationId(loc);
    setUnit(u);
    setUnitSubcategory(uSub);
    setUnitSubPickerParent(unitParent?.children?.length ? unitParent : null);
    setProject(proj || "");
    setName("");
    setNotes("");
    setQuantity(1);
    setPhotoUrl("");
    setBarcode("");
    setAssetStatus("active");
    setAssetTrackingMode("line_item");
    setRackLocation(prefs.rackLocation?.trim() ?? "");

    if (!loc) setOpenSection("location");
    else if (!cat) setOpenSection("category");
    else if (!u) setOpenSection("unit");
    else if (!proj) setOpenSection("project");
    else setOpenSection(null);
  }, [categories, locations, projects, defaultUnitName, units, applyLocationId]);

  React.useEffect(() => {
    if (!open) {
      hasHydratedForOpenRef.current = false;
      return;
    }
    if (hasHydratedForOpenRef.current) {
      return;
    }
    hasHydratedForOpenRef.current = true;
    hydrate();
    requestAnimationFrame(() => nameRef.current?.focus());
  }, [open, hydrate]);

  React.useEffect(() => {
    return () => { recognitionRef.current?.abort?.(); recognitionRef.current = null; };
  }, []);

  const persistSelections = React.useCallback(() => {
    savePrefs({
      location: locationId || undefined,
      category: category || undefined,
      unit: unit || undefined,
      unitSubcategory: unitSubcategory || undefined,
      project: project || undefined,
      rackLocation: rackLocation.trim() || undefined,
    });
  }, [locationId, category, unit, unitSubcategory, project, rackLocation]);

  const buildPayload = React.useCallback((): Omit<InventoryItem, "id" | "lastUpdated"> | null => {
    const trimmed = name.trim();
    if (trimmed.length < 2) { toast.error("Enter a name (at least 2 characters)."); return null; }
    if (!category) { toast.error("Choose a category."); return null; }
    if (!locationId) { toast.error("Choose a location."); return null; }
    if (!unit) { toast.error("Choose a unit."); return null; }

    const unitParentRow = units.find((x) => x.name === unit);
    if (unitParentRow?.children?.length) {
      if (!unitSubcategory.trim()) { toast.error("Choose a unit size."); return null; }
      if (!unitParentRow.children.some((c) => c.name === unitSubcategory)) { toast.error("Invalid unit size."); return null; }
    }

    const ds = SettingsService.loadDefaultSettings();
    const supplierName = suppliers.find((s) => s.name === ds.defaultSupplier)?.name ?? suppliers[0]?.name ?? "";
    const today = getTodayDateInputValue();

    return {
      name: trimmed,
      quantity: Math.max(0, quantity),
      unit,
      unitSubcategory: unitParentRow?.children?.length ? unitSubcategory : undefined,
      category,
      location: locationId,
      project: project || undefined,
      supplier: supplierName,
      supplierWebsite: "",
      description: "",
      notes: notes.trim(),
      minQuantity: ds.defaultMinQuantity ?? 0,
      costPerUnit: 0,
      assetStatus: assetStatus as InventoryItem["assetStatus"],
      expenseTypeCode: "N/A",
      costCenterCode: "N/A",
      expenseTypeDescription: "",
      costCenterDescription: "",
      barcode: barcode.trim() || "",
      serialNumber: "",
      manufacturer: "",
      modelNumber: "",
      dateInService: today,
      maintenanceNotes: "",
      assetTrackingMode,
      rackLocation: rackLocation.trim() || undefined,
      orderStatus: OrderStatus.COMPLETED,
      deliveryPercentage: 100,
      companyAssetTag: undefined,
      photoUrl: photoUrl.trim() || undefined,
    };
  }, [name, notes, quantity, unit, unitSubcategory, category, locationId, project, suppliers, photoUrl, barcode, units, assetStatus, assetTrackingMode, rackLocation]);

  const handleSubmit = async (mode: "once" | "next") => {
    const payload = buildPayload();
    if (!payload) return;
    persistSelections();
    saveLast({ location: locationId, category, unit, unitSubcategory: unitSubcategory || undefined, project, rackLocation: rackLocation.trim() || undefined, name: payload.name });
    bumpUsage(category, locationId);
    setUsageTick((t) => t + 1);
    try {
      await onSubmit(payload, mode);
      if (mode === "next") {
        setName("");
        setNotes("");
        setQuantity(1);
        setPhotoUrl("");
        setBarcode("");
        setRackLocation("");
        requestAnimationFrame(() => nameRef.current?.focus());
      }
    } catch (e) {
      console.error(e);
      toast.error("Could not add item.");
    }
  };

  const applySameAsLast = () => {
    const last = loadLast();
    if (!last) { toast.info("No previous quick-add row yet."); return; }
    if (!categoryPaths.includes(last.category)) { toast.error("Saved category no longer exists."); return; }
    const locOk = locations.some((l) => l.id === last.location) ||
      locations.some((l) => (l.children || []).some((s) => `${l.id}/${s.id}` === last.location));
    if (!locOk) { toast.error("Saved location no longer exists."); return; }
    if (!units.some((u) => u.name === last.unit)) { toast.error("Saved unit no longer exists."); return; }
    setCategory(last.category);
    applyLocationId(last.location);
    setUnit(last.unit);
    const uParent = units.find((x) => x.name === last.unit);
    if (uParent?.children?.length) {
      const sub = last.unitSubcategory && uParent.children.some((c) => c.name === last.unitSubcategory)
        ? last.unitSubcategory : uParent.children[0].name;
      setUnitSubcategory(sub);
      setUnitSubPickerParent(uParent);
    } else {
      setUnitSubcategory("");
      setUnitSubPickerParent(null);
    }
    setProject(last.project && projects.some((p) => p.id === last.project || p.name === last.project) ? last.project : "");
    setRackLocation(last.rackLocation?.trim() ?? "");
    toast.success("Applied last item's settings.");
  };

  const startVoice = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) { toast.error("Voice input is not supported in this browser."); return; }
    if (listening) { recognitionRef.current?.abort?.(); recognitionRef.current = null; setListening(false); return; }
    try {
      const r = new Ctor();
      recognitionRef.current = r;
      r.lang = navigator.language || "en-US";
      r.interimResults = false;
      r.maxAlternatives = 1;
      r.continuous = false;
      r.onresult = (event: SpeechRecognitionEvent) => {
        const text = event.results[0]?.[0]?.transcript?.trim() ?? "";
        if (text) setName((prev) => (prev ? `${prev} ${text}` : text));
        setListening(false);
        recognitionRef.current = null;
      };
      r.onerror = () => { setListening(false); recognitionRef.current = null; toast.error("Voice input failed."); };
      r.onend = () => { setListening(false); recognitionRef.current = null; };
      r.start();
      setListening(true);
    } catch { toast.error("Could not start voice input."); setListening(false); }
  };

  const readPhotoFile = (file: File) => {
    void normalizeImageFileToDataUrl(file, { targetBytes: TARGET_PHOTO_BYTES })
      .then((url) => {
        if (estimateDataUrlBytes(url) > TARGET_PHOTO_BYTES) { toast.error("Photo too large after compression."); return; }
        setPhotoUrl(url);
      })
      .catch(() => toast.error("Could not process photo."));
  };

  // ── chip class ──────────────────────────────────────────────────────────────

  const chipClass = (active: boolean) => cn(
    "touch-manipulation min-h-[2rem] rounded-full border px-2.5 py-1 text-left text-xs font-medium leading-tight transition-colors",
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-background hover:bg-muted"
  );

  // ── section expand state ────────────────────────────────────────────────────

  const detailsOpen = openSection === "details";
  const allLocOpen = openSection === "location";
  const allCatOpen = openSection === "category";
  const allUnitOpen = openSection === "unit";
  const allProjOpen = openSection === "project";

  const sectionHeader = (
    icon: React.ReactNode,
    label: string,
    sublabel: string,
    isOpen: boolean,
    toggle: () => void,
    highlight: boolean,
  ) => (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
      onClick={toggle}
      aria-expanded={isOpen}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className={cn("shrink-0", highlight ? "text-primary" : "text-muted-foreground")} aria-hidden>{icon}</span>
        <span className="text-sm font-semibold">{label}</span>
        {sublabel && <span className="truncate text-xs font-normal text-muted-foreground/80">{sublabel}</span>}
      </span>
      <ChevronDown
        className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")}
        aria-hidden
      />
    </button>
  );

  const lastSnapshot = loadLast();

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <SimpleBarcodeScanner
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        quiet
        onScan={(value) => {
          setBarcode(value);
          toast.success(`Barcode: ${value}`);
        }}
      />

      <QuickCapturePhotoDialog
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        onCapture={(dataUrl) => setPhotoUrl(dataUrl)}
        onFallbackToFiles={() => galleryInputRef.current?.click()}
      />

      {/* Hidden gallery file input */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) readPhotoFile(file);
        }}
      />

      <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
        <DraggableDialogContent
          showOverlay={false}
          className={cn(
            "w-[min(calc(100vw-1rem),680px)] gap-0 p-0",
            "h-[min(92vh,680px)]",
          )}
          minWidth={320}
          minHeight={300}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* ── HEADER ──────────────────────────────────────────────────────── */}
          <DialogHeader className="shrink-0 border-b px-4 py-3 sm:px-5">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Zap className="h-4 w-4 text-amber-500" aria-hidden />
              Quick add
            </DialogTitle>
          </DialogHeader>

          {/* ── SELECTION STRIP — current values, tap to jump ───────────────── */}
          <div className="shrink-0 border-b border-border/50 bg-muted/25 px-3 py-2 sm:px-4">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {[
                { icon: <MapPin className="h-3.5 w-3.5" />, label: locationStripLabel || "Location", key: "location" as const, ref: sectionAllLocRef },
                { icon: <Tag className="h-3.5 w-3.5" />, label: category || "Category", key: "category" as const, ref: sectionAllCatRef },
                { icon: <Layers className="h-3.5 w-3.5" />, label: unitStripLabel || "Unit", key: "unit" as const, ref: sectionUnitRef },
                { icon: <Briefcase className="h-3.5 w-3.5" />, label: projectStripLabel || "Project", key: "project" as const, ref: sectionProjectRef },
              ].map(({ icon, label, key, ref }) => (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    "flex min-h-9 min-w-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs font-medium shadow-sm transition-colors hover:bg-accent",
                    jumpHighlight === key
                      ? "border-primary/60 bg-primary/8 text-primary"
                      : "border-border/60 bg-background/90"
                  )}
                  onClick={() => {
                    setOpenSection(key);
                    flashJump(key);
                    scrollToSection(ref);
                  }}
                >
                  <span className="shrink-0 text-muted-foreground">{icon}</span>
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── NAME + QUICK INPUT STRIP ─────────────────────────────────────── */}
          <div className="shrink-0 border-b border-border/50 px-3 py-2.5 space-y-2 sm:px-4" ref={sectionNameRef}>
            {/* Name row */}
            <div className="flex gap-1.5">
              <Input
                id="quick-name"
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Item name"
                className="h-10 min-w-0 flex-1 text-base touch-manipulation"
                autoComplete="off"
                enterKeyHint="done"
              />
              <Button
                type="button"
                variant={listening ? "default" : "outline"}
                size="icon"
                className="h-10 w-10 shrink-0 touch-manipulation"
                onClick={startVoice}
                title={listening ? "Stop listening" : "Voice input"}
                aria-pressed={listening}
              >
                <Mic className="h-4 w-4" />
              </Button>
              {lastSnapshot && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0 touch-manipulation"
                  onClick={applySameAsLast}
                  title="Re-use last item's settings"
                  aria-label="Re-use last item's settings"
                >
                  <History className="h-4 w-4" />
                </Button>
              )}
            </div>
            {listening && <p className="text-[10px] text-muted-foreground">Listening…</p>}

            {/* Notes field */}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation"
            />

            {/* Quick tools row: Qty + icon buttons */}
            <div className="flex items-center gap-1.5">
              {/* Qty stepper */}
              <div className="flex items-center rounded-md border border-border/70 bg-background">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 touch-manipulation rounded-r-none border-r border-border/50"
                  onClick={() => setQuantity((q) => Math.max(0, q - 1))}
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <input
                  type="number"
                  min={0}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(0, Number(e.target.value) || 0))}
                  onFocus={(e) => e.target.select()}
                  className="h-9 w-10 border-0 bg-transparent text-center text-sm font-medium focus:outline-none touch-manipulation"
                  aria-label="Quantity"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 touch-manipulation rounded-l-none border-l border-border/50"
                  onClick={() => setQuantity((q) => q + 1)}
                  aria-label="Increase quantity"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Barcode badge (when set) or spacer */}
              {barcode ? (
                <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
                  <ScanLine className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate text-xs font-medium">{barcode}</span>
                  <button
                    type="button"
                    className="ml-auto shrink-0 touch-manipulation text-muted-foreground hover:text-foreground"
                    onClick={() => setBarcode("")}
                    aria-label="Clear barcode"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex-1" />
              )}

              {/* Icon action buttons: scan, camera, gallery */}
              <Button
                type="button"
                variant={barcode ? "secondary" : "outline"}
                size="icon"
                className="h-9 w-9 shrink-0 touch-manipulation"
                onClick={() => setScannerOpen(true)}
                title="Scan barcode"
                aria-label="Scan barcode"
              >
                <ScanLine className="h-4 w-4" />
              </Button>

              {photoUrl ? (
                <div className="relative shrink-0">
                  <img
                    src={photoUrl}
                    alt="Item photo"
                    className="h-9 w-9 rounded-md border object-cover cursor-pointer touch-manipulation"
                    onClick={() => setCaptureOpen(true)}
                    title="Retake photo"
                  />
                  <button
                    type="button"
                    className="absolute -right-1 -top-1 rounded-full border border-border bg-background p-0.5 shadow-sm touch-manipulation"
                    onClick={() => setPhotoUrl("")}
                    aria-label="Remove photo"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0 touch-manipulation"
                    onClick={() => setCaptureOpen(true)}
                    title="Take photo"
                    aria-label="Take photo"
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0 touch-manipulation"
                    onClick={() => galleryInputRef.current?.click()}
                    title="Choose from gallery"
                    aria-label="Choose photo from gallery"
                  >
                    <ImagePlus className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>

            {/* Favorites (often-used chips) */}
            {(favoriteLocationIds.length > 0 || favoriteCategories.length > 0) && (
              <div className="flex flex-wrap items-center gap-1 border-t border-dashed border-border/40 pt-1.5">
                <Sparkles className="h-3 w-3 shrink-0 text-amber-500" aria-hidden />
                {favoriteLocationIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={chipClass(locationId === id)}
                    onClick={() => applyLocationId(id)}
                  >
                    {resolveLocationLabel(id, locations)}
                  </button>
                ))}
                {favoriteCategories.map((path) => (
                  <button
                    key={path}
                    type="button"
                    className={chipClass(category === path)}
                    onClick={() => setCategory(path)}
                  >
                    {path}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── SCROLLABLE PICKER SECTIONS ───────────────────────────────────── */}
          <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-0 [-webkit-overflow-scrolling:touch]">
            <div className="divide-y divide-border/40 pb-4">

              {/* LOCATION */}
              <div ref={sectionAllLocRef} className={collapsibleSectionSurfaceClass(jumpHighlight === "location")}>
                {sectionHeader(
                  <MapPin className="h-4 w-4" />,
                  "Location",
                  locationStripLabel || "Not set",
                  allLocOpen,
                  () => setOpenSection((o) => (o === "location" ? null : "location")),
                  jumpHighlight === "location",
                )}
                {allLocOpen && (
                  <div className="px-3 pb-3 pt-1.5">
                    {/* Parent location chips */}
                    <div className="flex flex-wrap gap-1">
                      {locations.length === 0
                        ? <p className="text-[11px] text-muted-foreground">No locations defined.</p>
                        : locations.map((loc) => (
                          <button
                            key={loc.id}
                            type="button"
                            className={chipClass(
                              locationId === loc.id ||
                              locationId.startsWith(`${loc.id}/`) ||
                              subPickerParent?.id === loc.id
                            )}
                            onClick={() => selectParentLocation(loc)}
                          >
                            {loc.name}
                          </button>
                        ))}
                    </div>

                    {/* Sub-location chips */}
                    {subPickerParent && (subPickerParent.children?.length ?? 0) > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1 border-t border-dashed border-border/40 pt-1.5">
                        {subPickerParent.children!.map((sub) => (
                          <button
                            key={sub.id}
                            type="button"
                            className={chipClass(locationId === `${subPickerParent.id}/${sub.id}`)}
                            onClick={() => selectSubLocation(subPickerParent, sub.id)}
                          >
                            {sub.name}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Rack location */}
                    {showRackLocationRow && (
                      <div ref={sectionRackInLocRef} className="mt-2 border-t border-dashed border-border/40 pt-2">
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <Warehouse className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="text-xs font-semibold">Rack</span>
                          {rackLocation && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              {rackLocation}
                            </span>
                          )}
                        </div>
                        {quickRackOptions.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {quickRackOptions.map((slot) => (
                              <button
                                key={slot}
                                type="button"
                                className={chipClass(rackLocation === slot)}
                                onClick={() => setRackLocation(rackLocation === slot ? "" : slot)}
                              >
                                {slot}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <Input
                            ref={customRackRef}
                            value={rackLocation}
                            onChange={(e) => setRackLocation(e.target.value)}
                            placeholder="Rack / bay ID"
                            className="h-9 text-sm touch-manipulation"
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* CATEGORY */}
              <div ref={sectionAllCatRef} className={collapsibleSectionSurfaceClass(jumpHighlight === "category")}>
                {sectionHeader(
                  <Tag className="h-4 w-4" />,
                  "Category",
                  category || "Not set",
                  allCatOpen,
                  () => setOpenSection((o) => (o === "category" ? null : "category")),
                  jumpHighlight === "category",
                )}
                {allCatOpen && (
                  <div className="px-3 pb-3 pt-1.5">
                    <div className="flex flex-wrap gap-1">
                      {categoryPaths.length === 0
                        ? <p className="text-[11px] text-muted-foreground">No categories defined.</p>
                        : categoryPaths.map((path) => (
                          <button
                            key={path}
                            type="button"
                            className={chipClass(category === path)}
                            onClick={() => setCategory(path)}
                          >
                            {path}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* UNIT */}
              <div ref={sectionUnitRef} className={collapsibleSectionSurfaceClass(jumpHighlight === "unit")}>
                {sectionHeader(
                  <Layers className="h-4 w-4" />,
                  "Unit",
                  unitStripLabel || "Not set",
                  allUnitOpen,
                  () => setOpenSection((o) => (o === "unit" ? null : "unit")),
                  jumpHighlight === "unit",
                )}
                {allUnitOpen && (
                  <div className="px-3 pb-3 pt-1.5">
                    <div className="flex flex-wrap gap-1">
                      {units.length === 0
                        ? <p className="text-[11px] text-muted-foreground">No units defined.</p>
                        : units.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            className={chipClass(unit === u.name && (!u.children?.length || unitSubPickerParent?.id === u.id))}
                            onClick={() => selectParentUnit(u)}
                            title={u.children?.length ? "Has sizes — pick below" : undefined}
                          >
                            {u.name}
                          </button>
                        ))}
                    </div>
                    {unitSubPickerParent && (unitSubPickerParent.children?.length ?? 0) > 0 && (
                      <div className="mt-1.5 border-t border-dashed border-border/40 pt-1.5">
                        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Sizes</p>
                        <div className="flex flex-wrap gap-1">
                          {unitSubPickerParent.children!.map((sub) => (
                            <button
                              key={sub.id}
                              type="button"
                              className={chipClass(unit === unitSubPickerParent.name && unitSubcategory === sub.name)}
                              onClick={() => setUnitSubcategory(sub.name)}
                            >
                              {sub.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* PROJECT */}
              <div ref={sectionProjectRef} className={collapsibleSectionSurfaceClass(jumpHighlight === "project")}>
                {sectionHeader(
                  <Briefcase className="h-4 w-4" />,
                  "Project",
                  projectStripLabel || "None",
                  allProjOpen,
                  () => setOpenSection((o) => (o === "project" ? null : "project")),
                  jumpHighlight === "project",
                )}
                {allProjOpen && (
                  <div className="px-3 pb-3 pt-1.5">
                    <div className="flex flex-wrap gap-1">
                      <button type="button" className={chipClass(!project)} onClick={() => setProject("")}>
                        None
                      </button>
                      {projects.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className={chipClass(project === p.id || project === p.name)}
                          onClick={() => setProject(p.id)}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* DETAILS — asset status, tracking mode */}
              <div ref={sectionMetaRef} className={collapsibleSectionSurfaceClass(jumpHighlight === "details")}>
                {sectionHeader(
                  <LayoutList className="h-4 w-4" />,
                  "Details",
                  `${ASSET_STATUSES.find((s) => s.value === assetStatus)?.label ?? assetStatus} · ${assetTrackingMode === "line_item" ? "Single" : "Multiple"}`,
                  detailsOpen,
                  () => setOpenSection((o) => (o === "details" ? null : "details")),
                  jumpHighlight === "details",
                )}
                {detailsOpen && (
                  <div className="px-3 pb-3 pt-1.5 space-y-3">
                    {/* Asset status chips */}
                    <div>
                      <Label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Asset status</Label>
                      <div className="flex flex-wrap gap-1">
                        {ASSET_STATUSES.map(({ value, label }) => (
                          <button
                            key={value}
                            type="button"
                            className={chipClass(assetStatus === value)}
                            onClick={() => setAssetStatus(value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Tracking mode */}
                    <div>
                      <Label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Tracking</Label>
                      <div className="flex gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant={assetTrackingMode === "line_item" ? "secondary" : "outline"}
                          className="h-8 touch-manipulation px-3 text-xs"
                          onClick={() => setAssetTrackingMode("line_item")}
                        >
                          Single unit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={assetTrackingMode === "per_unit" ? "secondary" : "outline"}
                          className="h-8 touch-manipulation px-3 text-xs"
                          onClick={() => setAssetTrackingMode("per_unit")}
                        >
                          Multiple units
                        </Button>
                      </div>
                    </div>

                    {/* Photo (if not yet set via quick strip) */}
                    {!photoUrl && (
                      <div>
                        <Label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Photo (optional)</Label>
                        <div className="flex gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 touch-manipulation px-2.5 text-xs"
                            onClick={() => setCaptureOpen(true)}
                          >
                            <Camera className="mr-1 h-3.5 w-3.5" /> Camera
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 touch-manipulation px-2.5 text-xs"
                            onClick={() => galleryInputRef.current?.click()}
                          >
                            <ImagePlus className="mr-1 h-3.5 w-3.5" /> Gallery
                          </Button>
                        </div>
                      </div>
                    )}
                    {photoUrl && (
                      <div className="flex items-center gap-2">
                        <img src={photoUrl} alt="" className="h-10 w-10 rounded border object-cover" />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs touch-manipulation"
                          onClick={() => setPhotoUrl("")}
                        >
                          <Trash2 className="mr-1 h-3 w-3" /> Remove photo
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* ── FOOTER ──────────────────────────────────────────────────────── */}
          <DialogFooter className="shrink-0 border-t bg-background p-2.5">
            <div className="grid w-full grid-cols-3 gap-1.5">
              <Button
                type="button"
                variant="ghost"
                className="h-10 touch-manipulation text-sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-10 touch-manipulation text-sm font-medium"
                onClick={() => void handleSubmit("once")}
              >
                Add to inventory
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-10 touch-manipulation text-sm font-medium"
                onClick={() => void handleSubmit("next")}
              >
                Add &amp; next
              </Button>
            </div>
          </DialogFooter>
        </DraggableDialogContent>
      </Dialog>
    </>
  );
}
