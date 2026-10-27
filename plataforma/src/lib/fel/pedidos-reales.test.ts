import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { armarDocumento, type FelSettings } from '@/lib/fel';
import { buildDteXml } from './xml';
import { verificarMontos } from './totales';
import { interpretarReceptorId } from './nit';

/* ── Contexto ─────────────────────────────────────────────────────
   Las demás pruebas usan pedidos inventados con números redondos. Esta
   toma pedidos EXPORTADOS DE LA BASE, con las columnas y los tipos que
   Postgres devuelve de verdad (numeric como string, nulls donde el
   inventado pone 0), y comprueba lo único que de verdad importa:

       lo que dice la factura == lo que cobró la caja

   Era exactamente lo que fallaba antes: el DTE se armaba con los ítems
   más el envío, ignorando descuento y propina, así que el restaurante
   pagaba IVA sobre descuentos que nunca cobró.

   El archivo lo genera:
     docker exec -i supabase_db_plataforma psql -U postgres -d postgres ...
   y se versiona para que la prueba corra sin base de datos. */

const RUTA = 'scripts/fel/pedidos-reales.json';

interface OrdenExportada {
  id: string;
  order_number: string;
  total: number | string;
  delivery_fee: number | string | null;
  tip: number | string | null;
  discount: number | string | null;
  loyalty_discount: number | string | null;
  items: Array<{ name_snapshot: string; quantity: number; subtotal: number | string }> | null;
}

const settings: FelSettings = {
  restaurant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', provider: 'INFILE', ambiente: 'PRUEBAS',
  nit_emisor: '36029785', nombre_emisor: 'Rincón 502, S.A.', nombre_comercial: 'Rincón 502',
  correo_emisor: null, direccion: '5a avenida 10-50 zona 1', codigo_postal: '01001',
  municipio: 'Guatemala', departamento: 'Guatemala', pais: 'GT', codigo_establecimiento: '1',
  regimen_iva: 'GENERAL', regimen_isr: 'SIMPLIFICADO', agente_retencion_iva: false,
  numero_resolucion: null, fecha_resolucion: null, moneda: 'GTQ', iva_incluido: true,
  emision_automatica: true, facturar_propina: false, tope_consumidor_final: 2500,
  horas_para_anular: 24, serie_prefijo: '', api_usuario: 'u', api_clave: '', api_llave_firma: '',
  next_correlativo: 1, updated_at: new Date().toISOString(),
};

/** Mismo mapeo que usa actions/fel.ts para convertir un pedido en líneas. */
function pedidoDe(o: OrdenExportada) {
  return {
    lineas: (o.items ?? []).map((it) => ({
      descripcion: it.name_snapshot,
      cantidad: Number(it.quantity),
      importe: Number(it.subtotal),
    })),
    envio: Number(o.delivery_fee ?? 0),
    descuento: Number(o.discount ?? 0),
    descuentoLealtad: Number(o.loyalty_discount ?? 0),
    propina: Number(o.tip ?? 0),
    totalCobrado: Number(o.total),
  };
}

const cent = (n: number) => Math.round(n * 100);

const todas: OrdenExportada[] = existsSync(RUTA)
  ? (JSON.parse(readFileSync(RUTA, 'utf8')) as OrdenExportada[])
  : [];

/** Los que tienen líneas: los facturables de verdad. */
const ordenes = todas.filter((o) => (o.items ?? []).length > 0);
/** Los que no: la base tiene alguno, y NO se deben facturar. */
const sinLineas = todas.filter((o) => (o.items ?? []).length === 0);

function armar(orden: OrdenExportada, over: Partial<FelSettings> = {}) {
  return armarDocumento({
    settings: { ...settings, ...over },
    receptor: { id: interpretarReceptorId('CF')!, nombre: 'Consumidor Final' },
    pedido: pedidoDe(orden),
  });
}

describe.skipIf(todas.length === 0)('pedidos reales de la base', () => {
  it('hay pedidos que revisar', () => {
    expect(ordenes.length).toBeGreaterThan(0);
  });

  it.skipIf(sinLineas.length === 0)('se niega a facturar un pedido sin líneas', () => {
    // La base tiene pedidos sin ítems (restos de pruebas, pedidos rotos).
    // Emitir un DTE por uno de ellos sería declarar una venta inexistente.
    for (const orden of sinLineas) {
      const armado = armar(orden);
      expect(armado.errores.join(' ')).toContain('nada que facturar');
    }
  });

  it.each(ordenes.map((o) => [o.order_number, o] as const))(
    '%s: la factura cuadra con lo cobrado',
    (_num, orden) => {
      const armado = armar(orden);

      // Sin errores: si el cálculo no cuadra, armarDocumento se niega y aquí
      // se ve el motivo en vez de un DTE silenciosamente equivocado.
      expect(armado.errores).toEqual([]);

      // El DTE cobra el total menos la propina (que queda fuera de la base).
      const esperado = cent(Number(orden.total)) - cent(Number(orden.tip ?? 0));
      expect(cent(armado.montos.granTotal)).toBe(esperado);

      // Y las igualdades que el certificador va a comprobar.
      expect(verificarMontos(armado.montos, true)).toEqual([]);
    },
  );

  it.each(ordenes.map((o) => [o.order_number, o] as const))(
    '%s: el descuento se reparte entero entre las líneas',
    (_num, orden) => {
      const descuento = cent(Number(orden.discount ?? 0)) + cent(Number(orden.loyalty_discount ?? 0));
      const armado = armar(orden);
      const repartido = armado.montos.lineas.reduce((a, l) => a + cent(l.descuento), 0);
      expect(repartido).toBe(descuento);
    },
  );

  it('todos producen un XML con el gran total correcto', () => {
    for (const orden of ordenes) {
      const armado = armar(orden);
      const xml = buildDteXml(armado.documento);
      expect(xml).toContain(`<dte:GranTotal>${armado.montos.granTotal.toFixed(2)}</dte:GranTotal>`);
    }
  });

  it('el pequeño contribuyente factura lo mismo, sin IVA', () => {
    for (const orden of ordenes) {
      const armado = armar(orden, { regimen_iva: 'PEQUENO', regimen_isr: 'NO_APLICA' });
      expect(armado.errores).toEqual([]);
      expect(armado.montos.totalImpuesto).toBe(0);
      expect(verificarMontos(armado.montos, false)).toEqual([]);
    }
  });
});
