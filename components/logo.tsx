import { cn } from '@/lib/utils';

type Props = {
  size?: number;
  className?: string;
};

// ReadAura mark: an open book with a single light dot above it — "read + aura".
// `currentColor` makes it match the surrounding text colour, so the same SVG
// works on the light, dark, and CRT themes without a swap.
export function Logo({ size = 20, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(className)}
      aria-hidden="true"
    >
      {/* aura — a soft halo above the book */}
      <circle cx="12" cy="3.25" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="3.25" r="2.4" opacity="0.35" />
      {/* open book */}
      <path d="M3 7.5h5.5a3.5 3.5 0 0 1 3.5 3.5v10a2.5 2.5 0 0 0-2.5-2.5H3z" fill="currentColor" stroke="none" />
      <path d="M21 7.5h-5.5a3.5 3.5 0 0 0-3.5 3.5v10a2.5 2.5 0 0 1 2.5-2.5H21z" fill="currentColor" stroke="none" />
    </svg>
  );
}
