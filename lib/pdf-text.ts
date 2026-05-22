'use client';

// Extract plain text from a PDF blob using pdfjs-dist. Dynamic-imported so
// the heavy PDF.js bundle stays out of the server build (and `DOMMatrix`
// isn't evaluated during SSR).

export async function extractPdfText(blob: Blob): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // Match the worker that react-pdf is already loading from unpkg.
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }

  const data = await blob.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map(item => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (pageText) pages.push(pageText);
  }
  return pages.join('\n\n');
}
