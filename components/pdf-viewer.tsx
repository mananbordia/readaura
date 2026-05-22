'use client';

import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2 } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { cn } from '@/lib/utils';

// Host the worker on the unpkg CDN. We pin to the installed pdfjs-dist version
// to stay in sync. For air-gapped self-hosting, swap this for a local path
// (copy node_modules/pdfjs-dist/build/pdf.worker.min.mjs to public/).
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type Props = {
  url: string;
  className?: string;
};

export function PdfViewer({ url, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState<number>(800);
  const [error, setError] = useState<string | null>(null);

  // Measure container width and re-measure on resize so pages scale.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const padding = 48; // p-6 each side
      setWidth(Math.max(320, el.clientWidth - padding));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        'max-h-[85vh] overflow-y-auto rounded-lg border border-border bg-card p-6',
        className,
      )}
    >
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        onLoadError={err => setError(err?.message ?? 'Failed to load PDF.')}
        loading={
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading PDF…
          </div>
        }
        error={
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error ?? 'Failed to render PDF. Use "View original" to open it directly.'}
          </div>
        }
        className="flex flex-col items-center gap-4"
      >
        {Array.from({ length: numPages }, (_, i) => (
          <Page
            key={i}
            pageNumber={i + 1}
            width={width}
            className="overflow-hidden rounded shadow-md"
            renderAnnotationLayer
            renderTextLayer
          />
        ))}
      </Document>
    </div>
  );
}
