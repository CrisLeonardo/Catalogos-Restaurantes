import { describe, expect, it } from 'vitest';
import { buildDteXml, buildAnulacionXml, felDateTime, felDate, esc, type DocumentoDte } from './xml';
import { calcularMontos } from './totales';
import { frasesPara, afiliacionIvaXml, tipoDteDeRegimen, desglosaIva } from './frases';
import { interpretarReceptorId } from './nit';

/* ── Contexto ─────────────────────────────────────────────────────
   El XML es lo único que ve el certificador. Si sale mal, el rechazo
   llega como un código del SAT frente a un cliente que espera, no como
   un error de TypeScript. Estas pruebas cubren lo que no se nota hasta
   que alguien reclama su factura. */

const direccion = {
  direccion: '5a avenida 10-50 zona 1',
  codigoPostal: '01001',
  municipio: 'Guatemala',
  departamento: 'Guatemala',
  pais: 'GT',
};

function doc(over: Partial<DocumentoDte> = {}): DocumentoDte {
  const regimenIva = 'GENERAL' as const;
  const montos = calcularMontos(
    { lineas: [{ descripcion: 'Hamburguesa', cantidad: 2, importe: 112 }] },
    { ivaIncluido: true, desglosaIva: desglosaIva(regimenIva), facturarPropina: false },
  );
  return {
    tipo: tipoDteDeRegimen(regimenIva),
    desglosaIva: desglosaIva(regimenIva),
    fechaEmision: '2026-08-20T18:30:00.000Z',
    moneda: 'GTQ',
    emisor: {
      nit: '36029785',
      nombre: 'Restaurante Ejemplo, S.A.',
      nombreComercial: 'Rincón 502',
      codigoEstablecimiento: '1',
      afiliacionIva: afiliacionIvaXml(regimenIva),
      direccion,
    },
    receptor: {
      id: { tipo: 'CF', valor: 'CF' },
      nombre: 'Consumidor Final',
      direccion: { direccion: 'Ciudad' },
    },
    frases: frasesPara({ regimenIva, regimenIsr: 'SIMPLIFICADO', agenteRetencionIva: false }),
    montos,
    ...over,
  };
}

describe('estructura básica', () => {
  it('produce un GTDocumento con el namespace del SAT', () => {
    const xml = buildDteXml(doc());
    expect(xml).toContain('<dte:GTDocumento');
    expect(xml).toContain('xmlns:dte="http://www.sat.gob.gt/dte/fel/0.2.0"');
    expect(xml).toContain('<dte:DatosEmision ID="DatosEmision">');
    expect(xml).toContain('<dte:SAT ClaseDocumento="dte">');
  });

  it('no lleva saltos de línea ni indentación', () => {
    // El certificador firma estos bytes exactos: cualquier reformateo
    // posterior invalidaría la firma.
    const xml = buildDteXml(doc());
    expect(xml.includes('\n')).toBe(false);
    expect(xml).not.toMatch(/>\s+</);
  });

  it('respeta el orden de elementos que fija el XSD', () => {
    const xml = buildDteXml(doc());
    const orden = ['DatosGenerales', 'dte:Emisor', 'dte:Receptor', 'dte:Frases', 'dte:Items', 'dte:Totales'];
    const posiciones = orden.map((t) => xml.indexOf(t));
    expect(posiciones.every((p) => p >= 0)).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
  });

  it('dentro del ítem, el orden también es el del XSD', () => {
    const xml = buildDteXml(doc());
    const item = xml.slice(xml.indexOf('<dte:Item '), xml.indexOf('</dte:Item>'));
    const orden = ['Cantidad', 'UnidadMedida', 'Descripcion', 'PrecioUnitario', 'Precio', 'Descuento', 'Impuestos', 'Total'];
    const posiciones = orden.map((t) => item.indexOf(`<dte:${t}`));
    expect(posiciones.every((p) => p >= 0)).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
  });
});

describe('frases — el error que declaraba a otro contribuyente', () => {
  it('el pequeño contribuyente usa la frase 3, no la 2', () => {
    // La frase 2 del catálogo es "Es Agente de Retención del IVA". El
    // código anterior la emitía para PEQ, declarando al restaurante como
    // agente retenedor del IVA sin serlo.
    const xml = buildDteXml(
      doc({
        tipo: 'FPEQ',
        desglosaIva: false,
        frases: frasesPara({ regimenIva: 'PEQUENO', regimenIsr: 'NO_APLICA', agenteRetencionIva: false }),
      }),
    );
    expect(xml).toContain('TipoFrase="3" CodigoEscenario="1"');
    expect(xml).not.toContain('TipoFrase="2"');
  });

  it('el régimen general en Opcional Simplificado usa el escenario 2', () => {
    // El código anterior fijaba el escenario 1 ("Sujeto a pagos
    // trimestrales"), que corresponde al Régimen Sobre las Utilidades.
    const xml = buildDteXml(doc());
    expect(xml).toContain('TipoFrase="1" CodigoEscenario="2"');
  });

  it('el régimen Sobre las Utilidades sí usa el escenario 1', () => {
    const xml = buildDteXml(
      doc({ frases: frasesPara({ regimenIva: 'GENERAL', regimenIsr: 'UTILIDADES', agenteRetencionIva: false }) }),
    );
    expect(xml).toContain('TipoFrase="1" CodigoEscenario="1"');
  });

  it('acumula frases: agente de retención se suma a la de ISR', () => {
    const xml = buildDteXml(
      doc({ frases: frasesPara({ regimenIva: 'GENERAL', regimenIsr: 'SIMPLIFICADO', agenteRetencionIva: true }) }),
    );
    expect(xml).toContain('TipoFrase="1" CodigoEscenario="2"');
    expect(xml).toContain('TipoFrase="2" CodigoEscenario="1"');
  });

  it('el pequeño contribuyente electrónico lleva DOS frases', () => {
    const xml = buildDteXml(
      doc({
        tipo: 'FPEQ',
        desglosaIva: false,
        frases: frasesPara({
          regimenIva: 'PEQUENO_ELECTRONICO',
          regimenIsr: 'NO_APLICA',
          agenteRetencionIva: false,
          numeroResolucion: 'RES-123',
        }),
      }),
    );
    expect(xml).toContain('TipoFrase="3" CodigoEscenario="1"');
    expect(xml).toContain('TipoFrase="7" CodigoEscenario="1" NumeroResolucion="RES-123"');
  });

  it('el pago directo incluye número y fecha de resolución', () => {
    const xml = buildDteXml(
      doc({
        frases: frasesPara({
          regimenIva: 'GENERAL',
          regimenIsr: 'SIMPLIFICADO_PAGO_DIRECTO',
          agenteRetencionIva: false,
          numeroResolucion: 'SAT-2024-999',
          fechaResolucion: '2024-03-15',
        }),
      }),
    );
    expect(xml).toContain('TipoFrase="1" CodigoEscenario="3"');
    expect(xml).toContain('NumeroResolucion="SAT-2024-999"');
    expect(xml).toContain('FechaResolucion="2024-03-15"');
  });

  it('omite el bloque de frases cuando no hay ninguna', () => {
    const xml = buildDteXml(doc({ frases: [] }));
    expect(xml).not.toContain('<dte:Frases>');
  });
});

describe('IVA según el régimen', () => {
  it('el régimen general desglosa IVA y declara el total de impuesto', () => {
    const xml = buildDteXml(doc());
    expect(xml).toContain('<dte:NombreCorto>IVA</dte:NombreCorto>');
    expect(xml).toContain('<dte:CodigoUnidadGravable>1</dte:CodigoUnidadGravable>');
    expect(xml).toContain('TotalMontoImpuesto="12.00"');
    expect(xml).toContain('<dte:GranTotal>112.00</dte:GranTotal>');
  });

  it('el pequeño contribuyente no lleva impuestos en ninguna parte', () => {
    const montos = calcularMontos(
      { lineas: [{ descripcion: 'Menú', cantidad: 1, importe: 100 }] },
      { ivaIncluido: true, desglosaIva: false, facturarPropina: false },
    );
    const xml = buildDteXml(doc({ tipo: 'FPEQ', desglosaIva: false, montos }));
    expect(xml).toContain('Tipo="FPEQ"');
    expect(xml).not.toContain('<dte:Impuestos>');
    expect(xml).not.toContain('TotalImpuestos');
    expect(xml).toContain('<dte:GranTotal>100.00</dte:GranTotal>');
  });
});

describe('receptor', () => {
  it('consumidor final va sin TipoEspecial', () => {
    const xml = buildDteXml(doc());
    expect(xml).toContain('IDReceptor="CF"');
    expect(xml).not.toContain('TipoEspecial');
  });

  it('un NIT va sin TipoEspecial', () => {
    const id = interpretarReceptorId('3602978-5')!;
    const xml = buildDteXml(doc({ receptor: { id, nombre: 'Cliente, S.A.' } }));
    expect(xml).toContain('IDReceptor="36029785"');
    expect(xml).not.toContain('TipoEspecial');
  });

  it('un DPI se marca con TipoEspecial="CUI"', () => {
    // Obligatorio desde que el SAT limitó el consumidor final: sin esto no
    // se puede facturar arriba del tope a alguien que solo tiene DPI.
    const correlativo = '12345678';
    let suma = 0;
    for (let i = 0; i < 8; i++) suma += Number(correlativo[i]) * (i + 2);
    const cui = `${correlativo}${suma % 11}0101`;
    const id = interpretarReceptorId(cui)!;
    const xml = buildDteXml(doc({ receptor: { id, nombre: 'Juan Pérez' } }));
    expect(xml).toContain(`IDReceptor="${cui}" TipoEspecial="CUI"`);
  });

  it('un extranjero se marca con TipoEspecial="EXT"', () => {
    const xml = buildDteXml(
      doc({ receptor: { id: { tipo: 'EXT', valor: 'AB123456' }, nombre: 'Jane Doe' } }),
    );
    expect(xml).toContain('TipoEspecial="EXT"');
  });

  it('incluye el correo del receptor para que el certificador le mande el DTE', () => {
    const xml = buildDteXml(
      doc({ receptor: { id: { tipo: 'CF', valor: 'CF' }, nombre: 'Cliente', correo: 'a@b.com' } }),
    );
    expect(xml).toContain('CorreoReceptor="a@b.com"');
  });

  it('omite el correo cuando no se dio', () => {
    expect(buildDteXml(doc())).not.toContain('CorreoReceptor');
  });
});

describe('escapado y recortes', () => {
  it('escapa los caracteres que romperían el XML', () => {
    expect(esc(`Tacos & "Salsa" <picante> 'ya'`)).toBe(
      'Tacos &amp; &quot;Salsa&quot; &lt;picante&gt; &apos;ya&apos;',
    );
  });

  it('escapa el nombre del receptor, no lo inyecta', () => {
    const xml = buildDteXml(
      doc({ receptor: { id: { tipo: 'CF', valor: 'CF' }, nombre: 'A" NombreReceptor="B' } }),
    );
    // Las comillas del ataque quedan como &quot;, así que solo hay UN
    // atributo NombreReceptor de verdad (el que abre con comilla real).
    expect(xml).toContain('NombreReceptor="A&quot; NombreReceptor=&quot;B"');
    expect(xml.match(/NombreReceptor="/g)).toHaveLength(1);
  });

  it('recorta el nombre del receptor al límite del esquema en vez de fallar', () => {
    // Un nombre larguísimo no debe tumbar la venta del cliente.
    const largo = 'X'.repeat(600);
    const xml = buildDteXml(doc({ receptor: { id: { tipo: 'CF', valor: 'CF' }, nombre: largo } }));
    expect(xml).toContain(`NombreReceptor="${'X'.repeat(400)}"`);
  });

  it('recorta la unidad de medida a 3 caracteres', () => {
    const montos = calcularMontos(
      { lineas: [{ descripcion: 'A', cantidad: 1, importe: 10 }] },
      { ivaIncluido: true, desglosaIva: true, facturarPropina: false },
    );
    montos.lineas[0].unidadMedida = 'UNIDADES';
    expect(buildDteXml(doc({ montos }))).toContain('<dte:UnidadMedida>UNI</dte:UnidadMedida>');
  });
});

describe('fechas', () => {
  it('emite con el offset de Guatemala, no en UTC', () => {
    expect(felDateTime(new Date('2026-08-20T18:30:00.000Z'))).toBe('2026-08-20T12:30:00-06:00');
  });

  it('una venta de la noche no se pasa al día siguiente', () => {
    // 23:00 en Guatemala son las 05:00 UTC del día siguiente. En UTC la
    // venta se declararía en otro día fiscal.
    expect(felDateTime(new Date('2026-08-21T05:00:00.000Z'))).toBe('2026-08-20T23:00:00-06:00');
  });

  it('felDate devuelve solo la fecha en hora local', () => {
    expect(felDate(new Date('2026-08-21T05:00:00.000Z'))).toBe('2026-08-20');
  });

  it('el XML lleva la fecha convertida, no el ISO en UTC', () => {
    expect(buildDteXml(doc())).toContain('FechaHoraEmision="2026-08-20T12:30:00-06:00"');
  });
});

describe('nota de crédito', () => {
  const ncre = doc({
    tipo: 'NCRE',
    referenciaNota: {
      numeroAutorizacionOrigen: 'ABC-123-UUID',
      fechaEmisionOrigen: '2026-06-01',
      serieOrigen: 'A1B2',
      numeroOrigen: '445',
      motivoAjuste: 'Devolución de producto',
    },
  });

  it('lleva el complemento que la ata a la factura original', () => {
    const xml = buildDteXml(ncre);
    expect(xml).toContain('Tipo="NCRE"');
    expect(xml).toContain('xmlns:cno="http://www.sat.gob.gt/face2/ComplementoReferenciaNota/0.1.0"');
    expect(xml).toContain('NumeroAutorizacionDocumentoOrigen="ABC-123-UUID"');
    expect(xml).toContain('SerieDocumentoOrigen="A1B2"');
    expect(xml).toContain('NumeroDocumentoOrigen="445"');
    expect(xml).toContain('FechaEmisionDocumentoOrigen="2026-06-01"');
    expect(xml).toContain('MotivoAjuste="Devolución de producto"');
  });

  it('el complemento va después de Totales, como manda el XSD', () => {
    const xml = buildDteXml(ncre);
    expect(xml.indexOf('<dte:Complementos>')).toBeGreaterThan(xml.indexOf('</dte:Totales>'));
  });

  it('una factura normal no lleva complementos', () => {
    expect(buildDteXml(doc())).not.toContain('<dte:Complementos>');
  });
});

describe('anulación', () => {
  const xml = buildAnulacionXml({
    uuidOriginal: 'UUID-1',
    fechaEmisionOriginal: '2026-08-20T12:30:00-06:00',
    nitEmisor: '36029785',
    idReceptor: 'CF',
    motivo: 'Error en el NIT',
    fechaAnulacion: new Date('2026-08-20T19:00:00.000Z'),
  });

  it('usa el namespace 0.1.0, NO el del documento', () => {
    // El código anterior usaba el namespace del documento (0.2.0) y el
    // certificador habría rechazado todas las anulaciones.
    expect(xml).toContain('xmlns:dte="http://www.sat.gob.gt/dte/fel/0.1.0"');
    expect(xml).not.toContain('fel/0.2.0');
  });

  it('referencia el UUID original y lleva motivo', () => {
    expect(xml).toContain('NumeroDocumentoAAnular="UUID-1"');
    expect(xml).toContain('MotivoAnulacion="Error en el NIT"');
    expect(xml).toContain('FechaEmisionDocumentoAnular="2026-08-20T12:30:00-06:00"');
  });

  it('nunca deja el motivo vacío, que el XSD lo exige', () => {
    const sinMotivo = buildAnulacionXml({
      uuidOriginal: 'U',
      fechaEmisionOriginal: '2026-08-20T12:30:00-06:00',
      nitEmisor: '1',
      idReceptor: 'CF',
      motivo: '',
    });
    expect(sinMotivo).toContain('MotivoAnulacion="Anulación solicitada por el emisor"');
  });
});
