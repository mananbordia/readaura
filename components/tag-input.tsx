'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  className?: string;
  id?: string;
  /** Render the suggestion menu in a body portal (fixed position) so it isn't
   *  clipped by an `overflow-hidden` ancestor — e.g. the library table. Leave
   *  off inside dialogs, where a body portal would trip click-outside. */
  portalMenu?: boolean;
};

function normalize(t: string) {
  return t.trim().toLowerCase().replace(/[[\]]/g, '');
}

export function TagInput({ value, onChange, suggestions = [], placeholder, className, id, portalMenu }: Props) {
  const [draft, setDraft] = React.useState('');
  const [focused, setFocused] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [menuRect, setMenuRect] = React.useState<{ left: number; top: number; width: number } | null>(null);

  const addTag = (raw: string) => {
    const tag = normalize(raw);
    if (!tag) return;
    if (value.includes(tag)) return;
    onChange([...value, tag]);
    setDraft('');
  };

  const removeTag = (tag: string) => {
    onChange(value.filter(t => t !== tag));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (draft.trim().length > 0) {
        e.preventDefault();
        addTag(draft);
      }
    } else if (e.key === 'Backspace' && draft.length === 0 && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  const matches = React.useMemo(() => {
    const q = normalize(draft);
    if (q.length === 0) return [];
    return suggestions.filter(s => s.includes(q) && !value.includes(s)).slice(0, 6);
  }, [draft, suggestions, value]);

  const showMenu = focused && matches.length > 0;

  // When portaling, track the input's viewport rect so the fixed menu stays
  // anchored under it through scroll/resize.
  React.useEffect(() => {
    if (!portalMenu || !showMenu) { setMenuRect(null); return; }
    const el = wrapRef.current;
    if (!el) return;
    const place = () => {
      const r = el.getBoundingClientRect();
      setMenuRect({ left: r.left, top: r.bottom, width: r.width });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [portalMenu, showMenu, matches]);

  const menuItems = matches.map(tag => (
    <button
      key={tag}
      type="button"
      onMouseDown={e => { e.preventDefault(); addTag(tag); }}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
    >
      <Plus className="h-3 w-3 text-muted-foreground" />
      <span>{tag}</span>
    </button>
  ));

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1">
        {value.map(tag => (
          <Badge key={tag} variant="secondary" className="gap-1 pl-2 pr-1 py-0.5">
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="rounded-sm hover:bg-background/60"
              aria-label={`Remove ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Input
          id={id}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // commit on blur if there's text
            if (draft.trim().length > 0) addTag(draft);
            setTimeout(() => setFocused(false), 100);
          }}
          onFocus={() => setFocused(true)}
          placeholder={value.length === 0 ? placeholder : ''}
          className="h-7 flex-1 min-w-[120px] border-0 bg-transparent px-1 py-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
      {showMenu && !portalMenu && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-md">
          {menuItems}
        </div>
      )}
      {portalMenu && showMenu && menuRect && createPortal(
        <div
          style={{ position: 'fixed', left: menuRect.left, top: menuRect.top + 4, width: menuRect.width, zIndex: 60 }}
          className="overflow-hidden rounded-md border border-border bg-popover shadow-md"
        >
          {menuItems}
        </div>,
        document.body,
      )}
    </div>
  );
}
