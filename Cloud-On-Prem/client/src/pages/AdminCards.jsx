import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { ObjectUploader } from "@/components/ObjectUploader";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Edit2, Trash2, ImageIcon, Upload } from "lucide-react";
import { useForm } from "react-hook-form";
import { formatStatValue } from '../../../shared/gameUtils.ts';

export default function AdminCards() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [selectedCollection, setSelectedCollection] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: collections, isLoading: collectionsLoading } = useQuery({
    queryKey: ["/api/admin/collections"],
    retry: false,
  });

  const { data: cards, isLoading: cardsLoading } = useQuery({
    queryKey: ["/api/admin/collections", selectedCollection, "cards"],
    enabled: !!selectedCollection,
    retry: false,
  });

  const { data: statTypes, isLoading: statTypesLoading } = useQuery({
    queryKey: ["/api/admin/collections", selectedCollection, "stat-types"],
    enabled: !!selectedCollection,
    retry: false,
  });

  const createCardForm = useForm({
    defaultValues: {
      name: "",
      displayOrder: 1,
    },
  });

  const editCardForm = useForm({
    defaultValues: {
      name: "",
      displayOrder: 1,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      return await apiRequest(`/api/admin/collections/${selectedCollection}/cards`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/collections', selectedCollection, 'cards'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/collections'] });
      setIsCreateDialogOpen(false);
      createCardForm.reset();
      toast({
        title: "Success",
        description: `Card "${data.name}" created successfully!`,
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create card. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await apiRequest(`/api/admin/cards/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/collections', selectedCollection, 'cards'] });
      setEditingCard(null);
      editCardForm.reset();
      toast({
        title: "Success",
        description: `Card "${data.name}" updated successfully!`,
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update card. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      return await apiRequest(`/api/admin/cards/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/collections', selectedCollection, 'cards'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/collections'] });
      toast({
        title: "Success",
        description: "Card deleted successfully!",
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete card. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteImageMutation = useMutation({
    mutationFn: async (cardId) => {
      return await apiRequest(`/api/admin/cards/${cardId}/image`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/collections', selectedCollection, 'cards'] });
      toast({
        title: "Success",
        description: "Card image deleted successfully!",
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete card image. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCreate = (data) => {
    createMutation.mutate(data);
  };

  const handleEdit = (card) => {
    setEditingCard(card);
    const formData = {
      name: card.name,
      displayOrder: card.displayOrder,
    };
    
    // Add current stat values to form data
    if (card.stats && statTypes) {
      statTypes.forEach(statType => {
        const existingStat = card.stats.find(s => s.statTypeId === statType.id);
        formData[`stat_${statType.id}`] = existingStat ? formatStatValue(existingStat.value) : '';
      });
    }
    
    editCardForm.reset(formData);
  };

  const handleUpdate = (data) => {
    // Extract stats from form data
    const stats = [];
    const cardData = { ...data };
    
    if (statTypes) {
      statTypes.forEach(statType => {
        const statKey = `stat_${statType.id}`;
        if (data[statKey]) {
          stats.push({
            statTypeId: statType.id,
            value: data[statKey]
          });
        }
        // Remove stat fields from card data
        delete cardData[statKey];
      });
    }
    
    updateMutation.mutate({ 
      id: editingCard.id, 
      data: { ...cardData, stats }
    });
  };

  const handleDelete = (id) => {
    if (confirm("Are you sure you want to delete this card? This action cannot be undone.")) {
      deleteMutation.mutate(id);
    }
  };

  const handleDeleteImage = (cardId) => {
    if (confirm("Are you sure you want to delete this card's image? This action cannot be undone.")) {
      deleteImageMutation.mutate(cardId);
    }
  };

  const selectedCollectionData = collections?.find(c => c.id === selectedCollection);

  const handleImageUpload = async (card) => {
    try {
      const response = await apiRequest(`/api/admin/cards/${card.id}/image-upload-url`, {
        method: 'POST',
        body: JSON.stringify({
          collectionName: selectedCollectionData?.name,
          cardName: card.name,
        }),
      });
      
      return {
        method: "PUT",
        url: response.uploadUrl,
      };
    } catch (error) {
      throw error;
    }
  };

  const handleImageUploadComplete = (card) => {
    return async (result) => {
      try {
        // Get the uploaded file info
        const uploadedFile = result.successful[0];
        if (!uploadedFile) {
          throw new Error("No file uploaded");
        }

        console.log("Attempting to update card image record:", {
          cardId: card.id,
          collectionName: selectedCollectionData?.name,
          cardName: card.name
        });

        // Update the card's image key in the database
        const response = await apiRequest(`/api/admin/cards/${card.id}/image-uploaded`, {
          method: 'POST',
          body: JSON.stringify({
            collectionName: selectedCollectionData?.name,
            cardName: card.name,
          }),
        });

        console.log("Image update response:", response);

        
        // Refresh the cards data to show the updated image
        queryClient.invalidateQueries({ queryKey: ['/api/admin/collections', selectedCollection, 'cards'] });
      } catch (error) {
        console.error("Upload completion error:", error);
        console.error("Error details:", error.message, error.stack);
      }
    };
  };

  return (
    <QuizAdminLayout title="Quiz Cards" description="Manage quiz cards within collections" activeSection="quiz-cards">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-border pb-6">
          <div>
            <h1 className="text-3xl font-bold bg-primary hover:bg-primary/90 bg-clip-text text-transparent">
              Card Management
            </h1>
            <p className="text-muted-foreground mt-2">
              Create and manage individual cards within collections
            </p>
          </div>
          
          {selectedCollection && (
            <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
              setIsCreateDialogOpen(open);
              if (open) {
                // Calculate next display order when dialog opens
                const nextDisplayOrder = cards && cards.length > 0 
                  ? Math.max(...cards.map(card => card.displayOrder)) + 1 
                  : 1;
                createCardForm.reset({
                  name: "",
                  displayOrder: nextDisplayOrder,
                });
              }
            }}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-card">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Card
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border text-foreground">
                <DialogHeader>
                  <DialogTitle>Create New Card</DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    Add a new card to the {selectedCollectionData?.name} collection.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={createCardForm.handleSubmit(handleCreate)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Card Name</Label>
                    <Input
                      id="name"
                      {...createCardForm.register("name", { required: true })}
                      placeholder="e.g., T-Rex, Lamborghini, Superman"
                      className="bg-muted border-border text-foreground"
                      data-testid="input-card-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="displayOrder">Display Order</Label>
                    <Input
                      id="displayOrder"
                      type="number"
                      min="1"
                      {...createCardForm.register("displayOrder", { required: true, valueAsNumber: true })}
                      className="bg-muted border-border text-foreground"
                      data-testid="input-display-order"
                      placeholder={`Next available: ${cards && cards.length > 0 ? Math.max(...cards.map(card => card.displayOrder)) + 1 : 1}`}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-card" >
                      {createMutation.isPending ? "Creating..." : "Create Card"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Collection Selector */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center">
              <ImageIcon className="h-5 w-5 mr-2 text-primary" />
              Select Collection
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Choose a collection to manage its cards
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedCollection} onValueChange={setSelectedCollection} data-testid="select-collection">
              <SelectTrigger className="bg-muted border-border text-foreground">
                <SelectValue placeholder="Select a collection..." />
              </SelectTrigger>
              <SelectContent className="bg-muted border-border">
                {collections?.map((collection) => (
                  <SelectItem key={collection.id} value={collection.id}>
                    {collection.name} ({collection.totalCards} cards)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Cards Grid */}
        {selectedCollection && (
          <div>
            {cardsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                  <Card key={i} className="bg-card border-border animate-pulse">
                    <CardContent className="p-6">
                      <div className="h-6 bg-muted rounded mb-4"></div>
                      <div className="h-4 bg-muted rounded mb-2"></div>
                      <div className="h-8 bg-muted rounded"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : cards && cards.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {cards.map((card) => (
                  <Card key={card.id} className="bg-card border-border hover:border-primary/30 transition-all duration-300" data-testid={`card-${card.name.toLowerCase().replace(/\s+/g, '-')}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-foreground text-lg">{card.name}</CardTitle>
                          <CardDescription className="text-muted-foreground mt-1">
                            Order: {card.displayOrder}
                          </CardDescription>
                        </div>
                        <Badge variant="outline" >
                          #{card.displayOrder}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {/* Card Image Preview */}
                      <div className="mb-4 h-32 bg-muted/50 rounded-lg flex items-center justify-center border border-border">
                        {card.imageKey ? (
                          <img 
                            src={`/api/cards/image/${selectedCollectionData?.name}/${card.name}`}
                            alt={card.name}
                            className="h-full w-full object-contain rounded-lg"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div className={`flex flex-col items-center text-muted-foreground ${card.imageKey ? 'hidden' : 'flex'}`}>
                          <ImageIcon className="h-8 w-8 mb-2" />
                          <span className="text-xs">No image</span>
                        </div>
                      </div>

                      {/* Card Stats Display */}
                      {card.stats && card.stats.length > 0 && (
                        <div className="mb-4 space-y-2">
                          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stats</h4>
                          <div className="grid grid-cols-2 gap-2">
                            {card.stats.map((stat) => (
                              <div key={stat.id} className="bg-muted/50 rounded px-2 py-1">
                                <div className="text-xs text-muted-foreground">{stat.statName}</div>
                                <div className="text-sm text-foreground font-medium">
                                  {formatStatValue(stat.value)}{stat.statUnit && ` ${stat.statUnit}`}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="space-y-2">
                        <div className="flex space-x-2">
                          <Button onClick={() => handleEdit(card)}
                            variant="outline"
                            size="sm"
                            className="flex-1 bg-secondary/10 border-secondary/30 text-secondary hover:bg-secondary/20"
                            data-testid={`button-edit-card-${card.name.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            <Edit2 className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button onClick={() => handleDelete(card.id)}
                            variant="outline"
                            size="sm"
                            className="bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20"
                            data-testid={`button-delete-card-${card.name.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        
                        <div className="flex space-x-2">
                          <ObjectUploader
                            maxNumberOfFiles={1}
                            maxFileSize={104857600} // 100MB - allow large original files, they'll be resized automatically
                            onGetUploadParameters={() => handleImageUpload(card)}
                            onComplete={handleImageUploadComplete(card)}
                            buttonClassName="flex-1 bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                          >
                            <Upload className="h-3 w-3 mr-1" />
                            Upload Image
                          </ObjectUploader>
                          
                          {card.imageKey && (
                            <Button onClick={() => handleDeleteImage(card.id)}
                              variant="outline"
                              size="sm"
                              disabled={deleteImageMutation.isPending}
                              className="bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20"
                              data-testid={`button-delete-image-${card.name.toLowerCase().replace(/\s+/g, '-')}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bg-card border-border">
                <CardContent className="text-center py-16">
                  <ImageIcon className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-xl font-semibold text-foreground mb-2">No Cards Found</h3>
                  <p className="text-muted-foreground mb-6">
                    This collection doesn't have any cards yet. Create your first card to get started.
                  </p>
                  <Button onClick={() => setIsCreateDialogOpen(true)}
                    className="bg-primary hover:bg-primary/90"
                    data-testid="button-create-first-card"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Card
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {!selectedCollection && (
          <Card className="bg-card border-border">
            <CardContent className="text-center py-16">
              <ImageIcon className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">Select a Collection</h3>
              <p className="text-muted-foreground">
                Choose a collection from the dropdown above to start managing its cards.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Edit Card Dialog */}
        <Dialog open={!!editingCard} onOpenChange={(open) => !open && setEditingCard(null)}>
          <DialogContent className="bg-card border-border text-foreground w-[95vw] sm:w-full max-w-sm sm:max-w-md lg:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>Edit Card</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Update the card details and statistics.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto pr-2">
              <form id="edit-card-form" onSubmit={editCardForm.handleSubmit(handleUpdate)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Card Name</Label>
                <Input
                  id="edit-name"
                  {...editCardForm.register("name", { required: true })}
                  className="bg-muted border-border text-foreground"
                  data-testid="input-edit-card-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-displayOrder">Display Order</Label>
                <Input
                  id="edit-displayOrder"
                  type="number"
                  min="1"
                  {...editCardForm.register("displayOrder", { required: true, valueAsNumber: true })}
                  className="bg-muted border-border text-foreground"
                  data-testid="input-edit-display-order"
                />
              </div>

              {/* Stat Fields */}
              {statTypes && statTypes.length > 0 && (
                <div className="space-y-4 border-t border-border pt-4">
                  <h4 className="text-sm font-medium text-foreground">Card Statistics</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {statTypes.map((statType) => (
                      <div key={statType.id} className="space-y-2">
                        <Label htmlFor={`edit-stat-${statType.id}`} className="text-xs font-medium">
                          {statType.statName}
                          {statType.statUnit && (
                            <span className="text-muted-foreground ml-1">({statType.statUnit})</span>
                          )}
                        </Label>
                        <Input
                          id={`edit-stat-${statType.id}`}
                          type="number"
                          step="0.001"
                          placeholder={`Enter ${statType.statName.toLowerCase()}`}
                          {...editCardForm.register(`stat_${statType.id}`, {
                            setValueAs: (value) => {
                              // Handle both comma and period as decimal separators
                              if (typeof value === 'string') {
                                return value.replace(',', '.');
                              }
                              return value;
                            }
                          })}
                          className="bg-muted border-border text-foreground text-sm"
                          data-testid={`input-edit-stat-${statType.statName.toLowerCase().replace(/\s+/g, '-')}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              </form>
            </div>
            <DialogFooter className="flex-shrink-0 border-t border-border pt-4 mt-4">
              <Button type="button" variant="outline" onClick={() => setEditingCard(null)}
                className="border-border text-muted-foreground"
              >
                Cancel
              </Button>
              <Button type="submit" form="edit-card-form" disabled={updateMutation.isPending} data-testid="button-update-card" >
                {updateMutation.isPending ? "Updating..." : "Update Card"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </QuizAdminLayout>
  );
}
