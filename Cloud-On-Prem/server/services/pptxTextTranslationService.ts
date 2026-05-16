import JSZip from 'jszip';
import { aiTranslationService } from './aiTranslationService';

const TEXT_NODE_REGEX = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function encodeXmlEntities(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function bySlideOrder(a: string, b: string): number {
  const matchA = a.match(/(slide|notesSlide)(\d+)\.xml$/);
  const matchB = b.match(/(slide|notesSlide)(\d+)\.xml$/);
  const numA = matchA ? Number(matchA[2]) : Number.MAX_SAFE_INTEGER;
  const numB = matchB ? Number(matchB[2]) : Number.MAX_SAFE_INTEGER;
  return numA - numB;
}

export interface PptxTextTranslationResult {
  buffer: Buffer;
  translatedNodes: number;
  translatedFiles: number;
}

export class PptxTextTranslationService {
  static async translatePptxText(
    pptxBuffer: Buffer,
    targetLanguageCode: string,
    sourceLanguageCode: string,
  ): Promise<PptxTextTranslationResult> {
    const zip = await JSZip.loadAsync(pptxBuffer);

    const xmlFiles = Object.keys(zip.files)
      .filter((key) => key.startsWith('ppt/slides/slide') || key.startsWith('ppt/notesSlides/notesSlide'))
      .filter((key) => key.endsWith('.xml'))
      .sort(bySlideOrder);

    let translatedNodes = 0;
    let translatedFiles = 0;

    for (const xmlPath of xmlFiles) {
      const file = zip.file(xmlPath);
      if (!file) continue;

      const xml = await file.async('text');
      const originalTexts: string[] = [];

      xml.replace(TEXT_NODE_REGEX, (_full, textNodeValue: string) => {
        const decoded = decodeXmlEntities(textNodeValue || '');
        if (decoded.trim().length > 0) {
          originalTexts.push(decoded);
        }
        return _full;
      });

      if (!originalTexts.length) {
        continue;
      }

      const translatedTexts = await aiTranslationService.translateTextBatch(
        originalTexts,
        targetLanguageCode,
        sourceLanguageCode,
        `PPTX text nodes for ${xmlPath}`,
      );

      if (translatedTexts.length !== originalTexts.length) {
        throw new Error(
          `PPTX text translation count mismatch for ${xmlPath}: expected ${originalTexts.length}, got ${translatedTexts.length}`,
        );
      }

      let textIndex = 0;
      const translatedXml = xml.replace(TEXT_NODE_REGEX, (full, textNodeValue: string) => {
        const decoded = decodeXmlEntities(textNodeValue || '');
        if (decoded.trim().length === 0) {
          return full;
        }

        const translated = translatedTexts[textIndex++];
        const escaped = encodeXmlEntities(translated || decoded);
        return full.replace(textNodeValue, escaped);
      });

      zip.file(xmlPath, translatedXml);
      translatedNodes += originalTexts.length;
      translatedFiles += 1;
    }

    const translatedBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    return {
      buffer: translatedBuffer,
      translatedNodes,
      translatedFiles,
    };
  }
}
