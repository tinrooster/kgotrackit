import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ItemTemplate } from '@/types/templates';
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DraggableDialogContent } from "@/components/ui/draggable-dialog";
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
import { useToast } from "@/components/ui/use-toast";
import { TemplateForm } from '@/components/TemplateForm';
import { useNavigate } from 'react-router-dom';
import { getTemplates, saveTemplates, getSettings, SETTINGS_UPDATED_EVENT } from '@/lib/storageService';
import { v4 as uuidv4 } from 'uuid';
import { AddItemDialog } from '@/components/AddItemDialog';
import { useInventory } from "@/hooks/useInventory";
import { cn } from "@/lib/utils";
import { TemplatesSortableList } from "@/components/settings/TemplatesSortableList";
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { canViewMaintenanceWindowCautions } from '@/lib/maintenanceCutoverCaution';

export function TemplatesPage() {
  const [templates, setTemplates] = useState<ItemTemplate[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isAddItemDialogOpen, setIsAddItemDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ItemTemplate | null>(null);
  const [pendingDeleteTemplateId, setPendingDeleteTemplateId] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { items: existingItems } = useInventory();
  const { authBackend, currentUser } = useAuth();
  const { activeWorkspaceId, activeWorkspaceRole } = useWorkspace();
  const showMaintenanceCutoverCautions = canViewMaintenanceWindowCautions({
    authBackend,
    activeWorkspaceId,
    activeWorkspaceRole,
    appUserRole: currentUser?.role,
  });

  const [settings, setSettings] = useState(() => getSettings());
  const { categories, units, locations, suppliers, projects } = settings;

  // Load templates on component mount
  useEffect(() => {
    try {
      const loadedTemplates = getTemplates();
      setTemplates(loadedTemplates);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast({
        title: "Error",
        description: "Failed to load templates",
        variant: "destructive",
      });
    }
  }, []);

  useEffect(() => {
    const reloadSettings = () => setSettings(getSettings());
    reloadSettings();
    window.addEventListener(SETTINGS_UPDATED_EVENT, reloadSettings);
    window.addEventListener('focus', reloadSettings);
    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, reloadSettings);
      window.removeEventListener('focus', reloadSettings);
    };
  }, []);

  const handleCreateTemplate = () => {
    setSelectedTemplate(null);
    setIsCreateDialogOpen(true);
  };

  const handleEditTemplate = (template: ItemTemplate) => {
    setSelectedTemplate(template);
    setIsCreateDialogOpen(true);
  };

  const confirmDeleteTemplate = () => {
    if (!pendingDeleteTemplateId) {
      return;
    }
    const templateId = pendingDeleteTemplateId;
    try {
      const newTemplates = templates.filter(t => t.templateId !== templateId);
      saveTemplates(newTemplates);
      setTemplates(newTemplates);
      toast({
        title: "Template Deleted",
        description: "The template has been successfully deleted.",
      });
    } catch (error) {
      console.error('Error deleting template:', error);
      toast({
        title: "Error",
        description: "Failed to delete template",
        variant: "destructive",
      });
    } finally {
      setPendingDeleteTemplateId(null);
    }
  };

  const handleUseTemplate = (template: ItemTemplate) => {
    setSelectedTemplate(template);
    setIsAddItemDialogOpen(true);
  };

  const handleAddItem = async (newItemData: any) => {
    try {
      // Navigate to inventory page after successful addition
      navigate('/inventory', { state: { newItem: newItemData } });
    } catch (error) {
      console.error('Error adding item:', error);
      toast({
        title: "Error",
        description: "Failed to add item",
        variant: "destructive",
      });
    }
  };

  const handleSubmitTemplate = (templateData: ItemTemplate) => {
    try {
      let newTemplates: ItemTemplate[];
      
      if (selectedTemplate) {
        // Update existing template
        newTemplates = templates.map(t => 
          t.templateId === templateData.templateId ? templateData : t
        );
      } else {
        // Add new template with generated ID
        const newTemplate = {
          ...templateData,
          templateId: uuidv4(),
        };
        newTemplates = [...templates, newTemplate];
      }

      // Save to storage and update state
      saveTemplates(newTemplates);
      setTemplates(newTemplates);
      setIsCreateDialogOpen(false);

      toast({
        title: selectedTemplate ? "Template Updated" : "Template Created",
        description: `Template has been ${selectedTemplate ? 'updated' : 'created'} successfully.`,
      });
    } catch (error) {
      console.error('Error saving template:', error);
      toast({
        title: "Error",
        description: "Failed to save template",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Item Templates</h1>
        </div>
        <Button onClick={handleCreateTemplate} variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Create Template
        </Button>
      </div>

      <TemplatesSortableList
        templates={templates}
        onTemplatesOrderChange={setTemplates}
        onEdit={handleEditTemplate}
        onRequestDelete={(id) => setPendingDeleteTemplateId(id)}
        onUseTemplate={handleUseTemplate}
      />

      <AlertDialog open={pendingDeleteTemplateId !== null} onOpenChange={(open) => !open && setPendingDeleteTemplateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the template
              {pendingDeleteTemplateId
                ? ` "${templates.find((t) => t.templateId === pendingDeleteTemplateId)?.templateName ?? ''}"`
                : ''}{' '}
              permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={confirmDeleteTemplate}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} modal={false}>
        <DraggableDialogContent
          showOverlay={false}
          className={cn(
            "w-[min(calc(100vw-1rem),900px)] gap-0 p-0",
            "h-[min(92vh,820px)]",
          )}
          minWidth={360}
          minHeight={300}
        >
          <div className="shrink-0 border-b px-6 pb-4 pt-6">
            <DialogHeader className="space-y-2 p-0 text-left">
              <DialogTitle>
                {selectedTemplate ? "Edit Template" : "Create Template"}
              </DialogTitle>
              <DialogDescription>
                Fill in the template details below. Templates can be used to quickly create new inventory items.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <TemplateForm
              template={selectedTemplate || undefined}
              onSubmit={handleSubmitTemplate}
              onCancel={() => setIsCreateDialogOpen(false)}
              categories={categories}
              units={units}
              locations={locations}
              suppliers={suppliers}
              projects={projects}
              showMaintenanceCutoverCautions={showMaintenanceCutoverCautions}
            />
          </div>
        </DraggableDialogContent>
      </Dialog>

      {/* Render AddItemDialog outside of other dialogs */}
      {selectedTemplate && (
        <AddItemDialog
          open={isAddItemDialogOpen}
          onOpenChange={setIsAddItemDialogOpen}
          onSubmit={handleAddItem}
          categories={categories}
          units={units}
          locations={locations}
          suppliers={suppliers}
          projects={projects}
          selectedTemplate={selectedTemplate}
          existingItems={existingItems}
          showMaintenanceCutoverCautions={showMaintenanceCutoverCautions}
        />
      )}
    </div>
  );
} 
