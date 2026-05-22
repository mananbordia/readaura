import Navbar from '@/components/Navbar';
import { getSessionUserId } from '@/lib/auth';
import { listDocuments } from '@/lib/db';
import ReportsClient from './ReportsClient';

export default async function ReportsPage() {
  const userId = await getSessionUserId();
  const initialDocuments = userId ? listDocuments(userId) : [];
  const aiConfigured = Boolean(process.env.NVIDIA_API_KEY);

  return (
    <>
      <Navbar />
      <ReportsClient initialDocuments={initialDocuments} aiConfigured={aiConfigured} />
    </>
  );
}
