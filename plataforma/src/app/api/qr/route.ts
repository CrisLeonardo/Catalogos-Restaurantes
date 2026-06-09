import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url || url.length < 4 || url.length > 500) {
    return new NextResponse('URL inválida', { status: 400 });
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return new NextResponse('URL no permitida', { status: 400 });
  }

  try {
    const svg = await QRCode.toString(url, {
      type: 'svg',
      margin: 2,
      width: 300,
      color: { dark: '#000000', light: '#ffffff' },
    });

    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch {
    return new NextResponse('Error al generar el QR', { status: 500 });
  }
}
