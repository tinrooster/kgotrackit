"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Copy,
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
  Type,
  Warehouse,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { SimpleBarcodeScanner } from "@/components/SimpleBarcodeScanner";
import { QuickCapturePhotoDialog } from "@/components/QuickCapturePhotoDialog";
import { Combobox } from "@/components/ui/combobox";
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

interface QuickPrefs {
  location?: string;
  category?: string;
  unit?: string;
  /** When the unit has sub-sizes (e.g. Spools → roll width). */
  unitSubcategory?: string;
  project?: string;
  /** Rack preset or custom value when the chosen location has rack rules. */
  rackLocation?: string;
}

interface LastSnapshot {
  location: string;
  category: string;
  unit: string;
  project: string;
  /** When `unit` has configured children (e.g. Spools sizes). */
  unitSubcategory?: string;
  /** Last rack / bay (optional). */
  rackLocation?: string;
  /** Last successfully submitted item name (optional for older stored rows). */
  name?: string;
}

interface UsageCounts {
  cat: Record<string, number>;
  loc: Record<string, number>;
}

function loadPrefs(): QuickPrefs {
  try {
    const raw = sessionStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as QuickPrefs) : {};
  } catch {
    return {};
  }
}

function savePrefs(p: QuickPrefs) {
  try {
    sessionStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function loadLast(): LastSnapshot | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as LastSnapshot;
    if (o.location && o.category && o.unit) return o;
    return null;
  } catch {
    return null;
  }
}

function saveLast(s: LastSnapshot) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function loadUsage(): UsageCounts {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return { cat: {}, loc: {} };
    const o = JSON.parse(raw) as UsageCounts;
    return {
      cat: o.cat && typeof o.cat === "object" ? o.cat : {},
      loc: o.loc && typeof o.loc === "object" ? o.loc : {},
    };
  } catch {
    return { cat: {}, loc: {} };
  }
}

function bumpUsage(category: string, locationId: string) {
  const u = loadUsage();
  u.cat[category] = (u.cat[category] || 0) + 1;
  u.loc[locationId] = (u.loc[locationId] || 0) + 1;
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(u));
  } catch {
    /* ignore */
  }
}

function topKeys(counts: Record<string, number>, limit: number): string[] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .slice(0, limit);
}

function flattenCategoryPaths(nodes: CategoryNode[], parentPath = ""): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    const path = parentPath ? `${parentPath}/${n.name}` : n.name;
    out.push(path);
    if (n.children?.length) {
      out.push(...flattenCategoryPaths(n.children, path));
    }
  }
  return out.sort();
}

function findParentForLocationValue(
  value: string,
  locations: ItemWithSubcategories[]
): ItemWithSubcategories | null {
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
  const [name, setName] = React.useState("");
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
  const [assetTrackingMode, setAssetTrackingMode] = React.useState<"line_item" | "per_unit">(
    "line_item"
  );
  const [rackLocation, setRackLocation] = React.useState("");
  const [rackCfgEpoch, setRackCfgEpoch] = React.useState(0);
  const [subPickerParent, setSubPickerParent] = React.useState<ItemWithSubcategories | null>(null);
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const [captureOpen, setCaptureOpen] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const recognitionRef = React.useRef<SpeechRecognition | null>(null);
  const [usageTick, setUsageTick] = React.useState(0);
  const [openSection, setOpenSection] = React.useState<"details" | "location" | "category" | "unit" | "project" | null>(null);
  const [locFilter, setLocFilter] = React.useState("");
  const [catFilter, setCatFilter] = React.useState("");
  const [unitFilter, setUnitFilter] = React.useState("");
  const [projFilter, setProjFilter] = React.useState("");

  const sectionNameRef = React.useRef<HTMLDivElement>(null);
  const sectionRackInLocRef = React.useRef<HTMLDivElement>(null);
  const sectionMetaRef = React.useRef<HTMLDivElement>(null);
  const sectionAllLocRef = React.useRef<HTMLDivElement>(null);
  const sectionAllCatRef = React.useRef<HTMLDivElement>(null);
  const sectionUnitRef = React.useRef<HTMLDivElement>(null);
  const sectionProjectRef = React.useRef<HTMLDivElement>(null);

  type JumpHighlight = "name" | "details" | "location" | "category" | "unit" | "project";
  const [jumpHighlight, setJumpHighlight] = React.useState<JumpHighlight | null>(null);
  const jumpTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashJump = React.useCallback((id: JumpHighlight) => {
    if (jumpTimerRef.current) {
      clearTimeout(jumpTimerRef.current);
    }
    setJumpHighlight(id);
    jumpTimerRef.current = setTimeout(() => {
      setJumpHighlight(null);
      jumpTimerRef.current = null;
    }, 2200);
  }, []);

  React.useEffect(() => {
    return () => {
      if (jumpTimerRef.current) {
        clearTimeout(jumpTimerRef.current);
      }
    };
  }, []);

  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
    requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const jumpTo = (id: JumpHighlight, ref: React.RefObject<HTMLDivElement | null>) => {
    flashJump(id);
    scrollToSection(ref);
  };

  const goToRack = React.useCallback(() => {
    setOpenSection("location");
    flashJump("location");
    requestAnimationFrame(() => {
      sectionAllLocRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => {
        sectionRackInLocRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 200);
    });
  }, [flashJump]);

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
      for (const sub of loc.children || []) {
        valid.add(`${loc.id}/${sub.id}`);
      }
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

  const flatLocationPickOptions = React.useMemo(
    () =>
      locations.flatMap((loc) => [
        { value: loc.id, label: loc.name },
        ...(loc.children || []).map((s) => ({
          value: `${loc.id}/${s.id}`,
          label: `${loc.name} / ${s.name}`,
        })),
      ]),
    [locations]
  );

  /** Same shape as BasicDetailsTab flattened `name` (slash path) for `rack-locations.json` rules. */
  const flatLocationLabelForRack = React.useMemo(() => {
    const hit = flatLocationPickOptions.find((o) => o.value === locationId);
    if (hit?.label) {
      return hit.label.replace(/\s*\/\s*/g, "/");
    }
    const resolved = resolveLocationLabel(locationId, locations);
    return resolved ? resolved.replace(/\s*\/\s*/g, "/") : "";
  }, [flatLocationPickOptions, locationId, locations]);

  const selectedLocationRow = React.useMemo(
    () => findLocationByFlatId(locations, locationId),
    [locations, locationId],
  );

  const presetRackOptionsFromConfig = React.useMemo(() => {
    let opts = getRackOptionsForFlatLocationLabel(flatLocationLabelForRack);
    if (opts.length > 0) {
      return opts;
    }
    const resolved = resolveLocationLabel(locationId, locations).replace(/\s*\/\s*/g, "/");
    if (resolved) {
      opts = getRackOptionsForFlatLocationLabel(resolved);
      if (opts.length > 0) {
        return opts;
      }
    }
    if (locationId.includes("/")) {
      const subId = locationId.split("/").pop() ?? "";
      opts = getRackOptionsForSubLocationKey(subId);
    }
    return opts;
  }, [flatLocationLabelForRack, locationId, locations, rackCfgEpoch]);

  const useCustomRacks = selectedLocationRow?.rackLocationEnabled === true;
  const customRackSlots = React.useMemo(() => {
    if (!useCustomRacks || !Array.isArray(selectedLocationRow?.rackSlots)) {
      return null as string[] | null;
    }
    return selectedLocationRow!.rackSlots!.map((s) => String(s).trim()).filter(Boolean);
  }, [useCustomRacks, selectedLocationRow]);

  const quickRackOptions = React.useMemo(() => {
    if (useCustomRacks) {
      return customRackSlots ?? [];
    }
    return presetRackOptionsFromConfig;
  }, [useCustomRacks, customRackSlots, presetRackOptionsFromConfig]);

  const quickRackComboboxOptions = React.useMemo(
    () => quickRackOptions.map((o) => ({ label: o, value: o })),
    [quickRackOptions],
  );

  /** Match BasicDetailsTab: settings rack slots and/or rack-location JSON presets. */
  const showRackLocationRow = useCustomRacks || presetRackOptionsFromConfig.length > 0;

  const projectStripLabel = React.useMemo(() => {
    if (!project) return "";
    const p = projects.find((x) => x.id === project || x.name === project);
    return p?.name ?? project;
  }, [project, projects]);

  const unitStripLabel = React.useMemo(() => {
    if (!unit) return "";
    const parent = units.find((u) => u.name === unit);
    if (parent?.children?.length && unitSubcategory) {
      return `${parent.name} / ${unitSubcategory}`;
    }
    return unit;
  }, [unit, unitSubcategory, units]);
  const detailsIndicator = React.useMemo(() => {
    const tags: string[] = [`Qty ${quantity}`];
    if (rackLocation) tags.push("Rack");
    if (barcode) tags.push("Barcode");
    if (photoUrl) tags.push("Photo");
    return tags.join(" · ");
  }, [quantity, rackLocation, barcode, photoUrl]);

  const filteredLocationsForPicker = React.useMemo(() => {
    const q = locFilter.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter((loc) => {
      const parentMatch = loc.name.toLowerCase().includes(q);
      const childMatch = (loc.children || []).some((s) => s.name.toLowerCase().includes(q));
      return parentMatch || childMatch;
    });
  }, [locations, locFilter]);

  const filteredCategoryPaths = React.useMemo(() => {
    const q = catFilter.trim().toLowerCase();
    if (!q) return categoryPaths;
    return categoryPaths.filter((p) => p.toLowerCase().includes(q));
  }, [categoryPaths, catFilter]);

  const filteredUnitsForPicker = React.useMemo(() => {
    const q = unitFilter.trim().toLowerCase();
    if (!q) return units;
    return units.filter((u) => {
      const parentMatch = u.name.toLowerCase().includes(q);
      const childMatch = (u.children || []).some((s) => s.name.toLowerCase().includes(q));
      return parentMatch || childMatch;
    });
  }, [units, unitFilter]);

  const filteredProjects = React.useMemo(() => {
    const q = projFilter.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, projFilter]);

  const applyLocationId = React.useCallback(
    (loc: string) => {
      setLocationId(loc);
      setRackLocation("");
      const parent = findParentForLocationValue(loc, locations);
      setSubPickerParent(parent?.children?.length ? parent : null);
    },
    [locations]
  );

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

  const selectSubUnitSize = React.useCallback((_parent: ItemWithSubcategories, subName: string) => {
    setUnitSubcategory(subName);
  }, []);

  const hydrate = React.useCallback(() => {
    const prefs = loadPrefs();
    const ds = SettingsService.loadDefaultSettings();
    const paths = flattenCategoryPaths(categories);
    const cat =
      prefs.category ||
      (ds.defaultCategory && paths.includes(ds.defaultCategory) ? ds.defaultCategory : "") ||
      paths[0] ||
      "";
    let loc =
      prefs.location ||
      ds.defaultLocation ||
      locations[0]?.id ||
      "";
    if (loc && !loc.includes("/")) {
      const top = locations.find((l) => l.id === loc);
      if (top?.children?.length) {
        loc = `${top.id}/${top.children[0].id}`;
      }
    }
    let u = prefs.unit || ds.defaultUnit || defaultUnitName || units[0]?.name || "";
    const unitParent = units.find((x) => x.name === u);
    let uSub = prefs.unitSubcategory || "";
    if (unitParent?.children?.length) {
      if (!uSub || !unitParent.children.some((c) => c.name === uSub)) {
        uSub = unitParent.children[0].name;
      }
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
    setQuantity(1);
    setPhotoUrl("");
    setBarcode("");
    setAssetStatus("active");
    setAssetTrackingMode("line_item");
    setRackLocation(prefs.rackLocation?.trim() ?? "");
    setLocFilter("");
    setCatFilter("");
    setUnitFilter("");
    setProjFilter("");
    if (!loc) {
      setOpenSection("location");
    } else if (!cat) {
      setOpenSection("category");
    } else if (!u) {
      setOpenSection("unit");
    } else if (!proj) {
      setOpenSection("project");
    } else {
      setOpenSection(null);
    }
  }, [categories, locations, projects, defaultUnitName, units, applyLocationId]);

  React.useEffect(() => {
    if (open) {
      hydrate();
      requestAnimationFrame(() => nameRef.current?.focus());
    }
  }, [open, hydrate]);

  React.useEffect(() => {
    return () => {
      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
    };
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
    if (trimmed.length < 2) {
      toast.error("Enter a name (at least 2 characters).");
      return null;
    }
    if (!category) {
      toast.error("Choose a category.");
      return null;
    }
    if (!locationId) {
      toast.error("Choose a location.");
      return null;
    }
    if (!unit) {
      toast.error("Choose a unit.");
      return null;
    }

    const unitParentRow = units.find((x) => x.name === unit);
    if (unitParentRow?.children?.length) {
      if (!unitSubcategory.trim()) {
        toast.error("Choose a unit size for this unit type.");
        return null;
      }
      if (!unitParentRow.children.some((c) => c.name === unitSubcategory)) {
        toast.error("Invalid unit size.");
        return null;
      }
    }

    const ds = SettingsService.loadDefaultSettings();
    const supplierName =
      suppliers.find((s) => s.name === ds.defaultSupplier)?.name ?? suppliers[0]?.name ?? "";

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
      notes: "",
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
  }, [
    name,
    quantity,
    unit,
    unitSubcategory,
    category,
    locationId,
    project,
    suppliers,
    photoUrl,
    barcode,
    units,
    assetStatus,
    assetTrackingMode,
    rackLocation,
  ]);

  const handleSubmit = async (mode: "once" | "next") => {
    const payload = buildPayload();
    if (!payload) return;
    persistSelections();
    saveLast({
      location: locationId,
      category,
      unit,
      unitSubcategory: unitSubcategory || undefined,
      project,
      rackLocation: rackLocation.trim() || undefined,
      name: payload.name,
    });
    bumpUsage(category, locationId);
    setUsageTick((t) => t + 1);
    try {
      await onSubmit(payload, mode);
      if (mode === "next") {
        setName("");
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
    if (!last) {
      toast.info("No previous quick-add row yet.");
      return;
    }
    if (!categoryPaths.includes(last.category)) {
      toast.error("Saved category no longer exists.");
      return;
    }
    const locOk =
      locations.some((l) => l.id === last.location) ||
      locations.some((l) => (l.children || []).some((s) => `${l.id}/${s.id}` === last.location));
    if (!locOk) {
      toast.error("Saved location no longer exists.");
      return;
    }
    if (!units.some((u) => u.name === last.unit)) {
      toast.error("Saved unit no longer exists.");
      return;
    }
    setCategory(last.category);
    applyLocationId(last.location);
    setUnit(last.unit);
    const uParent = units.find((x) => x.name === last.unit);
    if (uParent?.children?.length) {
      const sub =
        last.unitSubcategory && uParent.children.some((c) => c.name === last.unitSubcategory)
          ? last.unitSubcategory
          : uParent.children[0].name;
      setUnitSubcategory(sub);
      setUnitSubPickerParent(uParent);
    } else {
      setUnitSubcategory("");
      setUnitSubPickerParent(null);
    }
    setProject(
      last.project && projects.some((p) => p.id === last.project || p.name === last.project)
        ? last.project
        : ""
    );
    setRackLocation(last.rackLocation?.trim() ?? "");
    toast.success("Applied last item’s location, category, unit, and rack (if saved).");
  };

  const applyLastName = () => {
    const last = loadLast();
    const n = last?.name?.trim();
    if (!n) {
      toast.info("No previous item name saved yet.");
      return;
    }
    setName(n);
    requestAnimationFrame(() => nameRef.current?.focus());
    toast.success("Applied last item name.");
  };

  const startVoice = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      toast.error("Voice input is not supported in this browser.");
      return;
    }
    if (listening) {
      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
      setListening(false);
      return;
    }
    try {
      const r = new Ctor();
      recognitionRef.current = r;
      r.lang = navigator.language || "en-US";
      r.interimResults = false;
      r.maxAlternatives = 1;
      r.continuous = false;
      r.onresult = (event: SpeechRecognitionEvent) => {
        const text = event.results[0]?.[0]?.transcript?.trim() ?? "";
        if (text) {
          setName((prev) => (prev ? `${prev} ${text}` : text));
        }
        setListening(false);
        recognitionRef.current = null;
      };
      r.onerror = () => {
        setListening(false);
        recognitionRef.current = null;
        toast.error("Voice input failed.");
      };
      r.onend = () => {
        setListening(false);
        recognitionRef.current = null;
      };
      r.start();
      setListening(true);
    } catch {
      toast.error("Could not start voice input.");
      setListening(false);
    }
  };

  const chipClass = (active: boolean) =>
    cn(
      "touch-manipulation min-h-8 rounded-full border px-2 py-1 text-left text-xs font-medium leading-tight transition-colors",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-background hover:bg-muted"
    );

  const selectParentLocation = (loc: ItemWithSubcategories) => {
    if (loc.children?.length) {
      setSubPickerParent(loc);
      const firstSub = loc.children[0];
      if (firstSub) {
        setLocationId(`${loc.id}/${firstSub.id}`);
      }
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

  const readPhotoFile = (file: File) => {
    void normalizeImageFileToDataUrl(file, {
      targetBytes: TARGET_PHOTO_BYTES,
    })
      .then((normalizedDataUrl) => {
        const finalBytes = estimateDataUrlBytes(normalizedDataUrl);
        if (finalBytes > TARGET_PHOTO_BYTES) {
          toast.error("Photo is still too large after compression. Try a smaller image.");
          return;
        }
        setPhotoUrl(normalizedDataUrl);
      })
      .catch(() => {
        toast.error("Could not process the selected photo.");
      });
  };

  const lastSnapshot = loadLast();
  const detailsOpen = openSection === "details";
  const allLocOpen = openSection === "location";
  const allCatOpen = openSection === "category";
  const allUnitOpen = openSection === "unit";
  const allProjOpen = openSection === "project";

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

      <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
        <DialogContent
          nonModalBackdrop
          className={cn(
            "flex w-[calc(100vw-0.75rem)] max-h-[90vh] min-h-0 flex-col gap-0 overflow-x-hidden overflow-y-visible p-0 sm:w-auto sm:max-w-3xl md:max-w-4xl lg:max-w-5xl",
            "sm:rounded-xl",
            "!left-1/2 !right-auto !top-[max(0.5rem,6vh)] !bottom-auto !translate-x-[-50%] !translate-y-0",
            "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[6vh] data-[state=closed]:slide-out-to-top-[6vh]"
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b px-4 py-3 text-left sm:px-6 sm:py-4">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold sm:text-lg">
              <Zap className="h-5 w-5" aria-hidden />
              Quick add
            </DialogTitle>
          </DialogHeader>

          <div
            className="shrink-0 border-b border-border/50 bg-muted/35 px-4 py-3 backdrop-blur-sm sm:px-6"
            aria-label="Current selection and quick navigation"
          >
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Current</p>
            <div className="mt-2 grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-4 md:gap-3">
              <button
                type="button"
                className="flex min-h-10 min-w-0 items-center gap-1.5 rounded-md border border-border/60 bg-background/90 px-2.5 py-2 text-left font-medium shadow-sm hover:bg-accent"
                onClick={() => {
                  setOpenSection("location");
                  jumpTo("location", sectionAllLocRef);
                }}
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{locationStripLabel || "—"}</span>
              </button>
              <button
                type="button"
                className="flex min-h-10 min-w-0 items-center gap-1.5 rounded-md border border-border/60 bg-background/90 px-2.5 py-2 text-left font-medium shadow-sm hover:bg-accent"
                onClick={() => {
                  setOpenSection("category");
                  jumpTo("category", sectionAllCatRef);
                }}
              >
                <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{category || "—"}</span>
              </button>
              <button
                type="button"
                className="flex min-h-10 min-w-0 items-center gap-1.5 rounded-md border border-border/60 bg-background/90 px-2.5 py-2 text-left font-medium shadow-sm hover:bg-accent"
                onClick={() => {
                  setOpenSection("unit");
                  jumpTo("unit", sectionUnitRef);
                }}
              >
                <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{unitStripLabel || "—"}</span>
              </button>
              <button
                type="button"
                className="flex min-h-10 min-w-0 items-center gap-1.5 rounded-md border border-border/60 bg-background/90 px-2.5 py-2 text-left font-medium shadow-sm hover:bg-accent"
                onClick={() => {
                  setOpenSection("project");
                  jumpTo("project", sectionProjectRef);
                }}
              >
                <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{projectStripLabel || "—"}</span>
              </button>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <span className="mr-0.5 self-center text-[10px] text-muted-foreground">Go to</span>
              <Button
                type="button"
                variant={jumpHighlight === "name" ? "secondary" : "outline"}
                size="sm"
                className="h-8 touch-manipulation px-2.5 text-xs"
                onClick={() => jumpTo("name", sectionNameRef)}
              >
                Name
              </Button>
              {showRackLocationRow ? (
                <Button
                  type="button"
                  variant={jumpHighlight === "location" ? "secondary" : "outline"}
                  size="sm"
                  className="h-8 touch-manipulation px-2.5 text-xs"
                  onClick={() => goToRack()}
                >
                  Rack
                </Button>
              ) : null}
              <Button
                type="button"
                variant={jumpHighlight === "details" ? "secondary" : "outline"}
                size="sm"
                className="h-8 touch-manipulation px-2.5 text-xs"
                onClick={() => {
                  setOpenSection("details");
                  jumpTo("details", sectionMetaRef);
                }}
              >
                Details
              </Button>
              <Button
                type="button"
                variant={jumpHighlight === "location" ? "secondary" : "outline"}
                size="sm"
                className="h-8 touch-manipulation px-2.5 text-xs"
                onClick={() => {
                  setOpenSection("location");
                  jumpTo("location", sectionAllLocRef);
                }}
              >
                Location
              </Button>
              <Button
                type="button"
                variant={jumpHighlight === "category" ? "secondary" : "outline"}
                size="sm"
                className="h-8 touch-manipulation px-2.5 text-xs"
                onClick={() => {
                  setOpenSection("category");
                  jumpTo("category", sectionAllCatRef);
                }}
              >
                Category
              </Button>
              <Button
                type="button"
                variant={jumpHighlight === "unit" ? "secondary" : "outline"}
                size="sm"
                className="h-8 touch-manipulation px-2.5 text-xs"
                onClick={() => {
                  setOpenSection("unit");
                  jumpTo("unit", sectionUnitRef);
                }}
              >
                Unit
              </Button>
              <Button
                type="button"
                variant={jumpHighlight === "project" ? "secondary" : "outline"}
                size="sm"
                className="h-8 touch-manipulation px-2.5 text-xs"
                onClick={() => {
                  setOpenSection("project");
                  jumpTo("project", sectionProjectRef);
                }}
              >
                Project
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 [-webkit-overflow-scrolling:touch] sm:px-6">
            <div className="space-y-3 py-3 pr-0 pb-6 sm:space-y-4 sm:py-4">
              <div ref={sectionNameRef} className={collapsibleSectionSurfaceClass(jumpHighlight === "name")}>
                <div className="p-3">
                  <Label htmlFor="quick-name" className="sr-only">
                    Item name
                  </Label>
                <div className="flex gap-1.5">
                  <Input
                    id="quick-name"
                    ref={nameRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Item name"
                    className="h-11 min-w-0 flex-1 text-base touch-manipulation"
                    autoComplete="off"
                    enterKeyHint="done"
                  />
                  <Button
                    type="button"
                    variant={listening ? "default" : "outline"}
                    size="icon"
                    className="h-11 w-11 shrink-0 touch-manipulation"
                    onClick={startVoice}
                    title={listening ? "Stop" : "Voice input"}
                    aria-pressed={listening}
                  >
                    <Mic className="h-4 w-4" />
                  </Button>
                  {lastSnapshot?.name ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 shrink-0 touch-manipulation"
                      onClick={applyLastName}
                      title="Use last item name"
                      aria-label="Use last item name"
                    >
                      <Type className="h-4 w-4" />
                    </Button>
                  ) : null}
                  {lastSnapshot ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 shrink-0 touch-manipulation"
                      onClick={applySameAsLast}
                      title="Apply same as last details"
                      aria-label="Apply same as last details"
                    >
                      <History className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
                {listening ? (
                  <p className="mt-1 text-[10px] leading-tight text-muted-foreground">Listening…</p>
                ) : null}
                {favoriteLocationIds.length > 0 || favoriteCategories.length > 0 ? (
                  <div className="mt-2.5 space-y-1.5 border-t border-dashed border-border/50 pt-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <Sparkles className="h-3 w-3 shrink-0 text-amber-500" aria-hidden />
                      <span>Often used</span>
                    </div>
                    {favoriteLocationIds.length > 0 ? (
                      <div className="space-y-0.5">
                        {favoriteCategories.length > 0 ? (
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/90">Loc</p>
                        ) : null}
                        <div className="flex flex-wrap gap-1">
                          {favoriteLocationIds.map((id) => {
                            const label =
                              locations
                                .flatMap((loc) => [
                                  { id: loc.id, label: loc.name },
                                  ...(loc.children || []).map((s) => ({
                                    id: `${loc.id}/${s.id}`,
                                    label: `${loc.name} / ${s.name}`,
                                  })),
                                ])
                                .find((o) => o.id === id)?.label ?? id;
                            return (
                              <button
                                key={id}
                                type="button"
                                className={chipClass(locationId === id)}
                                onClick={() => applyLocationId(id)}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                    {favoriteCategories.length > 0 ? (
                      <div className="space-y-0.5">
                        {favoriteLocationIds.length > 0 ? (
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/90">Cat</p>
                        ) : null}
                        <div className="flex flex-wrap gap-1">
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
                      </div>
                    ) : null}
                  </div>
                ) : !lastSnapshot ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">Often used shortcuts appear after you add items.</p>
                ) : null}
                </div>
              </div>

              <div ref={sectionMetaRef} className={collapsibleSectionSurfaceClass(jumpHighlight === "details")}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 border-b border-border/50 bg-muted/20 px-3 py-2.5 text-left hover:bg-muted/35"
                  onClick={() => setOpenSection((o) => (o === "details" ? null : "details"))}
                  aria-expanded={detailsOpen}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <LayoutList className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="text-sm font-semibold">Details</span>
                    <span className="truncate text-xs font-normal text-muted-foreground/80">{detailsIndicator}</span>
                  </span>
                  <ChevronDown
                    className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", detailsOpen && "rotate-180")}
                    aria-hidden
                  />
                </button>
                {detailsOpen ? (
                  <div className="border-t border-border/50 bg-muted/5 px-3 pb-3 pt-2.5">
                <div className="space-y-0">
                  <div className="space-y-1 pb-2">
                    <Label className="text-[11px] font-medium text-muted-foreground">Asset status</Label>
                    <select
                      value={assetStatus}
                      onChange={(e) => setAssetStatus(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="active">Active</option>
                      <option value="hot_spare">Hot Spare</option>
                      <option value="cold_spare">Cold Spare</option>
                      <option value="in_service">In Service</option>
                      <option value="ready_decommission">Ready to Decommission</option>
                      <option value="slated_removal">Slated for Removal</option>
                      <option value="cut_over_pending">Cut-over pending</option>
                      <option value="ewaste">E-Waste</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className="space-y-1 border-t border-dashed border-border/50 pt-2">
                    <Label className="text-[11px] font-medium text-muted-foreground">Units &amp; tagging</Label>
                    <div className="flex flex-wrap gap-1.5">
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

                  <div className="space-y-1 border-t border-dashed border-border/50 pb-2 pt-2">
                    <Label className="text-[11px] font-medium text-muted-foreground">Barcode (optional)</Label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 touch-manipulation px-2.5 text-xs"
                        onClick={() => setScannerOpen(true)}
                      >
                        <ScanLine className="mr-1 h-3.5 w-3.5" />
                        Scan
                      </Button>
                      <Input
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        placeholder="Or type"
                        className="h-9 min-w-0 flex-1 touch-manipulation text-sm"
                      />
                      {barcode ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => setBarcode("")}
                          aria-label="Clear barcode"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-1 border-t border-dashed border-border/50 pt-2">
                    <Label className="text-[11px] font-medium text-muted-foreground">Photo (optional)</Label>
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
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 touch-manipulation px-2.5 text-xs"
                        title="Live preview — needs a webcam or permission"
                        onClick={() => setCaptureOpen(true)}
                      >
                        <Camera className="mr-1 h-3.5 w-3.5" />
                        Camera
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 touch-manipulation px-2.5 text-xs"
                        title="Choose a file from disk"
                        onClick={() => galleryInputRef.current?.click()}
                      >
                        <ImagePlus className="mr-1 h-3.5 w-3.5" />
                        Gallery
                      </Button>
                      {photoUrl ? (
                        <>
                          <img
                            src={photoUrl}
                            alt=""
                            className="h-10 w-10 rounded border object-cover"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0 touch-manipulation"
                            onClick={() => setPhotoUrl("")}
                            aria-label="Remove photo"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-1 border-t border-dashed border-border/50 pt-2">
                    <Label className="text-[11px] font-medium text-muted-foreground">Quantity</Label>
                    <div className="flex items-center justify-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 shrink-0 touch-manipulation"
                        onClick={() => setQuantity((q) => Math.max(0, q - 1))}
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number"
                        min={0}
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(0, Number(e.target.value) || 0))}
                        className="h-10 w-[4rem] text-center text-base touch-manipulation"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 shrink-0 touch-manipulation"
                        onClick={() => setQuantity((q) => q + 1)}
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                  </div>
                ) : null}
              </div>

              <div ref={sectionAllLocRef} className={collapsibleSectionSurfaceClass(jumpHighlight === "location")}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 border-b border-border/50 bg-muted/20 px-3 py-2.5 text-left hover:bg-muted/35"
                  onClick={() => setOpenSection((o) => (o === "location" ? null : "location"))}
                  aria-expanded={allLocOpen}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="text-sm font-semibold">All locations</span>
                    <span className="truncate text-xs font-normal text-muted-foreground/80">
                      {locationStripLabel || "Not set"}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", allLocOpen && "rotate-180")}
                    aria-hidden
                  />
                </button>
                {allLocOpen ? (
                  <div className="border-t border-border/60 px-2.5 pb-2.5 pt-2">
                    <Label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Location
                    </Label>
                    <Combobox
                      options={flatLocationPickOptions}
                      value={locationId}
                      onChange={(id) => applyLocationId(id)}
                      placeholder="Select location"
                      emptyText="No location matches."
                    />
                    <Input
                      value={locFilter}
                      onChange={(e) => setLocFilter(e.target.value)}
                      placeholder="Filter chip lists…"
                      className="mb-2 mt-2 h-9 text-sm placeholder:text-muted-foreground/50"
                      aria-label="Filter location chip list"
                    />
                    <div className="flex flex-wrap gap-1">
                      {filteredLocationsForPicker.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">No locations match.</p>
                      ) : (
                        filteredLocationsForPicker.map((loc) => (
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
                        ))
                      )}
                    </div>
                    {subPickerParent && (subPickerParent.children?.length ?? 0) > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1 border-t border-dashed border-border/50 pt-1.5">
                        {subPickerParent
                          .children!.filter((sub) => {
                            const q = locFilter.trim().toLowerCase();
                            if (!q) return true;
                            return sub.name.toLowerCase().includes(q);
                          })
                          .map((sub) => (
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
                    {showRackLocationRow ? (
                      <div
                        ref={sectionRackInLocRef}
                        className="mt-3 border-t border-dashed border-border/50 bg-muted/5 px-0.5 pt-3"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <Warehouse className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="text-xs font-semibold text-foreground">Rack location</span>
                        </div>
                        {quickRackOptions.length === 0 ? (
                          <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
                            No rack presets for this location. Enter a custom rack ID.
                          </p>
                        ) : null}
                        <Combobox
                          options={quickRackComboboxOptions}
                          value={rackLocation}
                          onChange={(v) => setRackLocation(v)}
                          placeholder="Select rack or type…"
                          emptyText="No rack matches."
                          allowCustomValue
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div ref={sectionAllCatRef} className={collapsibleSectionSurfaceClass(jumpHighlight === "category")}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 border-b border-border/50 bg-muted/20 px-3 py-2.5 text-left hover:bg-muted/35"
                  onClick={() => setOpenSection((o) => (o === "category" ? null : "category"))}
                  aria-expanded={allCatOpen}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <Tag className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="text-sm font-semibold">All categories</span>
                    <span className="truncate text-xs font-normal text-muted-foreground/80">
                      {category || "Not set"}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", allCatOpen && "rotate-180")}
                    aria-hidden
                  />
                </button>
                {allCatOpen ? (
                  <div className="border-t border-border/60 px-2.5 pb-2.5 pt-2">
                    <Input
                      value={catFilter}
                      onChange={(e) => setCatFilter(e.target.value)}
                      placeholder="Filter categories…"
                      className="mb-2 h-9 text-sm placeholder:text-muted-foreground/50"
                      aria-label="Filter category list"
                    />
                    <div className="flex flex-wrap gap-1">
                      {filteredCategoryPaths.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">No categories match.</p>
                      ) : (
                        filteredCategoryPaths.map((path) => (
                          <button
                            key={path}
                            type="button"
                            className={chipClass(category === path)}
                            onClick={() => setCategory(path)}
                          >
                            {path}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <div ref={sectionUnitRef} className={collapsibleSectionSurfaceClass(jumpHighlight === "unit")}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 border-b border-border/50 bg-muted/20 px-3 py-2.5 text-left hover:bg-muted/35"
                  onClick={() => setOpenSection((o) => (o === "unit" ? null : "unit"))}
                  aria-expanded={allUnitOpen}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <Layers className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="text-sm font-semibold">Unit</span>
                    <span className="truncate text-xs font-normal text-muted-foreground/80">
                      {unitStripLabel || "Not set"}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", allUnitOpen && "rotate-180")}
                    aria-hidden
                  />
                </button>
                {allUnitOpen ? (
                  <div className="border-t border-border/60 px-2.5 pb-2.5 pt-2">
                    <Input
                      value={unitFilter}
                      onChange={(e) => setUnitFilter(e.target.value)}
                      placeholder="Filter units…"
                      className="mb-2 h-9 text-sm placeholder:text-muted-foreground/50"
                      aria-label="Filter units"
                    />
                    <div className="flex flex-wrap gap-1">
                      {filteredUnitsForPicker.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">No units match.</p>
                      ) : (
                        filteredUnitsForPicker.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            className={chipClass(
                              unit === u.name &&
                                (!u.children?.length || unitSubPickerParent?.id === u.id)
                            )}
                            onClick={() => selectParentUnit(u)}
                            title={u.children && u.children.length > 0 ? "Has sizes — pick below" : undefined}
                          >
                            {u.name}
                          </button>
                        ))
                      )}
                    </div>
                    {unitSubPickerParent && (unitSubPickerParent.children?.length ?? 0) > 0 && (
                      <div className="mt-1.5 border-t border-dashed border-border/50 pt-1.5">
                        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Sizes
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {unitSubPickerParent
                            .children!.filter((sub) => {
                              const q = unitFilter.trim().toLowerCase();
                              if (!q) return true;
                              return sub.name.toLowerCase().includes(q);
                            })
                            .map((sub) => (
                              <button
                                key={sub.id}
                                type="button"
                                className={chipClass(
                                  unit === unitSubPickerParent.name && unitSubcategory === sub.name
                                )}
                                onClick={() => selectSubUnitSize(unitSubPickerParent, sub.name)}
                              >
                                {sub.name}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              <div ref={sectionProjectRef} className={collapsibleSectionSurfaceClass(jumpHighlight === "project")}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 border-b border-border/50 bg-muted/20 px-3 py-2.5 text-left hover:bg-muted/35"
                  onClick={() => setOpenSection((o) => (o === "project" ? null : "project"))}
                  aria-expanded={allProjOpen}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="text-sm font-semibold">Project</span>
                    <span className="truncate text-xs font-normal text-muted-foreground/80">
                      {projectStripLabel || "None"}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", allProjOpen && "rotate-180")}
                    aria-hidden
                  />
                </button>
                {allProjOpen ? (
                  <div className="border-t border-border/60 px-2.5 pb-2.5 pt-2">
                    <Input
                      value={projFilter}
                      onChange={(e) => setProjFilter(e.target.value)}
                      placeholder="Filter projects…"
                      className="mb-2 h-9 text-sm placeholder:text-muted-foreground/50"
                      aria-label="Filter projects"
                    />
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className={chipClass(!project)}
                        onClick={() => setProject("")}
                      >
                        None
                      </button>
                    </div>
                    {projects.length > 0 ? (
                      <div className="mt-1.5 border-t border-dashed border-border/50 pt-1.5">
                        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Projects
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {filteredProjects.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground">No projects match.</p>
                          ) : (
                            filteredProjects.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className={chipClass(project === p.id || project === p.name)}
                                onClick={() => setProject(p.id)}
                              >
                                {p.name}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 flex-col gap-1 border-t bg-background p-2.5 sm:flex-col">
            <Button
              type="button"
              className="h-10 w-full touch-manipulation text-sm font-medium"
              onClick={() => void handleSubmit("once")}
            >
              Add to inventory
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-10 w-full touch-manipulation text-sm font-medium"
              onClick={() => void handleSubmit("next")}
            >
              Add &amp; next
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-9 w-full touch-manipulation text-sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
