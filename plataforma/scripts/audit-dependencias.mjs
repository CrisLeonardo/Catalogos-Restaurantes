#!/usr/bin/env node
/* ============================================================
   npm audit de las dependencias de producción, con excepciones escritas
   ------------------------------------------------------------
   SEG-05 de docs/auditorias/AUDITORIA_SALIDA_PRODUCCION_2026-10-09.md.
   Es `npm audit --omit=dev --audit-level=high` con una diferencia: un aviso
   alto o crítico que NO tiene arreglo publicado y que se revisó a mano
   puede quedar en EXCEPCIONES, con el motivo y una fecha de revisión. Sin
   esto la CI quedaría en rojo para siempre por algo que nadie puede
   arreglar, y la gente se acostumbra a ignorar el rojo.

   · Un aviso nuevo (alto o crítico) que no está en la lista → falla.
   · Una excepción vencida (`revisar` ya pasó) → falla: hay que volver a
     mirar si salió el arreglo y renovar la fecha o quitarla.
   · Una excepción que ya no aparece en el audit → solo avisa, para
     borrarla.

   Uso: node scripts/audit-dependencias.mjs   (desde plataforma/)
   ============================================================ */
import { spawnSync } from 'node:child_process';

const EXCEPCIONES = {
  'GHSA-86w9-cpqp-85rv': {
    paquete: 'node-forge',
    motivo:
      'Llega por acme-client (certificados del hub, src/lib/hub-tls/acme.ts). ' +
      'No hay versión de node-forge sin el fallo (la última, 1.4.0, está en el rango). ' +
      'El fallo es al VERIFICAR firmas RSA PKCS#1 v1.5; acme-client solo usa node-forge ' +
      'en su API vieja `acme.forge`, y el código usa `acme.crypto` (@peculiar/x509), ' +
      'así que el camino vulnerable no se ejecuta.',
    revisar: '2027-01-10',
  },
};

const NIVELES_QUE_FALLAN = new Set(['high', 'critical']);

// Una sola cadena con shell: en Windows `npm` es un .cmd y no arranca sin
// shell, y pasar argumentos sueltos con shell está obsoleto (DEP0190).
const r = spawnSync('npm audit --omit=dev --json', {
  encoding: 'utf8',
  shell: true,
  maxBuffer: 64 * 1024 * 1024,
});

let informe;
try {
  informe = JSON.parse(r.stdout);
} catch {
  console.error('No se pudo leer la salida de npm audit:\n', r.stdout, r.stderr);
  process.exit(2);
}
if (informe.error) {
  console.error('npm audit falló:', informe.error.summary ?? informe.error);
  process.exit(2);
}

// Cada aviso aparece en el paquete vulnerable (via = objeto); los paquetes
// que solo dependen de él (via = texto) se cuentan en ese aviso, no aparte.
const avisos = new Map();
for (const [nombre, v] of Object.entries(informe.vulnerabilities ?? {})) {
  for (const via of v.via) {
    if (typeof via !== 'object') continue;
    const ghsa = via.url?.split('/').pop() ?? String(via.source);
    if (!avisos.has(ghsa)) avisos.set(ghsa, { ...via, ghsa, paquete: nombre });
  }
}

const hoy = new Date().toISOString().slice(0, 10);
const fallos = [];
const toleradas = [];
for (const a of avisos.values()) {
  if (!NIVELES_QUE_FALLAN.has(a.severity)) continue;
  const exc = EXCEPCIONES[a.ghsa];
  if (!exc) fallos.push(`${a.severity.toUpperCase()} ${a.paquete} ${a.range} — ${a.title} (${a.url})`);
  else if (exc.revisar < hoy) fallos.push(`Excepción VENCIDA el ${exc.revisar}: ${a.ghsa} (${a.paquete}). Revisar si ya hay arreglo.`);
  else toleradas.push(`${a.ghsa} (${a.paquete}) hasta ${exc.revisar}: ${exc.motivo}`);
}
for (const ghsa of Object.keys(EXCEPCIONES)) {
  if (!avisos.has(ghsa)) console.warn(`Aviso: la excepción ${ghsa} ya no aparece en npm audit; se puede borrar.`);
}

const resumen = informe.metadata?.vulnerabilities ?? {};
console.log(
  `npm audit --omit=dev: ${resumen.critical ?? 0} críticas, ${resumen.high ?? 0} altas, ` +
    `${resumen.moderate ?? 0} moderadas, ${resumen.low ?? 0} bajas.`,
);
for (const t of toleradas) console.log(`  · Tolerada: ${t}`);

if (fallos.length) {
  console.error(`\n${fallos.length} aviso(s) alto(s) o crítico(s) sin excepción:`);
  for (const f of fallos) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('Sin avisos altos ni críticos fuera de las excepciones.');
