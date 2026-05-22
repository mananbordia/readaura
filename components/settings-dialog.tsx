'use client';

import * as React from 'react';
import { Eye, EyeOff, Key, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useApiKey } from '@/lib/use-api-key';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsDialog({ open, onOpenChange }: Props) {
  const { apiKey, setApiKey } = useApiKey();
  const [draft, setDraft] = React.useState('');
  const [reveal, setReveal] = React.useState(false);

  // Reset draft to the saved key whenever the dialog opens
  React.useEffect(() => {
    if (open) {
      setDraft(apiKey);
      setReveal(false);
    }
  }, [open, apiKey]);

  const save = () => {
    setApiKey(draft);
    onOpenChange(false);
  };

  const clear = () => {
    setApiKey('');
    setDraft('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" /> AI provider key
          </DialogTitle>
          <DialogDescription>
            ReadAura uses NVIDIA NIM (Llama 3.3 70B, free tier) for highlight-to-explain.
            Your key is stored locally in your browser — never sent anywhere except NVIDIA via this app&apos;s server.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="api-key">NVIDIA API key</Label>
            <div className="flex gap-1">
              <Input
                id="api-key"
                type={reveal ? 'text' : 'password'}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="nvapi-…"
                autoComplete="off"
                spellCheck={false}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setReveal(r => !r)}
                aria-label={reveal ? 'Hide key' : 'Show key'}
              >
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Don&apos;t have one? Get a free key at{' '}
              <a className="underline" href="https://build.nvidia.com/" target="_blank" rel="noopener noreferrer">
                build.nvidia.com
              </a>.
            </p>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {apiKey ? (
            <Button variant="ghost" onClick={clear} className="text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={draft.trim() === apiKey}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
