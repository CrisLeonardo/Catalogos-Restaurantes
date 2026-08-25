import { describe, it, expect } from 'vitest';
import { isLowPrivilegeRole, shouldHideResume } from './resume-policy';

/* ── Contexto ─────────────────────────────────────────────────────
   Checklist 2026-08-25: un mesero podía entrar como dueño en el aparato
   compartido del local con solo tocar "Continuar como {nombre}" — sin PIN
   ni contraseña — porque la sesión de correo/Google del dueño ganaba
   siempre sobre la grilla de PIN, sin importar cuánto tiempo llevara esa
   sesión abierta. Verificado con datos reales el mismo día (login de
   dueño + `restaurant_devices` a mano en Supabase local): con el
   aparato marcado de confianza, `/admin/login` abrió directo en la grilla
   de PIN — sin rastro de "Continuar como Dueño" en la página. Este archivo
   fija esa combinación en un test para que no pueda volver sin que algo
   falle aquí primero. */

describe('shouldHideResume', () => {
  it('aparato de confianza + rol alto → se esconde (el caso del checklist)', () => {
    expect(shouldHideResume(true, 'RESTAURANT_OWNER')).toBe(true);
    expect(shouldHideResume(true, 'SUPER_ADMIN')).toBe(true);
  });

  it('aparato de confianza + STAFF/WAITER → NO se esconde: ya está en la grilla de PIN', () => {
    expect(shouldHideResume(true, 'RESTAURANT_STAFF')).toBe(false);
    expect(shouldHideResume(true, 'RESTAURANT_WAITER')).toBe(false);
  });

  it('aparato SIN confianza → nunca se esconde, sea cual sea el rol', () => {
    // El celular personal del dueño, por ejemplo — el atajo tiene sentido ahí.
    expect(shouldHideResume(false, 'RESTAURANT_OWNER')).toBe(false);
    expect(shouldHideResume(false, 'SUPER_ADMIN')).toBe(false);
    expect(shouldHideResume(false, 'RESTAURANT_STAFF')).toBe(false);
  });

  it('rol ausente o desconocido en aparato de confianza → se esconde (el error prudente)', () => {
    expect(shouldHideResume(true, null)).toBe(true);
    expect(shouldHideResume(true, undefined)).toBe(true);
    expect(shouldHideResume(true, 'ALGO_QUE_NO_EXISTE')).toBe(true);
  });
});

describe('isLowPrivilegeRole', () => {
  it('STAFF y WAITER son de bajo privilegio', () => {
    expect(isLowPrivilegeRole('RESTAURANT_STAFF')).toBe(true);
    expect(isLowPrivilegeRole('RESTAURANT_WAITER')).toBe(true);
  });

  it('dueño, super admin, ausente o desconocido NO son de bajo privilegio', () => {
    expect(isLowPrivilegeRole('RESTAURANT_OWNER')).toBe(false);
    expect(isLowPrivilegeRole('SUPER_ADMIN')).toBe(false);
    expect(isLowPrivilegeRole(null)).toBe(false);
    expect(isLowPrivilegeRole(undefined)).toBe(false);
  });
});
