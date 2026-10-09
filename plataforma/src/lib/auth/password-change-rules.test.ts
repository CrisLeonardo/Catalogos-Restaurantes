import { describe, expect, it } from 'vitest';
import { puedeCambiarContrasena, validarContrasenaNueva } from './password-change-rules';

describe('puedeCambiarContrasena', () => {
  it('dueño con correo y contraseña: sí', () => {
    expect(puedeCambiarContrasena({ email: 'ana@gmail.com', identities: [{ provider: 'email' }] }).ok).toBe(true);
  });

  it('administrador con usuario@restaurante: sí', () => {
    expect(puedeCambiarContrasena({
      email: 'u.15fe3b20262e4404.carlos@staff.leogin.internal',
      identities: [{ provider: 'email' }],
    }).ok).toBe(true);
  });

  it('personal de PIN: no, y le dice a quién pedírselo', () => {
    const r = puedeCambiarContrasena({ email: 'staff-6c7f3dd5@staff.leogin.internal', identities: [{ provider: 'email' }] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toMatch(/PIN/);
  });

  it('solo Google: no, y lo manda a Google', () => {
    const r = puedeCambiarContrasena({ email: 'ana@gmail.com', identities: [{ provider: 'google' }] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.google).toBe(true);
  });

  it('Google + correo enlazados: sí (tiene contraseña propia)', () => {
    expect(puedeCambiarContrasena({
      email: 'ana@gmail.com', identities: [{ provider: 'google' }, { provider: 'email' }],
    }).ok).toBe(true);
  });

  it('sin lista de identidades se asume correo', () => {
    expect(puedeCambiarContrasena({ email: 'ana@gmail.com' }).ok).toBe(true);
  });

  it('sin correo: no', () => {
    expect(puedeCambiarContrasena({ email: null }).ok).toBe(false);
  });
});

describe('validarContrasenaNueva', () => {
  const base = { actual: 'vieja-123', nueva: 'nueva-1234', nueva2: 'nueva-1234' };

  it('acepta una buena', () => {
    expect(validarContrasenaNueva(base)).toBeNull();
  });

  it('pide la actual', () => {
    expect(validarContrasenaNueva({ ...base, actual: '' })).toMatch(/actual/);
  });

  it('mínimo 8', () => {
    expect(validarContrasenaNueva({ ...base, nueva: 'corta', nueva2: 'corta' })).toMatch(/8/);
  });

  it('las dos tienen que coincidir', () => {
    expect(validarContrasenaNueva({ ...base, nueva2: 'otra-1234' })).toMatch(/coinciden/);
  });

  it('no vale repetir la actual', () => {
    expect(validarContrasenaNueva({ actual: 'misma-1234', nueva: 'misma-1234', nueva2: 'misma-1234' })).toMatch(/distinta/);
  });
});
