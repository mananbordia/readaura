import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth';
import { getDocumentById, updateDocumentTextCache } from '@/lib/db';
import { extractText } from '@/lib/text-extract';
import path from 'path';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const doc = getDocumentById(id);
  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Return cached text if available (with version marker)
  if (doc.textCache && doc.textCache.endsWith('[TTS_V3]')) {
    return NextResponse.json({ text: doc.textCache.slice(0, -8) });
  }

  // Extract and cache on the fly
  const absPath = path.join(process.cwd(), doc.filePath);
  const text = await extractText(absPath, doc.fileType);
  updateDocumentTextCache(id, text + '[TTS_V3]');
  return NextResponse.json({ text });
}
