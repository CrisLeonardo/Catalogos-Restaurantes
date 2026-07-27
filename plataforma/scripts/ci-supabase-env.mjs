/**
 * Exporta las credenciales del Supabase local recién levantado (en CI) como
 * variables de entorno para los pasos siguientes del workflow — mismas
 * variables que usa `plataforma/.env.local` en desarrollo, para que
 * test-aislamiento.mjs y audit-security-definer.mjs corran igual en CI que
 * en la máquina de un dev. No son secretos reales: son las claves de demo
 * fijas que el CLI de Supabase genera siempre para un stack local nuevo.
 *
 * Uso: node scripts/ci-supabase-env.mjs   (después de `supabase start`)
 * Requiere GITHUB_ENV en el entorno (lo pone GitHub Actions automáticamente).
 */
import { execSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const githubEnvPath = process.env.GITHUB_ENV;
if (!githubEnvPath) {
  console.error('✗ GITHUB_ENV no está definido — este script es para correr dentro de un workflow de GitHub Actions.');
  process.exit(1);
}

const raw = execSync('npx supabase status -o json', { encoding: 'utf8' });
const status = JSON.parse(raw);

const mapping = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  SUPABASE_DB_URL: status.DB_URL,
};

let out = '';
for (const [k, v] of Object.entries(mapping)) {
  if (!v) {
    console.error(`✗ Falta ${k} en la salida de "supabase status" — ¿corriste "supabase start" antes?`);
    process.exit(1);
  }
  out += `${k}=${v}\n`;
}
appendFileSync(githubEnvPath, out);
console.log('✓ Variables de Supabase local exportadas a GITHUB_ENV:', Object.keys(mapping).join(', '));
