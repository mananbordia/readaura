'use client';

// Convert a DOCX blob to HTML in the browser via mammoth's browser build.
// Dynamic-imported so the heavy mammoth bundle isn't loaded during SSR or
// for users who never view a DOCX in this session.

export async function convertDocxBlobToHtml(blob: Blob): Promise<string> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await blob.arrayBuffer();
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      // Embed images as base64 data URLs so the viewer doesn't need a fetch.
      convertImage: mammoth.images.imgElement(image =>
        image.read('base64').then(imageBuffer => ({
          src: `data:${image.contentType};base64,${imageBuffer}`,
        })),
      ),
    },
  );
  return result.value;
}
