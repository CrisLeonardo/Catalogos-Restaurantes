import { describe, expect, it } from 'vitest';
import { canonicoDeFila, canonicoDeFormulario, fusionarEdicion, leerBase, nombrarCampos } from './fusion-edicion';

const LIMONADA = {
  category_id: 'cat-1', name: 'Limonada', description: 'Con hierbabuena', name_en: null, description_en: null,
  price: '18.00', cost: null, loyalty_points: null, image_url: null, icon: 'glass',
  tags: ['new'], dietary_tags: ['vegano'],
  options: [{ id: 'g1', name: 'Tamaño', type: 'single', required: true, choices: [{ id: 'c1', name: 'Grande', priceDelta: 4 }] }],
  is_active: true, is_available: false, agotado_motivo: 'manana',
};

/** Lo que manda la ficha abierta con esa fila, como FormData plano. */
function formulario(over: Record<string, string> = {}): Record<string, string> {
  return {
    category_id: 'cat-1', name: 'Limonada', description: 'Con hierbabuena', name_en: '', description_en: '',
    price: '18.00', cost: '', loyalty_points: '', image_url: '', icon: 'glass', tags: 'new', dietary_tags: 'vegano',
    options: JSON.stringify([{ id: 'g1', name: 'Tamaño', type: 'single', required: true, choices: [{ id: 'c1', name: 'Grande', priceDelta: 4 }] }]),
    is_active: 'true', is_available: 'false', agotado_hasta: 'manana',
    ...over,
  };
}
const leer = (o: Record<string, string>) => canonicoDeFormulario((k) => o[k] ?? null);

describe('fusionarEdicion', () => {
  it('la fila y la ficha recién abierta son iguales campo por campo', () => {
    expect(canonicoDeFila(LIMONADA)).toEqual(leer(formulario()));
  });

  it('una edición de precio antigua conserva la reactivación más reciente', () => {
    const base = leerBase(JSON.stringify(formulario()));
    const enviado = leer(formulario({ price: '21.50' }));
    const actual = canonicoDeFila({ ...LIMONADA, is_available: true, agotado_motivo: null });
    const r = fusionarEdicion(base, enviado, actual);
    expect(r.cambiados).toEqual(['precio']);
    expect(r.conflictos).toEqual([]);
  });

  it('el caso inverso: editar la descripción conserva el agotado de otra persona', () => {
    const disponible = { ...LIMONADA, is_available: true, agotado_motivo: null };
    const base = leerBase(JSON.stringify(formulario({ is_available: 'true', agotado_hasta: '' })));
    const enviado = leer(formulario({ is_available: 'true', agotado_hasta: '', description: 'Natural' }));
    const actual = canonicoDeFila({ ...disponible, is_available: false, agotado_motivo: 'reponer' });
    const r = fusionarEdicion(base, enviado, actual);
    expect(r.cambiados).toEqual(['descripcion']);
    expect(r.conflictos).toEqual([]);
  });

  it('dos personas cambian el mismo campo a valores distintos: conflicto', () => {
    const base = leerBase(JSON.stringify(formulario()));
    const enviado = leer(formulario({ price: '21.50' }));
    const actual = canonicoDeFila({ ...LIMONADA, price: '20.00' });
    const r = fusionarEdicion(base, enviado, actual);
    expect(r.conflictos).toEqual(['precio']);
    expect(nombrarCampos(r.conflictos)).toBe('el precio');
  });

  it('si las dos dejaron el mismo valor no hay conflicto', () => {
    const base = leerBase(JSON.stringify(formulario()));
    const enviado = leer(formulario({ price: '21.50' }));
    const actual = canonicoDeFila({ ...LIMONADA, price: 21.5 });
    expect(fusionarEdicion(base, enviado, actual).conflictos).toEqual([]);
  });

  it('sin base (ficha de antes del cambio) se guarda todo, como antes', () => {
    const r = fusionarEdicion(null, leer(formulario()), canonicoDeFila(LIMONADA));
    expect(r.cambiados).toContain('disponibilidad');
    expect(r.conflictos).toEqual([]);
  });

  it('un agotado sin motivo guardado se lee como «hasta mañana», igual que la ficha', () => {
    expect(canonicoDeFila({ ...LIMONADA, agotado_motivo: null }).disponibilidad).toBe('agotado:manana');
  });

  it('las opciones no cambian por el orden de las llaves de jsonb', () => {
    const fila = canonicoDeFila({ ...LIMONADA, options: [{ choices: [{ priceDelta: 4, name: 'Grande', id: 'c1' }], type: 'single', required: true, name: 'Tamaño', id: 'g1' }] });
    expect(fila.opciones).toBe(leer(formulario()).opciones);
  });

  it('nombra varios campos en español', () => {
    expect(nombrarCampos(['precio', 'disponibilidad', 'foto'])).toBe('el precio, la disponibilidad y la foto');
  });
});
