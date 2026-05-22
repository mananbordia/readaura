import { NextRequest, NextResponse } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const ALLOWED_VOICES = [
  'en-US-AvaMultilingualNeural',
  'en-US-EmmaMultilingualNeural',
  'en-US-BrianMultilingualNeural',
  'en-US-AndrewMultilingualNeural',
  'en-US-RogerNeural',
  'en-GB-RyanNeural',
];

export async function POST(req: NextRequest) {
  const { text, voice = 'en-US-AriaNeural' } = await req.json();

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'Text is required' }, { status: 400 });
  }

  if (!ALLOWED_VOICES.includes(voice)) {
    return NextResponse.json({ error: 'Invalid voice' }, { status: 400 });
  }

  // Limit text length per request (one paragraph at a time)
  const trimmed = text.slice(0, 5000);

  // Escape XML special characters — msedge-tts uses SSML (XML) internally,
  // so unescaped &, <, >, ", ' cause silent failures / empty audio
  const escaped = trimmed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    const { audioStream } = tts.toStream(escaped);

    // Collect chunks into a buffer and return as response
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(Buffer.from(chunk));
    }
    tts.close();

    const audioBuffer = Buffer.concat(chunks);

    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioBuffer.length),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Edge TTS error:', error);
    return NextResponse.json({ error: 'TTS generation failed' }, { status: 500 });
  }
}
