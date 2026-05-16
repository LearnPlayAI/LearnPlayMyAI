import { useState, useRef } from 'react';
import { Camera, Upload, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { apiRequest } from '@/lib/queryClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * AvatarUpload - Premium avatar upload component with client-side resizing
 * 
 * Features:
 * - Drag & drop support
 * - Client-side image resizing to save storage space
 * - Preview before upload
 * - Progress indication
 * - Error handling
 * - Direct upload to object storage
 * 
 * @param {Object} props
 * @param {Object} props.user - Current user object
 * @param {Function} props.onUploadSuccess - Callback when upload completes
 * @param {string} props.size - Avatar size variant
 */
export function AvatarUpload({ user, onUploadSuccess, size = 'xl' }) {
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const queryClient = useQueryClient();

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ resizedFile, avatarPath }) => {
      // Step 1: Get upload URL
      const uploadResponse = await apiRequest('/api/profile/avatar/upload-url', {
        method: 'POST'
      });

      // Step 2: Upload to object storage
      const response = await fetch(uploadResponse.uploadURL, {
        method: 'PUT',
        body: resizedFile,
        headers: {
          'Content-Type': 'image/jpeg'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to upload image');
      }

      // Step 3: Update user profile with avatar path
      const updatedUser = await apiRequest('/api/profile/avatar', {
        method: 'PUT',
        body: JSON.stringify({ 
          avatarImageUrl: `/${uploadResponse.avatarPath}` 
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return updatedUser;
    },
    onSuccess: (updatedUser) => {
      // Invalidate all user-related queries to refresh avatar everywhere
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/leaderboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/quiz-leaderboard'] });
      
      setPreviewUrl(null);
      setIsUploading(false);
      
      
      if (onUploadSuccess) {
        onUploadSuccess(updatedUser);
      }
    },
    onError: (error) => {
      console.error('Avatar upload error:', error);
      setIsUploading(false);
      
    }
  });

  // Client-side image resizing function
  const resizeImage = (file, maxWidth = 200, maxHeight = 200, quality = 0.8) => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        // Calculate new dimensions
        let { width, height } = img;
        
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and resize image
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to blob
        canvas.toBlob(resolve, 'image/jpeg', quality);
      };

      img.src = URL.createObjectURL(file);
    });
  };

  // Handle file selection
  const handleFileSelect = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      return;
    }

    setIsUploading(true);

    try {
      // Create preview
      const preview = URL.createObjectURL(file);
      setPreviewUrl(preview);

      // Resize image for upload
      const resizedFile = await resizeImage(file);
      const avatarPath = `avatars/${user.gamerName}/avatar_${user.gamerName}.jpg`;
      
      // Upload the resized image
      await uploadMutation.mutateAsync({ resizedFile, avatarPath });
      
    } catch (error) {
      console.error('File processing error:', error);
      setIsUploading(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const clearPreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
  };

  return (
    <div className="space-y-4">
      {/* Current Avatar Display */}
      <div className="flex items-center justify-center">
        {previewUrl ? (
          <div className="relative">
            <img
              src={previewUrl}
              alt="Preview"
              className={`rounded-full object-cover border-4 border-accent/30 ${
                size === 'xl' ? 'w-20 h-20' : size === 'lg' ? 'w-16 h-16' : 'w-12 h-12'
              }`}
              data-testid="avatar-preview"
            />
            {isUploading && (
              <div className="absolute inset-0 bg-[var(--modal-overlay)] rounded-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-primary-foreground animate-spin" />
              </div>
            )}
          </div>
        ) : (
          <PlayerAvatar 
            user={user} 
            size={size} 
            showGlow={true}
            data-testid="current-avatar"
          />
        )}
      </div>

      {/* Upload Area */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all duration-300 cursor-pointer ${
          isDragging 
            ? 'border-accent bg-accent/5 scale-105' 
            : 'border-muted-foreground/30 hover:border-accent/50 hover:bg-accent/5'
        } ${isUploading ? 'pointer-events-none opacity-50' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        data-testid="avatar-upload-area"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => handleFileSelect(e.target.files?.[0])}
          className="hidden"
          data-testid="avatar-file-input"
        />

        <div className="space-y-3">
          {isUploading ? (
            <>
              <Loader2 className="w-8 h-8 mx-auto text-accent animate-spin" />
              <p className="text-sm text-muted-foreground">
                Uploading your avatar...
              </p>
            </>
          ) : (
            <>
              <div className="w-12 h-12 mx-auto bg-accent/20 rounded-full flex items-center justify-center">
                {isDragging ? (
                  <Upload className="w-6 h-6 text-accent" />
                ) : (
                  <Camera className="w-6 h-6 text-accent" />
                )}
              </div>
              
              <div>
                <p className="text-sm font-medium">
                  {isDragging ? 'Drop your image here' : 'Upload new avatar'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Drag & drop or click to browse • JPG, PNG • Max 10MB
                </p>
                <p className="text-xs text-muted-foreground">
                  Images will be automatically resized to 200x200px
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Preview Actions */}
      {previewUrl && !isUploading && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={clearPreview}
            data-testid="button-clear-preview"
          >
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
        </div>
      )}

      {/* Upload Status */}
      {isUploading && (
        <div className="text-center">
          <div className="w-full bg-muted rounded-full h-2">
            <div className="bg-accent h-2 rounded-full animate-pulse w-2/3" />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Processing and uploading...
          </p>
        </div>
      )}
    </div>
  );
}

export default AvatarUpload;