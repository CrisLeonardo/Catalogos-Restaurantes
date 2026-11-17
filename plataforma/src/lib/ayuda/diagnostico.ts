/* ============================================================
   «NO ME ENTRAN PEDIDOS» — el diagnóstico (ficha 2.9, S07)
   ------------------------------------------------------------
   Revisa con los datos de ese momento las cuatro causas que explican
   casi todos los «no me llega nada»: la pausa, el horario, los pedidos
   apagados y la PC del local caída. Lo que falla trae su arreglo.
   Puro y sin red: la acción del servidor solo junta los datos.
   ============================================================ */

import { estadoDePausa, type PausaGuardada } from '@/lib/pausa-pedidos';
import { isOpenNow, todayWindowLabel, type HourExceptions, type WeeklyHours } from '@/lib/hours';

export type AccionDiagnostico =
  | { tipo: 'reanudar' }
  | { tipo: 'ir'; ruta: string; label: string; seccion?: string };

export interface PuntoDiagnostico {
  key: 'pausa' | 'horario' | 'pedidos' | 'pc';
  ok: boolean;
  titulo: string;
  detalle?: string;
  accion?: AccionDiagnostico;
}

export interface DatosDiagnostico {
  pausa: PausaGuardada;
  hours: WeeklyHours | null;
  exceptions: HourExceptions | null;
  zona: string;
  /** Módulo de pedidos encendido. */
  pedidosEncendidos: boolean;
  orderTypes: string[];
  pc: { activa: boolean | null; ultimaSenal: string | null } | null;
}

/** Desde aquí la PC se da por desconectada (el mismo reloj de la ficha 2.6). */
const PC_CAIDA_MS = 10 * 60_000;

function hora(iso: string, zona: string): string {
  try {
    return new Intl.DateTimeFormat('es-GT', { hour: 'numeric', minute: '2-digit', timeZone: zona }).format(new Date(iso));
  } catch { return iso.slice(11, 16); }
}

export function diagnosticarPedidos(d: DatosDiagnostico, ahora: number = Date.now()): PuntoDiagnostico[] {
  const out: PuntoDiagnostico[] = [];

  const pausa = estadoDePausa(d.pausa, ahora);
  out.push(pausa.tipo === 'pausa'
    ? {
        key: 'pausa', ok: false, titulo: 'Tus pedidos están pausados',
        detalle: pausa.hasta ? `Hasta las ${hora(pausa.hasta, d.zona)}` : 'Hasta que los reanudes',
        accion: { tipo: 'reanudar' },
      }
    : { key: 'pausa', ok: true, titulo: 'No hay pausa' });

  const abierto = isOpenNow(d.hours, d.zona, new Date(ahora), d.exceptions);
  const hoy = todayWindowLabel(d.hours, d.zona, new Date(ahora));
  out.push(!d.hours
    ? { key: 'horario', ok: true, titulo: 'Abierto a toda hora' }
    : abierto
      ? { key: 'horario', ok: true, titulo: 'Tu horario dice abierto', detalle: hoy ? `Hoy ${hoy}` : undefined }
      : {
          key: 'horario', ok: false, titulo: 'Tu horario dice cerrado ahora',
          detalle: hoy ? `Hoy abres ${hoy}` : 'Hoy no abres',
          accion: { tipo: 'ir', ruta: '/admin/ajustes/restaurante', label: 'Ver horario', seccion: 'ajustes' },
        });

  const enLinea = d.orderTypes.filter((t) => t === 'pickup' || t === 'delivery');
  out.push(!d.pedidosEncendidos
    ? {
        key: 'pedidos', ok: false, titulo: 'Los pedidos desde tu carta están apagados',
        accion: { tipo: 'ir', ruta: '/admin/modulos', label: 'Ver Funciones', seccion: 'modulos' },
      }
    : {
        key: 'pedidos', ok: true,
        titulo: enLinea.length
          ? `${enLinea.map((t) => (t === 'pickup' ? 'Para llevar' : 'A domicilio')).join(' y ')} ${enLinea.length > 1 ? 'encendidos' : 'encendido'}`
          : 'Solo recibes pedidos en la mesa (QR)',
      });

  if (d.pc && d.pc.activa !== false) {
    const caida = !d.pc.ultimaSenal || ahora - new Date(d.pc.ultimaSenal).getTime() >= PC_CAIDA_MS;
    out.push(caida
      ? {
          key: 'pc', ok: false, titulo: 'La PC del local no responde',
          detalle: 'Los pedidos llegan al panel, pero no se imprimen.',
          accion: { tipo: 'ir', ruta: '/admin/mi-pc', label: 'Revisar la PC', seccion: 'impresion' },
        }
      : { key: 'pc', ok: true, titulo: 'La PC del local responde' });
  }

  // Lo que falla, primero.
  return out.sort((a, b) => Number(a.ok) - Number(b.ok));
}
