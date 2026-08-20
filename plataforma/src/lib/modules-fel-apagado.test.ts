import { describe, expect, it } from 'vitest';
import {
  isManaged,
  isModuleActive,
  showsInPanel,
  FEL_DISPONIBLE,
  type ModulesMap,
} from './modules';

/* ── Contexto ─────────────────────────────────────────────────────
   La facturación está terminada pero APAGADA a propósito hasta elegir
   certificador y correr la migración 118 en producción.

   Esta prueba existe porque el riesgo no es que el módulo no funcione: es
   que funcione demasiado pronto. La emisión automática se dispara sola al
   cerrar un cobro, y basta con que una fila de `restaurants.modules` tenga
   fel=true —algunas lo tienen desde la migración 038— para que esa caja
   empiece a emitir documentos fiscales reales que nadie pidió.

   Si alguien encuentra estas pruebas fallando, la pregunta correcta es si
   de verdad ya toca encender la facturación (ver docs/FEL.md), no si hay
   que borrarlas. */

/** Un restaurante con TODO encendido en la base: el peor caso. */
const todoEncendido: ModulesMap = { fel: true, loyalty: true, recetas: true };

describe('interruptor general de la facturación', () => {
  it('está apagado mientras no se declare NEXT_PUBLIC_FEL_ENABLED=1', () => {
    expect(FEL_DISPONIBLE).toBe(process.env.NEXT_PUBLIC_FEL_ENABLED === '1');
  });

  it.skipIf(FEL_DISPONIBLE)('fel no está activo aunque la base diga que sí', () => {
    expect(isManaged(todoEncendido, 'fel')).toBe(false);
    expect(isModuleActive(todoEncendido, null, 'fel')).toBe(false);
    expect(isModuleActive(todoEncendido, { fel: { enabled: true } }, 'fel')).toBe(false);
  });

  it.skipIf(FEL_DISPONIBLE)('fel tampoco se muestra en el panel', () => {
    // Sin esto el dueño vería la pestaña, entraría y se encontraría una
    // pantalla que no puede usar.
    expect(showsInPanel(todoEncendido, 'fel')).toBe(false);
  });

  it('el apagado es SOLO para fel: los demás módulos siguen igual', () => {
    // Una regresión que apagara todo pasaría desapercibida en una prueba
    // que solo mirase fel.
    expect(isManaged(todoEncendido, 'loyalty')).toBe(true);
    expect(isManaged(todoEncendido, 'recetas')).toBe(true);
    expect(isModuleActive(todoEncendido, null, 'loyalty')).toBe(true);
    expect(showsInPanel(todoEncendido, 'recetas')).toBe(true);
  });

  it.skipIf(!FEL_DISPONIBLE)('con el interruptor encendido, fel vuelve a funcionar', () => {
    // La otra dirección: un apagado que no se pueda deshacer no serviría.
    // Se comprueba corriendo la suite con NEXT_PUBLIC_FEL_ENABLED=1.
    expect(isManaged(todoEncendido, 'fel')).toBe(true);
    expect(isModuleActive(todoEncendido, null, 'fel')).toBe(true);
    expect(showsInPanel(todoEncendido, 'fel')).toBe(true);
  });

  it('un módulo que la base no enciende sigue apagado', () => {
    expect(isManaged({ loyalty: true }, 'recetas')).toBe(false);
    expect(isManaged(null, 'loyalty')).toBe(false);
  });
});
