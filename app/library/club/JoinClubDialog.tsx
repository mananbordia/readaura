'use client';

import { useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { useClub } from '@/lib/use-club';
import { clubApi } from '@/lib/club/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import RecoveryCodeNotice from './RecoveryCodeNotice';

// The join / sign-in flow, as a dialog so the user never leaves the library hub.
// On success it saves the session (which flips the hub to its signed-in view via
// the useClub change event). Joining (first device) shows the account key to save;
// signing in on another device with that key just closes — the key is reusable, so
// no new code is minted and other devices stay signed in. Open with
// initialMode="recover" to land straight on the sign-in form (e.g. reconnect).
export default function JoinClubDialog({ open, onOpenChange, onSignedIn, initialMode = 'join' }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignedIn?: () => void;
  initialMode?: 'join' | 'recover';
}) {
  const club = useClub();
  const [mode, setMode] = useState<'join' | 'recover'>(initialMode);
  const [inviteCode, setInviteCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [error, setError] = useState('');

  const reset = () => {
    setMode(initialMode); setInviteCode(''); setDisplayName(''); setRecoveryInput('');
    setRecoveryCode(null); setError(''); setSubmitting(false);
  };

  const handleOpenChange = (o: boolean) => { onOpenChange(o); if (!o) reset(); };

  const submit = async () => {
    setSubmitting(true); setError('');
    try {
      if (mode === 'join') {
        const res = await clubApi.join(inviteCode.trim(), displayName.trim());
        club.save({ token: res.token, userId: res.userId, displayName: res.displayName, role: res.role });
        onSignedIn?.();
        setRecoveryCode(res.recoveryCode); // first device: show the account key to save
      } else {
        const res = await clubApi.recover(recoveryInput.trim());
        club.save({ token: res.token, userId: res.userId, displayName: res.displayName, role: res.role });
        onSignedIn?.();
        handleOpenChange(false); // reusable sign-in: nothing new to save, just close
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in.');
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Reading Club</DialogTitle>
          <DialogDescription>
            {recoveryCode
              ? 'You&apos;re in. Save your account key before closing — use it to sign in on your other devices and browsers.'
              : mode === 'recover'
                ? 'Sign in with your account key. You can be signed in on as many devices and browsers as you like.'
                : 'Join your club with an invite code to publish and discover docs. Your private notes stay on this device.'}
          </DialogDescription>
        </DialogHeader>

        {recoveryCode ? (
          <div className="flex flex-col gap-3">
            <RecoveryCodeNotice code={recoveryCode} />
            <Button className="w-full" onClick={() => handleOpenChange(false)}>I&apos;ve saved it</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {error && <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}
            {mode === 'join' ? (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="invite">Invite code</Label>
                  <Input id="invite" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="6-character invite code" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="name">Display name</Label>
                  <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="How others see you" />
                </div>
                <Button onClick={submit} disabled={submitting || !inviteCode.trim() || !displayName.trim()}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Join club'}
                </Button>
                <button className="text-xs text-muted-foreground underline" onClick={() => { setMode('recover'); setError(''); }}>
                  Already have an account? Sign in with your account key
                </button>
              </>
            ) : (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="recovery">Account key</Label>
                  <Input id="recovery" value={recoveryInput} onChange={(e) => setRecoveryInput(e.target.value)} placeholder="locator.secret" />
                </div>
                <Button onClick={submit} disabled={submitting || !recoveryInput.trim()}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
                </Button>
                <button className="text-xs text-muted-foreground underline" onClick={() => { setMode('join'); setError(''); }}>Have an invite instead? Join</button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
