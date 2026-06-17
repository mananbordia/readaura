'use client';

import { useEffect, useState } from 'react';

// The club session (member JWT + identity) lives in localStorage, mirroring
// lib/use-api-key.ts: a custom event keeps every mounted component and other
// tabs in sync. Private library data never goes here — this is just the club
// credential.

export type ClubSession = { token: string; userId: string; displayName: string };

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
    save: (s: ClubSession) => { writeClubSession(s); setSession(s); },
    signOut: () => { writeClubSession(null); setSession(null); },
  };
}
