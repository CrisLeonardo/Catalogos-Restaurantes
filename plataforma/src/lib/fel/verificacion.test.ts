import { describe, expect, it } from 'vitest';
import { urlVerificacion } from './verificacion';

/* ── Contexto ─────────────────────────────────────────────────────
   Este enlace se imprime en el ticket del cliente. Un enlace roto o a
   medias lo lleva a un formulario vacío y parece que su factura no
   existe — peor que no imprimir nada. */

const base = {
  numeroAutorizacion: '95605984-8395-5540-BE43-7D9ED0B45027',
  nitEmisor: '36029785',
  idReceptor: 'CF',
  montoTotal: 190,
};

describe('urlVerificacion', () => {
  it('apunta al verificador público del SAT', () => {
    expect(urlVerificacion(base)).toContain(
      'https://felpub.c.sat.gob.gt/verificador-web/publico/vistas/verificacionDte.jsf',
    );
  });

  it('lleva los cuatro datos que el verificador pide', () => {
    const url = new URL(urlVerificacion(base)!);
    expect(url.searchParams.get('tipo')).toBe('autorizacion');
    expect(url.searchParams.get('numero')).toBe(base.numeroAutorizacion);
    expect(url.searchParams.get('emisor')).toBe('36029785');
    expect(url.searchParams.get('receptor')).toBe('CF');
  });

  it('manda el monto con seis decimales, como el verificador espera', () => {
    expect(new URL(urlVerificacion(base)!).searchParams.get('monto')).toBe('190.000000');
    expect(new URL(urlVerificacion({ ...base, montoTotal: 12.5 })!).searchParams.get('monto')).toBe('12.500000');
  });

  it('no enlaza un registro interno, que no está en el SAT', () => {
    // Enlazarlo llevaría al cliente a un verificador que no encuentra nada
    // y le haría creer que su factura es falsa.
    expect(urlVerificacion({ ...base, numeroAutorizacion: 'INT-abc-123' })).toBeNull();
  });

  it('devuelve null en vez de un enlace incompleto', () => {
    expect(urlVerificacion({ ...base, numeroAutorizacion: '' })).toBeNull();
    expect(urlVerificacion({ ...base, nitEmisor: '' })).toBeNull();
    expect(urlVerificacion({ ...base, idReceptor: '' })).toBeNull();
  });

  it('escapa lo que va en la URL', () => {
    const url = urlVerificacion({ ...base, idReceptor: 'A B&C' })!;
    expect(url).not.toContain('A B&C');
    expect(new URL(url).searchParams.get('receptor')).toBe('A B&C');
  });
});
