import fs from 'fs';
import path from 'path';

export async function extractText(filePath: string, fileType: string): Promise<string> {
  const abs = path.resolve(filePath);
  if (fileType === 'pdf') {
    return extractPdfText(abs);
  }
  if (fileType === 'docx') {
    return extractDocxText(abs);
  }
  if (fileType === 'txt') {
    return fs.readFileSync(abs, 'utf-8');
  }
  throw new Error(`Unsupported file type: ${fileType}`);
}

async function extractPdfText(filePath: string): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

async function extractDocxText(filePath: string): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

export async function convertDocxToHtml(filePath: string): Promise<string> {
  const mammoth = await import('mammoth');
  const abs = path.resolve(filePath);
  const result = await mammoth.convertToHtml(
    { path: abs },
    {
      convertImage: mammoth.images.imgElement(image => {
        return image.read('base64').then(imageBuffer => {
          const src = `data:${image.contentType};base64,${imageBuffer}`;
          return { src };
        });
      }),
    },
  );
  return result.value;
}
