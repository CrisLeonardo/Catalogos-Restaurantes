import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// El módulo es de servidor: se aíslan sus dependencias de Next y Supabase.
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }));
vi.mock('@/lib/auth/trusted-device', () => ({ readDeviceId: vi.fn() }));

const USER = '6909289b-900e-4985-af40-dfa60cde50b2';
const OTRO = '15fe3b20-262e-4404-80ae-4ea58d40ae0a';

let isSessionStale: typeof import('./session-activity').isSessionStale;
let mintToken: typeof import('./signed-token').mintToken;

beforeAll(async () => {
  process.env.LEOGIN_SECRET_KEY = 'clave-de-prueba';
  ({ isSessionStale } = await import('./session-activity'));
  ({ mintToken } = await import('./signed-token'));
});

afterEach(() => {
  vi.useRealTimers();
});

const marca = (userId: string, tipo: 'corta' | 'larga', ms: number) =>
  mintToken('session-seen', `${userId}~${tipo}`, ms);

describe('isSessionStale — formato firmado (ACC-08)', () => {
  it('sin cookie: no vencida (recién entró)', () => {
    expect(isSessionStale(undefined, USER)).toBe(false);
  });

  it('dentro del plazo: viva', () => {
    expect(isSessionStale(marca(USER, 'larga', 7 * 86_400_000), USER)).toBe(false);
  });

  it('pasado el plazo: vencida', () => {
    vi.useFakeTimers();
    const m = marca(USER, 'corta', 30 * 60_000);
    vi.advanceTimersByTime(31 * 60_000);
    expect(isSessionStale(m, USER)).toBe(true);
  });

  it('editada a mano para alargarse (corta → larga): vencida, la firma no cuadra', () => {
    const m = marca(USER, 'corta', 30 * 60_000);
    expect(isSessionStale(m.replace('~corta', '~larga'), USER)).toBe(true);
  });

  it('vencimiento alterado a mano: vencida', () => {
    const [valor, , firma] = marca(USER, 'corta', 30 * 60_000).split('.');
    expect(isSessionStale(`${valor}.${Date.now() + 9e9}.${firma}`, USER)).toBe(true);
  });

  it('la marca de OTRA cuenta no cuenta (igual que antes)', () => {
    vi.useFakeTimers();
    const m = marca(OTRO, 'corta', 30 * 60_000);
    vi.advanceTimersByTime(31 * 60_000);
    expect(isSessionStale(m, USER)).toBe(false);
  });
});

describe('isSessionStale — formato viejo, de antes del despliegue', () => {
  it('reciente: viva (desplegar no saca a nadie)', () => {
    expect(isSessionStale(`${USER}:${Date.now() - 5 * 60_000}`, USER)).toBe(false);
  });

  it('de hace más de 30 min: vencida, como antes', () => {
    expect(isSessionStale(`${USER}:${Date.now() - 31 * 60_000}`, USER)).toBe(true);
  });

  it('de otra cuenta: no cuenta', () => {
    expect(isSessionStale(`${OTRO}:${Date.now() - 99 * 60_000}`, USER)).toBe(false);
  });
});
