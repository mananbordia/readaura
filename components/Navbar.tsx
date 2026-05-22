'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpen, Settings } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { SettingsDialog } from '@/components/settings-dialog';
import { Button } from '@/components/ui/button';

export default function Navbar() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <nav className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight hover:opacity-80"
            >
              <BookOpen className="h-4 w-4 text-primary" />
              <span>ReadAura</span>
            </Link>
            <span className="text-muted-foreground">/</span>
            <Link
              href="/library"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Library
            </Link>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="h-4 w-4" />
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </nav>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
