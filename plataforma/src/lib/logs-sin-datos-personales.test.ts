/**
 * Los registros del servidor no llevan datos personales (auditoría de
 * lanzamiento 2026-11-23, LZ-10 y ASVS 16.3/16.4).
 *
 * Al revisarlos había 55 llamadas a console.* en el servidor y ninguna
 * escribía teléfono, correo, dirección, NIT ni nombre de un comensal: solo
 * identificadores internos y mensajes de error. Esta prueba evita que una
 * llamada nueva los meta: los logs de Render los leen más personas y viven
 * más tiempo que la base, y no hay forma de borrarlos por cliente.
 *
 * Si de verdad hace falta registrar algo así, que sea un identificador
 * (el id del pedido o del cliente), no el dato.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..');

/* Variables o campos que, puestos en un log, serían un dato personal. */
const PERSONAL = /\b(phone|telefono|teléfono|customer_phone|customer_name|customerName|email|correo|address|direccion|dirección|nit|dpi|password|contrasena|contraseña|pin)\b/i;

/* Excepciones revisadas a mano. */
const PERMITIDOS = new Set([
  // Solo existe con DEV_LOGIN=1 y Supabase local (dos candados).
  'app/api/dev-login/route.ts',
  // Registra el texto del error de Supabase Auth, no la contraseña.
  'lib/actions/password-change.ts',
]);

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(ts|tsx)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

describe('logs del servidor sin datos personales', () => {
  it('ninguna llamada a console.* escribe teléfono, correo, dirección, NIT o nombre', () => {
    const hallazgos: string[] = [];
    for (const ruta of archivos(RAIZ)) {
      const rel = relative(RAIZ, ruta).replace(/\\/g, '/');
      if (PERMITIDOS.has(rel)) continue;
      const lineas = readFileSync(ruta, 'utf8').split('\n');
      lineas.forEach((linea, i) => {
        if (!/console\.(log|info|warn|error)\(/.test(linea)) return;
        // La llamada puede seguir en las dos líneas siguientes.
        const llamada = [linea, lineas[i + 1] ?? '', lineas[i + 2] ?? ''].join(' ');
        const argumentos = llamada.slice(llamada.indexOf('console.'));
        // El texto fijo entre comillas no cuenta: «sin teléfono» no filtra nada.
        const sinTextoFijo = argumentos.replace(/'[^']*'|"[^"]*"/g, '').replace(/`[^`$]*`/g, '');
        if (PERSONAL.test(sinTextoFijo)) hallazgos.push(`${rel}:${i + 1}: ${linea.trim()}`);
      });
    }
    expect(hallazgos).toEqual([]);
  });
});
