import { describe, expect, it } from 'vitest';
import { CARTEL, direccionLegible, esDireccionDePrueba, frasesDelCartel, fraseValida, mmAPx, nombreDeArchivo } from './qr-material';

describe('frases del cartel (R33.5)', () => {
  it('sin pedidos en línea solo invita a ver la carta', () => {
    expect(frasesDelCartel({ pedidos: false, orderTypes: ['pickup', 'delivery'] }).map((f) => f.texto)).toEqual(['Mira nuestra carta']);
    expect(frasesDelCartel({ pedidos: true, orderTypes: ['dine_in'] }).map((f) => f.id)).toEqual(['carta']);
  });

  it('con pedidos ofrece pedir, y dice solo los modos encendidos', () => {
    expect(frasesDelCartel({ pedidos: true, orderTypes: ['pickup', 'delivery'] })[0].texto).toBe('Mira la carta y pide');
    expect(frasesDelCartel({ pedidos: true, orderTypes: ['pickup'] })[2].texto).toBe('Pide para llevar');
    expect(frasesDelCartel({ pedidos: true, orderTypes: ['delivery'] })[2].texto).toBe('Pide a domicilio');
  });

  it('una frase que ya no vale cae a la primera', () => {
    expect(fraseValida({ pedidos: false, orderTypes: [] }, 'carta-y-pide').id).toBe('carta');
    expect(fraseValida({ pedidos: true, orderTypes: ['pickup'] }, 'para-llevar').id).toBe('para-llevar');
  });
});

describe('destino y medidas', () => {
  it('reconoce una dirección de prueba', () => {
    expect(esDireccionDePrueba('http://localhost:3000/m/rincon502')).toBe(true);
    expect(esDireccionDePrueba('http://rincon502.localhost:3000')).toBe(true);
    expect(esDireccionDePrueba('https://distleogin.com/m/rincon502')).toBe(false);
  });

  it('la dirección se lee sin protocolo', () => {
    expect(direccionLegible('https://distleogin.com/m/rincon502/')).toBe('distleogin.com/m/rincon502');
  });

  it('dos carteles caben en la hoja carta y el código mide 7 cm', () => {
    expect(CARTEL.cartelMm.w * 2).toBeLessThan(CARTEL.hojaMm.w);
    expect(CARTEL.cartelMm.h).toBeLessThan(CARTEL.hojaMm.h);
    expect(mmAPx(25.4)).toBe(200);
  });

  it('el nombre del archivo va sin acentos', () => {
    expect(nombreDeArchivo('Rincón 502')).toBe('rincon-502');
  });
});
