import { describe, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { armarDocumento, type FelSettings } from '@/lib/fel';
import { buildDteXml, buildAnulacionXml } from './xml';
import { interpretarReceptorId } from './nit';

/**
 * Genera los XML de muestra que valida `scripts/fel/validar-dte.py` contra
 * los XSD oficiales del SAT.
 *
 * No es una prueba de comportamiento: es el generador del material. Se deja
 * como test para que corra con el mismo tooling que el resto y para que
 * FALLE si `armarDocumento` empieza a rechazar un caso que antes armaba —
 * cada `throw` de abajo es una comprobación real.
 *
 * Flujo completo:
 *   npx vitest run src/lib/fel/muestras-xml.test.ts
 *   python scripts/fel/validar-dte.py scripts/fel/muestras
 */
const OUT = 'scripts/fel/muestras';

const settings: FelSettings = {
  restaurant_id: 'r1', provider: 'INFILE', ambiente: 'PRUEBAS',
  nit_emisor: '36029785', nombre_emisor: 'Restaurante Ejemplo, S.A.',
  nombre_comercial: 'Rincón 502', correo_emisor: 'facturacion@ejemplo.gt',
  direccion: '5a avenida 10-50 zona 1', codigo_postal: '01001',
  municipio: 'Guatemala', departamento: 'Guatemala', pais: 'GT',
  codigo_establecimiento: '1',
  regimen_iva: 'GENERAL', regimen_isr: 'SIMPLIFICADO', agente_retencion_iva: false,
  numero_resolucion: null, fecha_resolucion: null,
  moneda: 'GTQ', iva_incluido: true, emision_automatica: true,
  facturar_propina: false, tope_consumidor_final: 2500, horas_para_anular: 24,
  serie_prefijo: '', api_usuario: 'u', api_clave: '', api_llave_firma: '',
  next_correlativo: 1, updated_at: new Date().toISOString(),
};

describe('volcado de XML de muestra', () => {
  it('escribe los casos representativos', () => {
    mkdirSync(OUT, { recursive: true });

    // 1. Factura normal con descuento prorrateado, envío y propina excluida.
    const a = armarDocumento({
      settings,
      receptor: { id: interpretarReceptorId('CF')!, nombre: 'Consumidor Final', correo: 'cliente@correo.com' },
      pedido: {
        lineas: [
          { descripcion: 'Hamburguesa doble', cantidad: 2, importe: 112 },
          { descripcion: 'Refresco natural', cantidad: 3, importe: 30 },
        ],
        envio: 25, descuento: 12, propina: 15, totalCobrado: 170,
      },
    });
    if (a.errores.length) throw new Error(a.errores.join(' | '));
    writeFileSync(`${OUT}/factura.xml`, buildDteXml(a.documento), 'utf8');

    // 2. Pequeño contribuyente, sin desglose de IVA.
    const b = armarDocumento({
      settings: { ...settings, regimen_iva: 'PEQUENO', regimen_isr: 'NO_APLICA' },
      receptor: { id: interpretarReceptorId('3602978-5')!, nombre: 'Cliente, S.A.' },
      pedido: { lineas: [{ descripcion: 'Menú del día', cantidad: 1, importe: 45 }] },
    });
    if (b.errores.length) throw new Error(b.errores.join(' | '));
    writeFileSync(`${OUT}/fpeq.xml`, buildDteXml(b.documento), 'utf8');

    // 3. Receptor con DPI (CUI) por encima del tope de consumidor final,
    //    emisor con pago directo y agente de retención: tres frases.
    const correlativo = '12345678';
    let s = 0; for (let i = 0; i < 8; i++) s += Number(correlativo[i]) * (i + 2);
    const cui = `${correlativo}${s % 11}0101`;
    const c = armarDocumento({
      settings: {
        ...settings, regimen_isr: 'SIMPLIFICADO_PAGO_DIRECTO',
        numero_resolucion: 'SAT-2024-999', fecha_resolucion: '2024-03-15',
        agente_retencion_iva: true,
      },
      receptor: { id: interpretarReceptorId(cui)!, nombre: 'Juan Pérez' },
      pedido: { lineas: [{ descripcion: 'Evento privado', cantidad: 1, importe: 3200 }] },
    });
    if (c.errores.length) throw new Error(c.errores.join(' | '));
    writeFileSync(`${OUT}/cui.xml`, buildDteXml(c.documento), 'utf8');

    // 4. Nota de crédito con su complemento de referencia.
    const d = armarDocumento({
      settings,
      receptor: { id: interpretarReceptorId('CF')!, nombre: 'Consumidor Final' },
      pedido: { lineas: [{ descripcion: 'Hamburguesa doble', cantidad: 2, importe: 112 }] },
      tipo: 'NCRE',
      referenciaNota: {
        numeroAutorizacionOrigen: '95605984-8395-5540-BE43-7D9ED0B45027',
        fechaEmisionOrigen: '2026-06-01', serieOrigen: 'A1B2', numeroOrigen: '445',
        motivoAjuste: 'Devolución de producto',
      },
    });
    if (d.errores.length) throw new Error(d.errores.join(' | '));
    writeFileSync(`${OUT}/ncre.xml`, buildDteXml(d.documento), 'utf8');

    // 5. Anulación (otro esquema, otro namespace).
    writeFileSync(`${OUT}/anulacion.xml`, buildAnulacionXml({
      uuidOriginal: '95605984-8395-5540-BE43-7D9ED0B45027',
      fechaEmisionOriginal: '2026-08-20T12:30:00-06:00',
      nitEmisor: '36029785', idReceptor: 'CF', motivo: 'Error en el NIT del cliente',
    }), 'utf8');
  });
});
