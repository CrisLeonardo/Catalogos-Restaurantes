import { describe, expect, it } from 'vitest';
import { clientIp } from './rate-limit';

const h = (o: Record<string, string>) => new Headers(o);

describe('clientIp: la IP con que se limitan los intentos', () => {
  it('detrás de Cloudflare usa cf-connecting-ip, no lo que el cliente escriba en x-forwarded-for', () => {
    // Lo que llega a Render cuando el cliente manda una IP falsa: Cloudflare
    // agrega la real al final y pone la suya en cf-connecting-ip.
    expect(clientIp(h({
      'x-forwarded-for': '203.0.113.9, 198.51.100.20, 172.70.1.1',
      'cf-connecting-ip': '198.51.100.20',
    }))).toBe('198.51.100.20');
  });

  it('cambiar la IP falsa no cambia la clave (antes cada petición estrenaba cubo)', () => {
    const claves = new Set(Array.from({ length: 35 }, (_, i) => clientIp(h({
      'x-forwarded-for': `203.0.113.${i}, 198.51.100.20`,
      'cf-connecting-ip': '198.51.100.20',
    }))));
    expect([...claves]).toEqual(['198.51.100.20']);
  });

  it('sin Cloudflare conserva lo de antes: primera de x-forwarded-for, luego x-real-ip', () => {
    expect(clientIp(h({ 'x-forwarded-for': '198.51.100.20, 10.0.0.1' }))).toBe('198.51.100.20');
    expect(clientIp(h({ 'x-real-ip': '198.51.100.21' }))).toBe('198.51.100.21');
    expect(clientIp(h({}))).toBe('unknown');
  });

  it('una IPv6 cuenta por su /64: rotar dentro del bloque no da intentos nuevos', () => {
    const a = clientIp(h({ 'cf-connecting-ip': '2001:db8:1:2:aaaa:bbbb:cccc:1' }));
    const b = clientIp(h({ 'cf-connecting-ip': '2001:0db8:0001:0002::9' }));
    expect(a).toBe('2001:db8:1:2::/64');
    expect(b).toBe(a);
    expect(clientIp(h({ 'cf-connecting-ip': '2001:db8:1:3::1' }))).not.toBe(a);
  });

  it('casos raros de IPv6', () => {
    expect(clientIp(h({ 'cf-connecting-ip': '::ffff:203.0.113.7' }))).toBe('203.0.113.7');
    expect(clientIp(h({ 'cf-connecting-ip': '::1' }))).toBe('0:0:0:0::/64');
    expect(clientIp(h({ 'cf-connecting-ip': 'fe80::1%eth0' }))).toBe('fe80:0:0:0::/64');
    expect(clientIp(h({ 'cf-connecting-ip': 'no-es-ip' }))).toBe('no-es-ip');
  });
});
