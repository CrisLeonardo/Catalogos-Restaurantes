/** Opciones del comensal (auditoría 1.11, M03/M04). */
import { describe, expect, it } from 'vitest';
import type { ProductOptionGroup } from '@/types';
import {
  cabeOtra, grupoPendiente, reglaDeGrupo, seleccionDeLinea, seleccionInicial, textoPendiente, variantesDeLinea,
} from './opciones';

const termino: ProductOptionGroup = { id: 't', name: 'Término', type: 'single', required: true,
  choices: [{ id: 't1', name: 'Tres cuartos', priceDelta: 0 }, { id: 't2', name: 'Bien cocida', priceDelta: 0 }] };
const acomp: ProductOptionGroup = { id: 'a', name: 'Acompañamiento', type: 'single', required: true, defaultChoiceId: 'a1',
  choices: [{ id: 'a1', name: 'Papas', priceDelta: 0 }, { id: 'a2', name: 'Ensalada', priceDelta: 0 }] };
const extras: ProductOptionGroup = { id: 'e', name: 'Extras', type: 'multi', min: 1, max: 2,
  choices: [{ id: 'e1', name: 'Tocino', priceDelta: 10 }, { id: 'e2', name: 'Huevo', priceDelta: 6 }, { id: 'e3', name: 'Aguacate', priceDelta: 8 }] };
const combo: ProductOptionGroup = { id: 'c', name: 'Incluye', type: 'combo',
  choices: [{ id: 'c1', name: 'Papas', priceDelta: 0 }, { id: 'c2', name: 'Bebida', priceDelta: 0, variants: [{ id: 'v1', name: 'Coca', priceDelta: 0 }] }] };

describe('selección inicial', () => {
  it('obligatorio sin predeterminada empieza vacío; con predeterminada viene puesta; combo con todo', () => {
    expect(seleccionInicial([termino, acomp, extras, combo])).toEqual({ t: [], a: ['a1'], e: [], c: ['c1', 'c2'] });
  });
  it('una predeterminada que ya no existe no se marca', () => {
    expect(seleccionInicial([{ ...acomp, defaultChoiceId: 'zz' }])).toEqual({ a: [] });
  });
});

describe('reglas y pendientes', () => {
  it('dice la regla completa', () => {
    expect(reglaDeGrupo(termino)).toBe('Elige uno');
    expect(reglaDeGrupo(extras)).toBe('Elige de 1 a 2');
    expect(reglaDeGrupo({ ...extras, min: 2 })).toBe('Elige 2');
    expect(reglaDeGrupo({ ...extras, max: 0 })).toBe('Elige al menos 1');
    expect(reglaDeGrupo({ ...extras, min: 0 })).toBe('Opcional · hasta 2');
    expect(reglaDeGrupo(extras, 'en')).toBe('Choose 1 to 2');
  });
  it('dice qué falta y respeta el mínimo y el máximo', () => {
    const sel = seleccionInicial([termino, acomp, extras]);
    expect(grupoPendiente([termino, acomp, extras], sel)?.id).toBe('t');
    expect(textoPendiente(termino, sel)).toBe('Elige término');
    const conTermino = { ...sel, t: ['t1'] };
    expect(grupoPendiente([termino, acomp, extras], conTermino)?.id).toBe('e');
    expect(textoPendiente(extras, conTermino)).toBe('Elige 1 más en extras');
    expect(grupoPendiente([termino, acomp, extras], { ...conTermino, e: ['e1'] })).toBeNull();
    expect(cabeOtra(extras, { e: ['e1', 'e2'] })).toBe(false);
  });
});

describe('cambiar una línea del carrito', () => {
  it('reconstruye lo elegido y las variantes', () => {
    const opciones = [
      { groupId: 't', groupName: 'Término', choiceId: 't2', choiceName: 'Bien cocida', priceDelta: 0 },
      { groupId: 'e', groupName: 'Extras', choiceId: 'e2', choiceName: 'Huevo', priceDelta: 6 },
      { groupId: 'c', groupName: 'Incluye', choiceId: 'c2', choiceName: 'Bebida', priceDelta: 0, variantId: 'v1', variantName: 'Coca' },
    ];
    expect(seleccionDeLinea([termino, acomp, extras, combo], opciones)).toEqual({ t: ['t2'], a: [], e: ['e2'], c: ['c2'] });
    expect(variantesDeLinea(opciones)).toEqual({ c2: 'v1' });
  });
});
