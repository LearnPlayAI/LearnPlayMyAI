import fs from 'fs';
import path from 'path';
import os from 'os';
import unzipper from 'unzipper';
import archiver from 'archiver';
import sharp from 'sharp';

interface CompressionResult {
  compressed: boolean;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  outputPath: string;
}

interface CompressionOptions {
  sizeThresholdMB?: number;
  imageQuality?: number;
  targetMaxSizeMB?: number;
}

/**
 * PPTX Compression Utility
 * 
 * Compresses large PPTX files by optimizing embedded images to stay under
 * Microsoft Office Online viewer's 100MB limit.
 * 
 * Process:
 * 1. Check if file exceeds threshold (default 80MB)
 * 2. Extract PPTX (it's a ZIP archive)
 * 3. Find and compress images in ppt/media/ folder
 * 4. Repackage as PPTX with compressed images
 */
export class PPTXCompressor {
  private sizeThresholdMB: number;
  private imageQuality: number;
  private targetMaxSizeMB: number;

  constructor(options: CompressionOptions = {}) {
    this.sizeThresholdMB = options.sizeThresholdMB ?? 25; // Default 25MB - skip compression for smaller files
    this.imageQuality = options.imageQuality ?? 72; // 72% quality for good balance
    this.targetMaxSizeMB = options.targetMaxSizeMB ?? 95; // Target under 100MB
  }

  /**
   * Compress a PPTX file if it exceeds the size threshold
   */
  async compressIfNeeded(inputPath: string): Promise<CompressionResult> {
    const stats = await fs.promises.stat(inputPath);
    const originalSizeMB = stats.size / (1024 * 1024);
    const originalSize = stats.size;

    console.log(`[PPTXCompressor] File size: ${originalSizeMB.toFixed(2)}MB`);

    // Skip compression if file is already small enough
    if (originalSizeMB < this.sizeThresholdMB) {
      console.log(`[PPTXCompressor] File size (${originalSizeMB.toFixed(2)}MB) is below threshold (${this.sizeThresholdMB}MB) - skipping compression`);
      return {
        compressed: false,
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1,
        outputPath: inputPath,
      };
    }

    console.log(`[PPTXCompressor] File exceeds ${this.sizeThresholdMB}MB threshold - compressing...`);

    // Create temp directory for extraction
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pptx-compress-'));
    const outputPath = path.join(os.tmpdir(), `compressed-${Date.now()}.pptx`);

    try {
      // Step 1: Extract PPTX
      console.log(`[PPTXCompressor] Extracting PPTX to ${tempDir}`);
      await this.extractPPTX(inputPath, tempDir);

      // Step 2: Diagnostic - Count images BEFORE compression
      const mediaDir = path.join(tempDir, 'ppt', 'media');
      let imageCountBefore = 0;
      let imageFilesBefore: string[] = [];
      if (await this.directoryExists(mediaDir)) {
        const files = await fs.promises.readdir(mediaDir);
        imageFilesBefore = files.filter(f => /\.(jpg|jpeg|png|webp|gif|bmp|tiff)$/i.test(f));
        imageCountBefore = imageFilesBefore.length;
        console.log(`[PPTXCompressor] 📊 BEFORE compression: ${imageCountBefore} images found`);
        if (imageCountBefore > 0) {
          console.log(`[PPTXCompressor] Image files: ${imageFilesBefore.join(', ')}`);
        }
        await this.compressImages(mediaDir);
      } else {
        console.log(`[PPTXCompressor] ⚠️ No media directory found - file may not contain images`);
      }

      // Step 3: Diagnostic - Verify images still exist AFTER compression
      if (await this.directoryExists(mediaDir)) {
        const files = await fs.promises.readdir(mediaDir);
        const imageFilesAfter = files.filter(f => /\.(jpg|jpeg|png|webp|gif|bmp|tiff)$/i.test(f));
        const imageCountAfter = imageFilesAfter.length;
        console.log(`[PPTXCompressor] 📊 AFTER compression: ${imageCountAfter} images exist`);
        if (imageCountAfter !== imageCountBefore) {
          console.error(`[PPTXCompressor] ❌ IMAGE LOSS DETECTED: ${imageCountBefore} → ${imageCountAfter} (${imageCountBefore - imageCountAfter} images lost!)`);
        } else {
          console.log(`[PPTXCompressor] ✅ Image preservation verified: All ${imageCountBefore} images intact`);
        }
      }

      // Step 4: Repackage as PPTX
      console.log(`[PPTXCompressor] Repackaging PPTX to ${outputPath}`);
      await this.createPPTX(tempDir, outputPath);

      // Step 4: Check results
      const compressedStats = await fs.promises.stat(outputPath);
      const compressedSize = compressedStats.size;
      const compressedSizeMB = compressedSize / (1024 * 1024);
      const compressionRatio = compressedSize / originalSize;

      console.log(`[PPTXCompressor] Compression complete:`);
      console.log(`  - Original: ${originalSizeMB.toFixed(2)}MB`);
      console.log(`  - Compressed: ${compressedSizeMB.toFixed(2)}MB`);
      console.log(`  - Savings: ${((1 - compressionRatio) * 100).toFixed(1)}%`);

      return {
        compressed: true,
        originalSize,
        compressedSize,
        compressionRatio,
        outputPath,
      };
    } catch (error) {
      console.error(`[PPTXCompressor] Compression failed:`, error);
      // Clean up temp files on error
      await this.cleanup(tempDir, outputPath);
      throw error;
    } finally {
      // Clean up temp extraction directory (but keep output file)
      await this.cleanupDirectory(tempDir);
    }
  }

  /**
   * Extract PPTX file to directory
   * Uses unzipper.Open.file() for robust handling of large files
   * (avoids ERR_STREAM_PREMATURE_CLOSE with large archives)
   */
  private async extractPPTX(pptxPath: string, targetDir: string): Promise<void> {
    const directory = await unzipper.Open.file(pptxPath);
    await directory.extract({ path: targetDir });
  }

  /**
   * Compress all images in the media directory
   */
  private async compressImages(mediaDir: string): Promise<void> {
    const files = await fs.promises.readdir(mediaDir);
    const imageFiles = files.filter(f => 
      /\.(jpg|jpeg|png|webp)$/i.test(f)
    );

    console.log(`[PPTXCompressor] Found ${imageFiles.length} images to compress`);

    let compressed = 0;
    let skipped = 0;

    for (const file of imageFiles) {
      const filePath = path.join(mediaDir, file);
      try {
        const originalStats = await fs.promises.stat(filePath);
        const originalSize = originalStats.size;

        // Determine image format from extension
        const ext = path.extname(file).toLowerCase();
        const isPNG = ext === '.png';
        const isJPEG = ext === '.jpg' || ext === '.jpeg';
        const isWebP = ext === '.webp';

        // Compress image using appropriate format
        const tempOutput = `${filePath}.tmp`;
        const sharpInstance = sharp(filePath);

        if (isPNG) {
          // PNG compression - preserve transparency
          await sharpInstance
            .png({ 
              quality: this.imageQuality,
              compressionLevel: 9,
              effort: 7 // Higher effort for better compression
            })
            .toFile(tempOutput);
        } else if (isJPEG) {
          // JPEG compression - use mozjpeg for best results
          await sharpInstance
            .jpeg({ 
              quality: this.imageQuality, 
              mozjpeg: true 
            })
            .toFile(tempOutput);
        } else if (isWebP) {
          // WebP compression
          await sharpInstance
            .webp({ 
              quality: this.imageQuality 
            })
            .toFile(tempOutput);
        } else {
          // Unsupported format - skip
          skipped++;
          console.log(`  - ${file}: Unsupported format, skipping`);
          continue;
        }

        const compressedStats = await fs.promises.stat(tempOutput);
        const compressedSize = compressedStats.size;

        // Only use compressed version if it's actually smaller
        if (compressedSize < originalSize) {
          await fs.promises.rename(tempOutput, filePath);
          compressed++;
          console.log(`  ✓ ${file}: ${(originalSize / 1024).toFixed(0)}KB → ${(compressedSize / 1024).toFixed(0)}KB`);
        } else {
          await fs.promises.unlink(tempOutput);
          skipped++;
          console.log(`  - ${file}: Kept original (already optimized)`);
        }
      } catch (error) {
        console.warn(`  ✗ ${file}: Failed to compress -`, error instanceof Error ? error.message : 'Unknown error');
        skipped++;
      }
    }

    console.log(`[PPTXCompressor] Image compression: ${compressed} compressed, ${skipped} skipped`);
  }

  /**
   * Create PPTX file from directory
   */
  private async createPPTX(sourceDir: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression for ZIP container
      });

      output.on('close', () => {
        resolve();
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);

      // Add all files from source directory, preserving structure
      archive.directory(sourceDir, false);

      archive.finalize();
    });
  }

  /**
   * Check if directory exists
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Clean up temporary files
   */
  private async cleanup(tempDir: string, outputPath: string): Promise<void> {
    await this.cleanupDirectory(tempDir);
    try {
      await fs.promises.unlink(outputPath);
    } catch {
      // Ignore if output file doesn't exist
    }
  }

  /**
   * Recursively remove directory
   */
  private async cleanupDirectory(dirPath: string): Promise<void> {
    try {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      console.warn(`[PPTXCompressor] Failed to clean up ${dirPath}:`, error);
    }
  }
}

/**
 * Convenience function for one-off compression
 */
export async function compressPPTX(
  inputPath: string,
  options?: CompressionOptions
): Promise<CompressionResult> {
  const compressor = new PPTXCompressor(options);
  return compressor.compressIfNeeded(inputPath);
}
