import { NextRequest, NextResponse } from 'next/server';
import { handleWhatsAppMessage } from '@/lib/whatsapp';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const from = formData.get('From') as string;
    const MAX_BODY_LENGTH = 1000;
    const rawBody = formData.get('Body') as string;
    const body = rawBody ? rawBody.slice(0, MAX_BODY_LENGTH) : rawBody;
    const profileName = formData.get('ProfileName') as string | undefined;

    if (!from || !body) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Invalid request</Message></Response>`,
        { headers: { 'Content-Type': 'text/xml' } }
      );
    }

    const response = await handleWhatsAppMessage(from, body, profileName || undefined);

    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(response)}</Message></Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    );
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>An error occurred. Please try again.</Message></Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'WhatsApp Bot Webhook',
  });
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
