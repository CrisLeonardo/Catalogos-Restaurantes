import { rootDomainForUrls } from '@/lib/tenant';

/* ============================================================
   EL ORIGEN PÚBLICO DE ESTA PETICIÓN
   ------------------------------------------------------------
   Un `Location:` absoluto tiene que apuntar al dominio por el que
   entró la persona, no al del contenedor que atendió la petición.

   Detrás del proxy de Render eso NO se puede sacar de
   `request.nextUrl.origin` ni de `request.url`: ahí Next ve la
   petición ya reenviada al puerto interno y devuelve
   `localhost:10000` (10000 es el puerto por defecto de Render).
   No es teoría — el 2026-09-02 se comprobó contra producción:

     GET https://distleogin.com/admin/logout-operator
     → 307  location: https://localhost:10000/admin/login

   Y eso es exactamente lo que veía el dueño: pulsaba "Continuar
   como {nombre}", el candado de inactividad del layout lo mandaba
   a /admin/logout-operator, y el navegador terminaba en un
   localhost que no existe. Volver atrás y escribir la contraseña
   "lo arreglaba" solo porque un login nuevo reinicia el reloj de
   inactividad y ese camino ya no se vuelve a pisar.

   La única fuente fiable son las cabeceras que pone el proxy de
   delante (`x-forwarded-*`), con el dominio configurado como red
   de seguridad si vinieran vacías o apuntando hacia dentro.
   ============================================================ */

/** ¿Este host es el del contenedor (o cualquier cosa no publicable)? */
function esHostInterno(host: string): boolean {
  const nombre = host.toLowerCase().split(':')[0];
  return (
    !nombre ||
    nombre === 'localhost' ||
    nombre === '::1' ||
    nombre === '[::1]' ||
    nombre.startsWith('127.') ||
    nombre.endsWith('.internal') ||
    // Sin un solo punto no es un dominio público (el nombre del servicio
    // dentro de la red privada de Render entra por aquí).
    !nombre.includes('.')
  );
}

/**
 * ¿Es el entorno de desarrollo? OJO: `mi-restaurante.localhost:3000` NO es un
 * host interno —es el subdominio del tenant en local, y hay que conservarlo
 * tal cual— pero sí habla http, que es lo único que decide esta función.
 */
function esLocal(host: string): boolean {
  const nombre = host.toLowerCase().split(':')[0];
  return nombre === 'localhost' || nombre.endsWith('.localhost') || nombre.startsWith('127.');
}

/**
 * Origen público (`https://dominio`) al que redirigir desde un route handler.
 *
 * Úsalo SIEMPRE en vez de `request.nextUrl.origin` / `new URL(x, request.url)`
 * al construir un `Location:` absoluto.
 */
export function publicOrigin(request: Request): string {
  const headers = request.headers;
  // `x-forwarded-host` puede traer varios saltos separados por coma; el
  // primero es el que escribió el navegador.
  const reenviado = headers.get('x-forwarded-host')?.split(',')[0].trim();
  const candidato = reenviado || headers.get('host')?.trim() || '';

  const host = esHostInterno(candidato) ? rootDomainForUrls() : candidato;
  const proto =
    headers.get('x-forwarded-proto')?.split(',')[0].trim() ||
    (esLocal(host) ? 'http' : 'https');

  return `${proto}://${host}`;
}

/**
 * `Location:` absoluto para una ruta relativa de ESTE sitio.
 * `ruta` tiene que empezar por "/" — nunca se le pasa algo que venga de fuera
 * sin sanear antes (sería una redirección abierta).
 */
export function publicUrl(request: Request, ruta: string): string {
  return `${publicOrigin(request)}${ruta}`;
}
