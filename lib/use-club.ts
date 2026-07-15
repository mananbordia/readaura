'use client';

import { useEffect, useState } from 'react';
import type { MemberRole } from '@/shared/club-types';

// The club session (member JWT + identity) lives in localStorage, mirroring
// lib/use-api-key.ts: a custom event keeps every mounted component and other
// tabs in sync. Private library data never goes here — this is just the club
// credential.

// `expired` is set when a request comes back 401 (token rejected). We keep the
// identity so the UI can offer a one-tap reconnect instead of a silent logout;
// signing back in with the account key clears it.
export type ClubSession = { token: string; userId: string; displayName: string; role: MemberRole; expired?: boolean };

const STORAGE = 'readaura-club-session';
const CHANGE_EVENT = 'readaura-club-change';

export function readClubSession(): ClubSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE);
    return raw ? (JSON.parse(raw) as ClubSession) : null;
  } catch {
    return null;
  }
}

export function writeClubSession(session: ClubSession | null) {
  if (typeof window === 'undefined') return;
  if (session) localStorage.setItem(STORAGE, JSON.stringify(session));
  else localStorage.removeItem(STORAGE);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// A 401 means this device's token was rejected. Flag the session as needing
// re-auth WITHOUT discarding it, so the UI prompts a reconnect (sign in again
// with the account key) instead of silently logging the user out.
export function markClubSessionExpired() {
  const s = readClubSession();
  if (s && !s.expired) writeClubSession({ ...s, expired: true });
}

export function useClub() {
  const [session, setSession] = useState<ClubSession | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSession(readClubSession());
    setHydrated(true);
    const onChange = () => setSession(readClubSession());
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  return {
    session,
    hydrated,
    signedIn: hydrated && !!session,
    // Signed in, but the token was rejected — sync pauses and the UI shows a reconnect prompt.
    expired: hydrated && !!session?.expired,
    save: (s: ClubSession) => { writeClubSession(s); setSession(s); }, // fresh session clears `expired`
    signOut: () => { writeClubSession(null); setSession(null); },
  };
}
