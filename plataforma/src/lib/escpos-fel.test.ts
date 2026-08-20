import { describe, expect, it } from 'vitest';
import { buildReceiptEscPos, type FelTicket, type EscPosCurrency } from './escpos';
import type { OrderWithItems } from './db/orders';

/* ── Contexto ─────────────────────────────────────────────────────
   El ticket es lo único que el cliente se lleva a la mano. Antes no
   mencionaba la factura por ningún lado aunque el DTE existiera, así que
   el papel no le servía para nada fiscal.

   Lo que se comprueba aquí es sobre todo que el ticket NO MIENTA: que un
   registro interno se anuncie como lo que es, y que una factura que aún
   no certificó no se imprima como si ya estuviera lista. */

const currency: EscPosCurrency = { symbol: 'Q ', position: 'prefix', locale: 'es-GT' };

const order = {
  id: 'o1',
  order_number: 'ORD-2026-00042',
  customer_name: 'Ana López',
  customer_phone: '',
  order_type: 'DINE_IN',
  address: 'Mesa 4',
  status: 'DELIVERED',
  payment_method: 'CASH',
  subtotal: 112,
  total: 112,
  delivery_fee: 0,
  tip: 0,
  discount: 0,
  loyalty_discount: 0,
  loyalty_points_redeemed: 0,
  cash_amount: null,
  notes: null,
  created_at: '2026-08-20T18:30:00.000Z',
  items: [{ id: 'i1', name_snapshot: 'Hamburguesa', quantity: 2, subtotal: 112, options_snapshot: null, note: null }],
  voids: [],
} as unknown as OrderWithItems;

/** El ticket sale en PC850; para inspeccionarlo basta con latin1. */
function texto(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

const felCertificado: FelTicket = {
  estado: 'CERTIFICADO',
  esFiscal: true,
  serie: 'A1B2C3',
  numero: '445',
  numeroAutorizacion: '95605984-8395-5540-BE43-7D9ED0B45027',
  fechaCertificacion: '2026-08-20T18:31:00.000Z',
  receptorId: 'CF',
  receptorNombre: 'Consumidor Final',
  montoIva: 12,
  urlVerificacion: 'https://felpub.c.sat.gob.gt/verificador-web/publico/vistas/verificacionDte.jsf?tipo=autorizacion',
};

describe('ticket con factura certificada', () => {
  const t = texto(buildReceiptEscPos(order, currency, 'Mi Restaurante', undefined, felCertificado));

  it('anuncia que es una factura electrónica', () => {
    expect(t).toContain('FACTURA ELECTRONICA EN LINEA');
  });

  it('imprime serie, número y autorización', () => {
    expect(t).toContain('A1B2C3-445');
    expect(t).toContain('95605984-8395-5540-BE43-7D9ED0B45027');
  });

  it('imprime el IVA y el receptor', () => {
    expect(t).toContain('IVA incluido');
    expect(t).toContain('Consumidor Final');
  });

  it('imprime la dirección del verificador además del QR', () => {
    // Si la impresora no entiende el comando de QR, el cliente todavía
    // tiene por dónde consultar su factura.
    expect(t).toContain('felpub.c.sat.gob.gt');
  });

  it('incluye el comando de QR nativo', () => {
    const bytes = buildReceiptEscPos(order, currency, 'Mi Restaurante', undefined, felCertificado);
    // GS ( k … 1 Q 0 = imprimir el símbolo almacenado.
    const imprimirQr = [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30];
    const hay = Buffer.from(bytes).includes(Buffer.from(imprimirQr));
    expect(hay).toBe(true);
  });
});

describe('ticket de un registro interno', () => {
  const t = texto(
    buildReceiptEscPos(order, currency, 'Mi Restaurante', undefined, {
      ...felCertificado,
      esFiscal: false,
      numeroAutorizacion: 'INT-abc',
      urlVerificacion: null,
    }),
  );

  it('avisa en el papel que NO es una factura', () => {
    expect(t).toContain('NO ES UNA FACTURA');
    expect(t).toContain('Sin validez fiscal');
  });

  it('no se hace pasar por factura electrónica', () => {
    expect(t).not.toContain('FACTURA ELECTRONICA EN LINEA');
  });

  it('no imprime enlace de verificación, porque no está en el SAT', () => {
    expect(t).not.toContain('felpub');
  });
});

describe('ticket con la factura todavía en cola', () => {
  const t = texto(
    buildReceiptEscPos(order, currency, 'Mi Restaurante', undefined, {
      ...felCertificado,
      estado: 'PENDIENTE',
      numeroAutorizacion: null,
      urlVerificacion: null,
    }),
  );

  it('dice que está en proceso en vez de fingir un número', () => {
    expect(t).toContain('FACTURA EN PROCESO');
    expect(t).not.toContain('Autorizacion:');
  });
});

describe('ticket sin módulo de facturación', () => {
  it('sale exactamente como antes', () => {
    const sinFel = texto(buildReceiptEscPos(order, currency, 'Mi Restaurante'));
    expect(sinFel).toContain('TOTAL');
    expect(sinFel).toContain('Gracias por su preferencia');
    expect(sinFel).not.toContain('FACTURA');
  });
});
