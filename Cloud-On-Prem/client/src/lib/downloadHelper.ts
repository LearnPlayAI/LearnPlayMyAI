/**
 * Download Helper Utility
 * Provides safe, validated file download functions with proper error handling
 */

interface DownloadOptions {
  url: string;
  filename: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

type ErrorType = 'validation' | 'network' | 'unknown';

interface BlobDownloadResult {
  success: boolean;
  error?: string;
  errorType?: ErrorType; // validation = don't fallback, network = can fallback
}

/**
 * Validates that a download URL is a proper string
 */
export function isValidDownloadUrl(url: unknown): url is string {
  return typeof url === 'string' && url.length > 0 && (
    url.startsWith('http://') || 
    url.startsWith('https://') || 
    url.startsWith('blob:') ||
    url.startsWith('/')
  );
}

/**
 * Downloads a file using the anchor tag method (most reliable)
 * Creates a temporary anchor element, triggers the download, then cleans up
 */
export function downloadViaAnchor(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Valid MIME types for PPTX and video files
const VALID_PPTX_TYPES = [
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/octet-stream', // GCS often returns this for signed URLs
  'binary/octet-stream',
];

const VALID_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/octet-stream',
  'binary/octet-stream',
];

// Error response types that should never be saved as files
const ERROR_CONTENT_TYPES = [
  'text/html',
  'text/plain',
  'application/json',
  'application/xml',
];

/**
 * Determines the minimum valid file size based on the filename extension
 * - .docx, .doc files: 1KB (they can be very small)
 * - .pptx, .ppt, .mp4, .webm, .mov files: 10KB
 * - Default for unknown types: 1KB (be permissive)
 */
function getMinValidFileSize(filename: string): number {
  const ext = filename.toLowerCase().split('.').pop() || '';
  
  // Strict file types that need minimum 10KB
  const strictFileTypes = ['pptx', 'ppt', 'mp4', 'webm', 'mov'];
  if (strictFileTypes.includes(ext)) {
    return 10 * 1024; // 10KB
  }
  
  // Word documents and unknown types: 1KB (permissive)
  return 1024; // 1KB
}

/**
 * Safely download a file from a signed URL with blob conversion
 * This handles CORS properly and validates the response to prevent saving error pages
 * 
 * @param url - The signed download URL
 * @param filename - The desired filename for the download
 * @returns Promise with success status and optional error message
 */
export async function downloadFileAsBlob(
  url: string,
  filename: string
): Promise<BlobDownloadResult> {
  try {
    // Validate URL first
    if (!isValidDownloadUrl(url)) {
      console.error('[DownloadHelper] Invalid download URL:', url);
      return { 
        success: false, 
        error: 'Invalid download URL provided' 
      };
    }

    let response: Response;
    try {
      response = await fetch(url);
    } catch (fetchError) {
      // Network/CORS error - can fallback
      console.error('[DownloadHelper] Network error:', fetchError);
      return { 
        success: false, 
        error: 'Network error while downloading',
        errorType: 'network'
      };
    }
    
    // Check if request was successful
    if (!response.ok) {
      console.error('[DownloadHelper] Fetch failed:', response.status, response.statusText);
      return { 
        success: false, 
        error: `Download failed: ${response.status} ${response.statusText}`,
        errorType: 'network'
      };
    }

    // Get content type to validate we're getting the right file
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    
    // Log for debugging
    console.log('[DownloadHelper] Response:', {
      contentType,
      status: response.status
    });

    // CRITICAL: Check for error response content types BEFORE reading blob
    // This catches cases where server returns HTML/JSON error with 200 status
    const isErrorContentType = ERROR_CONTENT_TYPES.some(type => contentType.includes(type));
    
    if (isErrorContentType) {
      // Try to extract error message from response
      const text = await response.text();
      console.error('[DownloadHelper] Server returned error content type:', contentType, text.substring(0, 500));
      
      // Try to parse JSON error if applicable
      let errorMessage = 'Server returned an error instead of the file';
      if (contentType.includes('application/json')) {
        try {
          const json = JSON.parse(text);
          errorMessage = json.message || json.error || errorMessage;
        } catch {
          // Ignore parse error
        }
      }
      
      return { 
        success: false, 
        error: errorMessage,
        errorType: 'validation' // Don't fallback - we know the response is bad
      };
    }

    // Create blob from response
    const blob = await response.blob();
    
    // Validate blob size based on file type
    const minSize = getMinValidFileSize(filename);
    if (blob.size < minSize) {
      console.error('[DownloadHelper] File too small:', blob.size, 'bytes. Expected at least', minSize);
      
      // Try to read content as text to see if it's an error message
      try {
        const text = await blob.text();
        console.error('[DownloadHelper] Small file content:', text.substring(0, 500));
        
        // Check if it looks like an error (JSON or HTML)
        if (text.startsWith('{') || text.startsWith('<') || text.includes('error')) {
          return {
            success: false,
            error: 'The file appears to be corrupted or missing. Please try again.',
            errorType: 'validation' // Don't fallback - file content is invalid
          };
        }
      } catch {
        // Ignore read error
      }
      
      return { 
        success: false, 
        error: `File is too small (${blob.size} bytes). The file may be corrupted or missing.`,
        errorType: 'validation' // Don't fallback - file size is invalid
      };
    }

    // Create object URL and trigger download
    const objectUrl = window.URL.createObjectURL(blob);
    downloadViaAnchor(objectUrl, filename);
    
    // Clean up the object URL after a short delay
    setTimeout(() => {
      window.URL.revokeObjectURL(objectUrl);
    }, 100);

    return { success: true };
  } catch (error) {
    console.error('[DownloadHelper] Download error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown download error',
      errorType: 'unknown'
    };
  }
}

/**
 * Safe download with conditional fallback
 * - Only falls back to window.open for network/CORS errors
 * - Does NOT fallback for validation errors (corrupted/invalid files)
 */
export async function safeDownload(
  url: string,
  filename: string,
  onError?: (error: string) => void
): Promise<boolean> {
  // Validate URL
  if (!isValidDownloadUrl(url)) {
    const error = 'Invalid download URL. Please try again.';
    console.error('[DownloadHelper] Invalid URL:', typeof url, url);
    onError?.(error);
    return false;
  }

  // Try blob download first (better user experience)
  const result = await downloadFileAsBlob(url, filename);
  
  if (result.success) {
    return true;
  }

  // Only fallback for network/CORS errors, NOT for validation errors
  // Validation errors mean we got a response but it's not a valid file
  if (result.errorType === 'validation') {
    console.error('[DownloadHelper] Validation error - not falling back:', result.error);
    onError?.(result.error || 'The downloaded file is invalid or corrupted');
    return false;
  }

  // Fallback for network errors: open URL directly
  // This may work when CORS blocks fetch but browser can still download
  console.log('[DownloadHelper] Network error, trying direct open:', result.error);
  
  try {
    // Use window.open with _blank to open in new tab
    // The Content-Disposition header from the signed URL should trigger download
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  } catch (fallbackError) {
    console.error('[DownloadHelper] Fallback also failed:', fallbackError);
    onError?.(result.error || 'Download failed');
    return false;
  }
}

/**
 * Sanitize filename for safe file system use
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 100);
}

/**
 * Generate a safe filename for PPTX downloads
 */
export function generatePptxFilename(title: string, version?: number): string {
  const sanitized = sanitizeFilename(title) || 'lesson';
  return version ? `${sanitized}-v${version}.pptx` : `${sanitized}.pptx`;
}
