/* ============================================================
   API /api/print/sign
   POST → firma (RSA-SHA512, base64) la cadena que QZ Tray necesita
          para autorizar la conexión/impresión sin avisos.
   Requiere sesión de admin. La clave privada vive solo aquí
   (env QZ_PRIVATE_KEY_B64); el certificado público en src/lib/qz-cert.ts.
   ============================================================ */

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function getPrivateKey(): string | null {
  const b64 = process.env.QZ_PRIVATE_KEY_B64;
  if (!b64) return null;
  try {
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  // Solo admins autenticados pueden pedir firmas (no ser un oráculo abierto).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse('No autorizado.', { status: 401 });
  }

  const privateKey = getPrivateKey();
  if (!privateKey) {
    // Sin clave configurada → no se puede firmar; el cliente cae a modo sin firma.
    return new NextResponse('Firma no configurada.', { status: 501 });
  }

  const toSign = await req.text();
  if (!toSign) {
    return new NextResponse('Falta la cadena a firmar.', { status: 400 });
  }

  try {
    const signer = crypto.createSign('RSA-SHA512');
    signer.update(toSign);
    signer.end();
    const signature = signer.sign(privateKey, 'base64');
    return new NextResponse(signature, {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  } catch {
    return new NextResponse('Error al firmar.', { status: 500 });
  }
}
