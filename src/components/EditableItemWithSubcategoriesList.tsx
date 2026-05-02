import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Pencil, Trash2, GripVertical, Plus, ChevronDown, ChevronRight } from 'lucide-react';
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
import { ItemWithSubcategories } from '@/types/inventory';

function singularFormForListTitle(title: string): string {
  const lower = title.trim().toLowerCase();
  const irregular: Record<string, string> = {
    categories: 'category',
    suppliers: 'supplier',
    units: 'unit',
    locations: 'location',
    projects: 'project',
  };
  if (irregular[lower]) {
    return irregular[lower];
  }
  if (lower.endsWith('ies')) {
    return `${lower.slice(0, -3)}y`;
  }
  if (lower.endsWith('s') && lower.length > 1) {
    return lower.slice(0, -1);
  }
  return lower;
}

interface SortableItemProps {
  item: ItemWithSubcategories;
  onEdit: (id: string, newValue: string) => void;
  onEditColor?: (id: string, newColor: string) => void;
  onRequestDeleteParent: (id: string) => void;
  onAddSubcategory: (id: string, subcategory: string) => void;
  onEditSubcategory: (id: string, oldValue: string, newValue: string) => void;
  onRequestDeleteSubcategory: (id: string, subcategory: string) => void;
}

const DEFAULT_CATEGORY_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#14b8a6',
];

const getFallbackColor = (item: ItemWithSubcategories) => {
  if (item.color) return item.color;
  const hashBase = (item.name || item.id || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return DEFAULT_CATEGORY_COLORS[hashBase % DEFAULT_CATEGORY_COLORS.length];
};

function SortableItem({
  item,
  onEdit,
  onEditColor,
  onRequestDeleteParent,
  onAddSubcategory,
  onEditSubcategory,
  onRequestDeleteSubcategory,
  showColorPicker = false,
  enableSubcategories = true,
  colorPickerLabel = 'Category color',
}: SortableItemProps & {
  enableSubcategories?: boolean;
  showColorPicker?: boolean;
  colorPickerLabel?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.name);
  const [newSubcategory, setNewSubcategory] = useState('');
  const [subAddOpen, setSubAddOpen] = useState(false);
  const [editingSubcategory, setEditingSubcategory] = useState<string | null>(null);
  const [subsExpanded, setSubsExpanded] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSave = () => {
    if (editValue.trim() !== item.name) {
      onEdit(item.id, editValue.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(item.name);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleAddSubcategory = () => {
    if (newSubcategory.trim()) {
      onAddSubcategory(item.id, newSubcategory.trim());
      setNewSubcategory('');
      setSubAddOpen(false);
      setSubsExpanded(true);
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="space-y-2">
      <div className="flex justify-between items-center gap-2 rounded-md border border-border/80 bg-muted/30 p-2 font-medium text-foreground shadow-sm">
        <div className="flex min-w-0 flex-1 items-center">
          <button {...attributes} {...listeners} className="mr-2 shrink-0 cursor-grab p-1 active:cursor-grabbing">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
          {enableSubcategories && (item.children?.length ?? 0) > 0 ? (
            <button
              type="button"
              className="mr-1 shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setSubsExpanded((v) => !v)}
              aria-expanded={subsExpanded}
              aria-label={subsExpanded ? 'Collapse subcategories' : 'Expand subcategories'}
            >
              {subsExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : (
            <span className="mr-1 w-7 shrink-0" aria-hidden />
          )}
          {isEditing ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className="h-8 min-w-0 flex-1 basis-[8rem]"
                autoFocus
              />
              {showColorPicker && onEditColor && (
                <Input
                  type="color"
                  value={getFallbackColor(item)}
                  onChange={(e) => onEditColor(item.id, e.target.value)}
                  className="h-8 w-12 shrink-0 p-1"
                  title={colorPickerLabel}
                  aria-label={`${colorPickerLabel} for ${item.name}`}
                />
              )}
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {showColorPicker && (
                <span
                  className="h-3 w-3 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: getFallbackColor(item) }}
                  aria-hidden="true"
                />
              )}
              <span className="truncate">{item.name}</span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRequestDeleteParent(item.id)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          {enableSubcategories && (
            <Popover
              open={subAddOpen}
              onOpenChange={(open) => {
                setSubAddOpen(open);
                if (!open) setNewSubcategory('');
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                  title="Add subcategory"
                  aria-label={`Add subcategory under ${item.name}`}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(100vw-2rem,20rem)] p-3" align="end">
                <div className="space-y-2">
                  <Input
                    type="text"
                    placeholder="Subcategory name"
                    value={newSubcategory}
                    onChange={(e) => setNewSubcategory(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSubcategory();
                      }
                    }}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setSubAddOpen(false); setNewSubcategory(''); }}>
                      Cancel
                    </Button>
                    <Button type="button" size="sm" onClick={handleAddSubcategory}>
                      Add
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {enableSubcategories && subsExpanded && (item.children?.length ?? 0) > 0 && (
        <div className="ml-1 space-y-1 border-l-2 border-primary/30 pl-3 sm:ml-2 sm:pl-4">
          {item.children?.map((child) => (
            <div
              key={child.name}
              className="flex min-w-0 items-center justify-between gap-2 rounded-r-md border border-border/60 border-l-transparent bg-muted/15 py-1.5 pl-2 pr-2 text-sm text-muted-foreground"
            >
              {editingSubcategory === child.name ? (
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => {
                    if (editValue.trim() !== child.name) {
                      onEditSubcategory(item.id, child.name, editValue.trim());
                    }
                    setEditingSubcategory(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (editValue.trim() !== child.name) {
                        onEditSubcategory(item.id, child.name, editValue.trim());
                      }
                      setEditingSubcategory(null);
                    } else if (e.key === 'Escape') {
                      setEditingSubcategory(null);
                    }
                  }}
                  className="h-8 min-w-0 flex-1"
                  autoFocus
                />
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate italic">{child.name}</span>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditValue(child.name);
                        setEditingSubcategory(child.name);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRequestDeleteSubcategory(item.id, child.name)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface EditableItemWithSubcategoriesListProps {
  items: ItemWithSubcategories[];
  setItems: (items: ItemWithSubcategories[]) => void;
  title: string;
  description?: string;
  /** Hide the built-in H3 title when the parent card already shows the same heading. */
  hideListTitle?: boolean;
  enableSubcategories?: boolean;
  showColorPicker?: boolean;
  /** Accessible label for the color input when `showColorPicker` is on. */
  colorPickerLabel?: string;
  onCheckBeforeDelete?: (value: string, onSafeToDelete: () => void) => void;
}

type DeleteTarget =
  | null
  | { kind: 'parent'; id: string }
  | { kind: 'sub'; parentId: string; subName: string };

export function EditableItemWithSubcategoriesList({
  items,
  setItems,
  title,
  description,
  hideListTitle = false,
  enableSubcategories = true,
  showColorPicker = false,
  colorPickerLabel = 'Category color',
  onCheckBeforeDelete,
}: EditableItemWithSubcategoriesListProps) {
  const addInputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const addPlaceholder = `Add new ${singularFormForListTitle(title)}`;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      setItems(arrayMove(items, oldIndex, newIndex));
    }
  };

  const handleAddItem = () => {
    const value = addInputRef.current?.value?.trim();
    if (!value) {
      return;
    }
    const newItem: ItemWithSubcategories = {
      id: Date.now().toString(),
      name: value,
      ...(showColorPicker ? { color: DEFAULT_CATEGORY_COLORS[items.length % DEFAULT_CATEGORY_COLORS.length] } : {}),
      children: [],
    };
    setItems([...items, newItem]);
    if (addInputRef.current) {
      addInputRef.current.value = '';
    }
  };

  const handleEditItem = (id: string, newValue: string) => {
    const newItems = items.map((item) =>
      item.id === id ? { ...item, name: newValue } : item
    );
    setItems(newItems);
  };

  const runParentDelete = (id: string) => {
    const itemToDelete = items.find((item) => item.id === id);
    if (!itemToDelete) {
      return;
    }
    if (onCheckBeforeDelete) {
      onCheckBeforeDelete(itemToDelete.name, () => {
        setItems(items.filter((item) => item.id !== id));
      });
    } else {
      setItems(items.filter((item) => item.id !== id));
    }
  };

  const handleEditColor = (id: string, newColor: string) => {
    const newItems = items.map((item) =>
      item.id === id ? { ...item, color: newColor } : item
    );
    setItems(newItems);
  };

  const handleAddSubcategory = (id: string, subcategoryName: string) => {
    const newItems = items.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          children: [...(item.children || []), {
            id: Date.now().toString(),
            name: subcategoryName
          }],
        };
      }
      return item;
    });
    setItems(newItems);
  };

  const handleEditSubcategory = (id: string, oldValue: string, newValue: string) => {
    const newItems = items.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          children: item.children?.map((child) =>
            child.name === oldValue ? { ...child, name: newValue } : child
          ),
        };
      }
      return item;
    });
    setItems(newItems);
  };

  const handleDeleteSubcategory = (id: string, subcategoryName: string) => {
    const newItems = items.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          children: item.children?.filter((child) => child.name !== subcategoryName),
        };
      }
      return item;
    });
    setItems(newItems);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddItem();
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) {
      return;
    }
    if (deleteTarget.kind === 'parent') {
      runParentDelete(deleteTarget.id);
    } else {
      handleDeleteSubcategory(deleteTarget.parentId, deleteTarget.subName);
    }
    setDeleteTarget(null);
  };

  const parentLabel =
    deleteTarget?.kind === 'parent'
      ? items.find((i) => i.id === deleteTarget.id)?.name
      : deleteTarget?.kind === 'sub'
        ? deleteTarget.subName
        : '';

  return (
    <div className="space-y-4">
      {!hideListTitle && (
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium text-foreground">{title}</h3>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
      )}

      <div className="flex min-w-0 gap-2">
        <Input
          ref={addInputRef}
          type="text"
          className="min-w-0 flex-1"
          placeholder={addPlaceholder}
          onKeyDown={handleKeyDown}
          aria-label={addPlaceholder}
        />
        <Button
          type="button"
          onClick={handleAddItem}
          className="shrink-0 border-border"
          variant="outline"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((item) => (
              <SortableItem
                key={item.id}
                item={item}
                onEdit={handleEditItem}
                onEditColor={handleEditColor}
                onRequestDeleteParent={(id) => setDeleteTarget({ kind: 'parent', id })}
                onAddSubcategory={handleAddSubcategory}
                onEditSubcategory={handleEditSubcategory}
                onRequestDeleteSubcategory={(parentId, subName) =>
                  setDeleteTarget({ kind: 'sub', parentId, subName })
                }
                enableSubcategories={enableSubcategories}
                showColorPicker={showColorPicker}
                colorPickerLabel={colorPickerLabel}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.kind === 'sub' ? 'subcategory' : 'entry'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes &quot;{parentLabel}&quot; from the list. This cannot be undone from here (use app Undo where available).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
