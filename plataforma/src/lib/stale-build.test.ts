import { describe, expect, it } from 'vitest';
import { isStaleBuildError } from './stale-build';

/* ── Contexto ─────────────────────────────────────────────────────
   Si esta detección falla por lo bajo, el usuario se queda en una
   pantalla de error de la que no puede salir sin saber hacer
   Ctrl+Shift+R. Si falla por lo alto, la app se recarga sola ante
   errores que no son de build viejo y se pierde el mensaje real.

   Los mensajes de abajo son los que producen de verdad los
   navegadores; el primero es literalmente el que salió en
   producción el 2026-08-10 tras un despliegue. */

describe('isStaleBuildError', () => {
  it('reconoce el fallo de chunk que sale tras un despliegue', () => {
    const casos = [
      'Failed to load chunk /_next/static/chunks/240oszjudm_x8.js from module 964893',
      'Loading chunk 493 failed.',
      'error loading dynamically imported module: https://leogin.online/_next/static/chunks/x.js',
      'Importing a module script failed.',
      'Server Action "60e5113dde95f01fdbeb043ef32e5999e45a989410" was not found on the server. Read more: https://nextjs.org/docs/messages/failed-to-find-server-action',
      'Failed to find Server Action "abc". This request might be from an older or newer deployment.',
    ];
    for (const message of casos) {
      expect(isStaleBuildError({ message }), message).toBe(true);
    }
  });

  it('reconoce ChunkLoadError por el nombre, aunque el mensaje no diga nada', () => {
    expect(isStaleBuildError({ name: 'ChunkLoadError', message: '' })).toBe(true);
  });

  it('NO se traga errores normales de la app', () => {
    const casos = [
      'No se pudo crear el restaurante.',
      'Email o contraseña incorrectos.',
      'fetch failed',
      'Cannot read properties of null',
      '',
    ];
    for (const message of casos) {
      expect(isStaleBuildError({ message }), message).toBe(false);
    }
  });

  it('aguanta null/undefined sin reventar', () => {
    expect(isStaleBuildError(null)).toBe(false);
    expect(isStaleBuildError(undefined)).toBe(false);
  });
});
