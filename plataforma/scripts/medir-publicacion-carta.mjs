/**
 * Cuánto tarda un cambio de la carta en verse por cada acceso público
 * (CARTA-01, auditoría funcional del 2026-11-25).
 * ------------------------------------------------------------
 * La auditoría vio el precio nuevo en el enlace del QR (`/m/<slug>`) y el
 * viejo en el subdominio después de una recarga. Este script lee las dos
 * rutas a la vez, cada 2 s, y anota cuándo cada una muestra el precio
 * esperado. Solo lee páginas públicas: el cambio de precio lo hace el
 * dueño en su panel.
 *
 * Uso (desde plataforma/):
 *   node scripts/medir-publicacion-carta.mjs <slug> "<platillo>" <precio-nuevo> [segundos]
 *   node scripts/medir-publicacion-carta.mjs cafe-cedro-qa-2511 "Café americano" 17
 *
 * Arrancarlo y, en cuanto diga «Esperando», guardar el precio en el panel.
 * Repetirlo fuera de un despliegue: si las dos rutas cambian en el mismo
 * sondeo, la diferencia observada fue del despliegue (dos instancias con su
 * propia caché); si una tarda hasta ~60 s, la causa es otra.
 */
const [slug, platillo, precioTxt, segundosTxt = '120'] = process.argv.slice(2);
if (!slug || !platillo || !precioTxt) {
  console.error('Uso: node scripts/medir-publicacion-carta.mjs <slug> "<platillo>" <precio-nuevo> [segundos]');
  process.exit(1);
}
const esperado = Number(precioTxt);
const raiz = process.env.LEOGIN_ROOT_DOMAIN ?? 'distleogin.com';
const rutas = {
  subdominio: `https://${slug}.${raiz}/`,
  qr: `https://${raiz}/m/${slug}`,
};

const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/* El precio viaja en la carga de React como \"name\":\"<platillo>\" … \"price\":N. */
const patron = new RegExp(`\\\\"name\\\\":\\\\"${escapar(platillo)}\\\\"[^}]*?\\\\"price\\\\":([0-9.]+)`);

async function precio(url) {
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}_m=${Date.now()}`, {
    headers: { 'cache-control': 'no-cache', 'user-agent': 'leogin-medicion-carta' },
  });
  const html = await res.text();
  const m = html.match(patron);
  return { status: res.status, precio: m ? Number(m[1]) : null, cache: res.headers.get('cf-cache-status') };
}

const inicio = Date.now();
const vistoEn = {};
const limite = Number(segundosTxt) * 1000;
const t = () => `${((Date.now() - inicio) / 1000).toFixed(1).padStart(6)} s`;

console.log(`Esperando ${platillo} a Q${esperado} en:\n  ${rutas.subdominio}\n  ${rutas.qr}\n`);
while (Date.now() - inicio < limite && Object.keys(vistoEn).length < 2) {
  const lecturas = await Promise.all(Object.entries(rutas).map(async ([k, u]) => [k, await precio(u).catch((e) => ({ error: e.message }))]));
  const linea = lecturas.map(([k, r]) => `${k}: ${r.error ? `error ${r.error}` : `Q${r.precio ?? '?'} (${r.status}${r.cache ? `, ${r.cache}` : ''})`}`).join(' · ');
  console.log(`${t()}  ${linea}`);
  for (const [k, r] of lecturas) if (!vistoEn[k] && r.precio === esperado) vistoEn[k] = (Date.now() - inicio) / 1000;
  await new Promise((r) => setTimeout(r, 2000));
}

console.log('\nResultado:');
for (const k of Object.keys(rutas)) console.log(`  ${k}: ${vistoEn[k] != null ? `precio nuevo a los ${vistoEn[k].toFixed(1)} s` : 'no mostró el precio nuevo en el tiempo medido'}`);
if (vistoEn.subdominio != null && vistoEn.qr != null) {
  console.log(`  Diferencia entre accesos: ${Math.abs(vistoEn.subdominio - vistoEn.qr).toFixed(1)} s`);
}
