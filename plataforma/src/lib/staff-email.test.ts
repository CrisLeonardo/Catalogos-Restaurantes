import { describe, it, expect } from 'vitest';
import {
  isSyntheticStaffEmail,
  validateUsername,
  staffUsernameEmail,
  parseStaffUsername,
  splitLoginIdentifier,
} from '@/lib/staff-email';

/* El usuario del restaurante es una CREDENCIAL: si el correo interno se
   arma o se lee mal, alguien se queda sin poder entrar a trabajar, o —peor—
   el usuario `carlos` de un restaurante entra al de otro. Por eso estas dos
   funciones, que son puras, se prueban de verdad. */

const RID_A = '3f1b8c2e-5d47-4a90-b1c6-9e0a7d2f4b83';
const RID_B = '00000000-0000-4000-8000-000000000001';

describe('validateUsername', () => {
  it('acepta lo que una persona escribiría', () => {
    for (const u of ['carlos', 'ana_2', 'encargado-1', 'caja01']) {
      expect(validateUsername(u), u).toBeNull();
    }
  });

  it('rechaza lo que rompería el correo interno o la credencial', () => {
    for (const u of ['', 'ab', 'a'.repeat(25), 'Carlos', 'con.punto', 'con espacio', 'ñoño', 'a@b']) {
      expect(validateUsername(u), u).not.toBeNull();
    }
  });
});

describe('staffUsernameEmail / parseStaffUsername', () => {
  it('da la vuelta completa', () => {
    const email = staffUsernameEmail(RID_A, 'carlos');
    expect(isSyntheticStaffEmail(email)).toBe(true);
    expect(parseStaffUsername(email)).toEqual({
      restaurantIdFlat: RID_A.replace(/-/g, ''),
      username: 'carlos',
    });
  });

  it('el mismo usuario en dos restaurantes son dos credenciales distintas', () => {
    expect(staffUsernameEmail(RID_A, 'carlos')).not.toBe(staffUsernameEmail(RID_B, 'carlos'));
  });

  it('normaliza a minúsculas: el usuario no distingue mayúsculas al entrar', () => {
    expect(staffUsernameEmail(RID_A, 'CARLOS')).toBe(staffUsernameEmail(RID_A, 'carlos'));
  });

  it('no confunde un PIN del local ni un correo real con un usuario', () => {
    expect(parseStaffUsername('staff-9f8e7d6c5b4a3f2e1d0c9b8a@staff.leogin.internal')).toBeNull();
    expect(parseStaffUsername('carlos@gmail.com')).toBeNull();
    expect(parseStaffUsername(null)).toBeNull();
    // Con la forma correcta pero basura donde va el restaurante.
    expect(parseStaffUsername('u.no-es-un-id.carlos@staff.leogin.internal')).toBeNull();
  });
});

describe('splitLoginIdentifier', () => {
  it('un correo de verdad se reconoce como correo, con o sin restaurante delante', () => {
    expect(splitLoginIdentifier('Ana@Gmail.com', 'rincon-502')).toEqual({ kind: 'email', email: 'ana@gmail.com' });
    expect(splitLoginIdentifier('ana@gmail.com', null)).toEqual({ kind: 'email', email: 'ana@gmail.com' });
  });

  it('un usuario suelto se resuelve contra el restaurante donde se escribió', () => {
    expect(splitLoginIdentifier('  Carlos ', 'rincon-502')).toEqual({
      kind: 'username', username: 'carlos', slug: 'rincon-502',
    });
  });

  it('usuario@direccion sirve desde el dominio raíz, donde no hay restaurante que mirar', () => {
    expect(splitLoginIdentifier('carlos@rincon-502', null)).toEqual({
      kind: 'username', username: 'carlos', slug: 'rincon-502',
    });
  });

  it('el restaurante escrito manda sobre el del subdominio', () => {
    // Si alguien escribe el suyo estando en otro local, entra al suyo.
    expect(splitLoginIdentifier('carlos@otro-local', 'rincon-502')).toEqual({
      kind: 'username', username: 'carlos', slug: 'otro-local',
    });
  });

  it('sin restaurante que resolver, no adivina', () => {
    expect(splitLoginIdentifier('carlos', null)).toBeNull();
    expect(splitLoginIdentifier('', 'rincon-502')).toBeNull();
    expect(splitLoginIdentifier('   ', 'rincon-502')).toBeNull();
    expect(splitLoginIdentifier('ab', 'rincon-502')).toBeNull();       // usuario inválido
    expect(splitLoginIdentifier('con espacio', 'rincon-502')).toBeNull();
  });
});
