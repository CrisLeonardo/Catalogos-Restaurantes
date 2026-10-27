import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MUESTRA_ELECCION_KEY,
  MUESTRA_ELECCION_TTL_MS,
  borrarEleccionMuestra,
  esMuestraAviso,
  esMuestraPedido,
  guardarEleccionMuestra,
  leerEleccionMuestra,
} from './muestra-mensajes';

describe('mensajes entre la portada y el menú de muestra', () => {
  it('reconoce un pedido de estilo bien formado y nada más', () => {
    expect(esMuestraPedido({ type: 'leogin-muestra', estilo: 'vitrina-cereza', nombre: '' })).toBe(true);
    expect(esMuestraPedido({ type: 'leogin-muestra', estilo: 3, nombre: '' })).toBe(false);
    expect(esMuestraPedido({ type: 'state', config: {} })).toBe(false);
    expect(esMuestraPedido(null)).toBe(false);
  });

  it('reconoce los avisos del menú', () => {
    expect(esMuestraAviso({ type: 'leogin-muestra-lista' })).toBe(true);
    expect(esMuestraAviso({ type: 'leogin-muestra-aplicada', estilo: 'kiosco' })).toBe(true);
    expect(esMuestraAviso({ type: 'leogin-muestra' })).toBe(false);
  });
});

describe('la elección que viaja al registro', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('guarda el estilo y el nombre y los devuelve', () => {
    guardarEleccionMuestra('vitrina-cereza', '  Tacos Doña Tere  ');
    expect(leerEleccionMuestra()).toMatchObject({ estilo: 'vitrina-cereza', nombre: 'Tacos Doña Tere' });
  });

  it('caduca a la semana', () => {
    guardarEleccionMuestra('kiosco', '');
    const { t } = JSON.parse(store.get(MUESTRA_ELECCION_KEY)!);
    expect(leerEleccionMuestra(t + MUESTRA_ELECCION_TTL_MS - 1)).not.toBeNull();
    expect(leerEleccionMuestra(t + MUESTRA_ELECCION_TTL_MS + 1)).toBeNull();
  });

  it('ignora lo que no entiende y no lanza', () => {
    store.set(MUESTRA_ELECCION_KEY, '{no es json');
    expect(leerEleccionMuestra()).toBeNull();
    store.set(MUESTRA_ELECCION_KEY, JSON.stringify({ estilo: 5 }));
    expect(leerEleccionMuestra()).toBeNull();
  });

  it('se borra al crear el restaurante', () => {
    guardarEleccionMuestra('revista', 'Rincón');
    borrarEleccionMuestra();
    expect(leerEleccionMuestra()).toBeNull();
  });

  it('sin almacenamiento disponible, ni guarda ni lanza', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => { throw new Error('bloqueado'); },
        setItem: () => { throw new Error('bloqueado'); },
        removeItem: () => { throw new Error('bloqueado'); },
      },
    });
    expect(() => guardarEleccionMuestra('revista', '')).not.toThrow();
    expect(leerEleccionMuestra()).toBeNull();
    expect(() => borrarEleccionMuestra()).not.toThrow();
  });
});
