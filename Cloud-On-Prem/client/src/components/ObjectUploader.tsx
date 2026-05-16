import { useState } from "react";
import type { ReactNode } from "react";
import Uppy from "@uppy/core";
import { DashboardModal } from "@uppy/react";
import AwsS3 from "@uppy/aws-s3";
import type { UploadResult } from "@uppy/core";
import { Button } from "@/components/ui/button";

// Note: Uppy CSS is included automatically by the Dashboard component

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (
    result: UploadResult<Record<string, unknown>, Record<string, unknown>>
  ) => void;
  buttonClassName?: string;
  children: ReactNode;
  autoProceed?: boolean;
  resizeWidth?: number;
  resizeHeight?: number;
}

/**
 * A file upload component that renders as a button and provides a modal interface for
 * file management.
 * 
 * Features:
 * - Renders as a customizable button that opens a file upload modal
 * - Provides a modal interface for:
 *   - File selection
 *   - File preview
 *   - Upload progress tracking
 *   - Upload status display
 * 
 * The component uses Uppy under the hood to handle all file upload functionality.
 * All file management features are automatically handled by the Uppy dashboard modal.
 */
export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760, // 10MB default
  onGetUploadParameters,
  onComplete,
  buttonClassName,
  children,
  autoProceed = false,
  resizeWidth = 800,
  resizeHeight = 600,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  
  // Image resizing function with improved error handling
  const resizeImage = (file: File, maxWidth: number = resizeWidth, maxHeight: number = resizeHeight, quality: number = 0.85): Promise<File> => {
    return new Promise((resolve) => {
      // If file is not an image, return as is
      if (!file.type.startsWith('image/')) {
        resolve(file);
        return;
      }
      
      // If file is already small enough, don't resize
      if (file.size < 500 * 1024) { // Less than 500KB
        resolve(file);
        return;
      }
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      let objectUrl: string | null = null;
      
      const cleanup = () => {
        if (objectUrl) {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch (e) {
            // Ignore cleanup errors
          }
          objectUrl = null;
        }
      };
      
      const handleError = (error?: any) => {
        console.warn('Image resizing failed, using original file:', error);
        cleanup();
        resolve(file);
      };
      
      img.onload = () => {
        try {
          cleanup(); // Clean up URL immediately after loading
          
          if (!ctx) {
            handleError('Canvas context not available');
            return;
          }
          
          // Calculate new dimensions maintaining aspect ratio
          let { width, height } = img;
          
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          
          canvas.width = width;
          canvas.height = height;
          
          // Draw image on canvas with resized dimensions
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convert canvas to blob with compression
          canvas.toBlob(
            (blob) => {
              if (blob && blob.size < file.size) {
                // Only use resized version if it's actually smaller
                const resizedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                console.log(`Image resized: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(resizedFile.size / 1024 / 1024).toFixed(2)}MB`);
                resolve(resizedFile);
              } else {
                // If resizing didn't help, use original
                resolve(file);
              }
            },
            'image/jpeg',
            quality
          );
        } catch (error) {
          handleError(error);
        }
      };
      
      img.onerror = () => handleError('Image load error');
      
      try {
        objectUrl = URL.createObjectURL(file);
        img.src = objectUrl;
        
        // Set timeout to prevent hanging
        setTimeout(() => {
          if (objectUrl) {
            handleError('Image load timeout');
          }
        }, 10000);
      } catch (error) {
        handleError(error);
      }
    });
  };

  const [uppy] = useState(() => {
    const uppyInstance = new Uppy({
      restrictions: {
        maxNumberOfFiles,
        maxFileSize: 10 * 1024 * 1024, // 10MB limit
        allowedFileTypes: ['image/*'],
      },
      autoProceed: autoProceed,
      allowMultipleUploadBatches: false,
    })
      .use(AwsS3, {
        shouldUseMultipart: false,
        getUploadParameters: onGetUploadParameters,
      })
      .on('file-added', async (file) => {
        // Process images for resizing before upload
        if (file.type.startsWith('image/') && file.data instanceof File && !file.meta?.resized && file.size) {
          try {
            console.log(`Processing image: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB), target: ${resizeWidth}x${resizeHeight}`);
            
            const resizedFile = await resizeImage(file.data, resizeWidth, resizeHeight, 0.85);
            
            // Only replace if resizing was successful and reduced size
            if (resizedFile !== file.data) {
              uppyInstance.removeFile(file.id);
              uppyInstance.addFile({
                name: resizedFile.name,
                type: 'image/jpeg',
                data: resizedFile,
                source: file.source,
                isRemote: false,
                meta: { resized: true }, // Mark as processed to prevent infinite loop
              });
            }
          } catch (error) {
            console.warn('Error processing image, using original:', error);
            // Keep the original file if resizing fails
          }
        }
      })
      .on("upload-error", (file, error) => {
        console.error("Uppy upload error:", error);
        console.error("Failed file:", file);
      })
      .on("upload-success", (file, response) => {
        console.log("Uppy upload success:", file, response);
      })
      .on("complete", (result) => {
        console.log("Uppy upload complete:", result);
        console.log("Successful uploads:", result.successful);
        console.log("Failed uploads:", result.failed);
        
        // Only call onComplete and close modal if files were actually uploaded successfully
        if (result.successful && result.successful.length > 0) {
          onComplete?.(result);
          setShowModal(false);
        } else if (result.failed && result.failed.length > 0) {
          // If there were failed uploads, keep modal open so user can retry
          console.log("Upload failed, keeping modal open");
        }
        // If no files at all (successful.length === 0 && failed.length === 0), 
        // this means complete fired without any upload attempt, so we do nothing
      });

    return uppyInstance;
  });

  // Note: Uppy instance will be automatically cleaned up when component unmounts

  const handleButtonClick = () => {
    setShowModal(true);
  };

  return (
    <div>
      <Button type="button" onClick={handleButtonClick} className={buttonClassName} data-testid="button-upload-image" >
        {children}
      </Button>

      {showModal && (
        <div>
          <style>{`
            .uppy-Dashboard-browse {
              display: block !important;
              visibility: visible !important;
              opacity: 1 !important;
            }
            .uppy-Dashboard-AddFiles {
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              gap: 1rem !important;
            }
            .uppy-Dashboard-AddFiles-title {
              margin-bottom: 1rem !important;
            }
            .uppy-Dashboard-browse {
              background-color: var(--surface-raised) !important;
              color: var(--text-primary) !important;
              border: 2px solid var(--stroke-default) !important;
              border-radius: 0.5rem !important;
              padding: 0.75rem 1.5rem !important;
              font-size: 1rem !important;
              font-weight: 500 !important;
              cursor: pointer !important;
              transition: all 0.2s !important;
            }
            .uppy-Dashboard-browse:hover {
              background-color: color-mix(in srgb, var(--surface-raised) 80%, var(--action-accent)) !important;
              color: var(--action-accent-fg) !important;
              border-color: var(--action-accent) !important;
            }
          `}</style>
          <DashboardModal
          uppy={uppy}
          open={showModal}
          onRequestClose={() => {
            console.log("Modal close requested");
            setShowModal(false);
          }}
          proudlyDisplayPoweredByUppy={false}
          hideProgressDetails={false}
          hideUploadButton={false}
          hideCancelButton={false}
          hidePauseResumeButton={false}
          showRemoveButtonAfterComplete={true}
          note={autoProceed ? "Select a file to upload automatically" : "Click 'Browse Files' below to select from your device, or drag and drop files here"}
          browserBackButtonClose={true}
          doneButtonHandler={() => {
            setShowModal(false);
          }}
        />
        </div>
      )}
      
    </div>
  );
}
