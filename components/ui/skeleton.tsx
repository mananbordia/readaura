import * as React from 'react';
import { cn } from '@/lib/utils';

// Shimmer placeholder. `bg-muted` is always offset from `bg-card`/`bg-background`
// in all three themes (light/dark/crt), so the pulse reads on each. Compose these
// to mirror the shape of whatever is loading rather than showing a bare spinner.
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

// A page of reader prose — used as the loading placeholder while a DOCX/TXT
// renders, the PDF renderer chunk loads, or PDF bytes are fetched. Mirrors the
// `.reader-prose` card so there's no layout jump when the real content lands.
function ReaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-4 sm:p-6 md:p-10', className)}>
      <Skeleton className="mb-6 h-7 w-1/2" />
      <div className="space-y-3.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-10/12" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-9/12" />
      </div>
      <div className="mt-7 space-y-3.5">
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-10/12" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

export { Skeleton, ReaderSkeleton };
