'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

// A high-friction confirmation: the destructive action stays disabled until the
// user types the confirm word (default "confirm"). For irreversible things like
// deleting a private, local-only document.
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmWord?: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmWord = 'confirm',
  confirmLabel = 'Delete',
  onConfirm,
}: Props) {
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  // Reset when the dialog closes so the next open starts blank.
  React.useEffect(() => {
    if (!open) { setText(''); setBusy(false); }
  }, [open]);

  const matched = text.trim().toLowerCase() === confirmWord.toLowerCase();

  const run = async () => {
    if (!matched || busy) return;
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      setBusy(false); // keep the dialog open if the action failed
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="grid gap-1.5">
          <label htmlFor="confirm-word" className="text-sm text-muted-foreground">
            Type <span className="rounded bg-muted px-1 py-0.5 font-mono font-semibold text-foreground">{confirmWord}</span> to confirm.
          </label>
          <Input
            id="confirm-word"
            value={text}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
            placeholder={confirmWord}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={run} disabled={!matched || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
