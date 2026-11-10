import { describe, expect, it, vi } from 'vitest';
import { leerIntento, prepararIntento, resolverIntento, type SolicitudCobro } from './cobro-intento';

function almacenamiento() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); } } as Storage;
}
const solicitud: SolicitudCobro = { mesa: 1, operacion: 'parte', items: ['plato-1'], pagos: [{ method: 'CASH', amount: 40 }] };

describe('identidad del cobro en el aparato (0.15)', () => {
  it('persiste antes de enviar y una recarga recupera la solicitud original aunque cambie la pantalla', () => {
    const storage = almacenamiento();
    const original = prepararIntento(storage, 'rest', 'cajero', solicitud);
    const retry = prepararIntento(storage, 'rest', 'cajero', { ...solicitud, items: ['otra-ronda'] });
    expect(retry).toEqual(original);
    expect(leerIntento(storage, 'rest', 'cajero')).toEqual(original);
    expect(leerIntento(storage, 'otro-rest', 'cajero')).toBeNull();
    expect(leerIntento(storage, 'rest', 'otro-cajero')).toBeNull();
  });

  it('solo resolver el intento pendiente permite otro pago legítimo con igual contenido', () => {
    const storage = almacenamiento();
    const original = prepararIntento(storage, 'rest', 'cajero', solicitud);
    resolverIntento(storage, 'rest', 'cajero', 'otro-id');
    expect(leerIntento(storage, 'rest', 'cajero')).toEqual(original);
    resolverIntento(storage, 'rest', 'cajero', original.id);
    expect(prepararIntento(storage, 'rest', 'cajero', solicitud).id).not.toBe(original.id);
  });

  it('si no puede persistir, falla antes de obtener un intento enviable', () => {
    const storage = almacenamiento();
    storage.setItem = vi.fn(() => { throw new Error('Sin almacenamiento'); });
    expect(() => prepararIntento(storage, 'rest', 'cajero', solicitud)).toThrow('Sin almacenamiento');
    expect(leerIntento(storage, 'rest', 'cajero')).toBeNull();
  });
});
