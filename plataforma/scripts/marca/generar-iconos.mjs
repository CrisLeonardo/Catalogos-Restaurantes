/**
 * Genera los iconos de Leogin desde los trazos de la marca («La Comanda»).
 *
 *   node scripts/marca/generar-iconos.mjs [carpeta-para-fuente-desktop]
 *
 * Salida (dentro de plataforma/):
 *   public/icon-512.png, public/icon-192.png   loseta coral redondeada (purpose any)
 *   public/icon-maskable-512.png               coral a sangre, comanda dentro de la
 *                                              zona segura (maskable y apple-touch-icon)
 *   src/app/icon.svg                           loseta con la versión chica (pestañas)
 *   public/logo-mark.svg                       la comanda coral sola, sin loseta
 *   src/app/favicon.ico                        16 (chica), 32 y 48 px
 * Con un argumento, deja ahí `leogin-desktop-1024.png` para `npx tauri icon`.
 *
 * Los trazos viven en src/lib/marca/trazos.mjs; si cambian, corre esto otra vez.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import {
  COMANDA_ALTO,
  COMANDA_ANCHO,
  COMANDA_CHICA,
  COMANDA_NORMAL,
  LEOGIN_CORAL,
  LEOGIN_CREMA,
} from '../../src/lib/marca/trazos.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Loseta coral (redondeada o a sangre) con la comanda crema centrada. */
function loseta(lado, { alto, redondeada = true, chica = false }) {
  const escala = alto / COMANDA_ALTO;
  const x = (lado - COMANDA_ANCHO * escala) / 2;
  const y = (lado - alto) / 2;
  const radio = redondeada ? lado * 0.23 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}">`
    + `<rect width="${lado}" height="${lado}" rx="${radio}" fill="${LEOGIN_CORAL}"/>`
    + `<path transform="translate(${x} ${y}) scale(${escala})" fill-rule="evenodd" clip-rule="evenodd" d="${chica ? COMANDA_CHICA : COMANDA_NORMAL}" fill="${LEOGIN_CREMA}"/>`
    + '</svg>';
}

const png = (svg) => sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();

/** ICO con entradas PNG (Windows Vista en adelante y todos los navegadores). */
function ico(entradas) {
  const cabecera = Buffer.alloc(6 + 16 * entradas.length);
  cabecera.writeUInt16LE(0, 0);
  cabecera.writeUInt16LE(1, 2);
  cabecera.writeUInt16LE(entradas.length, 4);
  let desplazamiento = cabecera.length;
  entradas.forEach(({ lado, datos }, i) => {
    const o = 6 + 16 * i;
    cabecera.writeUInt8(lado >= 256 ? 0 : lado, o);
    cabecera.writeUInt8(lado >= 256 ? 0 : lado, o + 1);
    cabecera.writeUInt16LE(1, o + 4);
    cabecera.writeUInt16LE(32, o + 6);
    cabecera.writeUInt32LE(datos.length, o + 8);
    cabecera.writeUInt32LE(desplazamiento, o + 12);
    desplazamiento += datos.length;
  });
  return Buffer.concat([cabecera, ...entradas.map((e) => e.datos)]);
}

const escribir = (ruta, datos) => {
  writeFileSync(join(raiz, ruta), datos);
  console.log(`✓ ${ruta}`);
};

// La comanda ocupa el 74 % del alto de la loseta (maqueta); en la maskable,
// el 56 % para quedar dentro del círculo seguro del 80 %.
escribir('public/icon-512.png', await png(loseta(512, { alto: 512 * 0.74 })));
escribir('public/icon-192.png', await png(loseta(192, { alto: 192 * 0.74 })));
escribir('public/icon-maskable-512.png', await png(loseta(512, { alto: 512 * 0.56, redondeada: false })));
escribir('src/app/icon.svg', loseta(32, { alto: 32 * 0.74, chica: true }) + '\n');
escribir('public/logo-mark.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" width="${COMANDA_ANCHO}" height="${COMANDA_ALTO}" viewBox="0 0 ${COMANDA_ANCHO} ${COMANDA_ALTO}">`
  + `<path fill-rule="evenodd" clip-rule="evenodd" d="${COMANDA_NORMAL}" fill="${LEOGIN_CORAL}"/></svg>\n`);
escribir('src/app/favicon.ico', ico([
  { lado: 16, datos: await png(loseta(16, { alto: 16 * 0.78, chica: true })) },
  { lado: 32, datos: await png(loseta(32, { alto: 32 * 0.74 })) },
  { lado: 48, datos: await png(loseta(48, { alto: 48 * 0.74 })) },
]));

const carpetaDesktop = process.argv[2];
if (carpetaDesktop) {
  const ruta = join(carpetaDesktop, 'leogin-desktop-1024.png');
  writeFileSync(ruta, await png(loseta(1024, { alto: 1024 * 0.74 })));
  console.log(`✓ ${ruta}`);
}
