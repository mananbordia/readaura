'use client';

// Formatting toolbar for the in-browser rich editor (DOCX / TXT).
// Operates on the active contentEditable selection via document.execCommand.
// execCommand is deprecated but remains the only dependency-free way to drive a
// contentEditable region, and every target browser still supports it. Buttons
// use onMouseDown→preventDefault so clicking them never steals the selection
// from the editor.

import * as React from 'react';
import {
  Bold, Italic, Underline, Strikethrough,
  Heading1, Heading2, Heading3, Pilcrow,
  List, ListOrdered, Quote, RemoveFormatting,
  Undo2, Redo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  /** Runs a contentEditable command and keeps focus in the editor. */
  exec: (command: string, value?: string) => void;
  className?: string;
};

function queryState(command: string): boolean {
  try { return document.queryCommandState(command); } catch { return false; }
}

function currentBlock(): string {
  try { return (document.queryCommandValue('formatBlock') || '').toLowerCase(); } catch { return ''; }
}

function Btn({
  label, onClick, active, children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      // preventDefault keeps the editor's selection from being lost on click.
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        active && 'bg-accent text-accent-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />;
}

export function EditorToolbar({ exec, className }: Props) {
  // Re-render on selection change so the toggle buttons reflect the caret's
  // current formatting (bold/italic/heading/etc.).
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    const onSel = () => force();
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  const block = currentBlock();

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-card p-1.5',
        className,
      )}
      // role="group" (not "toolbar"): the WAI-ARIA toolbar pattern implies a
      // single tab stop with arrow-key roving, which we don't implement — every
      // button is its own tab stop, so "group" matches the actual behavior.
      role="group"
      aria-label="Formatting"
    >
      <Btn label="Undo (Ctrl+Z)" onClick={() => exec('undo')}><Undo2 className="h-4 w-4" /></Btn>
      <Btn label="Redo (Ctrl+Shift+Z)" onClick={() => exec('redo')}><Redo2 className="h-4 w-4" /></Btn>
      <Sep />
      <Btn label="Paragraph" active={block === 'p' || block === 'div' || block === ''} onClick={() => exec('formatBlock', '<p>')}><Pilcrow className="h-4 w-4" /></Btn>
      <Btn label="Heading 1" active={block === 'h1'} onClick={() => exec('formatBlock', '<h1>')}><Heading1 className="h-4 w-4" /></Btn>
      <Btn label="Heading 2" active={block === 'h2'} onClick={() => exec('formatBlock', '<h2>')}><Heading2 className="h-4 w-4" /></Btn>
      <Btn label="Heading 3" active={block === 'h3'} onClick={() => exec('formatBlock', '<h3>')}><Heading3 className="h-4 w-4" /></Btn>
      <Sep />
      <Btn label="Bold (Ctrl+B)" active={queryState('bold')} onClick={() => exec('bold')}><Bold className="h-4 w-4" /></Btn>
      <Btn label="Italic (Ctrl+I)" active={queryState('italic')} onClick={() => exec('italic')}><Italic className="h-4 w-4" /></Btn>
      <Btn label="Underline (Ctrl+U)" active={queryState('underline')} onClick={() => exec('underline')}><Underline className="h-4 w-4" /></Btn>
      <Btn label="Strikethrough" active={queryState('strikeThrough')} onClick={() => exec('strikeThrough')}><Strikethrough className="h-4 w-4" /></Btn>
      <Sep />
      <Btn label="Bulleted list" active={queryState('insertUnorderedList')} onClick={() => exec('insertUnorderedList')}><List className="h-4 w-4" /></Btn>
      <Btn label="Numbered list" active={queryState('insertOrderedList')} onClick={() => exec('insertOrderedList')}><ListOrdered className="h-4 w-4" /></Btn>
      <Btn label="Quote" active={block === 'blockquote'} onClick={() => exec('formatBlock', '<blockquote>')}><Quote className="h-4 w-4" /></Btn>
      <Sep />
      {/* removeFormat only strips inline styling, so also collapse the block
          back to a paragraph and toggle off any active list. */}
      <Btn
        label="Clear formatting"
        onClick={() => {
          exec('removeFormat');
          if (queryState('insertUnorderedList')) exec('insertUnorderedList');
          if (queryState('insertOrderedList')) exec('insertOrderedList');
          exec('formatBlock', '<p>');
        }}
      ><RemoveFormatting className="h-4 w-4" /></Btn>
    </div>
  );
}
