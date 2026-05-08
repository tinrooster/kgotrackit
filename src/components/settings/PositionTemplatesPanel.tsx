import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  createPositionTemplate,
  deletePositionTemplate,
  getPositionTemplates,
  POSITION_TEMPLATES_UPDATED_EVENT,
  reorderPositionTemplates,
  updatePositionTemplate,
} from '@/lib/positionTemplatesService';
import { PositionTemplate } from '@/types/productions';

interface PositionTemplatesPanelProps {
  canDeleteItems?: boolean;
}

export function PositionTemplatesPanel({ canDeleteItems = true }: PositionTemplatesPanelProps) {
  const [templates, setTemplates] = useState<PositionTemplate[]>(() => getPositionTemplates());
  const [newLabel, setNewLabel] = useState('');
  const [newDefaultRoleTag, setNewDefaultRoleTag] = useState('');
  const [newDefaultLocation, setNewDefaultLocation] = useState('');

  useEffect(() => {
    const refresh = () => setTemplates(getPositionTemplates());
    window.addEventListener(POSITION_TEMPLATES_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(POSITION_TEMPLATES_UPDATED_EVENT, refresh);
  }, []);

  const orderedTemplates = useMemo(
    () => [...templates].sort((left, right) => left.sortOrder - right.sortOrder),
    [templates],
  );

  const createTemplate = () => {
    const template = createPositionTemplate({
      label: newLabel,
      defaultRoleTag: newDefaultRoleTag,
      defaultLocation: newDefaultLocation,
    });
    if (!template) return;
    setNewLabel('');
    setNewDefaultRoleTag('');
    setNewDefaultLocation('');
  };

  const shiftTemplate = (templateId: string, direction: -1 | 1) => {
    const index = orderedTemplates.findIndex((template) => template.id === templateId);
    if (index < 0) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= orderedTemplates.length) return;
    const reordered = [...orderedTemplates];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(nextIndex, 0, moved);
    reorderPositionTemplates(reordered.map((template) => template.id));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crew position templates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Shared position labels for crew assignments. In Supabase team mode these are stored per active organization
          and sync with the org library; open them from Organization when you are setting up the master org.
        </p>
        <div className="grid gap-2 sm:grid-cols-4">
          <Input
            placeholder="Label (e.g. Anchor Cam)"
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
          />
          <Input
            placeholder="Default role"
            value={newDefaultRoleTag}
            onChange={(event) => setNewDefaultRoleTag(event.target.value)}
          />
          <Input
            placeholder="Default location"
            value={newDefaultLocation}
            onChange={(event) => setNewDefaultLocation(event.target.value)}
          />
          <Button type="button" className="gap-1" onClick={createTemplate} disabled={!newLabel.trim()}>
            <Plus className="h-4 w-4" />
            Add template
          </Button>
        </div>

        <div className="space-y-2">
          {orderedTemplates.map((template, index) => (
            <div key={template.id} className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Input
                value={template.label}
                onChange={(event) => updatePositionTemplate(template.id, { label: event.target.value })}
              />
              <Input
                placeholder="Default role"
                value={template.defaultRoleTag ?? ''}
                onChange={(event) =>
                  updatePositionTemplate(template.id, { defaultRoleTag: event.target.value })
                }
              />
              <Input
                placeholder="Default location"
                value={template.defaultLocation ?? ''}
                onChange={(event) =>
                  updatePositionTemplate(template.id, { defaultLocation: event.target.value })
                }
              />
              <div className="flex items-center justify-end gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  disabled={index === 0}
                  onClick={() => shiftTemplate(template.id, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  disabled={index === orderedTemplates.length - 1}
                  onClick={() => shiftTemplate(template.id, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  disabled={!canDeleteItems}
                  onClick={() => deletePositionTemplate(template.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          {orderedTemplates.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No position templates yet.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
