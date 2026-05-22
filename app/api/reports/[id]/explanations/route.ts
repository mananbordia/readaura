import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth';
import { getReportById, createExplanation, getExplanationsByReport } from '@/lib/db';
import crypto from 'crypto';

const MAX_SELECTED_TEXT = 2000;
const MAX_CONTEXT = 2000;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CONTENT = 4000;

type IncomingMessage = { role: 'user' | 'assistant'; content: string };

function isValidMessage(m: unknown): m is IncomingMessage {
  if (!m || typeof m !== 'object') return false;
  const obj = m as Record<string, unknown>;
  return (obj.role === 'user' || obj.role === 'assistant')
    && typeof obj.content === 'string'
    && obj.content.trim().length > 0
    && obj.content.length <= MAX_MESSAGE_CONTENT;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const report = getReportById(id);
  if (!report || report.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const explanations = getExplanationsByReport(id, userId);
  return NextResponse.json({ explanations });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: reportId } = await params;
  const report = getReportById(reportId);
  if (!report || report.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { selectedText, contextBefore, contextAfter, messages } = body as {
    selectedText?: unknown;
    contextBefore?: unknown;
    contextAfter?: unknown;
    messages?: unknown;
  };

  if (typeof selectedText !== 'string' || selectedText.trim().length === 0 || selectedText.length > MAX_SELECTED_TEXT) {
    return NextResponse.json({ error: 'Invalid selectedText' }, { status: 400 });
  }
  const ctxBefore = typeof contextBefore === 'string' ? contextBefore.slice(0, MAX_CONTEXT) : '';
  const ctxAfter = typeof contextAfter === 'string' ? contextAfter.slice(0, MAX_CONTEXT) : '';

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: 'Invalid messages' }, { status: 400 });
  }
  if (!messages.every(isValidMessage)) {
    return NextResponse.json({ error: 'Invalid message format' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  createExplanation({
    id,
    userId,
    reportId,
    selectedText,
    contextBefore: ctxBefore,
    contextAfter: ctxAfter,
    messages,
    createdAt,
  });

  return NextResponse.json({ id, createdAt });
}
