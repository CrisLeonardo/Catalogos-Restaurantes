// ESC/POS mínimo para el ticket de prueba del agente.
// (Los tickets reales de cocina/recibo se generan en el servidor con la lógica
//  de plataforma/src/lib/escpos.ts y llegan al agente ya como bytes crudos.)

// PC850: cubre acentos del español en impresoras térmicas.
const PC850: Record<string, number> = {
  á: 0xa0, é: 0x82, í: 0xa1, ó: 0xa2, ú: 0xa3,
  Á: 0xb5, É: 0x90, Í: 0xd6, Ó: 0xe0, Ú: 0xe9,
  ñ: 0xa4, Ñ: 0xa5, ü: 0x81, Ü: 0x9a,
  '¡': 0xad, '¿': 0xa8, '°': 0xf8,
};

function enc(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    out.push(code < 0x80 ? code : (PC850[ch] ?? 0x3f));
  }
  return out;
}

/** Ticket de prueba: confirma que la impresora recibe bytes ESC/POS y corta papel. */
export function buildTestTicket(label = 'PRUEBA'): Uint8Array {
  const b: number[] = [];
  const now = new Date().toLocaleString('es-GT', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  b.push(0x1b, 0x40);             // ESC @  reset
  b.push(0x1b, 0x74, 0x02);       // ESC t 2  codepage PC850
  b.push(0x1b, 0x61, 0x01);       // centrar

  b.push(0x1d, 0x21, 0x11);       // doble alto+ancho
  b.push(...enc('LEOGIN'), 0x0a);
  b.push(0x1d, 0x21, 0x00);       // tamaño normal

  b.push(0x1b, 0x45, 0x01);       // bold on
  b.push(...enc('Agente de impresion'), 0x0a);
  b.push(0x1b, 0x45, 0x00);       // bold off

  b.push(...enc(`Prueba: ${label}`), 0x0a);
  b.push(...enc(now), 0x0a);

  b.push(0x1b, 0x61, 0x00);       // alinear a la izquierda
  b.push(...enc('-'.repeat(42)), 0x0a);
  b.push(...enc('Si lees esto, la impresora esta'), 0x0a);
  b.push(...enc('conectada correctamente.'), 0x0a);
  b.push(...enc('Acentos: a=á e=é i=í o=ó u=ú ñ ¿ ¡ °'), 0x0a);
  b.push(...enc('-'.repeat(42)), 0x0a);

  b.push(0x1b, 0x64, 0x04);       // avanzar 4 líneas
  b.push(0x1d, 0x56, 0x42, 0x00); // corte parcial

  return new Uint8Array(b);
}
