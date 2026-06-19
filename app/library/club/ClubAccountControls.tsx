'use client';

import { useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { useClub } from '@/lib/use-club';
import { clubApi } from '@/lib/club/api';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import RecoveryCodeNotice from './RecoveryCodeNotice';

// Signed-in account chrome for the library hub header: display name, regenerate
// recovery code, and sign out. The recovery secret is stored hashed (can't be
// re-shown), so "show" mints a fresh code and invalidates the old one.
export default function ClubAccountControls({ onSignedOut }: { onSignedOut?: () => void }) {
  const club = useClub();
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (!club.signedIn) return null;

  const showRecovery = async () => {
    const token = club.session?.token;
    if (!token) return;
    if (!confirm('Show your recovery code?\n\nFor security it’s stored hashed, so we generate a NEW code and your current one stops working. Save the new code somewhere safe.')) return;
    setError('');
    try {
      const res = await clubApi.regenerateRecovery(token);
      setRecoveryCode(res.recoveryCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate a recovery code.');
    }
  };

  const signOut = () => { club.signOut(); onSignedOut?.(); };
  const dialogOpen = !!recoveryCode || !!error;
  const closeDialog = () => { setRecoveryCode(null); setError(''); };

  return (
    <div className="flex items-center gap-1 text-sm text-muted-foreground">
      <span className="mr-1 hidden truncate sm:inline">{club.session?.displayName}{club.session?.role === 'owner' ? ' · owner' : ''}</span>
      <Button variant="ghost" size="icon-sm" onClick={showRecovery} title="Recovery code" aria-label="Recovery code"><KeyRound className="h-4 w-4" /></Button>
      <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span></Button>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Recovery code</DialogTitle>
            <DialogDescription className="sr-only">
              Your reading club account recovery code.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : recoveryCode ? (
            <div className="flex flex-col gap-3">
              <RecoveryCodeNotice code={recoveryCode} />
              <Button className="w-full" onClick={closeDialog}>I&apos;ve saved it</Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
