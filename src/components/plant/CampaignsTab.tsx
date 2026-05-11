import { useCallback, useEffect, useState } from 'react';
import { Plus, ChevronDown, ChevronRight, Loader2, CheckCheck, XCircle } from 'lucide-react';
import {
  listCampaigns,
  getCampaignItems,
  updateCampaignItemReview,
  activateCampaign,
  completeCampaign,
  deleteCampaign,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_COLOURS,
  REVIEW_STATUS_LABELS,
} from '@/lib/plantService';
import type {
  PlantCleanupCampaign,
  PlantCampaignItem,
  PlantCampaignItemReviewStatus,
} from '@/types/plant';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { CreateCampaignDialog } from './CreateCampaignDialog';

const REVIEW_OPTIONS: PlantCampaignItemReviewStatus[] = [
  'pending', 'confirmed_dead', 'repurposed', 'needs_check', 'cleared',
];

const REVIEW_COLOURS: Record<PlantCampaignItemReviewStatus, string> = {
  pending:        'bg-muted text-muted-foreground',
  confirmed_dead: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  repurposed:     'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  needs_check:    'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  cleared:        'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
};

function CampaignItemRow({ item, onStatusChange }: {
  item: PlantCampaignItem;
  onStatusChange: (status: PlantCampaignItemReviewStatus) => void;
}) {
  const c = item.cable;
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors text-sm">
      <td className="px-3 py-2 font-mono text-xs">
        {c?.cableNumber ?? <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-3 py-2 text-xs max-w-[160px]">
        <span className="block truncate text-muted-foreground">{c?.originLocationCode}</span>
        <span className="block truncate">{c?.originDevice}</span>
      </td>
      <td className="px-3 py-2 text-xs max-w-[160px]">
        <span className="block truncate text-muted-foreground">{c?.destLocationCode}</span>
        <span className="block truncate">{c?.destDevice}</span>
      </td>
      <td className="px-3 py-2">
        <Badge className={cn('text-xs', item.confidence === 'high'
          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
        )}>
          {item.confidence}
        </Badge>
      </td>
      <td className="px-3 py-2">
        <Select
          value={item.reviewStatus}
          onValueChange={(v) => onStatusChange(v as PlantCampaignItemReviewStatus)}
        >
          <SelectTrigger className={cn('h-7 text-xs border-0 p-1 w-[130px]', REVIEW_COLOURS[item.reviewStatus])}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REVIEW_OPTIONS.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">{REVIEW_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
    </tr>
  );
}

function CampaignDetail({ campaign, onCampaignUpdated }: {
  campaign: PlantCleanupCampaign;
  onCampaignUpdated: () => void;
}) {
  const [items, setItems] = useState<PlantCampaignItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const PAGE_SIZE = 50;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    const result = await getCampaignItems(campaign.id, p, PAGE_SIZE);
    setItems(result.items);
    setTotal(result.total);
    setLoading(false);
  }, [campaign.id]);

  useEffect(() => { void load(0); }, [load]);

  const handleItemReview = async (item: PlantCampaignItem, status: PlantCampaignItemReviewStatus) => {
    const ok = await updateCampaignItemReview(item.id, status);
    if (ok) {
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, reviewStatus: status } : i));
    } else {
      toast.error('Failed to update review status');
    }
  };

  const handleActivate = async () => {
    setActivating(true);
    const result = await activateCampaign(campaign.id);
    if (result) {
      toast.success(`Activated — ${result.activated.toLocaleString()} cables marked for decommissioning`);
      onCampaignUpdated();
      await load(0);
    } else {
      toast.error('Activation failed');
    }
    setActivating(false);
  };

  const handleComplete = async () => {
    setCompleting(true);
    const ok = await completeCampaign(campaign.id);
    if (ok) {
      toast.success('Campaign completed');
      onCampaignUpdated();
    } else {
      toast.error('Failed to complete campaign');
    }
    setCompleting(false);
  };

  const handleDelete = async (force = false) => {
    const warn = force
      ? `Force-delete "${campaign.name}"? This will remove the campaign record but cables it touched will keep their current status — you may need to reset them manually.`
      : `Delete draft campaign "${campaign.name}"?`;
    if (!confirm(warn)) return;
    setDeleting(true);
    const ok = await deleteCampaign(campaign.id, force);
    if (ok) {
      toast.success('Campaign deleted');
      onCampaignUpdated();
    } else {
      toast.error('Failed to delete campaign');
    }
    setDeleting(false);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-3 pt-1">
      {/* Campaign meta */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {campaign.matchedCount != null && (
          <>
            <span className="text-muted-foreground">{campaign.matchedCount.toLocaleString()} cables</span>
            {campaign.highCount != null && (
              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-xs">
                {campaign.highCount} high
              </Badge>
            )}
            {campaign.mediumCount != null && (
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">
                {campaign.mediumCount} medium
              </Badge>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {campaign.status === 'draft' && (
            <Button size="sm" variant="outline" onClick={handleActivate} disabled={activating}>
              {activating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Activate
            </Button>
          )}
          {campaign.status === 'active' && (
            <Button size="sm" variant="outline" onClick={handleComplete} disabled={completing}>
              {completing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              <CheckCheck className="h-3.5 w-3.5 mr-1.5" /> Mark complete
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleDelete(campaign.status !== 'draft')}
            disabled={deleting}
            className="text-destructive hover:text-destructive"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Delete
          </Button>
        </div>
      </div>

      {/* Rules summary */}
      {campaign.rules.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {campaign.rules.map((rule, i) => (
            <span key={i} className="text-xs bg-muted rounded px-2 py-0.5">
              {rule.label || rule.type}
            </span>
          ))}
        </div>
      )}

      {/* Items table */}
      {campaign.status === 'draft' && total === 0 && !loading && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Activate the campaign to populate the cable list.
        </p>
      )}

      {(campaign.status !== 'draft' || total > 0) && (
        <>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Cable #</th>
                  <th className="px-3 py-2 font-medium">Origin</th>
                  <th className="px-3 py-2 font-medium">Destination</th>
                  <th className="px-3 py-2 font-medium">Confidence</th>
                  <th className="px-3 py-2 font-medium">Review</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                    </td>
                  </tr>
                )}
                {!loading && items.map((item) => (
                  <CampaignItemRow
                    key={item.id}
                    item={item}
                    onStatusChange={(status) => handleItemReview(item, status)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{total.toLocaleString()} items</span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" disabled={page === 0}
                  onClick={() => { setPage(p => p - 1); void load(page - 1); }}>
                  Previous
                </Button>
                <span>{page + 1} / {totalPages}</span>
                <Button variant="ghost" size="sm" disabled={page >= totalPages - 1}
                  onClick={() => { setPage(p => p + 1); void load(page + 1); }}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<PlantCleanupCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setCampaigns(await listCampaigns());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {campaigns.length === 0
            ? 'No campaigns yet.'
            : `${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''}`}
        </p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> New campaign
        </Button>
      </div>

      {campaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3 border rounded-lg">
          <XCircle className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm max-w-sm">
            Campaigns let you bulk-decommission cables by system, location, or drawing.
            Create one to start the Grass Valley cleanup.
          </p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Create first campaign
          </Button>
        </div>
      )}

      {campaigns.map((campaign) => (
        <div key={campaign.id} className="border rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
            onClick={() => setExpanded(expanded === campaign.id ? null : campaign.id)}
          >
            {expanded === campaign.id
              ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{campaign.name}</span>
                <Badge className={cn('text-xs', CAMPAIGN_STATUS_COLOURS[campaign.status])}>
                  {CAMPAIGN_STATUS_LABELS[campaign.status]}
                </Badge>
                {campaign.matchedCount != null && (
                  <span className="text-xs text-muted-foreground">
                    {campaign.matchedCount.toLocaleString()} cables
                  </span>
                )}
              </div>
              {campaign.description && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{campaign.description}</p>
              )}
            </div>
            <span className="text-xs text-muted-foreground shrink-0 ml-2">
              {new Date(campaign.createdAt).toLocaleDateString()}
            </span>
          </button>

          {expanded === campaign.id && (
            <div className="border-t px-4 pb-4 pt-3">
              <CampaignDetail
                campaign={campaign}
                onCampaignUpdated={() => {
                  void load();
                  setExpanded(null);
                }}
              />
            </div>
          )}
        </div>
      ))}

      <CreateCampaignDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(id) => {
          void load();
          setExpanded(id);
        }}
      />
    </div>
  );
}
