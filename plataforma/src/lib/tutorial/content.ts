/* ============================================================
   Tutorial content — all sections and steps for /admin/ayuda
   Plan levels: 'all' | 'popular' | 'premium'
   Sections with moduleKey are shown only when that module is active.
   ============================================================ */

export type PlanLevel = 'all' | 'popular' | 'premium';

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  /** Navigation path shown as a breadcrumb hint */
  route?: string;
  /** Optional pro tip */
  tip?: string;
  /**
   * @deprecated Las capturas de pantalla se retiraron del centro de ayuda
   * (mantenerlas al día con cada cambio de UI era insostenible). El "mira
   * dónde está" lo cubren los tours guiados (lib/tutorial/tours.ts), que
   * señalan la interfaz real. El campo se conserva solo para no reescribir
   * el contenido; ya no se renderiza.
   */
  screenshotDesc?: string;
}

export interface TutorialSectionDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  planLevel: PlanLevel;
  /** If set, section is only shown when this module is active */
  moduleKey?: string;
  steps: TutorialStep[];
}

/* ── Helpers ─────────────────────────────────────────────── */

export function getPlanLevelNum(plan: string | null): number {
  if (!plan) return 1;
  if (['PREMIUM', 'PRO'].includes(plan)) return 3;
  if (['ESTANDAR', 'POPULAR'].includes(plan)) return 2;
  return 1; // BASICO
}

export function isSectionLocked(
  section: TutorialSectionDef,
  planNum: number,
  modules: Record<string, boolean>,
): boolean {
  if (section.moduleKey) return modules[section.moduleKey] !== true;
  if (section.planLevel === 'popular') return planNum < 2;
  if (section.planLevel === 'premium') return planNum < 3;
  return false;
}

export function getPlanLabel(level: PlanLevel, moduleKey?: string): string | null {
  if (moduleKey) return 'Módulo';
  // «Popular» era el nombre viejo del plan Estándar.
  if (level === 'popular') return 'Plan Estándar';
  if (level === 'premium') return 'Plan Premium';
  return null;
}

export function searchSections(
  sections: TutorialSectionDef[],
  query: string,
): TutorialSectionDef[] {
  const q = query.toLowerCase().trim();
  if (!q) return sections;
  return sections
    .map((sec) => {
      const matchesSec =
        sec.title.toLowerCase().includes(q) ||
        sec.description.toLowerCase().includes(q);
      const matchingSteps = sec.steps.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          (s.route?.toLowerCase().includes(q) ?? false),
      );
      if (matchesSec) return sec;
      if (matchingSteps.length > 0) return { ...sec, steps: matchingSteps };
      return null;
    })
    .filter(Boolean) as TutorialSectionDef[];
}

/* ── Content ─────────────────────────────────────────────── */

/* REESCRITO 2026-10-02 (auditoría, N-01). La versión anterior describía el
   panel de antes del rediseño del 2026-08-21: una barra lateral con tres
   grupos («Operación», «Negocio», «Cuenta») que ya no existe, rutas como
   «Perfil → Sección Horarios», arrastrar con «≡» (no hay arrastre), y
   funciones retiradas (canjear puntos al pagar). Cada ruta de aquí se
   comprobó contra lib/admin-nav.ts y las pantallas. Si cambias el menú del
   panel, revisa también este archivo y lib/tutorial/tours.ts. */

export const TUTORIAL_SECTIONS: TutorialSectionDef[] = [
  /* ────────────── BÁSICO — todas las cuentas ────────────── */
  {
    id: 'primeros-pasos',
    title: 'Primeros pasos en tu panel',
    description: 'Cómo está organizado el panel y dónde está cada cosa.',
    icon: 'sparkle',
    planLevel: 'all',
    steps: [
      {
        id: 'login',
        title: 'Entra a tu panel',
        description:
          'Entra a distleogin.com, toca «Entrar» y escribe tu correo y contraseña (o entra con Google). Si olvidaste tu contraseña, toca «Olvidé mi contraseña» en esa misma pantalla y te llega un enlace a tu correo.',
        route: 'distleogin.com → Entrar',
      },
      {
        id: 'nav-grupos',
        title: 'Los seis destinos del menú',
        description:
          'El panel tiene seis destinos: Hoy (cómo va el día), Pedidos (en vivo, cocina, mesas y tomar pedidos), Menú (platillos, categorías, inventario…), Clientes (clientes, lealtad, cupones…), Negocio (resumen, analítica, finanzas y caja) y Ajustes (todo lo que se configura una vez). Dentro de cada destino, las pantallas aparecen como pestañas arriba.',
        route: 'Escritorio: barra de la izquierda · Teléfono: barra de abajo',
        tip: 'Si no encuentras algo, usa el buscador (en la barra de la izquierda o en el menú «⋯» del teléfono; Ctrl K en la computadora) y escribe lo que quieres hacer: «horarios», «QR», «cobrar».',
      },
      {
        id: 'hoy',
        title: 'La pantalla Hoy',
        description:
          'Es lo primero que ves al entrar: lo que necesita tu atención (la PC del local sin responder, platillos que se acaban…), las cifras del día, los pedidos en curso y cómo van tus mesas.',
        route: 'Hoy',
      },
      {
        id: 'plan-badge',
        title: 'Tu plan activo',
        description:
          'Abajo en la barra de la izquierda ves el nombre de tu plan. Al tocarlo llegas a «Mi suscripción», donde ves tu mensualidad, tus cobros y cómo cambiar de plan.',
        route: 'Ajustes → Mi suscripción',
      },
    ],
  },

  {
    id: 'perfil',
    title: 'Perfil, horarios y entrega',
    description: 'Los datos de tu restaurante que ven tus clientes, cuándo abres y hasta dónde repartes.',
    icon: 'user',
    planLevel: 'all',
    steps: [
      {
        id: 'info-basica',
        title: 'Datos del negocio',
        description:
          'Nombre del restaurante, lema, dirección, WhatsApp y correo de contacto. Aparecen en tu menú digital y en tus tickets.',
        route: 'Ajustes → Perfil del negocio',
      },
      {
        id: 'whatsapp',
        title: 'Tu número de WhatsApp',
        description:
          'Con tu número en el perfil, tus clientes pueden escribirte desde el menú con un toque. Puedes escribirlo como quieras: 8 dígitos o con el +502 delante.',
        route: 'Ajustes → Perfil del negocio → WhatsApp',
      },
      {
        id: 'horarios',
        title: 'Horarios de atención',
        description:
          'Toca cada día que abres y escribe la hora de apertura y cierre; puedes poner varios turnos por día y fechas especiales (feriados). Tu menú muestra «Abierto» o «Cerrado» solo y los pedidos en línea respetan el horario. Si no enciendes ningún día, tu menú sale abierto a toda hora.',
        route: 'Ajustes → Horarios',
      },
      {
        id: 'pausa',
        title: 'Pausa los pedidos',
        description:
          '¿Cocina saturada o se fue el gas? Apaga «Recibiendo pedidos» y nadie puede pedir en línea hasta que lo vuelvas a encender, sin tocar tus horarios. Puedes dejar un mensaje para tus clientes.',
        route: 'Ajustes → Horarios → Recibiendo pedidos',
        tip: 'La pausa no se quita sola: acuérdate de volver a encenderla.',
      },
      {
        id: 'zona-entrega',
        title: 'Zona de entrega y costo del envío',
        description:
          'En «Zona de entrega» marcas tu local en el mapa y el radio hasta donde repartes (si el cliente pone su pin fuera, no puede pedir a domicilio) y, si quieres cobrar distinto por zona (Zona 1, Centro…), cada zona con su tarifa. El costo normal del envío se pone en «Pedidos y cobro».',
        route: 'Ajustes → Zona de entrega · Ajustes → Pedidos y cobro → Envío a domicilio',
      },
    ],
  },

  {
    id: 'catalogo',
    title: 'Tus platillos',
    description: 'Agrega, edita y organiza los platillos de tu menú.',
    icon: 'bag',
    planLevel: 'all',
    steps: [
      {
        id: 'vista-catalogo',
        title: 'La lista de platillos',
        description:
          'Aquí están todos tus platillos con su precio y si se pueden pedir. Arriba puedes filtrar por categoría y descargar la lista en Excel o PDF.',
        route: 'Menú → Platillos',
      },
      {
        id: 'nuevo-producto',
        title: 'Agrega un platillo',
        description:
          'Toca «+ Nuevo platillo». En «Lo básico» pones nombre, precio (solo el número), categoría y una descripción corta que diga qué lleva. Al guardar, aparece en tu menú al instante.',
        route: 'Menú → Platillos → + Nuevo platillo',
        tip: '«Filete a la plancha con papas y ensalada» vende más que «Filete con guarnición».',
      },
      {
        id: 'foto-producto',
        title: 'Sube la foto',
        description:
          'En «Foto del platillo» toca el recuadro y elige una foto. Una foto con buena luz y fondo limpio es lo que más hace que pidan. Si no hay foto, el menú usa un dibujo de fondo (lo eliges en «Ícono del patrón»).',
        route: 'Ficha del platillo → Foto del platillo',
      },
      {
        id: 'opciones',
        title: 'Tamaños, extras y combos',
        description:
          'En «Opciones y combos» agregas grupos: «Elegir 1» (ej. tamaño chico/mediano/grande), «Varios» (extras con precio, como queso o tocino) o «Combo» (lo que viene incluido, con sus variantes, como el sabor de la bebida).',
        route: 'Ficha del platillo → Opciones y combos',
      },
      {
        id: 'disponibilidad',
        title: 'Agotado por hoy',
        description:
          'El interruptor de cada platillo en la lista lo marca agotado: tus clientes lo ven pero no lo pueden pedir, y vuelve solo a las 12 horas. Si quieres sacarlo del menú del todo, entra a la ficha y apaga «Mostrar en el menú».',
        route: 'Menú → Platillos → interruptor «Disponible»',
        tip: 'Si llevas control de inventario, el platillo se marca agotado solo al llegar a cero y vuelve cuando repones existencias.',
      },
      {
        id: 'alergenos',
        title: 'Alérgenos y dietas',
        description:
          'Marca si el platillo es vegetariano, vegano, sin gluten… y si contiene gluten, lácteos, mariscos o frutos secos. Se muestran con un ícono en tu menú y ayudan a quien tiene alergias a decidir.',
        route: 'Ficha del platillo → Alérgenos y dietas',
      },
    ],
  },

  {
    id: 'categorias',
    title: 'Categorías del menú',
    description: 'Organiza tu menú en grupos para que tus clientes encuentren rápido lo que buscan.',
    icon: 'tag',
    planLevel: 'all',
    steps: [
      {
        id: 'que-son',
        title: '¿Para qué sirven?',
        description:
          'Agrupan tus platillos (Entradas, Platos fuertes, Bebidas, Postres). Tu cliente las ve como botones arriba del menú para saltar a lo que busca.',
        route: 'Menú → Categorías',
      },
      {
        id: 'crear-categoria',
        title: 'Crea una categoría',
        description:
          'Toca «+ Nueva», escribe el nombre (el ícono se sugiere solo) y guarda. Si es un menú por horario, como Desayunos, ahí mismo le pones su franja y solo aparece a esa hora.',
        route: 'Menú → Categorías → + Nueva',
      },
      {
        id: 'ordenar-categorias',
        title: 'Ordénalas',
        description:
          'Usa las flechas ↑ ↓ de cada categoría para moverla. El orden de esta lista es el mismo que ve tu cliente: pon primero lo que más vendes.',
        route: 'Menú → Categorías → flechas ↑ ↓',
      },
      {
        id: 'asignar-categoria',
        title: 'Cambia un platillo de categoría',
        description:
          'Entra a la ficha del platillo y elige otra en «Categoría». Cada platillo pertenece a una sola categoría.',
        route: 'Menú → Platillos → Editar → Categoría',
      },
    ],
  },

  {
    id: 'personalizar',
    title: 'Personaliza tu menú',
    description: 'Dale a tu menú digital tu logo, tus colores y tu estilo.',
    icon: 'sparkle',
    planLevel: 'all',
    steps: [
      {
        id: 'abrir-personalizacion',
        title: 'Abre el editor',
        description:
          'Aquí cambias cómo se ve tu menú digital (el panel no cambia). Está organizado en pestañas: Diseño, Marca, Menú, Textos y Avanzado.',
        route: 'Ajustes → Personalizar el sitio',
      },
      {
        id: 'plantilla',
        title: 'Parte de una plantilla',
        description:
          'En «Diseño» eliges cómo se recorre tu carta (Clásico, Revista, Compacto…) y un estilo de colores. Tu logo, nombre, platillos y precios se conservan: la plantilla solo cambia la apariencia. Puedes guardar tus propios diseños para volver a ellos.',
        route: 'Personalizar el sitio → Diseño',
      },
      {
        id: 'logo',
        title: 'Logo y colores de marca',
        description:
          'En «Marca» subes tu logo (PNG con fondo transparente se ve mejor), escribes tu lema y eliges tus colores. Si tienes el código de tu color (#RRGGBB), puedes escribirlo directo.',
        route: 'Personalizar el sitio → Marca',
      },
      {
        id: 'textos',
        title: 'Los textos de tu menú',
        description:
          'En «Textos» cambias lo que dicen los botones y avisos del menú: «Ver el menú», «Ir a pagar», el mensaje cuando estás cerrado…',
        route: 'Personalizar el sitio → Textos',
      },
      {
        id: 'guardar',
        title: 'Guarda y publica',
        description:
          'Nada cambia para tus clientes hasta que tocas «Guardar cambios». Puedes abrir la vista previa para verlo antes, y después de guardar escanea tu QR para verlo como lo verán ellos.',
        route: 'Personalizar el sitio → Guardar cambios',
      },
    ],
  },

  {
    id: 'qr',
    title: 'Tu código QR',
    description: 'El QR y el enlace que llevan a tus clientes a tu menú.',
    icon: 'image',
    planLevel: 'all',
    steps: [
      {
        id: 'ver-qr',
        title: 'Tu QR y tu enlace',
        description:
          'Aquí está el QR de tu menú y el enlace directo. Copia el enlace y compártelo por WhatsApp, Instagram o donde quieras: funciona igual que el QR.',
        route: 'Ajustes → Código QR',
      },
      {
        id: 'descargar',
        title: 'Descárgalo para imprimir',
        description:
          'Toca «Descargar QR (.png)» para bajarlo en alta resolución. Imprímelo de al menos 8×8 cm para que se escanee fácil.',
        route: 'Ajustes → Código QR → Descargar QR (.png)',
        tip: 'Un texto junto al QR («Escanea para ver el menú y pedir») hace que la gente sepa qué hacer sin que se lo expliques.',
      },
      {
        id: 'qr-mesas',
        title: 'Un QR por mesa',
        description:
          'Si tus clientes piden desde la mesa, cada mesa tiene su propio QR: al escanearlo, el pedido llega con el número de mesa. Están en Salón, uno por mesa.',
        route: 'Ajustes → Salón → Códigos QR por mesa',
      },
      {
        id: 'probar',
        title: 'Pruébalo antes de compartir',
        description:
          'Escanea el QR con tu propio celular y haz un pedido de prueba: verás exactamente lo que ve tu cliente.',
      },
    ],
  },

  {
    id: 'metricas',
    title: 'Cómo va tu negocio',
    description: 'Las cifras del día, las visitas a tu menú y lo que más se vende.',
    icon: 'chart',
    planLevel: 'all',
    steps: [
      {
        id: 'visitas',
        title: 'Resumen',
        description:
          'Ventas, pedidos y ticket promedio de hoy, las ventas de los últimos 14 días, lo más vendido y cuántas personas abrieron tu menú (cada aparato cuenta una vez por visita).',
        route: 'Negocio → Resumen',
      },
      {
        id: 'hoy-resumen',
        title: 'Lo urgente, en Hoy',
        description:
          'Para el día a día no hace falta entrar a Negocio: Hoy te muestra las cifras del día y lo que necesita tu atención.',
        route: 'Hoy',
      },
    ],
  },

  /* ────────────── ESTÁNDAR ────────────────────────────── */

  {
    id: 'pedidos',
    title: 'Pedidos en línea',
    description: 'Todo para recibir pedidos desde tu menú: modos, cobro, propina y avisos.',
    icon: 'list',
    planLevel: 'popular',
    steps: [
      {
        id: 'activar',
        title: 'Elige cómo te pueden pedir',
        description:
          'En «Funciones», arriba, enciendes los modos que ofreces: comer en el local, para llevar y a domicilio. En el plan Estándar eliges dos de los tres.',
        route: 'Ajustes → Funciones → Modos de pedido',
      },
      {
        id: 'cobro',
        title: 'Cobro, propina y envío',
        description:
          'En «Pedidos y cobro» decides si aceptas tarjeta, la moneda, si cobras propina (y en qué tipo de pedido) y cuánto cuesta el envío a domicilio.',
        route: 'Ajustes → Pedidos y cobro',
      },
      {
        id: 'pausa',
        title: 'Pausa cuando lo necesites',
        description:
          'Apaga «Recibiendo pedidos» en Horarios y nadie puede pedir en línea hasta que lo vuelvas a encender.',
        route: 'Ajustes → Horarios → Recibiendo pedidos',
      },
      {
        id: 'notificaciones',
        title: 'Que no se te escape ninguno',
        description:
          'Cada pedido nuevo suena y aparece un aviso en cualquier pantalla del panel. Toca la campana de arriba para activar las notificaciones del navegador (te avisan aunque tengas otra ventana abierta) y el altavoz para el sonido.',
        route: 'Barra de arriba → campana y altavoz',
      },
    ],
  },

  {
    id: 'panel-pedidos',
    title: 'Pedidos en vivo',
    description: 'Atiende cada pedido desde que entra hasta que se entrega.',
    icon: 'list',
    planLevel: 'popular',
    steps: [
      {
        id: 'vista-live',
        title: 'La pantalla de pedidos',
        description:
          'Los pedidos aparecen al instante, agrupados por lo que falta: por enviar a cocina, en cocina, listos para entregar y servidos. Arriba puedes filtrar por en local, para llevar o a domicilio.',
        route: 'Pedidos → En vivo',
      },
      {
        id: 'estados',
        title: 'Avanza cada pedido',
        description:
          'El botón grande de cada tarjeta lo lleva al siguiente paso: «Enviar a cocina», «Marcar listo» y «Entregado al cliente» (o «Servido en mesa»). Tu cliente ve el avance en vivo desde su enlace de seguimiento.',
        route: 'Pedidos → En vivo → botón de cada tarjeta',
      },
      {
        id: 'imprimir',
        title: 'Recibo y comanda',
        description:
          'Cada tarjeta tiene «Recibo» y «Copia de comanda» para imprimir. Si tienes la PC del local configurada, la comanda sale sola en la impresora de cocina.',
        route: 'Pedidos → En vivo → Recibo / Copia de comanda',
      },
      {
        id: 'anular',
        title: 'Anula un pedido o un platillo',
        description:
          '«Anular» pide el motivo y, según tus permisos, el PIN de un encargado. Queda anotado en la actividad de Personal.',
        route: 'Pedidos → En vivo → Anular',
      },
      {
        id: 'historial',
        title: 'Lo que ya se cerró',
        description:
          'Abajo, «Cerrados hoy» guarda los pedidos terminados del día. Para días anteriores, descarga el Excel o el PDF, o revisa Negocio → Finanzas.',
        route: 'Pedidos → En vivo → Cerrados hoy',
      },
    ],
  },

  {
    id: 'cocina',
    title: 'Pantalla de cocina',
    description: 'Lo que hay que preparar, en una tablet en la cocina.',
    icon: 'flame',
    planLevel: 'popular',
    steps: [
      {
        id: 'que-es-kds',
        title: '¿Qué es la pantalla de cocina?',
        description:
          'Muestra solo lo que hay que preparar, en tarjetas grandes con el tiempo que lleva cada pedido. Pensada para una tablet o pantalla en la cocina.',
        route: 'Pedidos → Cocina',
      },
      {
        id: 'gestionar-pedidos-cocina',
        title: 'Comenzar y marcar listo',
        description:
          'Toca «Comenzar» cuando empiecen a prepararlo y «Marcar listo» al terminar: el pedido pasa a «Listos para entregar» en la pantalla de pedidos.',
        route: 'Pedidos → Cocina → Comenzar → Marcar listo',
      },
      {
        id: 'semaforo',
        title: 'El semáforo de tiempos',
        description:
          'Cada tarjeta cambia de color según el tiempo: verde a tiempo, ámbar apúrate, rojo tarde. Los minutos de cada color los decides tú.',
        route: 'Ajustes → Pedidos y cobro → Semáforo de la cocina',
      },
      {
        id: 'tablet-cocina',
        title: 'Una tablet solo para cocina',
        description:
          'Da de alta a alguien de cocina en Personal con el rol Cocina: entra con su PIN y solo ve la pantalla de cocina.',
        route: 'Ajustes → Personal y permisos → + Nuevo → Cocina',
      },
    ],
  },

  {
    id: 'finanzas',
    title: 'Finanzas y caja',
    description: 'Cuánto vendiste, cuánto ganas y el cierre de caja de cada noche.',
    icon: 'wallet',
    planLevel: 'popular',
    steps: [
      {
        id: 'resumen',
        title: 'Resumen de ventas',
        description:
          'Elige el rango (7, 30 o 90 días, o tus fechas) y ves ingreso, utilidad, costo de lo vendido, ticket promedio, envíos y propinas, con el ingreso de cada día.',
        route: 'Negocio → Finanzas',
        tip: 'La utilidad solo cuenta los platillos que tienen costo cargado. Pon el costo en la ficha de cada platillo para verla completa.',
      },
      {
        id: 'por-producto',
        title: 'Qué se vende y qué deja',
        description:
          'Más abajo: ventas por canal, por forma de pago, los platillos que más ingreso dan y los que más ganancia dejan.',
        route: 'Negocio → Finanzas',
      },
      {
        id: 'exportar',
        title: 'Descarga el reporte',
        description:
          'Los botones Excel y PDF descargan el reporte del rango elegido, con tu logo.',
        route: 'Negocio → Finanzas → Excel / PDF',
      },
      {
        id: 'corte-caja',
        title: 'Cierre de caja',
        description:
          'Al terminar el día: cuenta el efectivo (billetes y monedas), anota lo que salió de la caja (gastos) y reparte las propinas. Te dice si cuadra con lo vendido en efectivo. Puedes guardarlo y seguir después.',
        route: 'Negocio → Caja',
      },
    ],
  },

  {
    id: 'clientes',
    title: 'Tus clientes',
    description: 'Quién te compra y cuánto.',
    icon: 'users',
    planLevel: 'popular',
    steps: [
      {
        id: 'lista-clientes',
        title: 'Lista de clientes',
        description:
          'Cada persona que te pide en línea queda registrada con su teléfono, cuántas veces ha pedido y cuánto ha gastado. Puedes descargar la lista en Excel o PDF.',
        route: 'Clientes → Clientes',
      },
      {
        id: 'historial-cliente',
        title: 'Historial de un cliente',
        description:
          'Toca un cliente para ver sus pedidos.',
        route: 'Clientes → Clientes → toca un cliente',
      },
    ],
  },

  {
    id: 'kiosko',
    title: 'Kiosko de autoservicio',
    description: 'Una tablet en el mostrador para que tus clientes pidan solos.',
    icon: 'grid',
    planLevel: 'popular',
    moduleKey: 'orders',
    steps: [
      {
        id: 'que-es-kiosko',
        title: '¿Qué es el modo kiosko?',
        description:
          'Convierte una tablet fija en el mostrador en un punto de autoservicio: el cliente arma su pedido solo, lo confirma para recoger y ve su número en grande. El pedido entra a tu panel y a cocina como cualquier otro, y la pantalla vuelve sola al menú para el siguiente.',
        route: 'Cualquier tablet o pantalla táctil con navegador',
      },
      {
        id: 'activar-kiosko',
        title: 'Actívalo en la tablet',
        description:
          'Abre en la tablet la dirección de tu menú con /kiosko al final. Desde ese momento la tablet queda en modo kiosko.',
        route: 'tu-restaurante.distleogin.com/kiosko',
      },
      {
        id: 'privacidad-kiosko',
        title: 'Privacidad en un aparato compartido',
        description:
          'En modo kiosko el menú oculta la cuenta, los puntos y los pedidos anteriores, y no recuerda los datos del cliente anterior: cada quien empieza de cero.',
      },
      {
        id: 'salir-kiosko',
        title: 'Salir del modo kiosko',
        description:
          'Abre la misma dirección con ?salir=1 al final y la tablet vuelve a ser un navegador normal.',
        route: 'tu-restaurante.distleogin.com/kiosko?salir=1',
      },
    ],
  },

  /* ────────────── PREMIUM ─────────────────────────────── */

  {
    id: 'mesas',
    title: 'Mesas y salón',
    description: 'Cómo está tu salón ahora mismo y cómo se configura.',
    icon: 'grid',
    planLevel: 'premium',
    steps: [
      {
        id: 'ver-mesas',
        title: 'Tus mesas en vivo',
        description:
          'Cada mesa ocupada muestra en qué va (en cocina, lista, servida, por cobrar) y cuánto lleva. Puedes verlas como fichas, en el plano de tu local o en lista, y ordenarlas por tiempo, cuenta o personas.',
        route: 'Pedidos → Mesas',
      },
      {
        id: 'configurar-salon',
        title: 'Configura tu salón',
        description:
          'Cuántas mesas tienes, el plano por niveles (arrastra cada mesa a su lugar), cuántas sillas tiene cada una y sus códigos QR para imprimir.',
        route: 'Ajustes → Salón',
      },
      {
        id: 'avisos-mesa',
        title: 'Cuándo una mesa te necesita',
        description:
          'Decide cuántos minutos puede pasar una mesa con comida lista sin llevar, servida sin cobrar o sin que cocina acepte su pedido antes de marcarse como pendiente.',
        route: 'Ajustes → Pedidos y cobro → Cuándo una mesa te necesita',
      },
    ],
  },

  {
    id: 'meseros',
    title: 'Tomar pedidos (meseros)',
    description: 'Tus meseros toman la orden en la mesa desde un teléfono o una tablet.',
    icon: 'userPlus',
    planLevel: 'premium',
    steps: [
      {
        id: 'alta-mesero',
        title: 'Da de alta a un mesero',
        description:
          'En Personal toca «+ Nuevo», elige el rol Mesero y ponle un PIN. Entra en el teléfono o tablet del local con «Soy personal del restaurante» y su PIN, sin correo ni contraseña.',
        route: 'Ajustes → Personal y permisos → + Nuevo → Mesero',
      },
      {
        id: 'tomar-pedido',
        title: 'Toma un pedido',
        description:
          'Elige la mesa (o «Pedido para llevar»), agrega los platillos tocándolos o buscándolos por nombre, y toca «Enviar a cocina». Puedes seguir con otra mesa mientras se envía.',
        route: 'Pedidos → Tomar pedidos',
        tip: 'En la computadora, Ctrl K abre el buscador: escribe el número de mesa o el nombre del plato.',
      },
      {
        id: 'cobrar-mesa',
        title: 'Cobra la mesa',
        description:
          'Cuando la mesa pide la cuenta, toca «Cobrar»: puedes dividirla entre varias personas, cobrar en partes y aplicar un descuento con su motivo.',
        route: 'Pedidos → Tomar pedidos → mesa → Cobrar',
      },
    ],
  },

  {
    id: 'inventario',
    title: 'Inventario',
    description: 'Lleva la cuenta de lo que te queda de cada platillo.',
    icon: 'box',
    planLevel: 'premium',
    steps: [
      {
        id: 'activar-inv',
        title: 'Activa el control',
        description:
          'En Inventario toca «Activar control» en los platillos que quieras contar y pon cuántos tienes. Cada venta descuenta sola.',
        route: 'Menú → Inventario → Activar control',
      },
      {
        id: 'reponer',
        title: 'Ajusta las existencias',
        description:
          'Usa − y + para corregir, o el reloj para ver el historial de movimientos (kardex). Al llegar a cero, el platillo se marca agotado solo y vuelve cuando repones.',
        route: 'Menú → Inventario → − / +',
      },
      {
        id: 'alerta-bajo',
        title: 'Aviso de existencias bajas',
        description:
          'Con el engrane de cada platillo pones a partir de cuántas unidades te avise. Los que se están acabando salen en Hoy.',
        route: 'Menú → Inventario → engrane → Aviso de existencias bajas',
      },
    ],
  },

  {
    id: 'analitica',
    title: 'Analítica',
    description: 'Horas pico, lo que se mueve y lo que no, y tus tiempos.',
    icon: 'chart',
    planLevel: 'premium',
    steps: [
      {
        id: 'horas-pico',
        title: 'Horas pico',
        description:
          'Un mapa de calor con los pedidos por día y hora: sabrás cuándo necesitas más gente.',
        route: 'Negocio → Analítica → Horas pico',
      },
      {
        id: 'mas-vendidos',
        title: 'Lo que se vende y lo que no',
        description:
          'Los platillos más vendidos y los que no se mueven en el rango elegido: buena pista para ajustar tu carta.',
        route: 'Negocio → Analítica',
      },
      {
        id: 'tiempos',
        title: 'Tiempos y cancelaciones',
        description:
          'Cuánto tarda un pedido en prepararse y en entregarse, y qué parte de tus pedidos se cancela.',
        route: 'Negocio → Analítica → Resumen del rango',
      },
    ],
  },

  {
    id: 'personal',
    title: 'Personal y permisos',
    description: 'Quién entra a tu panel y qué puede ver cada quien.',
    icon: 'users',
    planLevel: 'premium',
    steps: [
      {
        id: 'nuevo-staff',
        title: 'Da acceso a alguien de tu equipo',
        description:
          'Toca «+ Nuevo» y elige su rol (Mesero, Cajero, Cocina…): cada rol trae sus permisos y puedes ajustarlos. Decide cómo entra: con un PIN en los aparatos del local, o con un usuario y contraseña.',
        route: 'Ajustes → Personal y permisos → + Nuevo',
      },
      {
        id: 'cambiar-contrasena',
        title: 'Cambia un PIN o una contraseña',
        description:
          'Toca «Editar» en la persona: ahí cambias su PIN, su contraseña, sus permisos o la quitas del equipo.',
        route: 'Ajustes → Personal y permisos → Editar',
      },
      {
        id: 'actividad',
        title: 'Lo que hizo cada quien',
        description:
          '«Actividad reciente» anota anulaciones, descuentos, mesas sentadas y cambios del personal. «Últimos accesos» muestra quién entró al panel y desde qué aparato.',
        route: 'Ajustes → Personal y permisos',
      },
      {
        id: 'dispositivos',
        title: 'El PIN solo en el local',
        description:
          'Si enciendes «El PIN solo funciona en estos aparatos», tu equipo solo puede entrar con PIN desde los aparatos que autorices.',
        route: 'Ajustes → Personal y permisos → Dispositivos del local',
      },
    ],
  },

  {
    id: 'grupo',
    title: 'Varios restaurantes',
    description: 'Si tienes dos o más restaurantes, míralos juntos.',
    icon: 'grid',
    planLevel: 'all',
    steps: [
      {
        id: 'que-es-grupo',
        title: 'Mi cuenta',
        description:
          'En Mi cuenta ves todos tus restaurantes y entras a cada uno con un toque. Con dos o más, aparecen el Resumen y las Finanzas del grupo.',
        route: 'distleogin.com → Entrar → Mi cuenta',
      },
      {
        id: 'resumen-consolidado',
        title: 'Resumen y finanzas del grupo',
        description:
          'Las ventas de hoy y de los últimos 14 días de todos tus restaurantes, y las finanzas del grupo con ingreso, costo y margen de cada uno.',
        route: 'Mi cuenta → Resumen · Mi cuenta → Finanzas',
      },
      {
        id: 'comparativa',
        title: 'Compara tus restaurantes',
        description:
          'Cuánto vende cada uno y qué parte del total representa, en el rango que elijas.',
        route: 'Mi cuenta → Comparativa',
      },
      {
        id: 'nuevo-restaurante',
        title: 'Abre otro restaurante',
        description:
          'Desde Mi cuenta → «Crear otro restaurante». Entras con la misma cuenta y su plan se suma a tu mensualidad.',
        route: 'Mi cuenta → Crear otro restaurante',
      },
    ],
  },

  /* ────────────── FUNCIONES (se encienden en Ajustes → Funciones) ── */

  {
    id: 'loyalty',
    title: 'Programa de lealtad',
    description: 'Puntos por cada compra y premios para que tus clientes vuelvan.',
    icon: 'star',
    planLevel: 'all',
    moduleKey: 'loyalty',
    steps: [
      {
        id: 'como-funciona',
        title: '¿Cómo funciona?',
        description:
          'Tus clientes acumulan puntos por cada compra y los cambian por premios de tu menú. Para acumular, entran con su cuenta de Google desde el menú.',
        route: 'Clientes → Lealtad',
      },
      {
        id: 'configurar',
        title: 'Configura el programa',
        description:
          'En «Configuración» decides cuántos puntos da cada compra (por ejemplo, 1 punto por cada Q10), el mínimo para canjear y los puntos de bienvenida.',
        route: 'Clientes → Lealtad → Configuración',
      },
      {
        id: 'recompensas',
        title: 'Crea los premios',
        description:
          'En «Recompensas» eliges qué platillos se pueden canjear y cuántos puntos cuestan. Tus clientes los ven en la pestaña de puntos del menú y, al canjear, el premio entra a su pedido sin costo.',
        route: 'Clientes → Lealtad → Recompensas',
      },
      {
        id: 'ver-saldos',
        title: 'Tus miembros',
        description:
          'En «Miembros» ves quién está en el programa y cuántos puntos tiene.',
        route: 'Clientes → Lealtad → Miembros',
      },
    ],
  },

  {
    id: 'cupones',
    title: 'Cupones de descuento',
    description: 'Códigos de descuento para atraer pedidos.',
    icon: 'ticket',
    planLevel: 'all',
    moduleKey: 'cupones',
    steps: [
      {
        id: 'nuevo-cupon',
        title: 'Crea un cupón',
        description:
          'Escribe el código (ej. VERANO20), elige si descuenta un porcentaje o un monto fijo y cuánto. Tus clientes lo escriben al pagar.',
        route: 'Clientes → Cupones → + Nuevo cupón',
      },
      {
        id: 'limites-cupon',
        title: 'Ponle límites',
        description:
          'Una compra mínima, cuántas veces se puede usar y hasta qué fecha vale. Si no pones nada, no tiene límite.',
        route: 'Clientes → Cupones → + Nuevo cupón',
      },
    ],
  },

  {
    id: 'encuestas',
    title: 'Encuestas de satisfacción',
    description: 'Qué opinan tus clientes de cada pedido.',
    icon: 'thumbsUp',
    planLevel: 'all',
    moduleKey: 'encuestas',
    steps: [
      {
        id: 'como-dejan',
        title: '¿Cómo califican tus clientes?',
        description:
          'Al terminar su pedido reciben un enlace para calificar de 1 a 5 estrellas y dejar un comentario. Es anónimo y toma menos de 30 segundos.',
        route: 'Clientes → Encuestas',
      },
      {
        id: 'ver-resenas',
        title: 'Tu promedio y tus reseñas',
        description:
          'Ves tu promedio, cuántas reseñas hay de cada estrella y los comentarios más recientes.',
        route: 'Clientes → Encuestas',
      },
    ],
  },

  {
    id: 'reservaciones',
    title: 'Reservaciones',
    description: 'Lleva las reservas de mesa en un solo lugar.',
    icon: 'calendar',
    planLevel: 'all',
    moduleKey: 'reservaciones',
    steps: [
      {
        id: 'ver-reservaciones',
        title: 'Tus reservaciones',
        description:
          'Las reservas próximas, agrupadas por día, con el nombre, la hora y cuántas personas.',
        route: 'Clientes → Reservaciones',
      },
      {
        id: 'registrar-manual',
        title: 'Anota una reserva',
        description:
          'Cuando te llaman para reservar, anótala en «Nueva reservación».',
        route: 'Clientes → Reservaciones → Nueva reservación',
      },
      {
        id: 'estados-reserva',
        title: 'Confirma y sienta',
        description:
          'Confírmala cuando quede acordada y siéntala cuando lleguen: la mesa aparece ocupada en el salón.',
        route: 'Clientes → Reservaciones → botones de cada reserva',
      },
    ],
  },

  {
    id: 'lista-espera',
    title: 'Lista de espera',
    description: 'Para cuando el local está lleno.',
    icon: 'users',
    planLevel: 'all',
    moduleKey: 'lista_espera',
    steps: [
      {
        id: 'agregar-grupo',
        title: 'Anota a quien espera',
        description:
          'En «Agregar grupo» pones el nombre, cuántas personas son y su teléfono. Les avisas cuando haya mesa y los sientas desde la lista.',
        route: 'Clientes → Lista de espera',
      },
    ],
  },

  {
    id: 'recetas',
    title: 'Recetas e ingredientes',
    description: 'Calcula el costo real de cada platillo.',
    icon: 'flask',
    planLevel: 'all',
    moduleKey: 'recetas',
    steps: [
      {
        id: 'registrar-ingrediente',
        title: 'Registra tus ingredientes',
        description:
          'Toca «+ Nuevo insumo»: nombre, unidad (kg, litro, unidad) y cuánto te cuesta cada unidad.',
        route: 'Menú → Ingredientes → + Nuevo insumo',
      },
      {
        id: 'crear-receta',
        title: 'Arma la receta de un platillo',
        description:
          'En la ficha del platillo, sección «Receta», agrega cada ingrediente con su cantidad. El costo del platillo se calcula solo y cada venta descuenta los ingredientes.',
        route: 'Menú → Platillos → Editar → Receta',
      },
      {
        id: 'ver-costo',
        title: 'Revisa cuánto ganas',
        description:
          'Con el costo calculado, la ficha te dice tu utilidad y margen por venta, y Negocio → Finanzas suma la ganancia de lo vendido.',
        route: 'Ficha del platillo → Costo y ganancia',
      },
    ],
  },

  {
    id: 'proveedores',
    title: 'Proveedores y compras',
    description: 'A quién le compras y tus órdenes de compra.',
    icon: 'truck',
    planLevel: 'all',
    moduleKey: 'proveedores',
    steps: [
      {
        id: 'nuevo-proveedor',
        title: 'Agrega un proveedor',
        description:
          'En la pestaña «Proveedores», toca «+ Nuevo proveedor» y pon su nombre, contacto y teléfono.',
        route: 'Menú → Proveedores → Proveedores → + Nuevo proveedor',
      },
      {
        id: 'orden-compra',
        title: 'Haz una orden de compra',
        description:
          'En «Órdenes de compra» eliges el proveedor y lo que le pides. Al marcarla como recibida, las existencias se suman solas a tu inventario.',
        route: 'Menú → Proveedores → Órdenes de compra',
      },
    ],
  },

  {
    id: 'fel',
    title: 'Facturación electrónica (FEL)',
    description: 'Facturas de la SAT desde tu panel.',
    icon: 'receipt',
    planLevel: 'all',
    moduleKey: 'fel',
    steps: [
      {
        id: 'que-es-fel',
        title: '¿Qué es FEL?',
        description:
          'La factura electrónica en línea de la SAT. Con este módulo emites facturas de tus pedidos desde el panel. Leogin la activa para tu restaurante cuando está lista.',
        route: 'Negocio → Facturación',
      },
      {
        id: 'configurar-fiscal',
        title: 'Tus datos fiscales',
        description:
          'Completa tu NIT, nombre comercial, dirección fiscal y los datos de tu certificador. Sin esto no se puede emitir.',
        route: 'Negocio → Facturación → Configuración',
      },
      {
        id: 'emitir-desde-pedido',
        title: 'Factura un pedido',
        description:
          'Elige el pedido, escribe el NIT del cliente (o CF) y emite. La factura queda en el historial, de donde también se anula si hace falta.',
        route: 'Negocio → Facturación',
      },
    ],
  },
];
