'use client';

import { notFound, useRouter } from 'next/navigation';
import { useEffect } from 'react';

// The club experience now lives inside the library hub. /club is kept only as a
// redirect so old bookmarks/links land on the Discover tab. When the flag is off
// the route 404s exactly as before — no club code is referenced here either way.
const CLUB_BUILD = process.env.NEXT_PUBLIC_CLUB_ENABLED === 'true';

function ClubRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/library?tab=discover'); }, [router]);
  return null;
}

export default function ClubPage() {
  if (!CLUB_BUILD) {
    notFound();
    return null;
  }
  return <ClubRedirect />;
}
