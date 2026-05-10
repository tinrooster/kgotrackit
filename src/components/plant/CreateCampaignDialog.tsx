import { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PlantCampaignRule, PlantCampaignPreview, PlantCableFamily, PlantDrawing } from '@/types/plant';
import {
  createCampaign,
  previewCampaignRules,
  activateCampaign,
  listDrawings,
} from '@/lib/plantService';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CreateCampaignDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (campaignId: string) => void;
}

type RuleType = 'system_name_match' | 'location_code_match' | 'drawing_match' | 'cable_family_match';

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  system_name_match:   'Device name contains…',
  location_code_match: 'Location code matches…',
  drawing_match:       'Drawing number matches…',
  cable_family_match:  'Cable family matches…',
};

const CABLE_FAMILY_OPTIONS: { value: PlantCableFamily; label: string }[] = [
  { value: 'belden_1855',  label: 'Belden 1855 (HD-SDI)' },
  { value: 'belden_1855a', label: 'Belden 1855A (HD-SDI)' },
  { value: 'belden_1505',  label: 'Belden 1505 (SDI)' },
  { value: 'belden_1505a', label: 'Belden 1505A (SDI)' },
  { value: 'belden_1694',  label: 'Belden 1694 (HD)' },
  { value: 'belden_1694a', label: 'Belden 1694A (HD)' },
  { value: 'belden_9451',  label: 'Belden 9451 (AES)' },
  { value: 'belden_1504a', label: 'Belden 1504A (AES)' },
  { value: 'belden_1800',  label: 'Belden 1800F (Fiber)' },
  { value: 'cat5',         label: 'Cat 5' },
  { value: 'cat5e',        label: 'Cat 5e' },
  { value: 'cat6',         label: 'Cat 6' },
  { value: 'fiber_mm',     label: 'Fiber (Multimode)' },
  { value: 'fiber_sm',     label: 'Fiber (Singlemode)' },
  { value: 'rg6',          label: 'RG6 (Coax)' },
  { value: 'triax',        label: 'Triax' },
  { value: 'lmr400',       label: 'LMR-400 (RF)' },
  { value: 'rs422',        label: 'RS-422' },
  { value: 'rs232',        label: 'RS-232' },
  { value: 'other',        label: 'Other' },
  { value: 'unknown',      label: 'Unknown' },
];

interface DraftRule {
  type: RuleType;
  label: string;
  terms?: string;           // system_name_match: comma-separated
  codes?: string;           // location_code_match: comma-separated
  dwgNumbers?: string[];    // drawing_match: selected drawing IDs (by dwg_number for readability)
  families?: PlantCableFamily[]; // cable_family_match
}

function draftToRule(d: DraftRule): PlantCampaignRule | null {
  switch (d.type) {
    case 'system_name_match': {
      const terms = (d.terms ?? '').split(',').map((t) => t.trim()).filter(Boolean);
      if (!terms.length) return null;
      return { type: 'system_name_match', label: d.label || terms.join(', '), terms, fields: ['origin_device', 'dest_device'] };
    }
    case 'location_code_match': {
      const codes = (d.codes ?? '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
      if (!codes.length) return null;
      return { type: 'location_code_match', label: d.label || codes.join(', '), codes };
    }
    case 'drawing_match': {
      const dwgNumbers = d.dwgNumbers ?? [];
      if (!dwgNumbers.length) return null;
      return { type: 'drawing_match', label: d.label || `Drawings: ${dwgNumbers.slice(0, 3).join(', ')}${dwgNumbers.length > 3 ? '…' : ''}`, dwgNumbers };
    }
    case 'cable_family_match': {
      const families = d.families ?? [];
      if (!families.length) return null;
      return { type: 'cable_family_match', label: d.label || `Family: ${families.slice(0, 2).join(', ')}${families.length > 2 ? '…' : ''}`, families };
    }
  }
}

function RuleForm({
  draft, onChange, onRemove, drawings,
}: {
  draft: DraftRule;
  onChange: (d: DraftRule) => void;
  onRemove: () => void;
  drawings: PlantDrawing[];
}) {
  return (
    <div className="rounded-md border p-3 flex flex-col gap-2 bg-muted/20">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{RULE_TYPE_LABELS[draft.type]}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>

      {draft.type === 'system_name_match' && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Terms (comma-separated)</Label>
          <Input
            value={draft.terms ?? ''}
            onChange={(e) => onChange({ ...draft, terms: e.target.value })}
            placeholder="GV, TRINIX, Miranda, Apex, Kayenne"
            className="h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Matches cables where origin <em>or</em> destination device contains any of these strings (case-insensitive).
          </p>
        </div>
      )}

      {draft.type === 'location_code_match' && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Location codes (comma-separated)</Label>
          <Input
            value={draft.codes ?? ''}
            onChange={(e) => onChange({ ...draft, codes: e.target.value })}
            placeholder="TRINIX, APEX, TK14, TK15"
            className="h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Matches cables where origin <em>or</em> destination location code is in this list.
          </p>
        </div>
      )}

      {draft.type === 'drawing_match' && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Drawings</Label>
          {drawings.length === 0 ? (
            <p className="text-xs text-muted-foreground">No drawings available.</p>
          ) : (
            <div className="max-h-36 overflow-y-auto border rounded-md p-2 flex flex-col gap-1">
              {drawings.map((d) => (
                <label key={d.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/40 px-1 py-0.5 rounded text-xs">
                  <Checkbox
                    checked={(draft.dwgNumbers ?? []).includes(d.dwgNumber)}
                    onCheckedChange={(checked) => {
                      const current = draft.dwgNumbers ?? [];
                      onChange({
                        ...draft,
                        dwgNumbers: checked
                          ? [...current, d.dwgNumber]
                          : current.filter((n) => n !== d.dwgNumber),
                      });
                    }}
                  />
                  <span className="font-mono">{d.dwgNumber}</span>
                  {d.title && <span className="text-muted-foreground truncate">{d.title}</span>}
                </label>
              ))}
            </div>
          )}
          {(draft.dwgNumbers ?? []).length > 0 && (
            <p className="text-xs text-muted-foreground">{draft.dwgNumbers!.length} drawing(s) selected</p>
          )}
        </div>
      )}

      {draft.type === 'cable_family_match' && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Cable families</Label>
          <div className="flex flex-wrap gap-1.5">
            {CABLE_FAMILY_OPTIONS.map((opt) => {
              const selected = (draft.families ?? []).includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    const current = draft.families ?? [];
                    onChange({
                      ...draft,
                      families: selected
                        ? current.filter((f) => f !== opt.value)
                        : [...current, opt.value],
                    });
                  }}
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full border transition-colors',
                    selected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:border-foreground/40'
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Rule label (optional)</Label>
        <Input
          value={draft.label}
          onChange={(e) => onChange({ ...draft, label: e.target.value })}
          placeholder="Auto-generated"
          className="h-8 text-sm"
        />
      </div>
    </div>
  );
}

export function CreateCampaignDialog({ open, onClose, onCreated }: CreateCampaignDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [draftRules, setDraftRules] = useState<DraftRule[]>([]);
  const [addingType, setAddingType] = useState<RuleType | ''>('');
  const [preview, setPreview] = useState<PlantCampaignPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [drawings, setDrawings] = useState<PlantDrawing[]>([]);

  useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
      setDraftRules([]);
      setAddingType('');
      setPreview(null);
    } else {
      listDrawings().then(setDrawings);
    }
  }, [open]);

  const addRule = () => {
    if (!addingType) return;
    setDraftRules((prev) => [
      ...prev,
      { type: addingType, label: '', terms: '', codes: '', dwgNumbers: [], families: [] },
    ]);
    setAddingType('');
    setPreview(null);
  };

  const validRules = draftRules.map(draftToRule).filter(Boolean) as PlantCampaignRule[];

  const handlePreview = async () => {
    if (!validRules.length) return;
    setPreviewing(true);
    const result = await previewCampaignRules(validRules);
    setPreview(result);
    setPreviewing(false);
  };

  const handleSaveDraft = async () => {
    if (!name.trim() || !validRules.length) return;
    setSaving(true);
    const campaign = await createCampaign({ name: name.trim(), description: description.trim() || undefined, rules: validRules });
    if (campaign) {
      toast.success('Campaign saved as draft');
      onCreated?.(campaign.id);
      onClose();
    } else {
      toast.error('Failed to create campaign');
    }
    setSaving(false);
  };

  const handleCreateAndActivate = async () => {
    if (!name.trim() || !validRules.length) return;
    setActivating(true);
    const campaign = await createCampaign({ name: name.trim(), description: description.trim() || undefined, rules: validRules });
    if (!campaign) {
      toast.error('Failed to create campaign');
      setActivating(false);
      return;
    }
    const result = await activateCampaign(campaign.id);
    if (result) {
      toast.success(`Campaign activated — ${result.activated.toLocaleString()} cables marked for decommissioning`);
      onCreated?.(campaign.id);
      onClose();
    } else {
      toast.error('Campaign created but activation failed. You can activate it from the campaigns list.');
      onCreated?.(campaign.id);
      onClose();
    }
    setActivating(false);
  };

  const canSubmit = name.trim().length > 0 && validRules.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New cleanup campaign</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>Campaign name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Grass Valley decommission"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Bulk-decommission cables tied to GV/Miranda equipment…"
              rows={2}
              className="resize-none text-sm"
            />
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Rules</Label>
              <p className="text-xs text-muted-foreground">
                A cable matching <em>any</em> rule is included.
              </p>
            </div>

            {draftRules.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-3 border rounded-md">
                Add at least one rule to define which cables to target.
              </p>
            )}

            {draftRules.map((d, i) => (
              <RuleForm
                key={i}
                draft={d}
                drawings={drawings}
                onChange={(updated) =>
                  setDraftRules((prev) => prev.map((r, idx) => (idx === i ? updated : r)))
                }
                onRemove={() => {
                  setDraftRules((prev) => prev.filter((_, idx) => idx !== i));
                  setPreview(null);
                }}
              />
            ))}

            <div className="flex items-center gap-2">
              <Select value={addingType} onValueChange={(v) => setAddingType(v as RuleType)}>
                <SelectTrigger className="h-8 flex-1 text-sm">
                  <SelectValue placeholder="Select rule type…" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(RULE_TYPE_LABELS) as RuleType[]).map((t) => (
                    <SelectItem key={t} value={t}>{RULE_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8" onClick={addRule} disabled={!addingType}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
          </div>

          {validRules.length > 0 && (
            <>
              <Separator />
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handlePreview} disabled={previewing}>
                    {previewing
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Previewing…</>
                      : <><ChevronRight className="h-3.5 w-3.5 mr-1.5" /> Preview matches</>}
                  </Button>
                  <span className="text-xs text-muted-foreground">Dry run — no changes.</span>
                </div>

                {preview && (
                  <div className="rounded-md border p-3 flex flex-col gap-2 text-sm">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-semibold">{preview.totalMatched.toLocaleString()} cables</span>
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        {preview.highConfidence} high
                      </Badge>
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                        {preview.mediumConfidence} medium
                      </Badge>
                    </div>
                    {preview.ruleBreakdown.map((rb) => (
                      <div key={rb.ruleIndex} className="flex justify-between text-xs text-muted-foreground">
                        <span>Rule {rb.ruleIndex + 1}: {rb.label}</span>
                        <span className={cn(rb.matchCount > 0 ? 'text-foreground font-medium' : '')}>
                          {rb.matchCount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                    {preview.sampleCables.length > 0 && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Sample: {preview.sampleCables
                          .slice(0, 5)
                          .map((c) => c.cableNumber ?? `${c.originLocationCode ?? '?'}→${c.destLocationCode ?? '?'}`)
                          .join(', ')}
                        {preview.sampleCables.length > 5 && '…'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving || activating}>Cancel</Button>
          <Button variant="outline" onClick={handleSaveDraft} disabled={!canSubmit || saving || activating}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save draft
          </Button>
          <Button onClick={handleCreateAndActivate} disabled={!canSubmit || saving || activating}>
            {activating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Create &amp; activate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
