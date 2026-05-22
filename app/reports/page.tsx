import Navbar from '@/components/Navbar';
import { getReportsByRegion } from '@/lib/db';
import ReportsClient from './ReportsClient';

export default function ReportsPage() {
  const initialReports = getReportsByRegion('US');

  return (
    <>
      <Navbar />
      <ReportsClient initialReports={initialReports} />
    </>
  );
}
