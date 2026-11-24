import { beforeEach, describe, expect, it, vi } from 'vitest';

/* Auditoría de lanzamiento 2026-11-23 (LZ-08 y LZ-10): «Exportar tus datos»
   cortaba en 5,000 pedidos y no traía cobros ni facturas FEL. Se abre el
   .xlsx que devuelve la acción y se miran sus hojas de verdad (exceljs real);
   solo la base, la sesión y la marca son dobles. */

const RID = '11111111-1111-4111-8111-111111111111';
const tablas: Record<string, Record<string, unknown>[]> = {};
const rangos: Record<string, [number, number][]> = {};
let fallaEn: string | null = null;
const anotado: { tabla: string; valores: Record<string, unknown>; id: unknown }[] = [];

function consulta(tabla: string) {
  const q: Record<string, unknown> = {};
  for (const f of ['select', 'eq', 'order']) q[f] = () => q;
  q.update = (valores: Record<string, unknown>) => ({
    eq: async (_c: string, id: unknown) => { anotado.push({ tabla, valores, id }); return { error: null }; },
  });
  q.single = async () => ({ data: { slug: 'rincon-prueba', timezone: 'America/Guatemala' }, error: null });
  q.range = async (desde: number, hasta: number) => {
    (rangos[tabla] ??= []).push([desde, hasta]);
    if (fallaEn === tabla) return { data: null, error: { message: 'statement timeout' } };
    return { data: (tablas[tabla] ?? []).slice(desde, hasta + 1), error: null };
  };
  return q;
}

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: consulta }) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'RESTAURANT_OWNER', restaurant_id: RID, permissions: null } }) }) }) }),
  }),
}));
vi.mock('@/lib/auth/reauth', () => ({ identidadReciente: async () => true }));
vi.mock('@/lib/db/membership', () => ({ resolveEffectiveRole: async () => ({ role: 'RESTAURANT_OWNER', permissions: null, isMember: true }) }));
vi.mock('@/lib/db/admin', () => ({
  canActOnGroupBranch: async () => false,
  getAdminMenu: async () => ({ categories: [], products: [] }),
}));
vi.mock('@/lib/db/customers', () => ({ getAllCustomersForExport: async () => [] }));
vi.mock('@/lib/db/loyalty', () => ({ loyaltyActive: async () => false }));
vi.mock('@/lib/documents/branding', () => ({
  resolveRestaurantBranding: async () => ({
    kind: 'restaurant', name: 'Rincón de prueba', subtitle: null, accentHex: '#C2542F', accentRgb: [194, 84, 47],
    onAccentHex: '#FFFFFF', logoUrl: null, currencySymbol: 'Q', currencyPosition: 'prefix', locale: 'es-GT',
  }),
}));

const { exportBackupXlsx } = await import('./backup');

async function abrir(b64: string) {
  const { Workbook } = await import('exceljs');
  const wb = new Workbook();
  await wb.xlsx.load(Buffer.from(b64, 'base64') as unknown as ArrayBuffer);
  return wb;
}

/** Los valores de una hoja como texto, para buscar sin depender de la fila del encabezado. */
function texto(wb: Awaited<ReturnType<typeof abrir>>, hoja: string): string {
  const ws = wb.getWorksheet(hoja);
  const filas: string[] = [];
  ws?.eachRow((r) => filas.push((r.values as unknown[]).slice(1).map((v) => String(v ?? '')).join(' | ')));
  return filas.join('\n');
}

beforeEach(() => {
  for (const k of Object.keys(tablas)) delete tablas[k];
  for (const k of Object.keys(rangos)) delete rangos[k];
  fallaEn = null;
  anotado.length = 0;
});

describe('Exportar tus datos', () => {
  it('trae todos los pedidos aunque pasen de 5,000, con su forma de pago y propina', async () => {
    tablas.orders = Array.from({ length: 5_203 }, (_, i) => ({
      order_number: `ORD-${i}`, created_at: '2026-11-20T18:00:00Z', customer_name: 'Ana', customer_phone: '5555',
      order_type: 'DINE_IN', table_number: 4, status: 'DELIVERED', payment_method: 'CARD',
      subtotal: 100, discount: 5, loyalty_discount: 0, delivery_fee: 0, tip: 10, total: 105, notes: null, es_prueba: i === 0,
      items: [{ name_snapshot: 'Pupusa', quantity: 2 }],
    }));
    const r = await exportBackupXlsx(RID);
    expect(r.error).toBeUndefined();
    const wb = await abrir(r.xlsx!);
    expect(wb.getWorksheet('Pedidos')!.actualRowCount).toBeGreaterThan(5_203);
    const t = texto(wb, 'Pedidos');
    expect(t).toContain('5203 pedidos, todos');
    expect(t).toContain('ORD-5202');
    expect(t).toContain('Tarjeta');
    expect(t).toMatch(/Forma de pago .*Propina/);
    expect(rangos.orders).toHaveLength(6); // 0–999 … 5000–5999
  }, 30_000); // armar 5,203 filas tarda más de 5 s con la suite entera corriendo

  it('trae los cobros con su pedido y nombra cada movimiento', async () => {
    tablas.order_payments = [
      { created_at: '2026-11-20T18:05:00Z', kind: 'PAYMENT', method: 'CASH', amount: 105, cash_received: 200, reason: null, order: { order_number: 'ORD-7' } },
      { created_at: '2026-11-20T18:09:00Z', kind: 'REFUND', method: 'CASH', amount: -20, cash_received: null, reason: 'Plato frío', order: { order_number: 'ORD-7' } },
    ];
    const wb = await abrir((await exportBackupXlsx(RID)).xlsx!);
    const t = texto(wb, 'Cobros');
    expect(t).toContain('ORD-7 | Cobro | Efectivo | 105 | 200');
    expect(t).toContain('Devolución | Efectivo | -20');
    expect(t).toContain('Plato frío');
  });

  it('la hoja de facturas FEL aparece solo si el local factura', async () => {
    expect((await abrir((await exportBackupXlsx(RID)).xlsx!)).getWorksheet('Facturas FEL')).toBeUndefined();

    tablas.fel_documents = [{
      created_at: '2026-11-20T18:10:00Z', fecha_certificacion: '2026-11-20T18:10:05Z', tipo: 'FACT', serie: 'A1B2', numero: '123',
      numero_autorizacion: 'AUT-1', uuid_sat: null, receptor_nit: 'CF', receptor_nombre: 'Consumidor final',
      monto_total: 105, monto_iva: 11.25, estado: 'CERTIFICADO', fecha_anulacion: null, motivo_anulacion: null, es_fiscal: true,
      order: { order_number: 'ORD-7' },
    }];
    const t = texto(await abrir((await exportBackupXlsx(RID)).xlsx!), 'Facturas FEL');
    expect(t).toContain('A1B2 | 123 | AUT-1 | CF | Consumidor final | 105 | 11.25 | Certificada | ORD-7');
  });

  it('si la base falla a mitad, no entrega un respaldo incompleto', async () => {
    tablas.orders = Array.from({ length: 1000 }, (_, i) => ({ order_number: `O${i}` }));
    fallaEn = 'order_payments';
    const r = await exportBackupXlsx(RID);
    expect(r.xlsx).toBeUndefined();
    expect(r.error).toMatch(/No se pudo leer todo/);
    expect(anotado).toEqual([]);
  });

  it('anota cuándo exportó el local, para avisar antes de borrarlo', async () => {
    await exportBackupXlsx(RID);
    expect(anotado).toEqual([{ tabla: 'restaurants', valores: { datos_exportados_at: expect.any(String) }, id: RID }]);
  });
});
