import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth';
import { createReport, updateReportTextCache } from '@/lib/db';
import { extractText } from '@/lib/text-extract';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const MAX_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = new Set(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
const VALID_REGIONS = new Set(['US', 'IN', 'AE']);

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const title = (formData.get('title') as string)?.trim();
  const region = (formData.get('region') as string)?.trim().toUpperCase();
  const tagsRaw = (formData.get('tags') as string) || '';

  if (!file || !title || !region) {
    return NextResponse.json({ error: 'Missing file, title, or region' }, { status: 400 });
  }

  if (!VALID_REGIONS.has(region)) {
    return NextResponse.json({ error: 'Invalid region' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Only PDF and DOCX files are allowed' }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 });
  }

  const fileType = file.type === 'application/pdf' ? 'pdf' : 'docx';
  const id = crypto.randomUUID();
  const tags = tagsRaw.split(',').map(t => t.trim().toLowerCase().replace(/[\[\]]/g, '')).filter(Boolean);

  // Write file to disk
  const dir = path.join(process.cwd(), 'data', 'reports', userId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join('data', 'reports', userId, `${id}.${fileType}`);
  const absPath = path.join(process.cwd(), filePath);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(absPath, buffer);

  // Insert metadata
  try {
    createReport({ id, userId, region, title, tags, fileType, filePath, fileSize: file.size });
  } catch (err) {
    // Clean up orphaned file
    fs.unlinkSync(absPath);
    throw err;
  }

  // Extract text async (fire-and-forget)
  extractText(absPath, fileType)
    .then(text => updateReportTextCache(id, text))
    .catch(() => { /* text extraction is best-effort */ });

  return NextResponse.json({ id, title, region, fileType, tags, createdAt: new Date().toISOString() });
}
