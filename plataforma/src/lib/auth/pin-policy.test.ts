import { describe, it, expect } from 'vitest';
import { decidePinAccess, isValidDeviceId } from './pin-policy';
import { isSyntheticStaffEmail } from '@/lib/staff-email';

describe('decidePinAccess', () => {
  it('con el candado apagado deja entrar a cualquier aparato', () => {
    // El caso de TODOS los restaurantes que ya operaban antes de la migración
    // 111: aplicarla no puede cambiarles nada.
    expect(decidePinAccess({ requiresTrusted: false, trusted: false }).allowed).toBe(true);
    expect(decidePinAccess({ requiresTrusted: false, trusted: true }).allowed).toBe(true);
  });

  it('con el candado puesto solo deja entrar a los aparatos del local', () => {
    expect(decidePinAccess({ requiresTrusted: true, trusted: true }).allowed).toBe(true);
    expect(decidePinAccess({ requiresTrusted: true, trusted: false }).allowed).toBe(false);
  });

  it('conserva el porqué de la decisión, no solo el sí o el no', () => {
    // La pantalla de login necesita distinguir "no autorizado" de "no hay
    // candado" para explicarle a la persona qué hacer.
    const d = decidePinAccess({ requiresTrusted: true, trusted: false });
    expect(d).toEqual({ requiresTrusted: true, trusted: false, allowed: false });
  });
});

describe('isValidDeviceId', () => {
  it('acepta los ids que genera device-id.ts', () => {
    expect(isValidDeviceId('3f8a1c92-4b7e-4d1a-9c3f-0e5b6a7d8c91')).toBe(true); // crypto.randomUUID
    expect(isValidDeviceId('dev-k3j4h5g6lq9x1m')).toBe(true);                    // respaldo sin randomUUID
  });

  it('rechaza lo que no tiene forma de id', () => {
    expect(isValidDeviceId(null)).toBe(false);
    expect(isValidDeviceId('')).toBe(false);
    expect(isValidDeviceId('corto')).toBe(false);
    expect(isValidDeviceId('a'.repeat(65))).toBe(false);
    // Nada de separadores ni comillas: esto viaja en una cookie y termina en
    // una consulta.
    expect(isValidDeviceId("abc'; drop table restaurant_devices;--")).toBe(false);
    expect(isValidDeviceId('id con espacios')).toBe(false);
  });
});

describe('isSyntheticStaffEmail', () => {
  it('reconoce los correos internos del personal por PIN', () => {
    expect(isSyntheticStaffEmail('staff-9f2a@staff.leogin.internal')).toBe(true);
  });

  it('deja pasar el correo real de un gerente', () => {
    expect(isSyntheticStaffEmail('encargado@ejemplo.com')).toBe(false);
    expect(isSyntheticStaffEmail(null)).toBe(false);
    // Un dominio que solo TERMINA parecido no cuenta como propio.
    expect(isSyntheticStaffEmail('alguien@mistaff.leogin.internal.com')).toBe(false);
  });
});
