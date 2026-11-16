// Genera el código QR del cierre (public/otra-vez/qr.svg).
//   node scripts/otra-vez/qr.mjs [url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const url = process.argv[2] ?? 'https://distleogin.com';
const destino = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'otra-vez');
mkdirSync(destino, { recursive: true });
const svg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#1C1C1E', light: '#00000000' } });
writeFileSync(join(destino, 'qr.svg'), svg);
console.log(`qr.svg → ${url}`);
