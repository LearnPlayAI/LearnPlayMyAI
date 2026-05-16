import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { 
  Palette,
  Upload,
  Image as ImageIcon,
  X,
  RefreshCw
} from 'lucide-react';

export default function GammaThemes() {
  const { toast } = useToast();
  const [uploadingStyleKey, setUploadingStyleKey] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  // Fetch image styles for upload management
  const { data: imageStylesData, isLoading: stylesLoading } = useQuery<any>({
    queryKey: ['/api/admin/gamma/image-styles'],
  });

  // Fetch Gamma themes for thumbnail management
  const { data: themesData, isLoading: themesLoading } = useQuery<any>({
    queryKey: ['/api/admin/gamma/themes'],
  });

  // Image style upload handler with XMLHttpRequest for progress tracking
  const handleStyleImageUpload = async (styleKey: string, file: File) => {
    // Client-side validation
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please upload a JPEG, PNG, or WebP image',
      });
      return;
    }

    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Please upload an image smaller than 2MB',
      });
      return;
    }

    setUploadingStyleKey(styleKey);
    setUploadProgress({ ...uploadProgress, [styleKey]: 0 });

    const formData = new FormData();
    formData.append('thumbnail', file);

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadProgress((prev) => ({ ...prev, [styleKey]: percentComplete }));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            queryClient.invalidateQueries({ queryKey: ['/api/admin/gamma/image-styles'] });
            
            toast({
              title: 'Upload successful',
              description: `${styleKey} style image updated`,
            });

            setUploadProgress((prev) => ({ ...prev, [styleKey]: 100 }));
            setTimeout(() => {
              setUploadProgress((prev) => {
                const newProgress = { ...prev };
                delete newProgress[styleKey];
                return newProgress;
              });
              setUploadingStyleKey(null);
            }, 1000);
            resolve();
          } catch (error) {
            reject(new Error('Failed to parse server response'));
          }
        } else {
          let errorMessage = 'Upload failed';
          try {
            const error = JSON.parse(xhr.responseText);
            errorMessage = error.error || error.message || errorMessage;
          } catch (parseError) {
            errorMessage = `Server error (${xhr.status})`;
          }
          setUploadingStyleKey(null);
          toast({
            variant: 'destructive',
            title: 'Upload failed',
            description: errorMessage,
          });
          reject(new Error(errorMessage));
        }
      };

      xhr.onerror = () => {
        setUploadingStyleKey(null);
        toast({
          variant: 'destructive',
          title: 'Upload failed',
          description: 'Network error occurred',
        });
        reject(new Error('Network error'));
      };

      xhr.open('POST', `/api/admin/gamma/image-styles/${styleKey}/upload`);
      xhr.withCredentials = true;
      xhr.send(formData);
    });
  };

  // Theme thumbnail upload handler with XMLHttpRequest for progress tracking
  const handleThemeThumbnailUpload = async (themeId: string, file: File) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please upload a JPEG, PNG, or WebP image',
      });
      return;
    }

    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Please upload an image smaller than 2MB',
      });
      return;
    }

    setUploadingStyleKey(themeId);
    setUploadProgress({ ...uploadProgress, [themeId]: 0 });

    const formData = new FormData();
    formData.append('thumbnail', file);

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadProgress((prev) => ({ ...prev, [themeId]: percentComplete }));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            queryClient.invalidateQueries({ queryKey: ['/api/admin/gamma/themes'] });
            queryClient.invalidateQueries({ queryKey: ['/api/gamma/themes'] });
            
            toast({
              title: 'Upload successful',
              description: 'Theme thumbnail updated',
            });

            setUploadProgress((prev) => ({ ...prev, [themeId]: 100 }));
            setTimeout(() => {
              setUploadProgress((prev) => {
                const newProgress = { ...prev };
                delete newProgress[themeId];
                return newProgress;
              });
              setUploadingStyleKey(null);
            }, 1000);
            resolve();
          } catch (error) {
            reject(new Error('Failed to parse server response'));
          }
        } else {
          let errorMessage = 'Upload failed';
          try {
            const error = JSON.parse(xhr.responseText);
            errorMessage = error.error || error.message || errorMessage;
          } catch (parseError) {
            errorMessage = `Server error (${xhr.status})`;
          }
          setUploadingStyleKey(null);
          toast({
            variant: 'destructive',
            title: 'Upload failed',
            description: errorMessage,
          });
          reject(new Error(errorMessage));
        }
      };

      xhr.onerror = () => {
        setUploadingStyleKey(null);
        toast({
          variant: 'destructive',
          title: 'Upload failed',
          description: 'Network error occurred',
        });
        reject(new Error('Network error'));
      };

      xhr.open('PATCH', `/api/admin/gamma-themes/${themeId}/thumbnail`);
      xhr.withCredentials = true;
      xhr.send(formData);
    });
  };

  // Theme thumbnail remove handler
  const handleThemeThumbnailRemove = async (themeId: string) => {
    try {
      const response = await fetch(`/api/admin/gamma-themes/${themeId}/thumbnail`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        let errorMessage = 'Remove failed';
        try {
          const error = await response.json();
          errorMessage = error.error || error.message || errorMessage;
        } catch (parseError) {
          errorMessage = `Server error (${response.status})`;
        }
        throw new Error(errorMessage);
      }

      queryClient.invalidateQueries({ queryKey: ['/api/admin/gamma/themes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamma/themes'] });
      
      toast({
        title: 'Thumbnail removed',
        description: 'Theme thumbnail has been removed',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Remove failed',
        description: error.message || 'Failed to remove theme thumbnail',
      });
    }
  };

  return (
    <QuizAdminLayout 
      title="AI Presentation Themes" 
      description="Manage AI image generation styles and presentation theme thumbnails" 
      activeSection="gamma-themes"
    >
      <div className="space-y-6 max-w-7xl">
        {/* Image Generation Style Management */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg">
                <Palette className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-foreground">Image Generation Style Management</CardTitle>
                <CardDescription>Upload reference images for AI image generation styles</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {stylesLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Loading image styles...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {imageStylesData?.styles?.map((style: any) => (
                  <div
                    key={style.id}
                    className="p-4 bg-muted rounded-lg space-y-3"
                    data-testid={`style-card-${style.styleKey}`}
                  >
                    <div className="aspect-[4/3] bg-card/50 rounded-lg overflow-hidden">
                      {style.thumbnailUrl ? (
                        <img
                          src={style.thumbnailUrl}
                          alt={style.displayName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-1">
                      <h4 className="font-semibold text-foreground text-sm">{style.displayName}</h4>
                      {style.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{style.description}</p>
                      )}
                    </div>

                    <div className="relative">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleStyleImageUpload(style.styleKey, file);
                          }
                        }}
                        disabled={uploadingStyleKey === style.styleKey}
                        className="hidden"
                        id={`upload-${style.styleKey}`}
                        data-testid={`input-upload-${style.styleKey}`}
                      />
                      <label htmlFor={`upload-${style.styleKey}`}>
                        <Button type="button" variant="outline" size="sm" className="w-full" disabled={uploadingStyleKey === style.styleKey} onClick={() => document.getElementById(`upload-${style.styleKey}`)?.click()}
                          data-testid={`button-upload-${style.styleKey}`}
                        >
                          {uploadingStyleKey === style.styleKey ? (
                            <>
                              <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Upload className="mr-2 h-3 w-3" />
                              Upload Image
                            </>
                          )}
                        </Button>
                      </label>
                      {uploadProgress[style.styleKey] !== undefined && uploadProgress[style.styleKey] < 100 && (
                        <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${uploadProgress[style.styleKey]}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Theme Thumbnail Management */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg">
                <Palette className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-foreground">Presentation Theme Thumbnails</CardTitle>
                <CardDescription>Upload preview images for AI presentation themes</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {themesLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Loading themes...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {themesData?.themes?.map((theme: any) => {
                  return (
                  <div
                    key={theme.id}
                    className="p-4 bg-muted rounded-lg space-y-3"
                    data-testid={`theme-card-${theme.id}`}
                  >
                    <div className="aspect-video bg-card/50 rounded-lg overflow-hidden">
                      {theme.thumbnailUrl ? (
                        <img
                          src={theme.thumbnailUrl}
                          alt={theme.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-surface-raised">
                          <div className="text-2xl font-bold text-primary/50">
                            {theme.name.split(' ').slice(0, 2).map((w: string) => w[0]).join('')}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-1">
                      <h4 className="font-semibold text-foreground text-sm">{theme.name}</h4>
                      {theme.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{theme.description}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleThemeThumbnailUpload(theme.id, file);
                            }
                          }}
                          disabled={uploadingStyleKey === theme.id}
                          className="hidden"
                          id={`upload-theme-${theme.id}`}
                          data-testid={`input-upload-theme-${theme.id}`}
                        />
                        <label htmlFor={`upload-theme-${theme.id}`}>
                          <Button type="button" variant="outline" size="sm" className="w-full" disabled={uploadingStyleKey === theme.id} onClick={() => document.getElementById(`upload-theme-${theme.id}`)?.click()}
                            data-testid={`button-upload-theme-${theme.id}`}
                          >
                            {uploadingStyleKey === theme.id ? (
                              <>
                                <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                                Uploading...
                              </>
                            ) : (
                              <>
                                <Upload className="mr-2 h-3 w-3" />
                                {theme.thumbnailUrl ? 'Replace' : 'Upload'}
                              </>
                            )}
                          </Button>
                        </label>
                        {uploadProgress[theme.id] !== undefined && uploadProgress[theme.id] < 100 && (
                          <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${uploadProgress[theme.id]}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {theme.thumbnailUrl && (
                        <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => handleThemeThumbnailRemove(theme.id)}
                          disabled={uploadingStyleKey === theme.id}
                          data-testid={`button-remove-theme-${theme.id}`}
                        >
                          <X className="mr-2 h-3 w-3" />
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </QuizAdminLayout>
  );
}
