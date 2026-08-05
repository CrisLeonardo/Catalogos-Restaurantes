import { describe, expect, it } from 'vitest';
import { buildDteXml, buildAnulacionXml, felDateTime, dteTipo } from './xml';
import { buildFacturaDte, type FelSettings } from '../fel';

/* ── Contexto ─────────────────────────────────────────────────────
   El XML es lo único que ve el certificador. Si sale mal, el DTE se
   rechaza y el restaurante se queda sin poder facturar — y el rechazo
   llega como un código del SAT, no como un error de TypeScript. Estas
   pruebas cubren lo que no se nota hasta que un cliente reclama. */

const settingsBase: FelSettings = {
  restaurant_id: 'r1',
  provider: 'INFILE',
  ambiente: 'PRUEBAS',
  nit_emisor: '1234567K',
  nombre_emisor: 'Restaurante Ejemplo, S.A.',
  nombre_comercial: 'Azúcar Negra',
  direccion: '5a avenida 10-50 zona 1',
  codigo_establecimiento: '1',
  afiliacion_iva: 'GEN',
  moneda: 'GTQ',
  iva_incluido: true,
  serie_prefijo: 'FEL',
  api_usuario: 'usuario',
  api_clave: '',
  api_llave_firma: '',
  codigo_postal: '01001',
  municipio: 'Guatemala',
  departamento: 'Guatemala',
  pais: 'GT',
  next_correlativo: 1,
  updated_at: new Date().toISOString(),
};

const emisorDir = {
  direccion: settingsBase.direccion,
  codigoPostal: '01001',
  municipio: 'Guatemala',
  departamento: 'Guatemala',
  pais: 'GT',
};

const receptor = { nit: 'CF', nombre: 'Consumidor Final', direccion: 'Ciudad' };

function xmlDe(settings: FelSettings, lineas = [{ descripcion: 'Hamburguesa', cantidad: 2, total: 112 }]) {
  const dte = buildFacturaDte(settings, receptor, lineas);
  return buildDteXml(dte, settings, { emisor: emisorDir });
}

describe('buildDteXml — estructura básica', () => {
  it('produce un GTDocumento con el namespace del SAT', () => {
    const xml = xmlDe(settingsBase);
    expect(xml).toContain('<dte:GTDocumento');
    expect(xml).toContain('xmlns:dte="http://www.sat.gob.gt/dte/fel/0.2.0"');
    expect(xml).toContain('<dte:DatosEmision ID="DatosEmision">');
  });

  it('no lleva saltos de línea ni indentación', () => {
    // El certificador firma estos bytes exactos: cualquier reformateo
    // posterior invalidaría la firma.
    const xml = xmlDe(settingsBase);
    expect(xml.includes('\n')).toBe(false);
  });

  it('numera las líneas desde 1', () => {
    const xml = xmlDe(settingsBase, [
      { descripcion: 'Hamburguesa', cantidad: 1, total: 56 },
      { descripcion: 'Coca Cola', cantidad: 1, total: 12 },
    ]);
    expect(xml).toContain('NumeroLinea="1"');
    expect(xml).toContain('NumeroLinea="2"');
  });
});

describe('buildDteXml — régimen general vs pequeño contribuyente', () => {
  it('GEN emite FACT, desglosa IVA y usa la frase 1', () => {
    const xml = xmlDe(settingsBase);
    expect(xml).toContain('Tipo="FACT"');
    expect(xml).toContain('<dte:NombreCorto>IVA</dte:NombreCorto>');
    expect(xml).toContain('TipoFrase="1"');
    expect(xml).toContain('<dte:TotalImpuesto NombreCorto="IVA"');
  });

  it('PEQ emite FPEQ, no desglosa IVA y usa la frase 2', () => {
    // Un pequeño contribuyente no factura IVA. Mandar un FACT desde su
    // cuenta hace que el certificador rechace el documento.
    const xml = xmlDe({ ...settingsBase, afiliacion_iva: 'PEQ' });
    expect(xml).toContain('Tipo="FPEQ"');
    expect(xml).toContain('TipoFrase="2"');
    expect(xml).not.toContain('<dte:Impuestos>');
    expect(xml).not.toContain('<dte:TotalImpuestos>');
  });

  it('dteTipo refleja la afiliación', () => {
    expect(dteTipo({ afiliacion_iva: 'GEN' })).toBe('FACT');
    expect(dteTipo({ afiliacion_iva: 'PEQ' })).toBe('FPEQ');
  });
});

describe('buildDteXml — escapado', () => {
  it('escapa los caracteres que romperían el XML', () => {
    // "Café & Té" o un nombre con comillas es normal en una carta real;
    // sin escapar produce un XML inválido que el certificador rechaza.
    const xml = xmlDe(settingsBase, [
      { descripcion: 'Café & Té <especial> "grande"', cantidad: 1, total: 25 },
    ]);
    expect(xml).toContain('Café &amp; Té');
    expect(xml).toContain('&lt;especial&gt;');
    expect(xml).toContain('&quot;grande&quot;');
    expect(xml).not.toMatch(/<especial>/);
  });

  it('escapa también el nombre del emisor', () => {
    const xml = xmlDe({ ...settingsBase, nombre_emisor: 'Ríos & Hijos, S.A.' });
    expect(xml).toContain('Ríos &amp; Hijos');
  });
});

describe('buildDteXml — montos', () => {
  it('escribe los montos con exactamente 2 decimales', () => {
    const xml = xmlDe(settingsBase, [{ descripcion: 'Plato', cantidad: 1, total: 100 }]);
    expect(xml).toContain('<dte:GranTotal>100.00</dte:GranTotal>');
    expect(xml).toContain('<dte:Descuento>0.00</dte:Descuento>');
  });

  it('el gran total coincide con la suma de las líneas', () => {
    const lineas = [
      { descripcion: 'Plato', cantidad: 1, total: 56.5 },
      { descripcion: 'Bebida', cantidad: 2, total: 24 },
    ];
    const xml = xmlDe(settingsBase, lineas);
    expect(xml).toContain('<dte:GranTotal>80.50</dte:GranTotal>');
  });

  it('no usa notación científica en montos pequeños', () => {
    const xml = xmlDe(settingsBase, [{ descripcion: 'Bolsa', cantidad: 1, total: 0.05 }]);
    expect(xml).toContain('<dte:GranTotal>0.05</dte:GranTotal>');
    expect(xml).not.toMatch(/e-\d/i);
  });
});

describe('buildDteXml — clasificación de líneas', () => {
  it('marca el envío como servicio y la comida como bien', () => {
    const xml = xmlDe(settingsBase, [
      { descripcion: 'Hamburguesa', cantidad: 1, total: 56 },
      { descripcion: 'Servicio de entrega', cantidad: 1, total: 15 },
    ]);
    expect(xml).toContain('NumeroLinea="1" BienOServicio="B"');
    expect(xml).toContain('NumeroLinea="2" BienOServicio="S"');
  });
});

describe('felDateTime', () => {
  it('usa la hora de Guatemala con offset -06:00, no UTC', () => {
    // Una venta a las 21:00 del día 4 en Guatemala es 03:00 del día 5 en
    // UTC. Mandarla en UTC la mueve al día siguiente y descuadra el cierre
    // fiscal de las ventas de la noche.
    const nocheDelCuatro = new Date('2026-08-05T03:00:00Z');
    const s = felDateTime(nocheDelCuatro);
    expect(s).toBe('2026-08-04T21:00:00-06:00');
  });

  it('no emite el sufijo Z', () => {
    expect(felDateTime(new Date())).not.toContain('Z');
    expect(felDateTime(new Date())).toContain('-06:00');
  });

  it('la fecha del DTE se normaliza al serializar', () => {
    const dte = buildFacturaDte(settingsBase, receptor, [{ descripcion: 'X', cantidad: 1, total: 10 }]);
    dte.fechaEmision = '2026-08-05T03:00:00.000Z';
    const xml = buildDteXml(dte, settingsBase, { emisor: emisorDir });
    expect(xml).toContain('FechaHoraEmision="2026-08-04T21:00:00-06:00"');
  });
});

describe('buildAnulacionXml', () => {
  it('referencia el UUID original', () => {
    const xml = buildAnulacionXml({
      uuidOriginal: 'ABC-123',
      fechaEmisionOriginal: '2026-08-01T10:00:00-06:00',
      nitEmisor: '1234567K',
      idReceptor: 'CF',
      motivo: 'Pedido cancelado',
    });
    expect(xml).toContain('<dte:GTAnulacionDocumento');
    expect(xml).toContain('NumeroDocumentoAAnular="ABC-123"');
    expect(xml).toContain('MotivoAnulacion="Pedido cancelado"');
    expect(xml).toContain('NITEmisor="1234567K"');
  });

  it('pone un motivo por defecto si viene vacío', () => {
    const xml = buildAnulacionXml({
      uuidOriginal: 'ABC-123',
      fechaEmisionOriginal: '2026-08-01T10:00:00-06:00',
      nitEmisor: '1234567K',
      idReceptor: 'CF',
      motivo: '',
    });
    expect(xml).toContain('MotivoAnulacion="Anulaci');
  });
});
