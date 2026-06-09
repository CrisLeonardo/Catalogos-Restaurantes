/**
 * Crea (o actualiza) el usuario SUPER_ADMIN de la plataforma.
 *
 * Uso:
 *   node scripts/crear-super-admin.mjs <email> <password>
 *
 * Lee las claves de Supabase desde .env.local (local) o de las variables
 * de entorno del sistema (útil en producción contra el proyecto en la nube).
 *
 * Es idempotente: si el email ya existe, solo asegura el rol SUPER_ADMIN.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Cargar .env.local si existe (sin dependencias) ─────────────────
function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    /* sin .env.local: se usan las variables del sistema */
  }
}
loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];
const password = process.argv[3];

if (!url || !serviceKey) {
  console.error('✗ Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
if (!email || !password) {
  console.error('Uso: node scripts/crear-super-admin.mjs <email> <password>');
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 1) Buscar si ya existe el usuario por email.
async function findUserByEmail(target) {
  let page = 1;
  for (;;) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find(
      (u) => u.email?.toLowerCase() === target.toLowerCase(),
    );
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

const existing = await findUserByEmail(email);

let userId;
if (existing) {
  userId = existing.id;
  console.log(`• Usuario ya existía: ${email}`);
} else {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    console.error('✗ Error creando el usuario:', error.message);
    process.exit(1);
  }
  userId = data.user.id;
  console.log(`✓ Usuario creado: ${email}`);
}

// 2) Asegurar el profile como SUPER_ADMIN (sin restaurante).
const { error: profErr } = await db.from('profiles').upsert({
  id: userId,
  restaurant_id: null,
  role: 'SUPER_ADMIN',
  full_name: 'Super Admin',
});

if (profErr) {
  console.error('✗ Error creando el profile:', profErr.message);
  process.exit(1);
}

console.log('✓ Listo. Entra en /login con ese email y contraseña.');
console.log('  Serás redirigido a /super/restaurantes.');
