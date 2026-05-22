import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth';
import { getDocumentById, updateDocumentTextCache } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const doc = getDocumentById(id);
  if (!doc || doc.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (doc.fileType !== 'txt') {
    return NextResponse.json({ error: 'Only text documents can be edited' }, { status: 400 });
  }

  const { text } = await req.json();
  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'Text is required' }, { status: 400 });
  }

  const trimmed = text.trim();

  // Update the file on disk
  const absPath = path.join(process.cwd(), doc.filePath);
  fs.writeFileSync(absPath, trimmed, 'utf-8');

  // Update text cache
  updateDocumentTextCache(id, trimmed + '[TTS_V3]');

  return NextResponse.json({ ok: true });
}
