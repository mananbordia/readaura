import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth';
import { createReport, updateReportTextCache } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const VALID_REGIONS = new Set(['US', 'IN', 'AE']);
const MAX_TEXT_LENGTH = 500_000; // ~500KB of text

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { title, text, region, tags: tagsRaw = '' } = await req.json();

  if (!title?.trim() || !text?.trim() || !region?.trim()) {
    return NextResponse.json({ error: 'Missing title, text, or region' }, { status: 400 });
  }

  const regionUp = region.trim().toUpperCase();
  if (!VALID_REGIONS.has(regionUp)) {
    return NextResponse.json({ error: 'Invalid region' }, { status: 400 });
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: 'Text too long (max 500K characters)' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const tags = tagsRaw.split(',').map((t: string) => t.trim().toLowerCase().replace(/[\[\]]/g, '')).filter(Boolean);

  // Save as .txt file
  const dir = path.join(process.cwd(), 'data', 'reports', userId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join('data', 'reports', userId, `${id}.txt`);
  const absPath = path.join(process.cwd(), filePath);
  const buffer = Buffer.from(text.trim(), 'utf-8');
  fs.writeFileSync(absPath, buffer);

  try {
    createReport({ id, userId, region: regionUp, title: title.trim(), tags, fileType: 'txt', filePath, fileSize: buffer.length });
  } catch (err) {
    fs.unlinkSync(absPath);
    throw err;
  }

  // Cache the text directly (no extraction needed) — include version marker
  updateReportTextCache(id, text.trim() + '[TTS_V3]');

  return NextResponse.json({ id, title: title.trim(), region: regionUp, fileType: 'txt', tags, createdAt: new Date().toISOString() });
}
