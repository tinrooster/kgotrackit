import * as React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ItemTemplate } from '@/types/templates';
import { saveTemplates } from '@/lib/storageService';

function SortableTemplateRow({
  template,
  onRename,
  onEdit,
  onDelete,
  onUseTemplate,
}: {
  template: ItemTemplate;
  onRename: (templateId: string, nextName: string) => void;
  onEdit: (t: ItemTemplate) => void;
  onDelete: (templateId: string) => void;
  onUseTemplate: (t: ItemTemplate) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: template.templateId,
  });
  const [editing, setEditing] = React.useState(false);
  const [draftName, setDraftName] = React.useState(template.templateName);

  React.useEffect(() => {
    if (!editing) {
      setDraftName(template.templateName);
    }
  }, [template.templateName, editing]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const commitName = () => {
    const next = draftName.trim();
    if (next && next !== template.templateName) {
      onRename(template.templateId, next);
    } else {
      setDraftName(template.templateName);
    }
    setEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex flex-col gap-2 rounded-md border border-border/80 bg-muted/30 p-2.5 text-sm shadow-sm sm:flex-row sm:items-center sm:gap-2',
        isDragging && 'opacity-60',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <button
          type="button"
          className="mt-0.5 shrink-0 cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          {editing ? (
            <Input
              autoFocus
              className="h-9 font-medium"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitName();
                }
                if (e.key === 'Escape') {
                  setDraftName(template.templateName);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="block w-full truncate text-left font-medium text-foreground hover:underline"
              title="Click to rename"
              onClick={() => setEditing(true)}
            >
              {template.templateName}
            </button>
          )}
          <p className="truncate text-xs text-muted-foreground">{template.category || '—'}</p>
          {template.description ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground/90">{template.description}</p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-1.5 sm:flex-nowrap">
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => onUseTemplate(template)}>
          <Copy className="h-3.5 w-3.5" />
          Use template
        </Button>
        <Button type="button" variant="ghost" size="icon" title="Edit" onClick={() => onEdit(template)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          title="Delete"
          onClick={() => onDelete(template.templateId)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface TemplatesSortableListProps {
  templates: ItemTemplate[];
  onTemplatesOrderChange: (next: ItemTemplate[]) => void;
  onEdit: (t: ItemTemplate) => void;
  onRequestDelete: (templateId: string) => void;
  onUseTemplate: (t: ItemTemplate) => void;
}

export function TemplatesSortableList({
  templates,
  onTemplatesOrderChange,
  onEdit,
  onRequestDelete,
  onUseTemplate,
}: TemplatesSortableListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = templates.findIndex((t) => t.templateId === active.id);
    const newIndex = templates.findIndex((t) => t.templateId === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    const next = arrayMove(templates, oldIndex, newIndex);
    saveTemplates(next);
    onTemplatesOrderChange(next);
  };

  const handleRename = (templateId: string, nextName: string) => {
    const next = templates.map((t) =>
      t.templateId === templateId ? { ...t, templateName: nextName } : t,
    );
    saveTemplates(next);
    onTemplatesOrderChange(next);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Drag the handle to reorder. Click the template name to rename. Use template opens the add-item flow with this
        template applied.
      </p>
      {templates.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No templates yet. Create one with the button above.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={templates.map((t) => t.templateId)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {templates.map((template) => (
                <SortableTemplateRow
                  key={template.templateId}
                  template={template}
                  onRename={handleRename}
                  onEdit={onEdit}
                  onDelete={onRequestDelete}
                  onUseTemplate={onUseTemplate}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
