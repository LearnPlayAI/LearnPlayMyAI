import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { useBranding } from '@/contexts/BrandingContext';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Edit2, Trash2, Database, Settings, X, Image, ImageIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useToast } from "@/hooks/use-toast";

export default function AdminCollections() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { branding } = useBranding();
  const orgName = branding?.orgName || 'LearnPlay';

  const { data: collections, isLoading } = useQuery({
    queryKey: ["/api/admin/collections"],
    retry: false,
  });

  const createCollectionForm = useForm({
    defaultValues: {
      name: "",
      description: "",
      isActive: true,
      statTypes: [
        { statName: "", statUnit: "", displayOrder: 1 }
      ],
    },
  });

  const editCollectionForm = useForm({
    defaultValues: {
      name: "",
      description: "",
      isActive: true,
      statTypes: [
        { statName: "", statUnit: "", displayOrder: 1 }
      ],
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      return await apiRequest('/api/admin/collections', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/collections'] });
      setIsCreateDialogOpen(false);
      createCollectionForm.reset();
      toast({
        title: "Success",
        description: `Collection "${data.name}" created successfully!`,
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create collection. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await apiRequest(`/api/admin/collections/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/collections'] });
      setEditingCollection(null);
      editCollectionForm.reset();
      toast({
        title: "Success",
        description: `Collection "${data.name}" updated successfully!`,
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update collection. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      return await apiRequest(`/api/admin/collections/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/collections'] });
      toast({
        title: "Success",
        description: "Collection deleted successfully!",
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete collection. Please try again.",
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }) => {
      return await apiRequest(`/api/admin/collections/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive }),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/collections'] });
      toast({
        title: "Success",
        description: `Collection "${data.name}" is now ${data.isActive ? 'active' : 'inactive'}!`,
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update collection status. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCreate = (data) => {
    createMutation.mutate(data);
  };

  const handleEdit = async (collection) => {
    setEditingCollection(collection);
    
    // Fetch stat types for this collection
    try {
      const statTypes = await apiRequest(`/api/admin/collections/${collection.id}/stat-types`);
      editCollectionForm.reset({
        name: collection.name,
        description: collection.description || "",
        isActive: collection.isActive,
        statTypes: statTypes.length > 0 ? statTypes : [{ statName: "", statUnit: "", displayOrder: 1 }],
      });
    } catch (error) {
      console.error("Failed to fetch stat types:", error);
      editCollectionForm.reset({
        name: collection.name,
        description: collection.description || "",
        isActive: collection.isActive,
        statTypes: [{ statName: "", statUnit: "", displayOrder: 1 }],
      });
    }
  };

  const handleUpdate = (data) => {
    updateMutation.mutate({ id: editingCollection.id, data });
  };

  const handleDelete = (id) => {
    if (confirm("Are you sure you want to delete this collection? This action cannot be undone.")) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggleActive = (collection) => {
    toggleActiveMutation.mutate({ 
      id: collection.id, 
      isActive: !collection.isActive 
    });
  };

  // Stat types management helpers
  const addStatType = (form) => {
    const currentStatTypes = form.watch("statTypes");
    const newDisplayOrder = currentStatTypes.length + 1;
    form.setValue("statTypes", [
      ...currentStatTypes,
      { statName: "", statUnit: "", displayOrder: newDisplayOrder }
    ]);
  };

  const removeStatType = (form, index) => {
    const currentStatTypes = form.watch("statTypes");
    if (currentStatTypes.length > 1) {
      const updatedStatTypes = currentStatTypes.filter((_, i) => i !== index);
      // Update display orders
      const reorderedStatTypes = updatedStatTypes.map((stat, i) => ({
        ...stat,
        displayOrder: i + 1
      }));
      form.setValue("statTypes", reorderedStatTypes);
    }
  };

  // Collection cover image upload handlers
  const handleCollectionCoverImageUpload = async () => {
    if (!editingCollection) return Promise.reject("No collection selected");
    
    try {
      const response = await apiRequest(`/api/admin/collections/${editingCollection.id}/cover-image/upload-url`, {
        method: "POST",
      });
      return {
        method: "PUT",
        url: response.uploadURL,
      };
    } catch (error) {
      console.error("Error getting upload URL:", error);
      throw error;
    }
  };

  const handleCollectionCoverImageComplete = async (result) => {
    if (!editingCollection) return;
    
    // Check if any files were actually uploaded successfully
    if (!result.successful || result.successful.length === 0) {
      console.log("No files were uploaded successfully");
      return;
    }

    setIsUploading(true);
    try {
      // Call the backend to update the collection's image key
      await apiRequest(`/api/admin/collections/${editingCollection.id}/cover-image-uploaded`, {
        method: "POST",
      });


      // Refresh the collections data
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collections"] });
    } catch (error) {
      console.error("Error updating collection cover image:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const deleteCollectionCoverImageMutation = useMutation({
    mutationFn: async (collectionId) => {
      return await apiRequest(`/api/admin/collections/${collectionId}/cover-image`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collections"] });
    },
    onError: (error) => {
      console.error("Delete collection cover image error:", error);
    },
  });

  return (
    <QuizAdminLayout title="Quiz Collections" description="Manage quiz collections" activeSection="quiz-collections">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-border pb-6">
          <div>
            <h1 className="text-3xl font-bold bg-primary hover:bg-primary/90 bg-clip-text text-transparent">
              Collection Management
            </h1>
            <p className="text-muted-foreground mt-2">
              {`Create and manage card collections for the ${orgName} game`}
            </p>
          </div>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-collection">
                <Plus className="h-4 w-4 mr-2" />
                Create Collection
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border text-foreground w-[95vw] sm:w-full max-w-sm sm:max-w-md lg:max-w-xl xl:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Collection</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Add a new card collection to the game. Players will be able to play with cards from this collection.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={createCollectionForm.handleSubmit(handleCreate)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Collection Name</Label>
                  <Input
                    id="name"
                    {...createCollectionForm.register("name", { required: true })}
                    placeholder="e.g., Dinosaurs, Sports Cars, Superheroes"
                    className="bg-muted border-border text-foreground"
                    data-testid="input-collection-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    {...createCollectionForm.register("description")}
                    placeholder="Brief description of this collection..."
                    className="bg-muted border-border text-foreground"
                    data-testid="input-collection-description"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Total Cards</Label>
                  <div className="bg-muted border border-border px-3 py-2 rounded-md text-muted-foreground">
                    0 cards (will be calculated after creation)
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isActive"
                    checked={createCollectionForm.watch("isActive")}
                    onCheckedChange={(checked) => createCollectionForm.setValue("isActive", checked)}
                    data-testid="switch-is-active"
                  />
                  <Label htmlFor="isActive">Active Collection</Label>
                </div>

                {/* Stat Types Section */}
                <div className="space-y-4 border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-foreground">Card Statistics</h4>
                    <Button type="button" onClick={() => addStatType(createCollectionForm)}
                      variant="outline"
                      size="sm"
                      className="bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                      data-testid="button-add-stat-type"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Stat
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {createCollectionForm.watch("statTypes")?.map((_, index) => (
                      <div key={index} className="flex gap-2 items-end">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs">Stat Name</Label>
                          <Input
                            {...createCollectionForm.register(`statTypes.${index}.statName`, { required: true })}
                            placeholder="e.g., Height, Speed, Power"
                            className="bg-muted border-border text-foreground text-sm"
                            data-testid={`input-stat-name-${index}`}
                          />
                        </div>
                        <div className="w-24 space-y-1">
                          <Label className="text-xs">Unit</Label>
                          <Input
                            {...createCollectionForm.register(`statTypes.${index}.statUnit`)}
                            placeholder="kg, m, /10"
                            className="bg-muted border-border text-foreground text-sm"
                            data-testid={`input-stat-unit-${index}`}
                          />
                        </div>
                        <div className="w-16 space-y-1">
                          <Label className="text-xs">Order</Label>
                          <Input
                            type="number"
                            min="1"
                            {...createCollectionForm.register(`statTypes.${index}.displayOrder`, { required: true, valueAsNumber: true })}
                            className="bg-muted border-border text-foreground text-sm"
                            data-testid={`input-stat-order-${index}`}
                          />
                        </div>
                        {createCollectionForm.watch("statTypes").length > 1 && (
                          <Button type="button" onClick={() => removeStatType(createCollectionForm, index)}
                            variant="outline"
                            size="sm"
                            className="bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20 p-2"
                            data-testid={`button-remove-stat-${index}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Define the statistics that cards in this collection will have. Each card will need values for all these stats.
                  </p>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-collection" >
                    {createMutation.isPending ? "Creating..." : "Create Collection"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Collections Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Card key={i} className="bg-card border-border animate-pulse">
                <CardContent className="p-6">
                  <div className="h-6 bg-muted rounded mb-4"></div>
                  <div className="h-4 bg-muted rounded mb-2"></div>
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : collections && collections.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {collections.map((collection) => (
              <Card key={collection.id} className="bg-card border-border hover:border-primary/30 transition-all duration-300" data-testid={`collection-card-${collection.name.toLowerCase().replace(/\s+/g, '-')}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-foreground text-lg">{collection.name}</CardTitle>
                      <CardDescription className="text-muted-foreground mt-1">
                        {collection.description || "No description provided"}
                      </CardDescription>
                    </div>
                    <Badge variant={collection.isActive ? "default" : "secondary"} className={ collection.isActive ? "bg-primary/20 text-primary border-primary/30" : "bg-muted text-muted-foreground border-border" }>
                      {collection.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center text-muted-foreground">
                      <Database className="h-4 w-4 mr-2" />
                      <span className="text-sm">{collection.totalCards} cards</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Label htmlFor={`toggle-${collection.id}`} className="text-sm text-muted-foreground">
                        {collection.isActive ? "Active" : "Inactive"}
                      </Label>
                      <Switch
                        id={`toggle-${collection.id}`}
                        checked={collection.isActive}
                        onCheckedChange={() => handleToggleActive(collection)}
                        disabled={toggleActiveMutation.isPending}
                        data-testid={`switch-collection-active-${collection.name.toLowerCase().replace(/\s+/g, '-')}`}
                      />
                    </div>
                  </div>
                  
                  <div className="flex space-x-2">
                    <Button onClick={() => handleEdit(collection)}
                      variant="outline"
                      size="sm"
                      className="flex-1 bg-secondary/10 border-secondary/30 text-secondary hover:bg-secondary/20"
                      data-testid={`button-edit-${collection.name.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Edit2 className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button onClick={() => handleDelete(collection.id)}
                      variant="outline"
                      size="sm"
                      className="bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20"
                      data-testid={`button-delete-${collection.name.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="bg-card border-border">
            <CardContent className="text-center py-16">
              <Database className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No Collections Found</h3>
              <p className="text-muted-foreground mb-6">
                Create your first card collection to get started with the game.
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}
                className="bg-primary hover:bg-primary/90"
                data-testid="button-create-first-collection"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Collection
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Edit Collection Dialog */}
        <Dialog open={!!editingCollection} onOpenChange={(open) => !open && setEditingCollection(null)}>
          <DialogContent className="bg-card border-border text-foreground w-[95vw] sm:w-full max-w-sm sm:max-w-md lg:max-w-xl xl:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Collection</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Update the collection details.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={editCollectionForm.handleSubmit(handleUpdate)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Collection Name</Label>
                <Input
                  id="edit-name"
                  {...editCollectionForm.register("name", { required: true })}
                  className="bg-muted border-border text-foreground"
                  data-testid="input-edit-collection-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  {...editCollectionForm.register("description")}
                  className="bg-muted border-border text-foreground"
                  data-testid="input-edit-collection-description"
                />
              </div>
              <div className="space-y-2">
                <Label>Total Cards</Label>
                <div className="bg-muted border border-border px-3 py-2 rounded-md text-foreground font-medium">
                  {editingCollection?.totalCards || 0} cards
                  <span className="text-muted-foreground ml-2 text-sm">(automatically calculated)</span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-isActive"
                  checked={editCollectionForm.watch("isActive")}
                  onCheckedChange={(checked) => editCollectionForm.setValue("isActive", checked)}
                  data-testid="switch-edit-is-active"
                />
                <Label htmlFor="edit-isActive">Active Collection</Label>
              </div>

              {/* Collection Cover Image Section */}
              <div className="space-y-4 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-foreground">Collection Cover Image</h4>
                </div>
                
                {/* Current Image Display */}
                {editingCollection?.imageKey && (
                  <div className="space-y-3">
                    <div className="relative">
                      <img 
                        src={`/api/collections/${editingCollection.id}/cover-image`}
                        alt={`${editingCollection.name} cover`}
                        className="w-full h-48 object-cover rounded-lg border border-border"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                      <Button type="button" onClick={() => deleteCollectionCoverImageMutation.mutate(editingCollection.id)}
                        disabled={deleteCollectionCoverImageMutation.isPending}
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2 bg-destructive/80 hover:bg-destructive"
                        data-testid="button-delete-collection-cover-image"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Upload New Image */}
                <div className="space-y-2">
                  <ObjectUploader
                    maxNumberOfFiles={1}
                    maxFileSize={10485760} // 10MB
                    onGetUploadParameters={handleCollectionCoverImageUpload}
                    onComplete={handleCollectionCoverImageComplete}
                    buttonClassName="w-full bg-primary hover:bg-primary/90 text-foreground"
                  >
                    <div className="flex items-center justify-center gap-2 py-2">
                      <ImageIcon className="h-4 w-4" />
                      <span>{editingCollection?.imageKey ? 'Replace Cover Image' : 'Upload Cover Image'}</span>
                    </div>
                  </ObjectUploader>
                  <p className="text-xs text-muted-foreground">
                    Upload a cover image for this collection. Maximum file size: 10MB. Recommended size: 800x600px.
                  </p>
                </div>
              </div>

              {/* Stat Types Section */}
              <div className="space-y-4 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-foreground">Card Statistics</h4>
                  <Button type="button" onClick={() => addStatType(editCollectionForm)}
                    variant="outline"
                    size="sm"
                    className="bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                    data-testid="button-edit-add-stat-type"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Stat
                  </Button>
                </div>
                <div className="space-y-3">
                  {editCollectionForm.watch("statTypes")?.map((_, index) => (
                    <div key={index} className="flex gap-2 items-end">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Stat Name</Label>
                        <Input
                          {...editCollectionForm.register(`statTypes.${index}.statName`, { required: true })}
                          placeholder="e.g., Height, Speed, Power"
                          className="bg-muted border-border text-foreground text-sm"
                          data-testid={`input-edit-stat-name-${index}`}
                        />
                      </div>
                      <div className="w-24 space-y-1">
                        <Label className="text-xs">Unit</Label>
                        <Input
                          {...editCollectionForm.register(`statTypes.${index}.statUnit`)}
                          placeholder="kg, m, /10"
                          className="bg-muted border-border text-foreground text-sm"
                          data-testid={`input-edit-stat-unit-${index}`}
                        />
                      </div>
                      <div className="w-16 space-y-1">
                        <Label className="text-xs">Order</Label>
                        <Input
                          type="number"
                          min="1"
                          {...editCollectionForm.register(`statTypes.${index}.displayOrder`, { required: true, valueAsNumber: true })}
                          className="bg-muted border-border text-foreground text-sm"
                          data-testid={`input-edit-stat-order-${index}`}
                        />
                      </div>
                      {editCollectionForm.watch("statTypes").length > 1 && (
                        <Button type="button" onClick={() => removeStatType(editCollectionForm, index)}
                          variant="outline"
                          size="sm"
                          className="bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20 p-2"
                          data-testid={`button-edit-remove-stat-${index}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Update the statistics that cards in this collection will have. Changes will apply to new cards added to this collection.
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingCollection(null)}
                  className="border-border text-muted-foreground"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-update-collection" >
                  {updateMutation.isPending ? "Updating..." : "Update Collection"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </QuizAdminLayout>
  );
}
