import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth';
import { getReportById, updateReportTextCache } from '@/lib/db';
import { convertDocxToHtml } from '@/lib/text-extract';
import fs from 'fs';
import path from 'path';

function editedHtmlPath(report: { filePath: string }): string {
  return path.join(process.cwd(), report.filePath.replace(/\.[^.]+$/, '.edited.html'));
}

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

  if (report.fileType !== 'docx') {
    return NextResponse.json({ error: 'Only DOCX files can be converted to HTML' }, { status: 400 });
  }

  // Check for edited HTML first
  const editedPath = editedHtmlPath(report);
  if (fs.existsSync(editedPath)) {
    const html = fs.readFileSync(editedPath, 'utf-8');
    return NextResponse.json({ html, edited: true });
  }

  const absPath = path.join(process.cwd(), report.filePath);
  const html = await convertDocxToHtml(absPath);
  return NextResponse.json({ html, edited: false });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const report = getReportById(id);
  if (!report || report.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (report.fileType !== 'docx') {
    return NextResponse.json({ error: 'Only DOCX reports can be edited this way' }, { status: 400 });
  }

  const { html } = await req.json();
  if (!html || typeof html !== 'string') {
    return NextResponse.json({ error: 'HTML content is required' }, { status: 400 });
  }

  // Save edited HTML alongside the DOCX
  const editedPath = editedHtmlPath(report);
  fs.writeFileSync(editedPath, html, 'utf-8');

  // Update text cache from the edited HTML for TTS
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  updateReportTextCache(id, text + '[TTS_V3]');

  return NextResponse.json({ ok: true });
}
