/* ============================================================
   EL ESTADO DE LA PC DEL LOCAL — una sola regla
   ------------------------------------------------------------
   Ficha 2.6 de la auditoría (X17, R34, PA-T21). La PC principal avisa
   cada 3 s (`/api/agent/poll` escribe `print_agents.last_seen_at`), pero
   cada pantalla la juzgaba con su propio reloj: Mi PC la daba por caída a
   los 90 s, Hoy y Ajustes a los 10 min y el superadmin a los 15. A los
   5 min sin señal, Ajustes decía «Conectada», Mi PC «Sin responder» y Hoy
   callaba. Ahora todas preguntan aquí y dicen las mismas palabras.

     · menos de 90 s .............. «Conectada»
     · de 90 s a 10 min ........... «Sin señal desde las 12:31» (Mi PC y Ajustes)
     · más de 10 min .............. «Desconectada desde las 12:31» (también Hoy y superadmin)
     · `is_active = false` ........ «Apagada» (la apagó el dueño: nadie se alarma)
   ============================================================ */

/** Hasta aquí es un parpadeo: el poll va cada 3 s, 90 s son 30 intentos. */
export const PC_SIN_SENAL_MS = 90_000;
/** Desde aquí ya no es la red: la PC se cayó y hay que ir a verla. */
export const PC_DESCONECTADA_MS = 10 * 60_000;

export type EstadoPc = 'sin_pc' | 'esperando' | 'apagada' | 'conectada' | 'sin_senal' | 'desconectada';

export interface LecturaPc {
  /** Hay fila en `print_agents`. */
  existe: boolean;
  /** `print_agents.is_active`; `null` cuenta como encendida. */
  activa: boolean | null;
  /** `print_agents.last_seen_at`. */
  ultimaSenal: string | null;
}

export interface DiagnosticoPc {
  estado: EstadoPc;
  /** «Conectada», «Sin señal desde las 12:31»… listo para pintar. */
  texto: string;
  tono: 'ok' | 'warn' | 'danger' | 'info' | 'neutral';
  /** ¿Merece un aviso en Hoy y en el superadmin? Solo `desconectada`. */
  alarma: boolean;
}

function hora(iso: string, zona: string): string {
  try {
    return new Intl.DateTimeFormat('es-GT', { hour: 'numeric', minute: '2-digit', timeZone: zona }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString().slice(11, 16);
  }
}

/** Si la señal es de otro día, la hora sola miente: se dice la fecha. */
function desde(iso: string, ahora: number, zona: string): string {
  const ms = ahora - new Date(iso).getTime();
  if (ms >= 20 * 3_600_000) {
    try {
      return `el ${new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long', timeZone: zona }).format(new Date(iso))}`;
    } catch { /* cae a la hora */ }
  }
  return `las ${hora(iso, zona)}`;
}

export function estadoDePc(pc: LecturaPc | null, ahora: number = Date.now(), zona = 'America/Guatemala'): DiagnosticoPc {
  if (!pc || !pc.existe) return { estado: 'sin_pc', texto: 'Sin PC principal', tono: 'neutral', alarma: false };
  if (pc.activa === false) return { estado: 'apagada', texto: 'Apagada', tono: 'info', alarma: false };
  if (!pc.ultimaSenal) return { estado: 'esperando', texto: 'Esperando la primera conexión', tono: 'warn', alarma: false };
  const ms = ahora - new Date(pc.ultimaSenal).getTime();
  if (ms < PC_SIN_SENAL_MS) return { estado: 'conectada', texto: 'Conectada', tono: 'ok', alarma: false };
  if (ms < PC_DESCONECTADA_MS) {
    return { estado: 'sin_senal', texto: `Sin señal desde ${desde(pc.ultimaSenal, ahora, zona)}`, tono: 'warn', alarma: false };
  }
  return { estado: 'desconectada', texto: `Desconectada desde ${desde(pc.ultimaSenal, ahora, zona)}`, tono: 'danger', alarma: true };
}

/* ── Las impresoras ───────────────────────────────────────────
   «PC conectada» no es «todo listo»: la impresora de cocina puede estar
   sin papel. Esto resume los trabajos de impresión de hoy por papel. */

export interface LecturaImpresora {
  /** Nombre de Windows elegido para este papel, o null si no hay. */
  destino: string | null;
  /** Trabajos fallidos que nadie ha vuelto a mandar (desde el inicio del día). */
  fallidos: number;
  /** Primer fallo pendiente, para decir «desde las 12:40». */
  primerFallo: string | null;
  /** Último papel que salió bien. */
  ultimoBien: string | null;
}

export interface DiagnosticoImpresora {
  estado: 'sin_asignar' | 'fallando' | 'lista' | 'sin_uso';
  texto: string;
  tono: DiagnosticoPc['tono'];
}

export function estadoDeImpresora(
  imp: LecturaImpresora, papel: 'comanda' | 'recibo', zona = 'America/Guatemala',
): DiagnosticoImpresora {
  if (!imp.destino) return { estado: 'sin_asignar', texto: 'Sin impresora elegida', tono: 'warn' };
  if (imp.fallidos > 0) {
    const n = imp.fallidos;
    const cuantos = `${n} ${papel === 'comanda' ? (n === 1 ? 'comanda' : 'comandas') : (n === 1 ? 'recibo' : 'recibos')}`;
    return {
      estado: 'fallando',
      texto: `${cuantos} no ${n === 1 ? 'salió' : 'salieron'}${imp.primerFallo ? ` desde las ${hora(imp.primerFallo, zona)}` : ''}`,
      tono: 'warn',
    };
  }
  if (imp.ultimoBien) {
    return { estado: 'lista', texto: `${papel === 'comanda' ? 'Última comanda' : 'Último recibo'} ${hora(imp.ultimoBien, zona)}`, tono: 'ok' };
  }
  return { estado: 'sin_uso', texto: `${imp.destino} · nada impreso hoy`, tono: 'ok' };
}

/** Cierra una frase sin doblar el punto de «p. m.». */
const frase = (t: string) => (t.endsWith('.') ? t : `${t}.`);

/** El titular de «La PC del local»: lo primero que falla, o «Todo listo». */
export function veredictoDePc(
  pc: DiagnosticoPc, cocina: DiagnosticoImpresora, caja: DiagnosticoImpresora, respaldo: boolean,
): { titulo: string; detalle: string; tono: 'ok' | 'warn' | 'danger' | 'neutral' } {
  if (pc.estado === 'sin_pc') return { titulo: 'Sin PC principal', detalle: 'Elige la computadora que imprime y te cubre sin internet.', tono: 'neutral' };
  if (pc.estado === 'apagada') return { titulo: 'La PC principal está apagada', detalle: 'No imprime ni te cubre sin internet hasta que la enciendas.', tono: 'warn' };
  if (pc.estado === 'esperando') return { titulo: 'Falta conectar la PC', detalle: 'Abre Leogin en la PC principal para terminar.', tono: 'warn' };
  if (pc.estado === 'desconectada' || pc.estado === 'sin_senal') {
    return { titulo: 'Revisa la PC principal', detalle: `${frase(pc.texto)} Mientras tanto no imprime.`, tono: pc.tono === 'danger' ? 'danger' : 'warn' };
  }
  if (cocina.estado === 'fallando') return { titulo: 'Revisa la impresora de cocina', detalle: `${frase(cocina.texto)} Lo demás funciona.`, tono: 'warn' };
  if (caja.estado === 'fallando') return { titulo: 'Revisa la impresora de caja', detalle: `${frase(caja.texto)} Lo demás funciona.`, tono: 'warn' };
  if (cocina.estado === 'sin_asignar' || caja.estado === 'sin_asignar') {
    return { titulo: 'Falta elegir una impresora', detalle: 'Elige dónde salen las comandas y los recibos.', tono: 'warn' };
  }
  return {
    titulo: 'Todo listo para el servicio',
    detalle: respaldo ? 'La PC, las dos impresoras y el respaldo responden.' : 'La PC y las dos impresoras responden.',
    tono: 'ok',
  };
}
