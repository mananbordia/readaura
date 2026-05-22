import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth';
import { getDocumentById } from '@/lib/db';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, convertToModelMessages, type UIMessage } from 'ai';

const MAX_SELECTED_TEXT = 2000;
const MAX_CONTEXT = 2000;
const MAX_MESSAGES = 20;

// Per-user rate limiting (in-memory; resets on server restart)
const RATE_LIMIT_PER_HOUR = 60;
const RATE_LIMIT_PER_MINUTE = 10;
const requestLog = new Map<string, number[]>();

function checkRateLimit(userId: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const log = requestLog.get(userId) ?? [];
  const recent = log.filter(t => now - t < 60 * 60 * 1000);
  const lastMinute = recent.filter(t => now - t < 60 * 1000).length;

  if (recent.length >= RATE_LIMIT_PER_HOUR) {
    return { ok: false, retryAfter: 60 * 60 };
  }
  if (lastMinute >= RATE_LIMIT_PER_MINUTE) {
    return { ok: false, retryAfter: 60 };
  }
  recent.push(now);
  requestLog.set(userId, recent);
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rate = checkRateLimit(userId);
  if (!rate.ok) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, {
      status: 429,
      headers: { 'Retry-After': String(rate.retryAfter ?? 60) },
    });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const {
    reportId,
    reportTitle,
    selectedText,
    contextBefore,
    contextAfter,
    messages,
    apiKey: userApiKey,
  } = body as Record<string, unknown>;

  // Prefer the user-supplied key from localStorage; fall back to env so existing
  // self-hosted setups still work without forcing a settings round-trip.
  const clientKey = typeof userApiKey === 'string' ? userApiKey.trim() : '';
  const envKey = (process.env.NVIDIA_API_KEY ?? '').trim();
  const apiKey = clientKey || envKey;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI not configured. Add your NVIDIA API key in Settings to enable explanations.' },
      { status: 503 },
    );
  }

  if (typeof reportId !== 'string') {
    return NextResponse.json({ error: 'Invalid reportId' }, { status: 400 });
  }
  const doc = getDocumentById(reportId);
  if (!doc || doc.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (typeof selectedText !== 'string' || selectedText.trim().length === 0 || selectedText.length > MAX_SELECTED_TEXT) {
    return NextResponse.json({ error: 'Invalid selectedText' }, { status: 400 });
  }
  const ctxBefore = (typeof contextBefore === 'string' ? contextBefore : '').slice(0, MAX_CONTEXT);
  const ctxAfter = (typeof contextAfter === 'string' ? contextAfter : '').slice(0, MAX_CONTEXT);
  const title = typeof reportTitle === 'string' ? reportTitle.slice(0, 200) : doc.title;

  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: 'Invalid messages' }, { status: 400 });
  }
  if (messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: 'Conversation too long' }, { status: 400 });
  }

  const systemPrompt = `You are a reading assistant helping the user understand a document titled "${title}". The user has highlighted the following passage:

"${selectedText}"

Surrounding context (for reference only — do not summarize the whole context):
Before: ${ctxBefore}
After: ${ctxAfter}

Your job is to help the user understand this passage. On the first turn, provide a clear explanation in 2-4 sentences: define unfamiliar terms or jargon, explain the significance, and relate it to the surrounding context where relevant. Do not repeat the highlighted text verbatim.

On follow-up turns, answer the user's specific question while staying anchored to the highlighted passage and the document context. If a question goes outside the scope of the document, briefly note that and answer using general knowledge. Keep follow-up answers concise (under 200 words unless the question demands more).`;

  const isFirstTurn = messages.length === 0;
  const uiMessages: UIMessage[] = isFirstTurn
    ? [{
        id: 'seed',
        role: 'user',
        parts: [{ type: 'text', text: 'Please explain the highlighted text.' }],
      }]
    : (messages as UIMessage[]);

  const modelMessages = await convertToModelMessages(uiMessages);

  // Build the client per-request so we can honor the runtime key. Cheap.
  const nvidia = createOpenAICompatible({
    name: 'nvidia',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey,
  });

  const result = streamText({
    model: nvidia.chatModel('meta/llama-3.3-70b-instruct'),
    system: systemPrompt,
    messages: modelMessages,
    temperature: 0.3,
  });

  return result.toUIMessageStreamResponse();
}
