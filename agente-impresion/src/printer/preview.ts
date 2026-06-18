// Simulador de impresora térmica: decodifica los bytes ESC/POS y los muestra
// como saldrían en papel de 80mm (42 columnas). Sirve para desarrollar sin
// hardware térmico (una inyección como la L3250 no entiende ESC/POS).

import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exec } from 'node:child_process';

// Reverso de PC850 → caracteres (para volver a leer los acentos).
const REV: Record<number, string> = {
  0xa0: 'á', 0x82: 'é', 0xa1: 'í', 0xa2: 'ó', 0xa3: 'ú',
  0xb5: 'Á', 0x90: 'É', 0xd6: 'Í', 0xe0: 'Ó', 0xe9: 'Ú',
  0xa4: 'ñ', 0xa5: 'Ñ', 0x81: 'ü', 0x9a: 'Ü',
  0xad: '¡', 0xa8: '¿', 0xf8: '°', 0xfa: '·',
};

const WIDTH = 42;

/** Interpreta los comandos ESC/POS que emite nuestro generador y devuelve líneas. */
export function decodeEscPos(data: Uint8Array): string[] {
  const lines: string[] = [];
  let buf = '';
  let align: 0 | 1 | 2 = 0;
  let dbl = false;

  const flush = () => {
    let text = dbl ? [...buf].join(' ') : buf; // espaciado = simula doble ancho
    const len = [...text].length;
    if (align === 1) text = ' '.repeat(Math.max(0, Math.floor((WIDTH - len) / 2))) + text;
    else if (align === 2) text = ' '.repeat(Math.max(0, WIDTH - len)) + text;
    lines.push(text);
    buf = '';
  };

  let i = 0;
  while (i < data.length) {
    const c = data[i];

    if (c === 0x0a) { flush(); i++; continue; } // LF

    if (c === 0x1b) { // ESC
      const n = data[i + 1];
      if (n === 0x40) { align = 0; dbl = false; i += 2; }          // ESC @ reset
      else if (n === 0x74) { i += 3; }                              // ESC t (codepage)
      else if (n === 0x61) { align = ((data[i + 2] ?? 0) as 0 | 1 | 2); i += 3; } // ESC a align
      else if (n === 0x45) { i += 3; }                              // ESC E bold (ignorado en texto)
      else if (n === 0x64) {                                        // ESC d feed n
        if (buf) flush();
        for (let j = 0; j < (data[i + 2] ?? 0); j++) lines.push('');
        i += 3;
      } else if (n === 0x21) { i += 3; }                            // ESC ! modo
      else { i += 2; }
      continue;
    }

    if (c === 0x1d) { // GS
      const n = data[i + 1];
      if (n === 0x21) { dbl = (data[i + 2] ?? 0) !== 0; i += 3; }   // GS ! tamaño
      else if (n === 0x56) {                                        // GS V corte
        const m = data[i + 2];
        i += (m === 0x41 || m === 0x42) ? 4 : 3;
        if (buf) flush();
        lines.push('— — — — — — ✂ — — — — — —');
      } else { i += 2; }
      continue;
    }

    buf += c < 0x80 ? String.fromCharCode(c) : (REV[c] ?? '?'); // texto
    i++;
  }
  if (buf) flush();
  return lines;
}

/** Envuelve las líneas en un marco que parece papel de ticket. */
export function renderReceiptText(data: Uint8Array): string {
  const lines = decodeEscPos(data);
  const top = '┌' + '─'.repeat(WIDTH) + '┐';
  const bot = '└' + '─'.repeat(WIDTH) + '┘';
  const body = lines
    .map((l) => '│' + [...l].slice(0, WIDTH).join('').padEnd(WIDTH, ' ') + '│')
    .join('\n');
  return [top, body, bot].join('\n');
}

/** Muestra el ticket simulado en consola y lo abre en un archivo de texto. */
export async function previewEscPos(data: Uint8Array): Promise<void> {
  const receipt = renderReceiptText(data);
  console.log('\n' + receipt + '\n');
  try {
    if (process.env.LEOGIN_PREVIEW_NO_OPEN) return; // headless / pruebas
    const dir = await mkdtemp(join(tmpdir(), 'leogin-preview-'));
    const file = join(dir, 'ticket-preview.txt');
    await writeFile(file, receipt, 'utf8');
    exec(`start "" "${file}"`, { shell: 'cmd.exe' }, () => {});
  } catch {
    /* la consola ya mostró el ticket; abrir el archivo es opcional */
  }
}
