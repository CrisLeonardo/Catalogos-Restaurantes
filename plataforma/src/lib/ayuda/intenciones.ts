/* ============================================================
   AYUDA POR LO QUE NECESITAS (ficha 2.9: R39, X18, S07)
   ------------------------------------------------------------
   Quien abre Ayuda tiene un problema ahora: no salen las comandas, no
   entran pedidos, quiere cerrar por hoy. El buscador comparaba palabras
   exactas («no me entran pedidos» no encontraba nada) y respondía con
   un capítulo del manual. Aquí cada intención trae sus sinónimos, la
   pantalla exacta y la sección que hace falta para abrirla: la primera
   respuesta es un botón, y nunca lleva a una pantalla cerrada.

   Lo usan el centro de ayuda y el buscador del panel (Ctrl K).
   ============================================================ */

export type IdIntencion =
  | 'no-entran-pedidos' | 'impresora' | 'cerrar-por-hoy' | 'cambiar-precio' | 'no-puedo-entrar'
  | 'horario' | 'qr' | 'dar-acceso' | 'agotar' | 'cerrar-caja' | 'agregar-platillos'
  | 'zona-entrega' | 'cambiar-plan' | 'diseno' | 'cocina';

export interface Intencion {
  id: IdIntencion;
  titulo: string;
  /** Una o dos frases: qué es y dónde se hace. */
  respuesta: string;
  /** Pantalla exacta (ruta interna del panel). Sin ruta: solo respuesta. */
  ruta?: string;
  /** Texto del botón. */
  accion?: string;
  /** Sección de permisos que abre esa pantalla (`can()`); sin sección, todos. */
  seccion?: string;
  /** Si no puede abrirla: a quién pedírselo. */
  sinPermiso?: string;
  /** Guía del centro de ayuda relacionada (id de TUTORIAL_SECTIONS). */
  guia?: string;
  /** Lo que la gente escribe. */
  sinonimos: string[];
  /** Responde con un diagnóstico en vivo en vez de un enlace. */
  diagnostico?: boolean;
  /** Va entre los casos de arriba al abrir Ayuda. */
  comun?: boolean;
}

export const INTENCIONES: Intencion[] = [
  {
    id: 'no-entran-pedidos', titulo: 'No me entran pedidos', comun: true, diagnostico: true,
    respuesta: 'Revisamos tu restaurante ahora mismo: la pausa, el horario, los modos de pedido y la PC del local.',
    guia: 'panel-pedidos',
    sinonimos: ['no entran pedidos', 'no llegan pedidos', 'no recibo pedidos', 'no me piden', 'no aparecen los pedidos',
      'menu cerrado', 'dice cerrado', 'el cliente no puede pedir', 'no puedo recibir pedidos', 'pedidos no llegan'],
  },
  {
    id: 'impresora', titulo: 'Configurar la impresora', comun: true,
    respuesta: 'Las comandas y los recibos salen por la PC del local: ahí eliges qué impresora imprime cada cosa y mandas una prueba.',
    ruta: '/admin/mi-pc', accion: 'Ir a La PC del local', seccion: 'impresion',
    sinPermiso: 'La impresora la configura quien maneja la PC del local: pídeselo al dueño o al encargado.',
    sinonimos: ['impresora', 'imprimir', 'ticket', 'no imprime', 'no sale la comanda', 'comanda', 'papel', 'recibo',
      'pc del local', 'computadora', 'agente', 'sin internet', 'wifi'],
  },
  {
    id: 'cerrar-por-hoy', titulo: 'Cerrar por hoy', comun: true,
    respuesta: 'Pausa los pedidos en línea sin tocar tu horario: dejas de recibir hasta que reanudes o hasta la hora que elijas.',
    ruta: '/admin/ajustes/restaurante', accion: 'Pausar pedidos', seccion: 'ajustes',
    sinPermiso: 'La pausa la pone el dueño o el encargado.',
    sinonimos: ['cerrar por hoy', 'cerrar hoy', 'pausar', 'pausa', 'no recibir pedidos', 'cerrar temprano', 'cocina saturada',
      'dejar de recibir', 'apagar pedidos'],
  },
  {
    id: 'cambiar-precio', titulo: 'Cambiar un precio', comun: true,
    respuesta: 'Abre el platillo en Menú, cambia el precio y guarda: tu carta lo enseña al instante.',
    ruta: '/admin/menu', accion: 'Ir al Menú', seccion: 'catalogo',
    sinPermiso: 'Los precios los cambia quien maneja el Menú. Tu usuario no tiene ese permiso: pídeselo al dueño o al encargado.',
    guia: 'catalogo',
    sinonimos: ['precio', 'cambiar precio', 'subir precio', 'bajar precio', 'editar platillo', 'cuanto cuesta', 'costo del platillo'],
  },
  {
    id: 'no-puedo-entrar', titulo: 'No puedo entrar', comun: true,
    respuesta: 'Si olvidaste tu contraseña, toca «Olvidé mi contraseña» en la pantalla de entrada y te llega un enlace a tu correo. Si eres del personal y entras con PIN, el dueño te lo puede cambiar en Personal.',
    ruta: '/mi-cuenta/seguridad', accion: 'Cambiar mi contraseña',
    sinonimos: ['no puedo entrar', 'olvide mi contrasena', 'contrasena', 'clave', 'pin', 'olvide el pin', 'acceso',
      'recuperar cuenta', 'no me deja entrar', 'bloqueado'],
  },
  {
    id: 'horario', titulo: 'Cambiar el horario',
    respuesta: 'Elige los días y las horas en que recibes pedidos, y agrega feriados sin tocar tu semana.',
    ruta: '/admin/ajustes/restaurante', accion: 'Ir a Horarios', seccion: 'ajustes', guia: 'perfil',
    sinPermiso: 'El horario lo cambia el dueño o el encargado.',
    sinonimos: ['horario', 'hora de abrir', 'hora de cerrar', 'abrir', 'feriado', 'dias que abro', 'navidad'],
  },
  {
    id: 'qr', titulo: 'Imprimir mis QR',
    respuesta: 'Descarga el QR de tu carta o los de cada mesa, listos para imprimir.',
    ruta: '/admin/qr', accion: 'Ir a Código QR', seccion: 'qr', guia: 'qr',
    sinPermiso: 'Los QR los descarga el dueño o el encargado.',
    sinonimos: ['qr', 'codigo qr', 'imprimir qr', 'qr de mesa', 'enlace del menu', 'link del menu'],
  },
  {
    id: 'dar-acceso', titulo: 'Dar acceso a alguien',
    respuesta: 'Agrega a tu personal con su PIN y elige qué puede ver cada quien.',
    ruta: '/admin/personal', accion: 'Ir a Personal', seccion: 'personal',
    sinPermiso: 'Al personal lo agrega el dueño o quien maneja Personal.',
    sinonimos: ['dar acceso', 'empleado', 'mesero nuevo', 'cajero', 'usuario', 'permisos', 'agregar personal', 'nuevo trabajador'],
  },
  {
    id: 'agotar', titulo: 'Marcar un platillo agotado',
    respuesta: 'En Menú apaga el platillo o márcalo agotado: tu carta deja de ofrecerlo y vuelve cuando lo enciendas.',
    ruta: '/admin/menu', accion: 'Ir al Menú', seccion: 'catalogo',
    sinPermiso: 'Lo agotado lo marca quien maneja el Menú; en Tomar pedidos también se puede si tienes ese permiso.',
    sinonimos: ['agotado', 'se acabo', 'no hay', 'ocultar platillo', 'quitar platillo', 'sin existencias'],
  },
  {
    id: 'cerrar-caja', titulo: 'Cerrar la caja',
    respuesta: 'En Caja cuentas el efectivo, ves la diferencia y cierras el turno con su corte.',
    ruta: '/admin/caja', accion: 'Ir a Caja', seccion: 'caja',
    sinPermiso: 'La caja la cierra quien tiene permiso de Caja.',
    sinonimos: ['cerrar caja', 'corte', 'cuadre', 'arqueo', 'turno', 'efectivo', 'cierre del dia'],
  },
  {
    id: 'agregar-platillos', titulo: 'Agregar platillos',
    respuesta: 'Agrega cada platillo con su foto y precio en Menú.',
    ruta: '/admin/menu', accion: 'Ir al Menú', seccion: 'catalogo', guia: 'catalogo',
    sinPermiso: 'Los platillos los agrega quien maneja el Menú.',
    sinonimos: ['agregar platillo', 'nuevo platillo', 'subir menu', 'foto', 'cargar menu', 'importar'],
  },
  {
    id: 'zona-entrega', titulo: 'Cambiar hasta dónde reparto',
    respuesta: 'Elige si repartes por zonas, por distancia o a cualquier dirección, y prueba un punto en el mapa.',
    ruta: '/admin/ajustes/entrega', accion: 'Ir a Zona de entrega', seccion: 'ajustes',
    sinPermiso: 'La entrega la configura el dueño o el encargado.',
    sinonimos: ['domicilio', 'delivery', 'zona', 'envio', 'radio', 'reparto', 'hasta donde llevo'],
  },
  {
    id: 'cambiar-plan', titulo: 'Mi plan y mis pagos',
    respuesta: 'Ve tu mensualidad, tus cobros y cómo cambiar de plan.',
    ruta: '/admin/suscripcion', accion: 'Ir a Mi suscripción', seccion: 'suscripcion',
    sinPermiso: 'El plan lo maneja el dueño.',
    sinonimos: ['plan', 'pagar', 'mensualidad', 'pago de leogin', 'cambiar plan', 'premium', 'suscripcion'],
  },
  {
    id: 'diseno', titulo: 'Cambiar cómo se ve mi carta',
    respuesta: 'Elige uno de los diseños recomendados para tu carta, tu logo y tus colores.',
    ruta: '/admin/personalizacion', accion: 'Ir a Personalizar', seccion: 'personalizar', guia: 'personalizar',
    sinPermiso: 'El diseño lo cambia el dueño o quien maneja Personalizar.',
    sinonimos: ['logo', 'colores', 'diseno', 'plantilla', 'como se ve', 'portada', 'fotos de la carta'],
  },
  {
    id: 'cocina', titulo: 'Pantalla de cocina',
    respuesta: 'Abre Cocina en una tablet: ahí llegan las comandas y la cocina las marca listas.',
    ruta: '/admin/cocina', accion: 'Ir a Cocina', seccion: 'cocina',
    sinPermiso: 'La pantalla de cocina la abre quien tiene permiso de Cocina.',
    sinonimos: ['cocina', 'kds', 'tablet de cocina', 'comandas en pantalla', 'chef'],
  },
];

/* ── Buscar ───────────────────────────────────────────────── */

const VACIAS = new Set(['me', 'mi', 'mis', 'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'por', 'para', 'que',
  'como', 'con', 'y', 'a', 'en', 'se', 'lo', 'le', 'es', 'quiero', 'necesito', 'puedo', 'hacer', 'mas', 'al']);

/** Sin acentos, sin mayúsculas ni signos: «¿Cómo cambio el PRECIO?» → «como cambio el precio». */
export function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const palabras = (t: string) => normalizar(t).split(' ').filter((p) => p && !VACIAS.has(p));

/** Raíz corta para que «imprime», «imprimir» e «impresora» se encuentren. */
const raiz = (p: string) => (p.length > 5 ? p.slice(0, 5) : p);

/**
 * Intenciones que responden a lo escrito, la mejor primero. Una frase
 * completa de sinónimo pesa más que palabras sueltas.
 */
export function buscarIntenciones(consulta: string, lista: Intencion[] = INTENCIONES): Intencion[] {
  const q = normalizar(consulta);
  if (q.length < 2) return [];
  const qRaices = new Set(palabras(q).map(raiz));
  const puntos = lista.map((it) => {
    let p = 0;
    for (const s of [it.titulo, ...it.sinonimos]) {
      const n = normalizar(s);
      if (q.includes(n)) p += 10 + n.length / 10;
      else if (n.includes(q) && q.length >= 3) p += 6;
      const comunes = palabras(n).filter((w) => qRaices.has(raiz(w))).length;
      p += comunes;
    }
    return { it, p };
  });
  return puntos.filter((x) => x.p >= 2).sort((a, b) => b.p - a.p).map((x) => x.it);
}

/** ¿Puede abrir la pantalla de esta intención? (`puede` suele ser `can()`). */
export function abrible(it: Intencion, puede: (seccion: string) => boolean): boolean {
  return !it.seccion || puede(it.seccion);
}

/* ── Soporte con contexto ─────────────────────────────────── */

/** El primer mensaje a soporte: entiende el caso sin preguntar. Nada privado. */
export function mensajeASoporte(c: { restaurante: string; plan: string | null; busqueda: string; version: string }): string {
  const plan = c.plan ? ` (plan ${c.plan})` : '';
  const lo = c.busqueda.trim() ? `Busqué «${c.busqueda.trim()}» en Ayuda y no lo resolví.` : 'Necesito ayuda con mi panel.';
  return `Hola, soy de ${c.restaurante}${plan}. ${lo} Versión ${c.version}.`;
}
