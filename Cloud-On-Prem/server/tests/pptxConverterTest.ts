// @ts-ignore - No types available for pptx-in-html-out
import { PPTXInHTMLOut } from 'pptx-in-html-out';
import { objectStorageClient, parseObjectPath } from '../objectStorage';
import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import unzipper from 'unzipper';
import sharp from 'sharp';

/**
 * Test script for converting PPTX to HTML using pptx-in-html-out
 * Tests the "Learnplay Technical Innovation with Vibe Coding using Replit" lesson
 */

const LESSON_STORAGE_KEY = 'replit-objstore-715e7ee1-a469-4dc4-ab5c-071794a467d4/.private/lessons/5e9f4d34-bdad-4318-a711-d14e065614ca/a876e8b3-2bc8-4905-aff2-891eca44013b/v1.pptx';
const LESSON_ID = 'a876e8b3-2bc8-4905-aff2-891eca44013b';
const OUTPUT_DIR = path.join(process.cwd(), 'server/tests/output');

interface ExtractedImage {
  originalName: string;
  compressedName: string;
  originalSize: number;
  compressedSize: number;
}

async function extractAndCompressImages(pptxBuffer: Buffer, outputDir: string): Promise<ExtractedImage[]> {
  const extractedImages: ExtractedImage[] = [];
  const imageFiles: { [key: string]: Buffer } = {};

  const stream = Readable.from(pptxBuffer);
  await stream
    .pipe(unzipper.Parse())
    .on('entry', async (entry: any) => {
      const fileName = entry.path;

      if (fileName.match(/ppt\/media\/.*\.(jpg|jpeg|png|gif|bmp|webp)$/i)) {
        const chunks: Buffer[] = [];
        for await (const chunk of entry) {
          chunks.push(Buffer.from(chunk));
        }
        imageFiles[fileName] = Buffer.concat(chunks);
      } else {
        entry.autodrain();
      }
    })
    .promise();

  console.log(`   Found ${Object.keys(imageFiles).length} images in PPTX`);

  for (const [filePath, buffer] of Object.entries(imageFiles)) {
    const originalName = path.basename(filePath);
    const ext = path.extname(originalName).toLowerCase();
    const baseName = path.basename(originalName, ext);
    const compressedName = `${baseName}_compressed${ext}`;
    const outputPath = path.join(outputDir, compressedName);

    try {
      const originalSize = buffer.length;

      const isPNG = ext === '.png';
      const isJPEG = ext === '.jpg' || ext === '.jpeg';
      const sharpInstance = sharp(buffer);

      if (isPNG) {
        await sharpInstance
          .png({ 
            quality: 80,
            compressionLevel: 9,
            effort: 7
          })
          .toFile(outputPath);
      } else if (isJPEG) {
        await sharpInstance
          .jpeg({ 
            quality: 80, 
            mozjpeg: true 
          })
          .toFile(outputPath);
      } else {
        await fs.writeFile(outputPath, buffer);
      }

      const compressedStats = await fs.stat(outputPath);
      const compressedSize = compressedStats.size;

      extractedImages.push({
        originalName,
        compressedName,
        originalSize,
        compressedSize,
      });

      console.log(`   ✓ ${originalName} → ${compressedName} (${(originalSize / 1024).toFixed(1)}KB → ${(compressedSize / 1024).toFixed(1)}KB, ${((1 - compressedSize / originalSize) * 100).toFixed(0)}% savings)`);
    } catch (error) {
      console.error(`   ✗ Failed to compress ${originalName}:`, error);
    }
  }

  return extractedImages;
}

function updateImagePaths(html: string, extractedImages: ExtractedImage[]): string {
  let updatedHtml = html;

  for (const img of extractedImages) {
    const originalNamePattern = img.originalName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(originalNamePattern, 'g');
    updatedHtml = updatedHtml.replace(regex, `images/${img.compressedName}`);
  }

  return updatedHtml;
}

async function testPptxConversion() {
  console.log('🚀 Starting PPTX to HTML conversion test...\n');

  try {
    // Step 1: Download PPTX from object storage
    console.log('📥 Step 1: Downloading PPTX from object storage...');
    console.log(`   Storage key: ${LESSON_STORAGE_KEY}`);
    
    const { bucketName, objectName } = parseObjectPath(LESSON_STORAGE_KEY);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    const [pptxBuffer] = await file.download();
    console.log(`   ✅ Downloaded ${pptxBuffer.length} bytes\n`);

    // Step 2: Extract images from PPTX
    console.log('🖼️  Step 2: Extracting and compressing images from PPTX...');
    const imagesDir = path.join(OUTPUT_DIR, 'images');
    await fs.mkdir(imagesDir, { recursive: true });
    
    const extractedImages = await extractAndCompressImages(pptxBuffer, imagesDir);
    console.log(`   ✅ Extracted ${extractedImages.length} images\n`);

    // Step 3: Convert to HTML using pptx-in-html-out
    console.log('🔄 Step 3: Converting PPTX to HTML...');
    const converter = new PPTXInHTMLOut(pptxBuffer);
    
    // Convert with default styles
    let htmlWithStyles = await converter.toHTML({ includeStyles: true });
    console.log(`   ✅ Conversion complete! HTML length: ${htmlWithStyles.length} characters\n`);

    // Step 4: Update HTML to use extracted images
    console.log('🔗 Step 4: Updating HTML to reference extracted images...');
    htmlWithStyles = updateImagePaths(htmlWithStyles, extractedImages);
    console.log(`   ✅ HTML updated with ${extractedImages.length} image references\n`);

    // Step 5: Create output directory
    console.log('📁 Step 5: Ensuring output directory...');
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`   ✅ Directory ready: ${OUTPUT_DIR}\n`);

    // Step 6: Save HTML output with embedded styles
    console.log('💾 Step 6: Saving HTML output...');
    const htmlFilePath = path.join(OUTPUT_DIR, `${LESSON_ID}_converted.html`);
    await fs.writeFile(htmlFilePath, htmlWithStyles, 'utf-8');
    console.log(`   ✅ Saved to: ${htmlFilePath}\n`);

    // Step 7: Save PPTX for reference
    console.log('💾 Step 7: Saving original PPTX for reference...');
    const pptxFilePath = path.join(OUTPUT_DIR, `${LESSON_ID}_original.pptx`);
    await fs.writeFile(pptxFilePath, pptxBuffer);
    console.log(`   ✅ Saved to: ${pptxFilePath}\n`);

    // Step 8: Create a simple viewer page
    console.log('🌐 Step 8: Creating viewer page...');
    const viewerHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PPTX Conversion Test - Learnplay Technical Innovation</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      background: white;
      padding: 20px;
      border-radius: 10px;
      margin-bottom: 20px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    h1 {
      margin: 0 0 10px 0;
      color: #333;
    }
    .test-info {
      background: #f0f7ff;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
      border-left: 4px solid #667eea;
    }
    .test-info strong {
      display: block;
      margin-bottom: 5px;
      color: #667eea;
    }
    .viewer-frame {
      background: white;
      border-radius: 10px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.2);
      overflow: hidden;
      min-height: 600px;
    }
    iframe {
      width: 100%;
      height: 80vh;
      border: none;
    }
    .controls {
      background: white;
      padding: 15px;
      border-radius: 10px;
      margin-top: 20px;
      display: flex;
      gap: 10px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    button {
      padding: 10px 20px;
      border: none;
      border-radius: 5px;
      background: #667eea;
      color: white;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.3s;
    }
    button:hover {
      background: #5568d3;
    }
    .success {
      background: #10b981;
    }
    .success:hover {
      background: #059669;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🧪 PPTX to HTML5 Conversion Test</h1>
      <p><strong>Library:</strong> pptx-in-html-out (v0.0.2)</p>
    </div>
    
    <div class="test-info">
      <strong>📚 Test Lesson:</strong>
      <div>Learnplay Technical Innovation with Vibe Coding using Replit</div>
      <div style="margin-top: 10px; font-size: 14px; color: #666;">
        Converted on: ${new Date().toLocaleString()}
      </div>
    </div>

    <div class="viewer-frame">
      <iframe src="${LESSON_ID}_converted.html" title="Converted PPTX Viewer"></iframe>
    </div>

    <div class="controls">
      <button onclick="window.open('${LESSON_ID}_converted.html', '_blank')">
        📄 Open in New Tab
      </button>
      <button onclick="window.open('${LESSON_ID}_original.pptx', '_blank')">
        📥 Download Original PPTX
      </button>
      <button class="success" onclick="alert('Test Results:\\n\\n✅ Conversion completed\\n📊 Check browser console for details\\n🔍 Inspect HTML to verify animations')">
        ✅ View Test Results
      </button>
    </div>
  </div>

  <script>
    console.log('=== PPTX to HTML Conversion Test ===');
    console.log('Lesson: Learnplay Technical Innovation with Vibe Coding using Replit');
    console.log('Library: pptx-in-html-out');
    console.log('Converted at:', new Date().toISOString());
    console.log('');
    console.log('📋 Evaluation Criteria:');
    console.log('1. Animation Fidelity: Check if animations work (≥70% target)');
    console.log('2. Layout Quality: Text/image positioning (<10% drift target)');
    console.log('3. Transcript: Speaker notes extraction');
    console.log('4. Audio: Embedded audio support');
    console.log('5. Mobile: Responsive rendering');
  </script>
</body>
</html>`;

    const viewerFilePath = path.join(OUTPUT_DIR, 'viewer.html');
    await fs.writeFile(viewerFilePath, viewerHtml, 'utf-8');
    console.log(`   ✅ Viewer page created: ${viewerFilePath}\n`);

    // Step 9: Print test summary
    console.log('='.repeat(60));
    console.log('✨ CONVERSION TEST COMPLETE!');
    console.log('='.repeat(60));
    console.log('\n📊 Test Results Summary:');
    console.log(`   • Original PPTX: ${(pptxBuffer.length / 1024).toFixed(2)} KB`);
    console.log(`   • Converted HTML: ${(htmlWithStyles.length / 1024).toFixed(2)} KB`);
    console.log(`   • Extracted Images: ${extractedImages.length}`);
    console.log(`   • Output Directory: ${OUTPUT_DIR}`);
    console.log('\n🌐 View Results:');
    console.log(`   1. Open viewer: file://${viewerFilePath}`);
    console.log(`   2. Or serve via: cd server/tests/output && python3 -m http.server 8080`);
    console.log(`      Then visit: http://localhost:8080/viewer.html`);
    console.log('\n📋 Next Steps:');
    console.log(`   • Evaluate animation fidelity (target: ≥70%)`);
    console.log(`   • Check layout quality (target: <10% drift)`);
    console.log(`   • Test transcript extraction`);
    console.log(`   • Verify audio support`);
    console.log(`   • Test mobile responsiveness`);
    console.log('');

  } catch (error) {
    console.error('❌ Conversion test failed:', error);
    throw error;
  }
}

// Run the test
testPptxConversion()
  .then(() => {
    console.log('✅ Test script completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Test script failed:', error);
    process.exit(1);
  });
