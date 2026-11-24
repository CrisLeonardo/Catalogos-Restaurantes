import { beforeEach, describe, expect, it, vi } from 'vitest';

/* LZ-08 y LZ-10: borrar un local se llevaba en cascada lo que Leogin le
   cobró. Ahora se copia a la bitácora (solo escritura) antes de borrar. */

vi.mock('@/lib/archivos-del-local', () => ({
  borrarArchivosDelLocal: async () => ({ fotosBorradas: 3, fotosConservadas: 1, comprobantesBorrados: 2 }),
}));

const { borrarLocal } = await import('./borrar-local');

const ID = '22222222-2222-4222-8222-222222222222';
const QUIEN = { actorId: 'super-1', actorEmail: 'super@local.test', ip: '198.51.100.1' };

let cobros: Record<string, unknown>[];
let falla: { bitacora?: boolean; borrar?: boolean; cobros?: boolean };
let pasos: string[];
let bitacora: Record<string, unknown>[];

function db() {
  return {
    from(tabla: string) {
      const q: Record<string, unknown> = {};
      for (const f of ['select', 'eq', 'order']) q[f] = () => q;
      if (tabla === 'restaurants') {
        q.maybeSingle = async () => ({ data: { name: 'Rincón 502', slug: 'rincon-502' } });
        q.delete = () => ({
          eq: async () => {
            pasos.push('borrar local');
            return { error: falla.borrar ? { message: 'timeout' } : null };
          },
        });
      }
      if (tabla === 'invoices') {
        q.range = async (desde: number, hasta: number) =>
          falla.cobros ? { data: null, error: { message: 'x' } } : { data: cobros.slice(desde, hasta + 1), error: null };
      }
      if (tabla === 'super_admin_log') {
        // Solo INSERT: la migración 132 no deja editar ni borrar.
        q.insert = async (fila: Record<string, unknown>) => {
          pasos.push('guardar cobros');
          if (falla.bitacora) return { error: { message: 'no' } };
          bitacora.push(fila);
          return { error: null };
        };
      }
      return q;
    },
  } as never;
}

beforeEach(() => {
  cobros = [
    { id: 'i1', concept: 'MONTHLY', amount: 199, status: 'PAID', period: '2026-10-01' },
    { id: 'i2', concept: 'MONTHLY', amount: 199, status: 'PENDING', period: '2026-11-01' },
  ];
  falla = {};
  pasos = [];
  bitacora = [];
});

describe('Borrar un local', () => {
  it('copia sus cobros de Leogin a la bitácora antes de borrarlo', async () => {
    const r = await borrarLocal(db(), QUIEN, ID);
    expect(pasos).toEqual(['guardar cobros', 'borrar local']);
    expect(r).toMatchObject({ nombre: 'Rincón 502', slug: 'rincon-502', cobrosGuardados: 2, archivos: { fotosBorradas: 3 } });
    expect(bitacora[0]).toMatchObject({
      action: 'restaurante.cobros-guardados', target_restaurant_id: ID, target_label: 'Rincón 502',
      actor_id: 'super-1', meta: { slug: 'rincon-502', cuantos: 2, cobros },
    });
  });

  it('no borra el local si no puede guardar sus cobros', async () => {
    falla.bitacora = true;
    await expect(borrarLocal(db(), QUIEN, ID)).rejects.toThrow(/No se borró.*cobros de Leogin/);
    expect(pasos).not.toContain('borrar local');
  });

  it('no borra el local si no puede leer sus cobros', async () => {
    falla.cobros = true;
    await expect(borrarLocal(db(), QUIEN, ID)).rejects.toThrow(/No se borró/);
    expect(pasos).toEqual([]);
  });

  it('sin cobros no escribe nada de más', async () => {
    cobros = [];
    const r = await borrarLocal(db(), QUIEN, ID);
    expect(pasos).toEqual(['borrar local']);
    expect(r.cobrosGuardados).toBe(0);
  });

  it('si el borrado falla, avisa (los cobros ya quedaron guardados)', async () => {
    falla.borrar = true;
    await expect(borrarLocal(db(), QUIEN, ID)).rejects.toThrow(/No se pudo borrar/);
    expect(bitacora).toHaveLength(1);
  });
});
