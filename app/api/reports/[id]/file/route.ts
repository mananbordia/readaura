import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth';
import { getReportById } from '@/lib/db';
import fs from 'fs';
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

  const absPath = path.join(process.cwd(), report.filePath);
  if (!fs.existsSync(absPath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const buffer = fs.readFileSync(absPath);
  const contentType = report.fileType === 'pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${report.title}.${report.fileType}"`,
    },
  });
}
