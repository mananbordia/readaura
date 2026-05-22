'use client';

import { useEffect, useState } from 'react';

export const API_KEY_STORAGE = 'readaura-nvidia-key';

// Listen to localStorage updates from any tab + our own setter.
const CHANGE_EVENT = 'readaura-api-key-change';

export function readApiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(API_KEY_STORAGE) ?? '';
}

export function writeApiKey(key: string) {
  if (typeof window === 'undefined') return;
  const trimmed = key.trim();
  if (trimmed) {
    localStorage.setItem(API_KEY_STORAGE, trimmed);
  } else {
    localStorage.removeItem(API_KEY_STORAGE);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useApiKey() {
  const [apiKey, setApiKeyState] = useState<string>('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setApiKeyState(readApiKey());
    setHydrated(true);
    const onChange = () => setApiKeyState(readApiKey());
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  return {
    apiKey,
    setApiKey: (k: string) => { writeApiKey(k); setApiKeyState(k.trim()); },
    hasKey: hydrated && apiKey.length > 0,
    hydrated,
  };
}
