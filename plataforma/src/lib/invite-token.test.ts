import { describe, it, expect } from 'vitest';
import { newInviteToken, hashInviteToken, INVITE_TTL_MS } from '@/lib/invite-token';

/* ── Contexto ─────────────────────────────────────────────────────
   El token de invitación es lo único que separa "el encargado del local"
   de "cualquiera que reciba un reenvío". Lo que se prueba aquí es que el
   token no se pueda adivinar y que lo que se guarda no sirva para entrar:
   una fuga de restaurant_invitations no puede repartir accesos. */

describe('token de invitación', () => {
  it('no se guarda en claro: lo que se guarda es el hash', () => {
    const { token, hash } = newInviteToken();
    expect(hash).not.toBe(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // sha-256 en hexadecimal
    expect(hash).not.toContain(token);
  });

  it('el hash es reproducible desde el token (así se busca al aceptar)', () => {
    const { token, hash } = newInviteToken();
    expect(hashInviteToken(token)).toBe(hash);
  });

  it('dos invitaciones nunca comparten token', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newInviteToken().token));
    expect(tokens.size).toBe(200);
  });

  it('el token tiene entropía de sobra para no adivinarse', () => {
    // 32 bytes en base64url ≈ 43 caracteres. Un enlace que llega por correo
    // vive en bandejas ajenas y en historiales: tiene que ser imposible de
    // enumerar, no solo difícil.
    const { token } = newInviteToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/); // base64url: seguro en una URL
  });

  it('caduca a los 7 días', () => {
    expect(INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
