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
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PlantCampaignRule, PlantCampaignPreview } from '@/types/plant';
import {
  createCampaign,
  previewCampaignRules,
  activateCampaign,
} from '@/lib/plantService';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CreateCampaignDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (campaignId: string) => void;
}

type RuleType = 'system_name_match' | 'location_code_match';

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  system_name_match:   'Device name contains…',
  location_code_match: 'Location code matches…',
};

interface DraftRule {
  type: RuleType;
  label: string;
  // system_name_match
  terms?: string;          // comma-separated input
  // location_code_match
  codes?: string;          // comma-separated input
}

function draftToRule(d: DraftRule): PlantCampaignRule | null {
  if (d.type === 'system_name_match') {
    const terms = (d.terms ?? '').split(',').map((t) => t.trim()).filter(Boolean);
    if (!terms.length) return null;
    return {
      type: 'system_name_match',
      label: d.label || terms.join(', '),
      terms,
      fields: ['origin_device', 'dest_device'],
    };
  }
  if (d.type === 'location_code_match') {
    const codes = (d.codes ?? '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
    if (!codes.length) return null;
    return {
      type: 'location_code_match',
      label: d.label || codes.join(', '),
      codes,
    };
  }
  return null;
}

function RuleForm({
  draft,
  onChange,
  onRemove,
}: {
  draft: DraftRule;
  onChange: (d: DraftRule) => void;
  onRemove: () => void;
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
            placeholder="GV, TRINIX, Miranda, Apex"
            className="h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Matches cables where origin <em>or</em> destination device contains any of these strings.
          </p>
        </div>
      )}
      {draft.type === 'location_code_match' && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Location codes (comma-separated)</Label>
          <Input
            value={draft.codes ?? ''}
            onChange={(e) => onChange({ ...draft, codes: e.target.value })}
            placeholder="TRINIX, APEX, TK14"
            className="h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Matches cables where origin <em>or</em> destination location code is in this list.
          </p>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Rule label (optional)</Label>
        <Input
          value={draft.label}
          onChange={(e) => onChange({ ...draft, label: e.target.value })}
          placeholder="Auto-generated from terms"
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

  useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
      setDraftRules([]);
      setAddingType('');
      setPreview(null);
    }
  }, [open]);

  const addRule = () => {
    if (!addingType) return;
    setDraftRules((prev) => [
      ...prev,
      { type: addingType, label: '', terms: '', codes: '' },
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
      toast.error('Campaign created but activation failed. You can activate from the campaigns list.');
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
          {/* Name */}
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

          {/* Rules */}
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

          {/* Preview */}
          {validRules.length > 0 && (
            <>
              <Separator />
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreview}
                    disabled={previewing}
                  >
                    {previewing
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Previewing…</>
                      : <><ChevronRight className="h-3.5 w-3.5 mr-1.5" /> Preview matches</>}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Counts cables that would be targeted (dry run, no changes).
                  </span>
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
          <Button variant="outline" onClick={onClose} disabled={saving || activating}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={!canSubmit || saving || activating}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save draft
          </Button>
          <Button
            onClick={handleCreateAndActivate}
            disabled={!canSubmit || saving || activating}
          >
            {activating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Create &amp; activate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
