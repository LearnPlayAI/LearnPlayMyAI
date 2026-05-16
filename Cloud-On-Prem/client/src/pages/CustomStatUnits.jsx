import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Plus, ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

export default function CustomStatUnits() {
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    unitName: "",
    unitSymbol: "",
    description: "",
    category: "",
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all universal stat units (predefined + custom)
  const { data: allUnits = [], isLoading: allUnitsLoading } = useQuery({
    queryKey: ["/api/universal-stat-units"],
  });

  // Fetch user's custom stat units
  const { data: customUnits = [], isLoading: customUnitsLoading } = useQuery({
    queryKey: ["/api/custom-stat-units"],
  });

  // Create custom stat unit mutation
  const createUnitMutation = useMutation({
    mutationFn: (unitData) => apiRequest("/api/custom-stat-units", "POST", unitData),
    onSuccess: () => {
      toast({
        title: "Custom Unit Created",
        description: "Your custom stat unit has been created successfully.",
      });
      setIsCreating(false);
      setFormData({ unitName: "", unitSymbol: "", description: "", category: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/universal-stat-units"] });
      queryClient.invalidateQueries({ queryKey: ["/api/custom-stat-units"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create custom stat unit.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.unitName || !formData.unitSymbol) {
      toast({
        title: "Validation Error",
        description: "Unit name and symbol are required.",
        variant: "destructive",
      });
      return;
    }
    createUnitMutation.mutate(formData);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const predefinedCategories = [
    "weight", "temperature", "speed", "atomic", "length", "time", 
    "volume", "pressure", "energy", "power", "other"
  ];

  // Group units by category
  const groupedUnits = allUnits.reduce((acc, unit) => {
    const category = unit.category || "other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(unit);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/profile">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ChevronLeft className="h-4 w-4" />
              Back to Profile
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Custom Stat Units</h1>
            <p className="text-muted-foreground mt-2">
              Create and manage your own custom stat unit types for use across all card collections.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Create New Unit Section */}
          <div>
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Create Custom Unit
                </CardTitle>
                <CardDescription>
                  Add a new stat unit type that you can use in any collection.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!isCreating ? (
                  <Button onClick={() => setIsCreating(true)} 
                    className="w-full"
                    data-testid="button-create-unit"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Unit
                  </Button>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="unitName" className="text-muted-foreground">Unit Name</Label>
                      <Input
                        id="unitName"
                        value={formData.unitName}
                        onChange={(e) => handleInputChange("unitName", e.target.value)}
                        placeholder="e.g., kilometers per hour"
                        className="bg-muted border-border text-foreground"
                        data-testid="input-unit-name"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="unitSymbol" className="text-muted-foreground">Unit Symbol</Label>
                      <Input
                        id="unitSymbol"
                        value={formData.unitSymbol}
                        onChange={(e) => handleInputChange("unitSymbol", e.target.value)}
                        placeholder="e.g., km/h"
                        className="bg-muted border-border text-foreground"
                        data-testid="input-unit-symbol"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="category" className="text-muted-foreground">Category</Label>
                      <Select onValueChange={(value) => handleInputChange("category", value)} data-testid="select-category">
                        <SelectTrigger className="bg-muted border-border text-foreground">
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                        <SelectContent>
                          {predefinedCategories.map((category) => (
                            <SelectItem key={category} value={category}>
                              {category.charAt(0).toUpperCase() + category.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label htmlFor="description" className="text-muted-foreground">Description (Optional)</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => handleInputChange("description", e.target.value)}
                        placeholder="Describe what this unit measures..."
                        className="bg-muted border-border text-foreground"
                        data-testid="textarea-description"
                      />
                    </div>
                    
                    <div className="flex gap-2">
                      <Button type="submit" disabled={createUnitMutation.isPending} data-testid="button-submit-unit" >
                        {createUnitMutation.isPending ? "Creating..." : "Create Unit"}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setIsCreating(false)}
                        data-testid="button-cancel"
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>

            {/* Your Custom Units */}
            <Card className="bg-card border-border mt-6">
              <CardHeader>
                <CardTitle className="text-foreground">Your Custom Units</CardTitle>
                <CardDescription>
                  Units you've created ({customUnits.length})
                </CardDescription>
              </CardHeader>
              <CardContent>
                {customUnitsLoading ? (
                  <p className="text-muted-foreground">Loading your custom units...</p>
                ) : customUnits.length === 0 ? (
                  <p className="text-muted-foreground">You haven't created any custom units yet.</p>
                ) : (
                  <div className="space-y-2">
                    {customUnits.map((unit) => (
                      <div 
                        key={unit.id} 
                        className="flex items-center justify-between p-3 bg-muted rounded-lg"
                        data-testid={`custom-unit-${unit.id}`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{unit.unitName}</span>
                            <Badge variant="secondary" className="text-xs">{unit.unitSymbol}</Badge>
                          </div>
                          {unit.description && (
                            <p className="text-sm text-muted-foreground mt-1">{unit.description}</p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {unit.category}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* All Available Units */}
          <div>
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">All Available Units</CardTitle>
                <CardDescription>
                  Predefined and custom stat units available for use ({allUnits.length} total)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {allUnitsLoading ? (
                  <p className="text-muted-foreground">Loading units...</p>
                ) : (
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {Object.entries(groupedUnits).map(([category, units]) => (
                      <div key={category}>
                        <h3 className="text-sm font-semibold text-muted-foreground mb-2 capitalize">
                          {category} ({units.length})
                        </h3>
                        <div className="grid grid-cols-1 gap-2 mb-4">
                          {units.map((unit) => (
                            <div 
                              key={unit.id} 
                              className="flex items-center justify-between p-2 bg-muted rounded"
                              data-testid={`unit-${unit.id}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-foreground text-sm">{unit.unitName}</span>
                                <Badge variant="secondary" className="text-xs">{unit.unitSymbol}</Badge>
                              </div>
                              <div className="flex items-center gap-1">
                                {unit.isPredefined ? (
                                  <Badge variant="default" className="text-xs">System</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs">Custom</Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {Object.keys(groupedUnits).indexOf(category) < Object.keys(groupedUnits).length - 1 && (
                          <Separator className="bg-border" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}