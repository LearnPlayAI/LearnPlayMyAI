import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Plus, Settings, Check, Sparkles, Edit, Trash2, AlertTriangle, Image, Type, Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AIModel {
  name: string;
  displayName: string;
  capabilities: string[];
}

interface ModelsResponse {
  models: AIModel[];
  source: 'api' | 'gemini_api' | 'error' | 'no_config';
  message?: string;
  error?: string;
}

function getModelCapabilityLabel(capabilities: string[]): string {
  const hasText = capabilities.includes('text');
  const hasImage = capabilities.includes('image');
  
  if (hasText && hasImage) return '(Text + Image)';
  if (hasImage) return '(Image)';
  if (hasText) return '(Text)';
  return '';
}

function getDefaultModelForPurpose(purpose: string, availableModels: AIModel[]): string {
  if (purpose === 'image') {
    const imageModel = availableModels.find(m => 
      m.capabilities.includes('image') && m.name.toLowerCase().startsWith('gemini')
    );
    return imageModel?.name || 'gemini-2.0-flash-exp';
  } else {
    const textModel = availableModels.find(m => 
      m.capabilities.includes('text') && m.name.toLowerCase().startsWith('gemini')
    );
    return textModel?.name || 'gemini-2.5-flash';
  }
}

export default function AISettings() {
  const { toast } = useToast();
  const { onpremMode } = usePlatformMode();
  const [createDialog, setCreateDialog] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [editingConfig, setEditingConfig] = useState<any>(null);
  const [formData, setFormData] = useState({
    provider: 'gemini',
    apiKey: '__managed_in_integration_settings__',
    modelName: '',
    purpose: 'text',
  });

  const { data: configs = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/ai/config'],
  });

  const { data: modelsData, isLoading: isLoadingModels, isError: isModelsError } = useQuery<ModelsResponse>({
    queryKey: ['/api/ai/models'],
    retry: false,
  });

  const availableModels = modelsData?.models || [];
  const modelsError = modelsData?.error;
  const modelsMessage = modelsData?.message;
  const modelsSource = modelsData?.source;
  const hasModelCatalog = availableModels.length > 0;

  const isModelValidForSubmission = (modelName: string) => {
    if (!modelName?.trim()) return false;
    if (!hasModelCatalog) return true;
    return availableModels.some(m => m.name === modelName);
  };

  useEffect(() => {
    if (availableModels.length > 0 && !formData.modelName) {
      const defaultModel = getDefaultModelForPurpose(formData.purpose, availableModels);
      setFormData(prev => ({ ...prev, modelName: defaultModel }));
    }
  }, [availableModels, formData.purpose]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/ai/config', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai/config'] });
      setCreateDialog(false);
      setFormData({
        provider: 'gemini',
        apiKey: '__managed_in_integration_settings__',
        modelName: '',
        purpose: 'text',
      });
      toast({
        title: 'AI Configuration Created',
        description: 'Your AI settings have been saved successfully.',
      });
    },
    onError: (error: any) => {
      const errorMsg = error.message || 'Failed to create AI configuration';
      const isConflict = errorMsg.includes('Only one active config per purpose');
      toast({
        title: isConflict ? 'Configuration Conflict' : 'Error',
        description: isConflict 
          ? `${errorMsg} You can either deactivate the existing config or create this one as inactive.`
          : errorMsg,
        variant: 'destructive',
      });
    },
  });

  const testAIMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/ai/test', {
        method: 'POST',
        body: JSON.stringify({ topic: "Math" }),
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: 'AI Test Successful!',
        description: data.message || 'AI connection is working properly.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'AI Test Failed',
        description: error.message || 'Could not connect to AI service',
        variant: 'destructive',
      });
    },
  });

  const setActiveMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/ai/config/${id}/activate`, {
        method: 'PATCH',
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai/config'] });
      const purposeLabel = data?.purpose === 'image' ? 'Image Generation' : 'Text Generation';
      toast({
        title: 'Configuration Activated',
        description: `The ${purposeLabel} configuration is now active.`,
      });
    },
    onError: (error: any) => {
      const errorMsg = error.message || 'Failed to activate configuration';
      toast({
        title: 'Activation Failed',
        description: errorMsg,
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest(`/api/ai/config/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai/config'] });
      setEditDialog(false);
      setEditingConfig(null);
      setFormData({
        provider: 'gemini',
        apiKey: '__managed_in_integration_settings__',
        modelName: '',
        purpose: 'text',
      });
      toast({
        title: 'Configuration Updated',
        description: 'AI settings have been updated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update configuration',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/ai/config/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai/config'] });
      toast({
        title: 'Configuration Deleted',
        description: 'AI configuration has been removed.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete configuration',
        variant: 'destructive',
      });
    },
  });

  const handleCreate = () => {
    if (!formData.modelName) {
      toast({
        title: 'Missing Information',
        description: 'Please select a model.',
        variant: 'destructive',
      });
      return;
    }
    
    const modelExists = availableModels.some(m => m.name === formData.modelName);
    if (!modelExists && hasModelCatalog) {
      toast({
        title: 'Invalid Model',
        description: `Model "${formData.modelName}" is not in the available models list. Please select a valid model.`,
        variant: 'destructive',
      });
      return;
    }
    
    createMutation.mutate(formData);
  };

  const handleEdit = (config: any) => {
    setEditingConfig(config);
    setFormData({
      provider: config.provider,
      apiKey: '__managed_in_integration_settings__',
      modelName: config.modelName,
      purpose: config.purpose || 'text',
    });
    setEditDialog(true);
  };

  const handleUpdate = () => {
    if (!formData.modelName) {
      toast({
        title: 'Missing Information',
        description: 'Please select a model.',
        variant: 'destructive',
      });
      return;
    }
    
    const modelExists = availableModels.some(m => m.name === formData.modelName);
    if (!modelExists && hasModelCatalog) {
      toast({
        title: 'Invalid Model',
        description: `Model "${formData.modelName}" is not in the available models list. Please select a valid model.`,
        variant: 'destructive',
      });
      return;
    }
    
    updateMutation.mutate({ id: editingConfig.id, data: formData });
  };

  const handleDelete = (config: any) => {
    if (config.isActive) {
      toast({
        title: 'Cannot Delete',
        description: 'Cannot delete the active configuration. Please activate another configuration first.',
        variant: 'destructive',
      });
      return;
    }
    
    if (confirm(`Are you sure you want to delete the ${config.modelName} configuration?`)) {
      deleteMutation.mutate(config.id);
    }
  };

  const activeTextConfig = configs.find(c => c.isActive && c.purpose === 'text');
  const activeImageConfig = configs.find(c => c.isActive && c.purpose === 'image');

  return (
    <QuizAdminLayout title="AI Settings" description="Configure AI models and API keys" activeSection="ai-settings">
      <div className="p-[var(--container-padding)] space-y-[var(--space-lg)]">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-[var(--space-md)]">
          <div>
            <h2 className="text-[length:var(--text-2xl)] font-bold text-foreground">AI Configuration</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage AI providers and models for quiz generation
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/ai/models'] })}
              disabled={isLoadingModels}
              variant="outline"
              className="min-h-[44px] touch-manipulation border-secondary/30 text-secondary hover:bg-secondary/10"
              data-testid="button-refresh-models"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingModels ? 'animate-spin' : ''}`} />
              {isLoadingModels ? 'Refreshing...' : 'Refresh Models'}
            </Button>
            <Button onClick={() => setCreateDialog(true)}
              className="min-h-[44px] touch-manipulation bg-primary hover:bg-primary/90 text-btn-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="button-create-config"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Configuration
            </Button>
          </div>
        </div>

        {modelsSource === 'error' && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/20 border border-[var(--destructive)]/30" data-testid="warning-models-error">
            <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">Unable to fetch AI models</p>
              <p className="text-xs text-destructive/70">{modelsError}</p>
            </div>
          </div>
        )}

        {modelsSource === 'no_config' && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-warning/20 border border-[var(--warning)]/30" data-testid="warning-no-api-config">
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-warning">No AI configuration found</p>
              <p className="text-xs text-warning/70">Please create an AI configuration with a valid API key to fetch available models.</p>
            </div>
          </div>
        )}

        {activeTextConfig && (
          <Card className="bg-surface-raised border-primary/30">
            <CardHeader className="p-[var(--card-padding)]">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-[var(--space-md)]">
                <div>
                  <CardTitle className="flex items-center gap-2 text-foreground text-[length:var(--text-xl)]">
                    <Type className="w-5 h-5 text-primary" />
                    Active Text Configuration
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Used for AI-powered quiz and content generation
                  </CardDescription>
                </div>
                <Button onClick={() => testAIMutation.mutate()}
                  disabled={testAIMutation.isPending}
                  variant="outline"
                  className="min-h-[44px] touch-manipulation border-primary/30 text-primary hover:bg-primary/10"
                  data-testid="button-test-ai-text"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  {testAIMutation.isPending ? 'Testing...' : 'Test AI Connection'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                <div>
                  <p className="text-sm text-muted-foreground">Provider</p>
                  <p className="text-lg font-semibold text-foreground capitalize">{activeTextConfig.provider}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Model</p>
                  <p className="text-lg font-semibold text-foreground">{activeTextConfig.modelName}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">API Key Source</p>
                <p className="text-sm bg-muted p-2 rounded text-muted-foreground">
                  Managed in Integration Settings
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {activeImageConfig && (
          <Card className="bg-surface-raised border-primary/30">
            <CardHeader className="p-[var(--card-padding)]">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-[var(--space-md)]">
                <div>
                  <CardTitle className="flex items-center gap-2 text-foreground text-[length:var(--text-xl)]">
                    <Image className="w-5 h-5 text-primary" />
                    Active Image Configuration
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Used for AI-powered thumbnail generation
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                <div>
                  <p className="text-sm text-muted-foreground">Provider</p>
                  <p className="text-lg font-semibold text-foreground capitalize">{activeImageConfig.provider}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Model</p>
                  <p className="text-lg font-semibold text-foreground">{activeImageConfig.modelName}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">API Key Source</p>
                <p className="text-sm bg-muted p-2 rounded text-muted-foreground">
                  Managed in Integration Settings
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!activeImageConfig && (
          <div 
            className="flex items-center gap-3 p-4 rounded-lg bg-warning/20 border border-[var(--warning)]/30"
            data-testid="warning-no-image-config"
          >
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
            <p className="text-sm text-warning">
              No image generation model configured. AI thumbnail generation is disabled.
            </p>
          </div>
        )}

        <Card className="bg-card border-border">
            <CardHeader className="p-[var(--card-padding)]">
              <CardTitle className="text-foreground text-[length:var(--text-xl)]">All Configurations</CardTitle>
              <CardDescription className="text-muted-foreground">
                Manage and switch between different AI configurations
              </CardDescription>
            </CardHeader>
            <CardContent className="p-[var(--card-padding)] pt-0">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground" data-testid="text-loading">Loading configurations...</div>
              ) : configs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground" data-testid="text-no-configs">
                  No configurations yet. Create one to get started.
                </div>
              ) : (
                <div className="space-y-[var(--space-md)]">
                  {configs.map((config: any) => (
                    <div
                      key={config.id}
                      className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-[var(--space-md)] p-[var(--card-padding)] rounded-lg bg-muted border border-border"
                      data-testid={`config-item-${config.id}`}
                    >
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground">{config.modelName}</span>
                          {config.isActive && config.purpose === 'text' && (
                            <Badge data-testid="badge-active-text">
                              <Type className="w-3 h-3 mr-1" />
                              Active for Text
                            </Badge>
                          )}
                          {config.isActive && config.purpose === 'image' && (
                            <Badge data-testid="badge-active-image">
                              <Image className="w-3 h-3 mr-1" />
                              Active for Image
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground capitalize">{config.provider} Provider • {config.purpose === 'image' ? 'Image Generation' : 'Text Generation'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => handleEdit(config)}
                          variant="outline"
                          size="sm"
                          className="min-h-[44px] touch-manipulation border-secondary/30 text-secondary hover:bg-secondary/10"
                          data-testid={`button-edit-${config.id}`}
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button onClick={() => handleDelete(config)}
                          disabled={config.isActive || deleteMutation.isPending}
                          variant="outline"
                          size="sm"
                          className="min-h-[44px] touch-manipulation border-[var(--destructive)]/30 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          data-testid={`button-delete-${config.id}`}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </Button>
                        {!config.isActive && (
                          <Button onClick={() => setActiveMutation.mutate(config.id)}
                            disabled={setActiveMutation.isPending}
                            variant="outline"
                            size="sm"
                            className="min-h-[44px] touch-manipulation border-primary/30 text-primary hover:bg-primary/10"
                            data-testid={`button-activate-${config.id}`}
                          >
                            Set Active
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        <Dialog open={createDialog} onOpenChange={setCreateDialog}>
          <DialogContent className="bg-card border-border text-foreground w-[calc(100%-2rem)] max-w-md mx-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground text-[length:var(--text-xl)]">Add AI Configuration</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Configure a new AI provider and model for quiz generation
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-[var(--space-md)] py-[var(--space-md)]">
              <div className="space-y-2">
                <Label htmlFor="provider" className="text-foreground">Provider</Label>
                <Select
                  value={formData.provider}
                  onValueChange={(value) => setFormData({ ...formData, provider: value })}
                >
                  <SelectTrigger className="min-h-[44px] touch-manipulation bg-muted border-border text-foreground" data-testid="select-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-muted border-border">
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="purpose" className="text-foreground">Purpose</Label>
                <Select
                  value={formData.purpose}
                  onValueChange={(value) => {
                    const defaultModel = getDefaultModelForPurpose(value, availableModels);
                    setFormData({ ...formData, purpose: value, modelName: defaultModel });
                  }}
                >
                  <SelectTrigger className="min-h-[44px] touch-manipulation bg-muted border-border text-foreground" data-testid="select-purpose">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-muted border-border">
                    <SelectItem value="text">
                      <div className="flex items-center gap-2">
                        <Type className="w-4 h-4" />
                        Text Generation
                      </div>
                    </SelectItem>
                    <SelectItem value="image">
                      <div className="flex items-center gap-2">
                        <Image className="w-4 h-4" />
                        Image Generation
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="modelName" className="text-foreground">Model</Label>
                {isLoadingModels ? (
                  <div className="flex items-center gap-2 min-h-[44px] px-3 bg-muted border border-border rounded-md text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading models...
                  </div>
                ) : availableModels.length === 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 min-h-[44px] px-3 bg-muted border border-warning/30 rounded-md text-warning" data-testid="no-models-warning">
                      <AlertTriangle className="w-4 h-4" />
                      {modelsError || 'No models available. Enter a Gemini model manually.'}
                    </div>
                    {modelsMessage && (
                      <p className="text-xs text-muted-foreground break-words" data-testid="no-models-details">
                        {modelsMessage}
                      </p>
                    )}
                    <Input
                      value={formData.modelName}
                      onChange={(e) => setFormData({ ...formData, modelName: e.target.value })}
                      placeholder="e.g. gemini-2.5-flash"
                      className="min-h-[44px] touch-manipulation bg-muted border-border text-foreground"
                      data-testid="input-model-manual"
                    />
                  </div>
                ) : (
                  <Select
                    value={formData.modelName}
                    onValueChange={(value) => setFormData({ ...formData, modelName: value })}
                  >
                    <SelectTrigger className="min-h-[44px] touch-manipulation bg-muted border-border text-foreground" data-testid="select-model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-muted border-border max-h-[300px]">
                      {availableModels.map((model) => (
                        <SelectItem key={model.name} value={model.name}>
                          <div className="flex items-center gap-2">
                            <span>{model.displayName}</span>
                            {model.capabilities.includes('image') && (
                              <Badge variant="outline" className="text-xs py-0 px-1">
                                <Image className="w-3 h-3" />
                              </Badge>
                            )}
                            <span className="text-muted-foreground text-xs">
                              {getModelCapabilityLabel(model.capabilities)}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">API Key</Label>
                <p className="text-xs text-muted-foreground">
                  Managed via Integration Settings. AI Settings controls model selection only.
                </p>
              </div>
            </div>

            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setCreateDialog(false)}
                className="min-h-[44px] touch-manipulation border-border text-foreground hover:bg-muted"
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending || !isModelValidForSubmission(formData.modelName)} className="min-h-[44px] touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed" data-testid="button-save-config" >
                {createMutation.isPending ? 'Creating...' : 'Create Configuration'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editDialog} onOpenChange={setEditDialog}>
          <DialogContent className="bg-card border-border text-foreground w-[calc(100%-2rem)] max-w-md mx-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground text-[length:var(--text-xl)]">Edit AI Configuration</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Update AI provider and model settings
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-[var(--space-md)] py-[var(--space-md)]">
              <div className="space-y-2">
                <Label htmlFor="edit-provider" className="text-foreground">Provider</Label>
                <Select
                  value={formData.provider}
                  onValueChange={(value) => setFormData({ ...formData, provider: value })}
                >
                  <SelectTrigger className="min-h-[44px] touch-manipulation bg-muted border-border text-foreground" data-testid="select-edit-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-muted border-border">
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-purpose" className="text-foreground">Purpose</Label>
                <Select
                  value={formData.purpose}
                  onValueChange={(value) => {
                    const defaultModel = getDefaultModelForPurpose(value, availableModels);
                    setFormData({ ...formData, purpose: value, modelName: defaultModel });
                  }}
                >
                  <SelectTrigger className="min-h-[44px] touch-manipulation bg-muted border-border text-foreground" data-testid="select-edit-purpose">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-muted border-border">
                    <SelectItem value="text">
                      <div className="flex items-center gap-2">
                        <Type className="w-4 h-4" />
                        Text Generation
                      </div>
                    </SelectItem>
                    <SelectItem value="image">
                      <div className="flex items-center gap-2">
                        <Image className="w-4 h-4" />
                        Image Generation
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-modelName" className="text-foreground">Model</Label>
                {isLoadingModels ? (
                  <div className="flex items-center gap-2 min-h-[44px] px-3 bg-muted border border-border rounded-md text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading models...
                  </div>
                ) : availableModels.length === 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 min-h-[44px] px-3 bg-muted border border-warning/30 rounded-md text-warning" data-testid="no-models-warning-edit">
                      <AlertTriangle className="w-4 h-4" />
                      {modelsError || 'No models available. Enter a Gemini model manually.'}
                    </div>
                    {modelsMessage && (
                      <p className="text-xs text-muted-foreground break-words" data-testid="no-models-details-edit">
                        {modelsMessage}
                      </p>
                    )}
                    <Input
                      value={formData.modelName}
                      onChange={(e) => setFormData({ ...formData, modelName: e.target.value })}
                      placeholder="e.g. gemini-2.5-flash"
                      className="min-h-[44px] touch-manipulation bg-muted border-border text-foreground"
                      data-testid="input-edit-model-manual"
                    />
                  </div>
                ) : (
                  <Select
                    value={formData.modelName}
                    onValueChange={(value) => setFormData({ ...formData, modelName: value })}
                  >
                    <SelectTrigger className="min-h-[44px] touch-manipulation bg-muted border-border text-foreground" data-testid="select-edit-model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-muted border-border max-h-[300px]">
                      {availableModels.map((model) => (
                        <SelectItem key={model.name} value={model.name}>
                          <div className="flex items-center gap-2">
                            <span>{model.displayName}</span>
                            {model.capabilities.includes('image') && (
                              <Badge variant="outline" className="text-xs py-0 px-1">
                                <Image className="w-3 h-3" />
                              </Badge>
                            )}
                            <span className="text-muted-foreground text-xs">
                              {getModelCapabilityLabel(model.capabilities)}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-foreground">API Key</Label>
                <p className="text-xs text-muted-foreground">
                  Managed via Integration Settings. AI Settings controls model selection only.
                </p>
              </div>
            </div>

            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setEditDialog(false)}
                className="min-h-[44px] touch-manipulation border-border text-foreground hover:bg-muted"
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={updateMutation.isPending || !isModelValidForSubmission(formData.modelName)} className="min-h-[44px] touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed" data-testid="button-update-config" >
                {updateMutation.isPending ? 'Updating...' : 'Update Configuration'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </QuizAdminLayout>
  );
}
