'use server';

import { getSessionUserId } from '@/lib/auth';
import { getReportsByRegion, deleteReport as dbDeleteReport, getReportById, updateReport as dbUpdateReport, type ResearchReport } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function fetchReports(region: string): Promise<ResearchReport[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];
  return getReportsByRegion(region);
}

export async function removeReport(reportId: string): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };

  const report = getReportById(reportId);
  if (!report || report.userId !== userId) return { ok: false };

  // Delete file from disk
  const absPath = path.join(process.cwd(), report.filePath);
  if (fs.existsSync(absPath)) {
    fs.unlinkSync(absPath);
  }

  dbDeleteReport(reportId, userId);
  return { ok: true };
}

export async function editReport(reportId: string, title: string, tags: string[]): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  const report = getReportById(reportId);
  if (!report || report.userId !== userId) return { ok: false };
  dbUpdateReport(reportId, userId, title.trim(), tags);
  return { ok: true };
}
