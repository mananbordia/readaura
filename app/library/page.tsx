import Navbar from '@/components/Navbar';
import LibraryClient from './LibraryClient';

export default function LibraryPage() {
  // Library data is stored client-side in IndexedDB; the only thing the
  // server contributes is whether an env-var NVIDIA key exists as a fallback.
  const aiConfigured = Boolean(process.env.NVIDIA_API_KEY);
  // Build-time gate for the opt-in club UI. Unset on the public demo, so club
  // code is dynamic-imported away and the bundle is unchanged.
  const clubEnabled = process.env.NEXT_PUBLIC_CLUB_ENABLED === 'true';

  return (
    <>
      <Navbar />
      <LibraryClient aiConfigured={aiConfigured} clubEnabled={clubEnabled} />
    </>
  );
}
