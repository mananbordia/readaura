import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth';
import { getReportById, getExplanationById, appendExplanationMessages, deleteExplanation } from '@/lib/db';

const MAX_MESSAGES_TOTAL = 20;
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; explanationId: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: reportId, explanationId } = await params;
  const report = getReportById(reportId);
  if (!report || report.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const existing = getExplanationById(explanationId, userId);
  if (!existing || existing.reportId !== reportId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { messages } = (body || {}) as { messages?: unknown };

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'Invalid messages' }, { status: 400 });
  }
  if (!messages.every(isValidMessage)) {
    return NextResponse.json({ error: 'Invalid message format' }, { status: 400 });
  }
  if (existing.messages.length + messages.length > MAX_MESSAGES_TOTAL) {
    return NextResponse.json({ error: 'Conversation too long' }, { status: 400 });
  }

  const ok = appendExplanationMessages(explanationId, userId, messages);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; explanationId: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: reportId, explanationId } = await params;
  const report = getReportById(reportId);
  if (!report || report.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const existing = getExplanationById(explanationId, userId);
  if (!existing || existing.reportId !== reportId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const ok = deleteExplanation(explanationId, userId);
  return NextResponse.json({ ok });
}
