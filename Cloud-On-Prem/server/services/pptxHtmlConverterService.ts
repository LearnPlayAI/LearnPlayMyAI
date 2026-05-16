import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { isOnPremMode } from '../featureFlags';
import { getUploadDir, resolveStoragePath } from '../utils/uploadPaths';

const UPLOAD_DIR = getUploadDir();
const CONVERSION_TIMEOUT_MS = 90_000;
const SLIDE_IMAGE_DPI = Number(process.env.PPTX_SLIDE_IMAGE_DPI || 120);
const activeConversions = new Set<string>();

export interface ConversionResult {
  success: boolean;
  htmlPath: string | null;
  error?: string;
  durationMs?: number;
}

function deriveHtmlPath(pptxStorageKey: string): string {
  const dir = path.dirname(pptxStorageKey);
  const base = path.basename(pptxStorageKey, '.pptx');
  return path.join(dir, `${base}.html`);
}

function resolveLocalPath(storagePath: string): string {
  if (!storagePath) return storagePath;
  return resolveStoragePath(storagePath);
}

const IMAGE_MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.emf': 'image/x-emf',
  '.wmf': 'image/x-wmf',
};

export class PptxHtmlConverterService {
  private static libreOfficeAvailable: boolean | null = null;
  private static libreOfficeCommand: 'libreoffice' | 'soffice' = 'libreoffice';
  private static pdftoppmAvailable: boolean | null = null;
  private static gsAvailable: boolean | null = null;
  private static mutoolAvailable: boolean | null = null;

  static async checkLibreOfficeAvailable(): Promise<boolean> {
    if (this.libreOfficeAvailable !== null) {
      return this.libreOfficeAvailable;
    }

    const candidates: Array<'libreoffice' | 'soffice'> = ['libreoffice', 'soffice'];
    return new Promise((resolve) => {
      const tryCandidate = (index: number) => {
        const candidate = candidates[index];
        if (!candidate) {
          console.warn('[PptxHtmlConverter] LibreOffice not found - PPTX conversion unavailable');
          console.warn('[PptxHtmlConverter] Install with: apt-get install -y libreoffice-impress --no-install-recommends');
          this.libreOfficeAvailable = false;
          resolve(false);
          return;
        }

        execFile(candidate, ['--version'], { timeout: 10_000 }, (error, stdout, stderr) => {
          if (error) {
            tryCandidate(index + 1);
            return;
          }
          const version = (stdout || stderr || '').trim();
          this.libreOfficeCommand = candidate;
          this.libreOfficeAvailable = true;
          console.log(`[PptxHtmlConverter] LibreOffice detected via '${candidate}': ${version}`);
          resolve(true);
        });
      };
      tryCandidate(0);
    });
  }

  static async convertPptxToHtml(pptxStorageKey: string): Promise<ConversionResult> {
    if (!isOnPremMode()) {
      return { success: false, htmlPath: null, error: 'HTML conversion only available in on-prem mode' };
    }

    const available = await this.checkLibreOfficeAvailable();
    if (!available) {
      return { success: false, htmlPath: null, error: 'LibreOffice not installed' };
    }

    const lockKey = pptxStorageKey;
    if (activeConversions.has(lockKey)) {
      console.log(`[PptxHtmlConverter] Conversion already in progress for: ${pptxStorageKey}`);
      return { success: false, htmlPath: null, error: 'Conversion already in progress' };
    }

    activeConversions.add(lockKey);
    const startTime = Date.now();

    try {
      const localPptxPath = resolveLocalPath(pptxStorageKey);

      try {
        await fs.promises.access(localPptxPath, fs.constants.R_OK);
      } catch {
        return { success: false, htmlPath: null, error: `PPTX file not found: ${localPptxPath}` };
      }

      const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'lo-convert-'));

      try {
        await this.runLibreOfficeConversion(localPptxPath, tempDir);

        const tempFiles = await fs.promises.readdir(tempDir);
        const htmlFile = tempFiles.find(f => f.endsWith('.html'));

        if (!htmlFile) {
          return { success: false, htmlPath: null, error: 'LibreOffice did not produce HTML output' };
        }

        const tempHtmlPath = path.join(tempDir, htmlFile);
        let rawHtml = await fs.promises.readFile(tempHtmlPath, 'utf-8');

        rawHtml = await this.inlineImages(rawHtml, tempDir);
        rawHtml = this.wrapHtmlForViewer(rawHtml);

        const outputPath = resolveLocalPath(deriveHtmlPath(pptxStorageKey));
        await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.promises.writeFile(outputPath, rawHtml, 'utf-8');

        const durationMs = Date.now() - startTime;
        const fileSizeKB = (Buffer.byteLength(rawHtml, 'utf-8') / 1024).toFixed(1);
        console.log(`[PptxHtmlConverter] Conversion complete in ${durationMs}ms: ${outputPath} (${fileSizeKB}KB)`);

        return { success: true, htmlPath: outputPath, durationMs };
      } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      console.error(`[PptxHtmlConverter] Conversion failed after ${durationMs}ms:`, error.message);
      return { success: false, htmlPath: null, error: error.message, durationMs };
    } finally {
      activeConversions.delete(lockKey);
    }
  }

  private static runLibreOfficeConversion(pptxPath: string, outputDir: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        '--headless',
        '--norestore',
        '--convert-to', 'html',
        '--outdir', outputDir,
        pptxPath,
      ];

      const libreOfficeCommand = this.libreOfficeCommand;
      console.log(`[PptxHtmlConverter] Running: ${libreOfficeCommand} ${args.join(' ')}`);

      execFile(libreOfficeCommand, args, {
        timeout: CONVERSION_TIMEOUT_MS,
        env: {
          ...process.env,
          HOME: os.tmpdir(),
        },
      }, (error, stdout, stderr) => {
        if (error) {
          if ((error as any).killed) {
            reject(new Error(`LibreOffice conversion timed out after ${CONVERSION_TIMEOUT_MS / 1000}s`));
          } else {
            reject(new Error(`LibreOffice conversion failed: ${stderr || error.message}`));
          }
        } else {
          console.log(`[PptxHtmlConverter] LibreOffice stdout: ${stdout.trim()}`);
          if (stderr) {
            console.log(`[PptxHtmlConverter] LibreOffice stderr: ${stderr.trim()}`);
          }
          resolve(stdout);
        }
      });
    });
  }

  private static async inlineImages(html: string, tempDir: string): Promise<string> {
    const imgRegex = /(<img\s[^>]*src=["'])([^"']+)(["'][^>]*>)/gi;
    const matches: Array<{ fullMatch: string; prefix: string; src: string; suffix: string }> = [];

    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      matches.push({
        fullMatch: match[0],
        prefix: match[1],
        src: match[2],
        suffix: match[3],
      });
    }

    if (matches.length === 0) return html;

    let result = html;
    let inlinedCount = 0;

    for (const m of matches) {
      if (m.src.startsWith('data:')) continue;

      const imagePath = path.resolve(tempDir, m.src);

      if (!imagePath.startsWith(path.resolve(tempDir))) continue;

      try {
        await fs.promises.access(imagePath, fs.constants.R_OK);
        const imageBuffer = await fs.promises.readFile(imagePath);
        const ext = path.extname(m.src).toLowerCase();
        const mimeType = IMAGE_MIME_TYPES[ext] || 'image/png';
        const base64 = imageBuffer.toString('base64');
        const dataUri = `data:${mimeType};base64,${base64}`;

        result = result.replace(m.fullMatch, `${m.prefix}${dataUri}${m.suffix}`);
        inlinedCount++;
      } catch {
        console.warn(`[PptxHtmlConverter] Could not inline image: ${m.src}`);
      }
    }

    console.log(`[PptxHtmlConverter] Inlined ${inlinedCount}/${matches.length} images as base64 data URIs`);
    return result;
  }

  private static wrapHtmlForViewer(rawHtml: string): string {
    const viewerStyles = `
<style>
  html, body {
    margin: 0;
    padding: 0;
    background: #1a1a2e;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
    overflow-x: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  body > * {
    max-width: 100%;
    box-sizing: border-box;
  }
  img {
    max-width: 100%;
    height: auto;
  }
  table {
    max-width: 100%;
    border-collapse: collapse;
  }
  p, div, span, td, th {
    max-width: 100%;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
</style>`;

    if (rawHtml.includes('</head>')) {
      return rawHtml.replace('</head>', `${viewerStyles}\n</head>`);
    }

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${viewerStyles}
</head>
<body>
${rawHtml}
</body>
</html>`;
  }

  static async htmlVersionExists(pptxStorageKey: string): Promise<boolean> {
    if (!isOnPremMode()) return false;
    const htmlPath = resolveLocalPath(deriveHtmlPath(pptxStorageKey));
    try {
      await fs.promises.access(htmlPath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  static getHtmlFilePath(pptxStorageKey: string): string {
    return resolveLocalPath(deriveHtmlPath(pptxStorageKey));
  }

  static async cleanupHtmlVersion(pptxStorageKey: string): Promise<void> {
    const htmlPath = resolveLocalPath(deriveHtmlPath(pptxStorageKey));
    try {
      await fs.promises.unlink(htmlPath);
      console.log(`[PptxHtmlConverter] Cleaned up HTML for: ${pptxStorageKey}`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error(`[PptxHtmlConverter] Failed to cleanup HTML for ${pptxStorageKey}:`, error.message);
      }
    }
  }

  static async checkPdftoppmAvailable(): Promise<boolean> {
    if (this.pdftoppmAvailable !== null) {
      return this.pdftoppmAvailable;
    }

    return new Promise((resolve) => {
      execFile('pdftoppm', ['-v'], { timeout: 10_000 }, (error, _stdout, stderr) => {
        const output = (stderr || _stdout || '').trim();
        if (error && !output.includes('pdftoppm version')) {
          console.warn('[PptxHtmlConverter] pdftoppm not found - slide image conversion unavailable');
          console.warn('[PptxHtmlConverter] Install with: apt-get install -y poppler-utils');
          this.pdftoppmAvailable = false;
          resolve(false);
        } else {
          console.log(`[PptxHtmlConverter] pdftoppm detected: ${output}`);
          this.pdftoppmAvailable = true;
          resolve(true);
        }
      });
    });
  }

  static getSlidesDir(pptxStorageKey: string): string {
    const localPath = resolveLocalPath(pptxStorageKey);
    const dir = path.dirname(localPath);
    const base = path.basename(localPath, '.pptx');
    return path.join(dir, 'slides', base);
  }

  static async slideImagesExist(pptxStorageKey: string): Promise<{ exists: boolean; slideCount: number }> {
    const slidesDir = this.getSlidesDir(pptxStorageKey);
    const metadataPath = path.join(slidesDir, 'metadata.json');

    try {
      await fs.promises.access(metadataPath, fs.constants.R_OK);
      const raw = await fs.promises.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(raw);
      return { exists: true, slideCount: metadata.slideCount || 0 };
    } catch {
      return { exists: false, slideCount: 0 };
    }
  }

  static async checkSlideImageConversionAvailable(): Promise<{ available: boolean; reason?: string; tool?: string }> {
    const libreOfficeAvailable = await this.checkLibreOfficeAvailable();
    if (!libreOfficeAvailable) {
      return { available: false, reason: 'LibreOffice is not installed' };
    }

    const tool = await this.detectPdfToPngTool();
    if (!tool) {
      return {
        available: false,
        reason: 'No PDF-to-PNG tool installed (need pdftoppm, gs, or mutool)',
      };
    }

    return { available: true, tool };
  }

  static async cleanupSlideImages(pptxStorageKey: string): Promise<void> {
    const slidesDir = this.getSlidesDir(pptxStorageKey);
    try {
      await fs.promises.rm(slidesDir, { recursive: true, force: true });
      console.log(`[PptxHtmlConverter] Cleaned up slide images for: ${pptxStorageKey}`);
    } catch (error: any) {
      console.error(`[PptxHtmlConverter] Failed to cleanup slides for ${pptxStorageKey}:`, error.message);
    }
  }

  private static async checkGhostscriptAvailable(): Promise<boolean> {
    if (this.gsAvailable !== null) return this.gsAvailable;
    return new Promise((resolve) => {
      execFile('gs', ['--version'], { timeout: 10_000 }, (error) => {
        this.gsAvailable = !error;
        if (this.gsAvailable) console.log('[PptxHtmlConverter] Ghostscript (gs) detected');
        else console.warn('[PptxHtmlConverter] Ghostscript (gs) not found');
        resolve(this.gsAvailable);
      });
    });
  }

  private static async checkMutoolAvailable(): Promise<boolean> {
    if (this.mutoolAvailable !== null) return this.mutoolAvailable;
    return new Promise((resolve) => {
      execFile('mutool', ['--version'], { timeout: 10_000 }, (error, _stdout, stderr) => {
        this.mutoolAvailable = !error || (stderr || '').includes('mutool');
        if (this.mutoolAvailable) console.log('[PptxHtmlConverter] mutool detected');
        else console.warn('[PptxHtmlConverter] mutool not found');
        resolve(this.mutoolAvailable!);
      });
    });
  }

  private static async detectPdfToPngTool(): Promise<'pdftoppm' | 'gs' | 'mutool' | null> {
    if (await this.checkPdftoppmAvailable()) return 'pdftoppm';
    if (await this.checkGhostscriptAvailable()) return 'gs';
    if (await this.checkMutoolAvailable()) return 'mutool';
    return null;
  }

  private static runGhostscript(pdfPath: string, outputDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const outputPattern = path.join(outputDir, 'slide-%d.png');
      const args = [
        '-sDEVICE=pngalpha',
        `-r${SLIDE_IMAGE_DPI}`,
        '-dNOPAUSE',
        '-dBATCH',
        '-o', outputPattern,
        pdfPath,
      ];

      console.log(`[PptxHtmlConverter] Running: gs ${args.join(' ')}`);

      execFile('gs', args, {
        timeout: CONVERSION_TIMEOUT_MS,
      }, (error, stdout, stderr) => {
        if (error) {
          if ((error as any).killed) {
            reject(new Error(`Ghostscript conversion timed out after ${CONVERSION_TIMEOUT_MS / 1000}s`));
          } else {
            reject(new Error(`Ghostscript conversion failed: ${stderr || error.message}`));
          }
        } else {
          if (stdout && stdout.trim()) {
            console.log(`[PptxHtmlConverter] gs stdout: ${stdout.trim()}`);
          }
          if (stderr && stderr.trim()) {
            console.log(`[PptxHtmlConverter] gs stderr: ${stderr.trim()}`);
          }
          resolve();
        }
      });
    });
  }

  private static runMutool(pdfPath: string, outputDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const outputPattern = path.join(outputDir, 'slide-%d.png');
      const args = ['draw', '-o', outputPattern, '-r', String(SLIDE_IMAGE_DPI), pdfPath];

      console.log(`[PptxHtmlConverter] Running: mutool ${args.join(' ')}`);

      execFile('mutool', args, {
        timeout: CONVERSION_TIMEOUT_MS,
      }, (error, stdout, stderr) => {
        if (error) {
          if ((error as any).killed) {
            reject(new Error(`mutool conversion timed out after ${CONVERSION_TIMEOUT_MS / 1000}s`));
          } else {
            reject(new Error(`mutool conversion failed: ${stderr || error.message}`));
          }
        } else {
          if (stdout && stdout.trim()) {
            console.log(`[PptxHtmlConverter] mutool stdout: ${stdout.trim()}`);
          }
          if (stderr && stderr.trim()) {
            console.log(`[PptxHtmlConverter] mutool stderr: ${stderr.trim()}`);
          }
          resolve();
        }
      });
    });
  }

  private static async runPdfToPng(tool: 'pdftoppm' | 'gs' | 'mutool', pdfPath: string, tempDir: string): Promise<void> {
    if (tool === 'pdftoppm') {
      const outputPrefix = path.join(tempDir, 'slide');
      await this.runPdftoppm(pdfPath, outputPrefix);
    } else if (tool === 'gs') {
      await this.runGhostscript(pdfPath, tempDir);
    } else if (tool === 'mutool') {
      await this.runMutool(pdfPath, tempDir);
    }
  }

  private static collectPngFiles(allFiles: string[]): string[] {
    return allFiles
      .filter(f => f.endsWith('.png') && /slide[-]?\d+\.png$/i.test(f))
      .sort((a, b) => {
        const numA = parseInt(a.replace(/[^0-9]/g, ''), 10);
        const numB = parseInt(b.replace(/[^0-9]/g, ''), 10);
        return numA - numB;
      });
  }

  static async convertPptxToSlideImages(pptxStorageKey: string): Promise<ConversionResult & { slideCount?: number; slidesDir?: string }> {
    const available = await this.checkLibreOfficeAvailable();
    if (!available) {
      return { success: false, htmlPath: null, error: 'LibreOffice not installed' };
    }

    const tool = await this.detectPdfToPngTool();
    if (!tool) {
      return {
        success: false,
        htmlPath: null,
        error: 'No PDF-to-PNG tool available. Install one of: poppler-utils (pdftoppm), ghostscript (gs), or mupdf-tools (mutool)',
      };
    }

    console.log(`[PptxHtmlConverter] Using '${tool}' for PDF→PNG conversion`);

    const lockKey = pptxStorageKey;
    if (activeConversions.has(lockKey)) {
      console.log(`[PptxHtmlConverter] Conversion already in progress for: ${pptxStorageKey}`);
      return { success: false, htmlPath: null, error: 'Conversion already in progress' };
    }

    activeConversions.add(lockKey);
    const startTime = Date.now();

    try {
      const localPptxPath = resolveLocalPath(pptxStorageKey);

      try {
        await fs.promises.access(localPptxPath, fs.constants.R_OK);
      } catch {
        return { success: false, htmlPath: null, error: `PPTX file not found: ${localPptxPath}` };
      }

      const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'lo-slides-'));

      try {
        await this.runLibreOfficePdfConversion(localPptxPath, tempDir);

        const tempFiles = await fs.promises.readdir(tempDir);
        const pdfFile = tempFiles.find(f => f.endsWith('.pdf'));

        if (!pdfFile) {
          return { success: false, htmlPath: null, error: 'LibreOffice did not produce PDF output' };
        }

        const pdfPath = path.join(tempDir, pdfFile);

        await this.runPdfToPng(tool, pdfPath, tempDir);

        const allTempFiles = await fs.promises.readdir(tempDir);
        const pngFiles = this.collectPngFiles(allTempFiles);

        if (pngFiles.length === 0) {
          return { success: false, htmlPath: null, error: `${tool} did not produce any PNG files` };
        }

        const slidesDir = this.getSlidesDir(pptxStorageKey);
        await fs.promises.mkdir(slidesDir, { recursive: true });

        for (let i = 0; i < pngFiles.length; i++) {
          const srcPath = path.join(tempDir, pngFiles[i]);
          const destPath = path.join(slidesDir, `slide-${i + 1}.png`);
          await fs.promises.copyFile(srcPath, destPath);
        }

        const metadata = {
          slideCount: pngFiles.length,
          convertedAt: new Date().toISOString(),
          resolution: SLIDE_IMAGE_DPI,
          tool,
        };
        await fs.promises.writeFile(
          path.join(slidesDir, 'metadata.json'),
          JSON.stringify(metadata, null, 2),
          'utf-8'
        );

        const durationMs = Date.now() - startTime;
        console.log(`[PptxHtmlConverter] Slide image conversion complete in ${durationMs}ms: ${pngFiles.length} slides via ${tool} → ${slidesDir}`);

        return {
          success: true,
          htmlPath: null,
          slidesDir,
          slideCount: pngFiles.length,
          durationMs,
        };
      } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      console.error(`[PptxHtmlConverter] Slide image conversion failed after ${durationMs}ms:`, error.message);
      return { success: false, htmlPath: null, error: error.message, durationMs };
    } finally {
      activeConversions.delete(lockKey);
    }
  }

  static async convertPptxToSlides(pptxStorageKey: string): Promise<ConversionResult & { slideCount?: number; slidesDir?: string }> {
    const result = await this.convertPptxToSlideImages(pptxStorageKey);
    if (!result.success) {
      if (result.error === 'Conversion already in progress') {
        console.log(`[PptxHtmlConverter] Slide conversion already running for ${pptxStorageKey}`);
      } else {
        console.error(`[PptxHtmlConverter] Slide image conversion failed: ${result.error}. Ensure poppler-utils (pdftoppm), ghostscript (gs), or mupdf-tools (mutool) is installed.`);
      }
    }
    return result;
  }

  private static runLibreOfficePdfConversion(pptxPath: string, outputDir: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        '--headless',
        '--norestore',
        '--convert-to', 'pdf',
        '--outdir', outputDir,
        pptxPath,
      ];

      const libreOfficeCommand = this.libreOfficeCommand;
      console.log(`[PptxHtmlConverter] Running: ${libreOfficeCommand} ${args.join(' ')}`);

      execFile(libreOfficeCommand, args, {
        timeout: CONVERSION_TIMEOUT_MS,
        env: {
          ...process.env,
          HOME: os.tmpdir(),
        },
      }, (error, stdout, stderr) => {
        if (error) {
          if ((error as any).killed) {
            reject(new Error(`LibreOffice PDF conversion timed out after ${CONVERSION_TIMEOUT_MS / 1000}s`));
          } else {
            reject(new Error(`LibreOffice PDF conversion failed: ${stderr || error.message}`));
          }
        } else {
          console.log(`[PptxHtmlConverter] LibreOffice PDF stdout: ${stdout.trim()}`);
          if (stderr) {
            console.log(`[PptxHtmlConverter] LibreOffice PDF stderr: ${stderr.trim()}`);
          }
          resolve(stdout);
        }
      });
    });
  }

  private static runPdftoppm(pdfPath: string, outputPrefix: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['-png', '-r', String(SLIDE_IMAGE_DPI), pdfPath, outputPrefix];

      console.log(`[PptxHtmlConverter] Running: pdftoppm ${args.join(' ')}`);

      execFile('pdftoppm', args, {
        timeout: CONVERSION_TIMEOUT_MS,
      }, (error, stdout, stderr) => {
        if (error) {
          if ((error as any).killed) {
            reject(new Error(`pdftoppm conversion timed out after ${CONVERSION_TIMEOUT_MS / 1000}s`));
          } else {
            reject(new Error(`pdftoppm conversion failed: ${stderr || error.message}`));
          }
        } else {
          if (stdout.trim()) {
            console.log(`[PptxHtmlConverter] pdftoppm stdout: ${stdout.trim()}`);
          }
          if (stderr && stderr.trim()) {
            console.log(`[PptxHtmlConverter] pdftoppm stderr: ${stderr.trim()}`);
          }
          resolve();
        }
      });
    });
  }
}
