'use client';

import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import Navbar from '@/components/Navbar';

// Gate the whole club page on the build-time flag. When it's off, ClubClient is
// never imported (the ternary is dead code), so no club code ships in the /club
// route chunk and the page 404s — keeping the default build club-free.
const CLUB_BUILD = process.env.NEXT_PUBLIC_CLUB_ENABLED === 'true';
const ClubClient = CLUB_BUILD ? dynamic(() => import('./ClubClient'), { ssr: false }) : null;

export default function ClubPage() {
  if (!ClubClient) {
    notFound();
    return null;
  }
  return (
    <>
      <Navbar />
      <ClubClient />
    </>
  );
}
