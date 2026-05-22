import Navbar from '@/components/Navbar';
import { getSessionUserId } from '@/lib/auth';
import { listDocuments } from '@/lib/db';
import LibraryClient from './LibraryClient';

export default async function LibraryPage() {
  const userId = await getSessionUserId();
  const initialDocuments = userId ? listDocuments(userId) : [];
  const aiConfigured = Boolean(process.env.NVIDIA_API_KEY);

  return (
    <>
      <Navbar />
      <LibraryClient initialDocuments={initialDocuments} aiConfigured={aiConfigured} />
    </>
  );
}
