import Navbar from '@/components/Navbar';
import LibraryClient from './LibraryClient';

export default function LibraryPage() {
  // Library data is stored client-side in IndexedDB; the only thing the
  // server contributes is whether an env-var NVIDIA key exists as a fallback.
  const aiConfigured = Boolean(process.env.NVIDIA_API_KEY);

  return (
    <>
      <Navbar />
      <LibraryClient aiConfigured={aiConfigured} />
    </>
  );
}
