import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth';
import { getReportById, updateReportTextCache } from '@/lib/db';
import { extractText } from '@/lib/text-extract';
import path from 'path';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const report = getReportById(id);
  if (!report) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Return cached text if available
  // Re-extract DOCX if cached before marker support (v2 marker at end)
  if (report.textCache && report.textCache.endsWith('[TTS_V3]')) {
    return NextResponse.json({ text: report.textCache.slice(0, -8) });
  }

  // Extract and cache on the fly
  const absPath = path.join(process.cwd(), report.filePath);
  const text = await extractText(absPath, report.fileType);
  updateReportTextCache(id, text + '[TTS_V3]');
  return NextResponse.json({ text });
}
