import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Trash2, GripVertical, Plus, Save, X, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
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

interface SortableItemProps {
  item: ItemWithSubcategories;
  onEdit: (id: string, newValue: string) => void;
  onEditColor?: (id: string, newColor: string) => void;
  onDelete: (id: string) => void;
  onAddSubcategory: (id: string, subcategory: string) => void;
  onEditSubcategory: (id: string, oldValue: string, newValue: string) => void;
  onDeleteSubcategory: (id: string, subcategory: string) => void;
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
  onDelete, 
  onAddSubcategory, 
  onEditSubcategory,
  onDeleteSubcategory,
  showColorPicker = false,
  enableSubcategories = true,
}: SortableItemProps & { enableSubcategories?: boolean; showColorPicker?: boolean }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.name);
  const [newSubcategory, setNewSubcategory] = useState('');
  const [editingSubcategory, setEditingSubcategory] = useState<string | null>(null);
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
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="space-y-2">
      <div className="flex justify-between items-center p-2 rounded-md border bg-card text-card-foreground">
        <div className="flex items-center flex-1">
          <button {...attributes} {...listeners} className="p-1 mr-2 cursor-grab active:cursor-grabbing">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
          {isEditing ? (
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              className="h-8"
              autoFocus
            />
          ) : (
            <div className="flex items-center gap-2">
              {showColorPicker && (
                <span
                  className="h-3 w-3 rounded-full border border-border"
                  style={{ backgroundColor: getFallbackColor(item) }}
                  aria-hidden="true"
                />
              )}
              <span>{item.name}</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {showColorPicker && onEditColor && (
            <Input
              type="color"
              value={getFallbackColor(item)}
              onChange={(e) => onEditColor(item.id, e.target.value)}
              className="h-8 w-10 p-1"
              title="Category color"
              aria-label={`Category color for ${item.name}`}
            />
          )}
          <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)} className="text-muted-foreground hover:text-foreground">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {enableSubcategories && (
        <div className="pl-8 space-y-2">
          <div className="flex space-x-2">
            <Input
              type="text"
              className="flex-1"
              placeholder="Add subcategory"
              value={newSubcategory}
              onChange={(e) => setNewSubcategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddSubcategory();
                }
              }}
            />
            <Button 
              onClick={handleAddSubcategory}
              variant="outline"
              className="border-border"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>

          {item.children?.map((child) => (
            <div key={child.name} className="flex justify-between items-center p-2 rounded-md border bg-background text-foreground">
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
                  className="h-8"
                  autoFocus
                />
              ) : (
                <>
                  <span>{child.name}</span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingSubcategory(child.name)} className="text-muted-foreground hover:text-foreground">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => onDeleteSubcategory(item.id, child.name)} 
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
  enableSubcategories?: boolean;
  showColorPicker?: boolean;
  onCheckBeforeDelete?: (value: string, onSafeToDelete: () => void) => void;
}

export function EditableItemWithSubcategoriesList({
  items,
  setItems,
  title,
  description,
  enableSubcategories = true,
  showColorPicker = false,
  onCheckBeforeDelete,
}: EditableItemWithSubcategoriesListProps) {
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
    const input = document.querySelector(`input[placeholder="Add new ${title.toLowerCase().slice(0, -1)}"]`) as HTMLInputElement;
    if (input && input.value.trim()) {
      const newItem: ItemWithSubcategories = {
        id: Date.now().toString(),
        name: input.value.trim(),
        ...(showColorPicker ? { color: DEFAULT_CATEGORY_COLORS[items.length % DEFAULT_CATEGORY_COLORS.length] } : {}),
        children: [],
      };
      setItems([...items, newItem]);
      input.value = '';
    }
  };

  const handleEditItem = (id: string, newValue: string) => {
    const newItems = items.map((item) => 
      item.id === id ? { ...item, name: newValue } : item
    );
    setItems(newItems);
  };

  const handleDeleteItem = (id: string) => {
    const itemToDelete = items.find(item => item.id === id);
    if (itemToDelete && onCheckBeforeDelete) {
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

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-foreground">{title}</h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>

      <div className="flex space-x-2">
        <Input
          type="text"
          className="flex-1"
          placeholder={`Add new ${title.toLowerCase().slice(0, -1)}`}
          onKeyDown={handleKeyDown}
        />
        <Button 
          onClick={handleAddItem}
          className="border-border"
          variant="outline"
        >
          <Plus className="h-4 w-4 mr-2" />
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
                onDelete={handleDeleteItem}
                onAddSubcategory={handleAddSubcategory}
                onEditSubcategory={handleEditSubcategory}
                onDeleteSubcategory={handleDeleteSubcategory}
                enableSubcategories={enableSubcategories}
                showColorPicker={showColorPicker}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
} 