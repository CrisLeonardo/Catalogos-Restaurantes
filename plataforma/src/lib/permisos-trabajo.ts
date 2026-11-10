/* ============================================================
   PERMISOS POR TRABAJO (auditoría 1.7: E12, N18, R35, C05)
   ------------------------------------------------------------
   Sin dependencias de servidor: lo usan la ficha de Personal, la vista
   «Así verá el panel» y las acciones que guardan permisos. El candado real
   sigue siendo `can()` en el servidor y `leogin_puede` en la base; esto
   solo da nombre a lo que esas reglas ya deciden.

   Un PUESTO es una plantilla: rellena la lista de permisos con lo típico de
   un trabajo. Lo que el dueño añade o quita encima son EXCEPCIONES, y la
   ficha las enseña como tales. El puesto no decide cómo entra la persona
   (PIN o usuario): eso es aparte (decisión del dueño, 2026-11-08).
   ============================================================ */

import { CAJA_CAPACIDADES, STAFF_ASSIGNABLE } from '@/lib/permissions';

export type PuestoKey = 'mesero' | 'cocina' | 'caja' | 'recepcion' | 'reparto' | 'encargado';

const CAJA_BASICA = ['caja.cobrar', 'caja.abrir', 'caja.salida', 'caja.cerrar'];

export const PUESTOS: { key: PuestoKey; label: string; desc: string; permisos: string[] }[] = [
  { key: 'mesero', label: 'Mesero', desc: 'Toma pedidos, atiende y cobra', permisos: ['mesero', 'caja.cobrar'] },
  { key: 'cocina', label: 'Cocina', desc: 'Prepara en la pantalla de cocina', permisos: ['cocina'] },
  { key: 'caja', label: 'Caja', desc: 'Cobra, abre y cierra caja', permisos: [...CAJA_BASICA, 'pedidos', 'mesas'] },
  { key: 'recepcion', label: 'Recepción', desc: 'Sienta grupos y lleva la espera', permisos: ['mesas', 'lista_espera', 'pedidos'] },
  { key: 'reparto', label: 'Reparto', desc: 'Recoge y entrega a domicilio', permisos: ['reparto'] },
  {
    key: 'encargado', label: 'Encargado', desc: 'Lleva el turno y el equipo',
    permisos: ['mesero', 'mesas', 'lista_espera', 'pedidos', 'cocina', ...CAJA_CAPACIDADES,
      'catalogo', 'categorias', 'inventario', 'clientes', 'personal'],
  },
];

export const PUESTO_LABEL: Record<PuestoKey, string> =
  Object.fromEntries(PUESTOS.map((p) => [p.key, p.label])) as Record<PuestoKey, string>;

export function esPuesto(v: unknown): v is PuestoKey {
  return typeof v === 'string' && PUESTOS.some((p) => p.key === v);
}

export function permisosDePuesto(puesto: PuestoKey): string[] {
  return [...(PUESTOS.find((p) => p.key === puesto)?.permisos ?? [])];
}

/**
 * Papel al dar un acceso desde superadmin (N19): Dueño o un puesto. Antes el
 * formulario arrancaba en «Dueño» y el personal nacía sin lista (= todo).
 * Valor del formulario: 'OWNER' o 'puesto:<clave>'.
 */
export const PAPELES: { value: string; label: string }[] = [
  ...PUESTOS.map((p) => ({ value: `puesto:${p.key}`, label: p.label })),
  { value: 'OWNER', label: 'Dueño (todo, incluido el cobro del plan)' },
];

export type Papel = {
  memberRole: 'OWNER' | 'MANAGER' | 'STAFF';
  puesto: PuestoKey | null;
  /** null para el dueño: no depende de una lista. */
  permissions: string[] | null;
};

export function leerPapel(raw: unknown): Papel | null {
  if (raw === 'OWNER') return { memberRole: 'OWNER', puesto: null, permissions: null };
  if (typeof raw !== 'string' || !raw.startsWith('puesto:')) return null;
  const puesto = raw.slice('puesto:'.length);
  if (!esPuesto(puesto)) return null;
  const permissions = permisosDePuesto(puesto);
  return { memberRole: permissions.includes('personal') ? 'MANAGER' : 'STAFF', puesto, permissions };
}

/** El valor del selector para una membresía existente. */
export function papelActual(role: string | null, puesto: string | null): string {
  if (role === 'OWNER') return 'OWNER';
  if (esPuesto(puesto)) return `puesto:${puesto}`;
  if (role === 'WAITER') return 'puesto:mesero';
  return '';
}

export type Tarea = { key: string; label: string; ayuda?: string; delicada?: boolean };
export type Area = { key: string; label: string; tareas: Tarea[] };

/** Las llaves agrupadas por área y dichas como tareas (N18). */
export const AREAS: Area[] = [
  { key: 'salon', label: 'Salón y servicio', tareas: [
    { key: 'mesero', label: 'Tomar pedidos y atender mesas', ayuda: 'Tomar pedidos en su teléfono' },
    { key: 'mesas', label: 'Sentar y repartir mesas', ayuda: 'Puesto de la entrada' },
    { key: 'lista_espera', label: 'Lista de espera y reservaciones' },
    { key: 'pedidos', label: 'Ver pedidos en vivo', ayuda: 'Incluye avisos de cocina y entregas' },
  ] },
  { key: 'cocina', label: 'Cocina', tareas: [
    { key: 'cocina', label: 'Pantalla de cocina', ayuda: 'Preparar y marcar listo' },
  ] },
  { key: 'caja', label: 'Caja', tareas: [
    { key: 'caja.cobrar', label: 'Cobrar cuentas', ayuda: 'Efectivo, tarjeta y pago mixto' },
    { key: 'caja.abrir', label: 'Abrir la caja', ayuda: 'También recibir la caja de otro turno' },
    { key: 'caja.salida', label: 'Registrar salidas de efectivo', ayuda: 'Compras pequeñas, retiros' },
    { key: 'caja.cerrar', label: 'Cerrar la caja y entregar el turno' },
    { key: 'caja.ver_esperado', label: 'Ver cuánto debería haber', ayuda: 'Sin esto, cuenta a ciegas si el local lo activa', delicada: true },
    { key: 'caja.corregir', label: 'Corregir cobros ya registrados', ayuda: 'Cambiar el método, reabrir o anular un corte', delicada: true },
    { key: 'caja.devolver', label: 'Hacer devoluciones', delicada: true },
  ] },
  { key: 'finanzas', label: 'Ganancias y reportes', tareas: [
    { key: 'finanzas', label: 'Ver ventas, costos y utilidades', ayuda: 'Finanzas e historial de caja', delicada: true },
    { key: 'metricas', label: 'Resumen del negocio' },
    { key: 'analitica', label: 'Analítica' },
    { key: 'respaldo', label: 'Descargar copia de los datos', ayuda: 'Clientes, ventas y catálogo', delicada: true },
    { key: 'fel', label: 'Facturación electrónica (FEL)', delicada: true },
  ] },
  { key: 'menu', label: 'Carta e inventario', tareas: [
    { key: 'catalogo', label: 'Platillos y precios', delicada: true },
    { key: 'categorias', label: 'Categorías' },
    { key: 'inventario', label: 'Inventario y agotados' },
    { key: 'ingredientes', label: 'Ingredientes y recetas' },
    { key: 'proveedores', label: 'Proveedores y compras' },
  ] },
  { key: 'clientes', label: 'Clientes', tareas: [
    { key: 'clientes', label: 'Lista de clientes' },
    { key: 'loyalty', label: 'Puntos y lealtad' },
    { key: 'cupones', label: 'Cupones y descuentos', delicada: true },
    { key: 'whatsapp', label: 'WhatsApp' },
  ] },
  { key: 'local', label: 'Ajustes del local', tareas: [
    { key: 'ajustes', label: 'Horarios, zonas y forma de cobro', delicada: true },
    { key: 'personalizar', label: 'Diseño del sitio y la carta' },
    { key: 'perfil', label: 'Perfil del negocio' },
    { key: 'modulos', label: 'Encender o apagar funciones', delicada: true },
    { key: 'impresion', label: 'La PC del local e impresoras' },
    { key: 'qr', label: 'Códigos QR' },
    { key: 'repartidores', label: 'Repartidores' },
    { key: 'ayuda', label: 'Centro de ayuda' },
  ] },
  { key: 'equipo', label: 'Equipo', tareas: [
    { key: 'personal', label: 'Agregar personal y cambiar sus permisos', ayuda: 'Sólo puede dar lo que él mismo tiene', delicada: true },
  ] },
  { key: 'reparto', label: 'Reparto', tareas: [
    { key: 'reparto', label: 'Pantalla del repartidor', ayuda: 'Recoger y entregar pedidos' },
  ] },
];

const TAREA_POR_LLAVE = new Map(AREAS.flatMap((a) => a.tareas.map((t) => [t.key, t] as const)));

export function etiquetaDeTarea(key: string): string {
  return TAREA_POR_LLAVE.get(key)?.label ?? key;
}

/** Sólo llaves que existen y se pueden delegar, sin repetir y en orden estable. */
export function normalizarPermisos(lista: readonly unknown[]): string[] {
  const set = new Set(lista.filter((x): x is string => typeof x === 'string' && STAFF_ASSIGNABLE.includes(x)));
  return STAFF_ASSIGNABLE.filter((k) => set.has(k));
}

/** Lo que difiere de la plantilla: añadido o quitado por el dueño. */
export function excepciones(puesto: PuestoKey | null, permisos: readonly string[]): { añadidos: string[]; quitados: string[] } {
  if (!puesto) return { añadidos: [], quitados: [] };
  const base = new Set(permisosDePuesto(puesto));
  const tiene = new Set(permisos);
  return {
    añadidos: normalizarPermisos(permisos.filter((p) => !base.has(p))),
    quitados: normalizarPermisos([...base].filter((p) => !tiene.has(p))),
  };
}

/** Si la lista coincide exactamente con una plantilla, ese es su puesto. */
export function puestoQueCoincide(permisos: readonly string[]): PuestoKey | null {
  const v = normalizarPermisos(permisos);
  for (const p of PUESTOS) {
    const base = normalizarPermisos(p.permisos);
    if (base.length === v.length && base.every((k, i) => k === v[i])) return p.key;
  }
  return null;
}

export function tareasDelicadas(permisos: readonly string[]): Tarea[] {
  return AREAS.flatMap((a) => a.tareas).filter((t) => t.delicada && permisos.includes(t.key));
}

/**
 * Un responsable con «personal» sólo reparte lo que él mismo tiene, y
 * nunca «personal» si no es el dueño quien lo da (no puede crear pares).
 * Devuelve lo que se pasa de su techo.
 */
export function fueraDelTecho(techo: readonly string[] | null, pedidos: readonly string[]): string[] {
  if (techo === null) return [];
  return pedidos.filter((p) => !techo.includes(p) || p === 'personal');
}
