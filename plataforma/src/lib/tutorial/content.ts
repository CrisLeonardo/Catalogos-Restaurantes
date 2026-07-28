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
  if (level === 'popular') return 'Plan Popular';
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

export const TUTORIAL_SECTIONS: TutorialSectionDef[] = [
  /* ────────────── BÁSICO — todas las cuentas ────────────── */
  {
    id: 'primeros-pasos',
    title: 'Primeros pasos en tu panel',
    description: 'Aprende a navegar el panel admin y configura lo básico desde el primer día.',
    icon: 'sparkle',
    planLevel: 'all',
    steps: [
      {
        id: 'login',
        title: 'Ingresa al panel admin',
        description:
          'Abre tu navegador y ve a la URL que te dio Leogin (ej. turestaurante.leogin.app). Escribe tu correo y contraseña y da clic en "Iniciar sesión". Si olvidaste tu contraseña, contáctanos por WhatsApp.',
        route: 'turestaurante.leogin.app → /admin/login',
        screenshotDesc: 'Pantalla de login con campo de email y contraseña',
      },
      {
        id: 'dashboard',
        title: 'Conoce el panel de inicio',
        description:
          'Al ingresar verás el panel de inicio con accesos rápidos y el resumen de hoy. La barra lateral izquierda agrupa todas las secciones en tres grupos: Operación, Negocio y Cuenta. En móvil, el menú aparece como barra inferior.',
        route: 'Inicio del panel → Barra lateral (escritorio) o barra inferior (móvil)',
        screenshotDesc: 'Dashboard principal con sidebar visible y accesos rápidos',
      },
      {
        id: 'nav-grupos',
        title: 'Las tres secciones del menú',
        description:
          'El menú lateral tiene tres grupos: Operación (pedidos, catálogo, cocina), Negocio (métricas, finanzas, clientes) y Cuenta. La sección Cuenta empieza oculta por defecto — haz clic en "Cuenta" para expandirla. Ahí encontrarás Perfil, Personalizar, QR, Módulos, Mi suscripción, Ayuda y Soporte.',
        route: 'Barra lateral → Clic en "Cuenta" para expandirla → Aparecen Perfil, QR, Personalizar y más',
        tip: 'Si no ves "Personalizar" o "QR" en el menú, busca el encabezado "Cuenta" y haz clic para expandirlo.',
        screenshotDesc: 'Sidebar con los tres grupos Operación / Negocio / Cuenta expandida',
      },
      {
        id: 'plan-badge',
        title: 'Tu plan activo',
        description:
          'En la parte inferior de la barra lateral verás el badge con el nombre de tu plan (Básico, Estándar o Premium). Clic en él te lleva a "Mi suscripción" donde puedes ver el estado de tu cuenta y actualizar tu plan.',
        route: 'Barra lateral → Esquina inferior → Badge del plan → Mi suscripción',
        screenshotDesc: 'Badge del plan en la parte inferior del sidebar',
      },
    ],
  },

  {
    id: 'perfil',
    title: 'Perfil del restaurante',
    description: 'Configura la información de tu restaurante que aparece en tu menú y para tus clientes.',
    icon: 'user',
    planLevel: 'all',
    steps: [
      {
        id: 'info-basica',
        title: 'Información básica',
        description:
          'Ingresa el nombre de tu restaurante, una descripción corta, teléfono de contacto y dirección. Esta información aparece en tu menú digital y puede ser útil para los clientes que buscan cómo contactarte.',
        route: 'Barra lateral → Cuenta → Perfil',
        screenshotDesc: 'Formulario de perfil con campos de nombre, descripción y teléfono',
      },
      {
        id: 'horarios',
        title: 'Horarios de atención',
        description:
          'Define los días y horas en que atiendes. El menú mostrará automáticamente "Abierto" o "Cerrado" según el horario y la zona horaria configurada. Puedes configurar horarios distintos para cada día de la semana.',
        route: 'Perfil → Sección "Horarios" → Activa cada día y escribe la hora de apertura y cierre',
        tip: 'Si tu horario varía mucho entre días, configura cada día por separado. Si cierras un día, deja ese día desactivado.',
        screenshotDesc: 'Editor de horarios con días de la semana y campos de hora',
      },
      {
        id: 'whatsapp',
        title: 'Número de WhatsApp',
        description:
          'Ingresa tu número de WhatsApp (con código de país: 502 para Guatemala). Los clientes podrán contactarte directamente desde el menú y tú recibirás notificaciones de nuevos pedidos si tienes pedidos activos.',
        route: 'Perfil → Campo "WhatsApp (con código de país)"',
        tip: 'Formato correcto: 50212345678 (sin guiones ni espacios, con el 502 de Guatemala al inicio).',
        screenshotDesc: 'Campo de WhatsApp con ejemplo de formato 502XXXXXXXX',
      },
      {
        id: 'zona-entrega',
        title: 'Zona de entrega',
        description:
          'Si ofreces entrega a domicilio, define el radio de cobertura en kilómetros desde tu restaurante. El sistema calculará si la dirección del cliente está dentro de tu zona.',
        route: 'Perfil → Sección "Entrega" → Radio en km + Tarifa de envío',
        screenshotDesc: 'Mapa con radio de entrega y campo de tarifa de envío',
      },
    ],
  },

  {
    id: 'catalogo',
    title: 'Tu catálogo de platillos',
    description: 'Agrega, edita y organiza todos los productos de tu menú desde aquí.',
    icon: 'bag',
    planLevel: 'all',
    steps: [
      {
        id: 'vista-catalogo',
        title: 'Vista del catálogo',
        description:
          'Aquí viven todos tus platillos agrupados por categoría. Puedes ver el estado de disponibilidad de cada uno, su precio y foto. Usa los filtros de categoría en la parte superior para ver solo un grupo.',
        route: 'Barra lateral → Operación → Catálogo',
        screenshotDesc: 'Lista del catálogo con tarjetas de productos y fotos',
      },
      {
        id: 'nuevo-producto',
        title: 'Agrega tu primer producto',
        description:
          'Clic en el botón "+ Nuevo producto". Ingresa el nombre, precio (solo el número, sin símbolo de moneda), y una descripción breve. Una buena descripción menciona los ingredientes principales y el método de preparación.',
        route: 'Catálogo → Botón "+ Nuevo producto" (esquina superior derecha)',
        tip: 'Sé específico en la descripción: "Filete de res a la plancha con guarnición de papas y ensalada" vende más que "Filete con guarnición".',
        screenshotDesc: 'Formulario de nuevo producto con campos de nombre, precio y descripción',
      },
      {
        id: 'foto-producto',
        title: 'Sube la foto del producto',
        description:
          'Clic en el área de imagen y selecciona una foto de tu dispositivo. El sistema la recorta automáticamente en formato cuadrado. Recomendamos mínimo 600×600 px en JPG o PNG con buena iluminación.',
        route: 'Formulario de producto → Área de imagen → Clic o arrastra tu foto',
        tip: 'Una foto con fondo claro y buena luz natural hace el platillo mucho más apetitoso. Evita fondos muy oscuros o con muchos elementos distractores.',
        screenshotDesc: 'Área de carga de imagen con vista previa de la foto del producto',
      },
      {
        id: 'opciones',
        title: 'Opciones y variantes',
        description:
          'Si tu platillo tiene variantes (tamaño chico/grande, nivel de picante, extras opcionales), agrégalas en la sección "Opciones" del formulario. Define el nombre del grupo de opciones (ej. "Tamaño"), si es obligatorio elegir una, y cada opción con su precio adicional.',
        route: 'Formulario de producto → Sección "Opciones" → "+ Agregar grupo de opciones"',
        screenshotDesc: 'Editor de opciones con grupos y opciones individuales con precios',
      },
      {
        id: 'disponibilidad',
        title: 'Activa o desactiva la disponibilidad',
        description:
          'El toggle al lado de cada producto en el catálogo controla si está disponible para los clientes. Cuando lo desactivas, el producto no aparece en el menú pero no se elimina — puedes reactivarlo cuando quieras.',
        route: 'Catálogo → Toggle a la derecha del producto (verde = activo, gris = inactivo)',
        tip: 'Si un ingrediente se termina a media jornada, desactiva el producto de inmediato para que no lleguen pedidos de algo que no puedes preparar.',
        screenshotDesc: 'Lista de productos con toggle de disponibilidad activo/inactivo',
      },
      {
        id: 'reordenar',
        title: 'Reordena tus productos',
        description:
          'El orden en que aparecen los productos en el catálogo es el mismo que verá tu cliente. Mantén presionado el ícono "≡" a la izquierda del producto y arrástralo a la posición que quieres.',
        route: 'Catálogo → Ícono "≡" (arrastrar) a la izquierda del nombre del producto',
        screenshotDesc: 'Catálogo con ícono de arrastre resaltado en un producto',
      },
    ],
  },

  {
    id: 'categorias',
    title: 'Categorías del menú',
    description: 'Organiza tu menú en grupos para que tus clientes encuentren fácilmente lo que buscan.',
    icon: 'tag',
    planLevel: 'all',
    steps: [
      {
        id: 'que-son',
        title: '¿Para qué sirven las categorías?',
        description:
          'Las categorías agrupan tus platillos en secciones visibles (ej. Entradas, Platos fuertes, Bebidas, Postres). Tu cliente las verá como pestañas o secciones en el menú y podrá filtrar por ellas para encontrar lo que busca más rápido.',
        route: 'Barra lateral → Operación → Categorías',
        screenshotDesc: 'Panel de categorías con lista de grupos y sus íconos',
      },
      {
        id: 'crear-categoria',
        title: 'Crea tu primera categoría',
        description:
          'Clic en "+ Nueva categoría". Escribe el nombre (recomendamos máximo 3 palabras, ej. "Platos principales") y selecciona un ícono representativo del grupo. Guarda y repite para cada categoría.',
        route: 'Categorías → Botón "+ Nueva categoría" → Nombre + Ícono → Guardar',
        tip: 'Comienza con categorías amplias: Entradas, Platos fuertes, Bebidas, Postres. Puedes crear subcategorías más específicas después.',
        screenshotDesc: 'Modal de nueva categoría con campo de nombre y selector de ícono',
      },
      {
        id: 'ordenar-categorias',
        title: 'Ordena tus categorías',
        description:
          'El orden de las categorías en esta pantalla es el mismo que verá tu cliente. Arrastra cada categoría con el ícono "≡" para cambiar su posición. Poner las más populares al inicio mejora la experiencia.',
        route: 'Categorías → Ícono "≡" → Arrastrar a la posición deseada',
        screenshotDesc: 'Lista de categorías con íconos de arrastre',
      },
      {
        id: 'asignar-categoria',
        title: 'Asigna productos a categorías',
        description:
          'Al crear o editar un producto, encontrarás el campo "Categoría" en el formulario. Selecciona la categoría correspondiente. Un producto solo puede pertenecer a una categoría a la vez.',
        route: 'Catálogo → Editar producto → Campo "Categoría" → Selecciona',
        screenshotDesc: 'Formulario de producto con el selector de categoría desplegado',
      },
    ],
  },

  {
    id: 'personalizar',
    title: 'Personalizar tu menú',
    description: 'Dale identidad visual a tu menú: colores, tipografía, tema y logo.',
    icon: 'sparkle',
    planLevel: 'all',
    steps: [
      {
        id: 'abrir-personalizacion',
        title: 'Abre el editor de personalización',
        description:
          'Desde aquí controlas toda la apariencia visual de tu menú. Los cambios se muestran en una vista previa en tiempo real antes de guardar.',
        route: 'Barra lateral → Cuenta → Personalizar',
        screenshotDesc: 'Panel de personalización con editor a la izquierda y vista previa a la derecha',
      },
      {
        id: 'logo',
        title: 'Sube tu logo',
        description:
          'Tu logo aparece en la parte superior del menú y en el panel admin. Recomendamos PNG con fondo transparente, al menos 200×200 px. El sistema lo muestra en formato cuadrado redondeado.',
        route: 'Personalizar → Sección "Logo" → Clic en el área de logo → Selecciona tu imagen',
        screenshotDesc: 'Área de carga de logo con vista previa del logotipo',
      },
      {
        id: 'color-principal',
        title: 'Elige tu color principal',
        description:
          'El color principal se usa en botones, precios destacados, la categoría seleccionada y otros acentos visuales del menú. Usa el selector de color o ingresa directamente el código hexadecimal (#RRGGBB) de tu color de marca.',
        route: 'Personalizar → Sección "Colores" → "Color principal"',
        tip: 'Si tienes tu color de marca exacto, busca el código HEX en tu guía de identidad o en el diseñador que hizo tu logo.',
        screenshotDesc: 'Selector de color con el código HEX y paleta visual',
      },
      {
        id: 'tema',
        title: 'Tema claro u oscuro',
        description:
          'Elige si tu menú se muestra con fondo claro (blanco/gris) u oscuro (negro/profundo). El modo oscuro luce elegante para cocina contemporánea y bar. El claro es más limpio y familiar para la mayoría de restaurantes.',
        route: 'Personalizar → Sección "Apariencia" → Selector "Modo claro / Modo oscuro"',
        screenshotDesc: 'Comparación de tema claro vs oscuro en la vista previa',
      },
      {
        id: 'tipografia',
        title: 'Tipografía',
        description:
          'Selecciona la fuente que define el carácter de tu menú. Cada fuente comunica algo diferente: serif para restaurantes clásicos, sans-serif para modernos, display para conceptos creativos.',
        route: 'Personalizar → Sección "Tipografía" → Selector de fuente principal',
        screenshotDesc: 'Selector de tipografía con preview del nombre del restaurante en cada fuente',
      },
      {
        id: 'guardar',
        title: 'Guarda y publica',
        description:
          'Cuando estés conforme con cómo se ve la vista previa, clic en "Guardar". Los cambios se publican instantáneamente — tus clientes verán el nuevo diseño en su próxima visita.',
        route: 'Personalizar → Botón "Guardar" (esquina superior o inferior derecha)',
        tip: 'Escanea tu QR después de guardar para confirmar que todo luce bien en el teléfono real.',
        screenshotDesc: 'Botón de guardar resaltado en el panel de personalización',
      },
    ],
  },

  {
    id: 'qr',
    title: 'Tu código QR',
    description: 'Descarga, comparte e imprime el QR que conecta a tus clientes con tu menú digital.',
    icon: 'image',
    planLevel: 'all',
    steps: [
      {
        id: 'ver-qr',
        title: 'Accede a tu código QR',
        description:
          'En la sección QR encontrarás tu código listo para usar. También verás el enlace directo a tu menú, que puedes copiar y compartir por WhatsApp, Instagram o donde quieras.',
        route: 'Barra lateral → Cuenta → QR',
        screenshotDesc: 'Página del QR con el código generado y el enlace del menú',
      },
      {
        id: 'descargar',
        title: 'Descarga el QR en alta resolución',
        description:
          'Clic en "Descargar PNG" para obtener el QR en alta resolución listo para imprimir. El archivo tiene al menos 1000×1000 px para garantizar calidad en cualquier tamaño de impresión.',
        route: 'QR → Botón "Descargar PNG"',
        tip: 'Imprime el QR en un mínimo de 8×8 cm para que sea fácilmente escaneable desde cualquier ángulo y distancia.',
        screenshotDesc: 'Botón de descarga del QR resaltado',
      },
      {
        id: 'probar',
        title: 'Prueba tu menú antes de compartir',
        description:
          'Escanea el QR con tu propio celular para ver exactamente cómo lo verá tu cliente: los productos, las fotos, el diseño y el proceso de pedido completo.',
        route: 'Cámara del celular → Apunta al QR → Abre el enlace → Verifica que se ve bien',
        screenshotDesc: 'Vista del menú del cliente en un celular',
      },
      {
        id: 'donde-colocar',
        title: '¿Dónde poner tu QR?',
        description:
          'Coloca el QR en todos los puntos de contacto con tu cliente: sobre la mesa (una impresión por mesa o un stand central), en la ventana o vitrina del local, en el empaque para llevar, en tus redes sociales como historia o publicación fija, y en el menú físico si lo tienes.',
        tip: 'Un pequeño texto junto al QR ("Escanea para ver el menú" o "Pide aquí") ayuda a que los clientes sepan qué hacer sin que tengas que explicarlo.',
        screenshotDesc: 'Ejemplo de QR impreso en un soporte de mesa de restaurante',
      },
    ],
  },

  {
    id: 'metricas',
    title: 'Métricas básicas',
    description: 'Entiende cuántas personas visitan tu menú y cómo se comportan.',
    icon: 'chart',
    planLevel: 'all',
    steps: [
      {
        id: 'visitas',
        title: 'Visitas a tu menú',
        description:
          'El panel de métricas muestra cuántas personas han visto tu menú. Cada escaneo del QR o visita al enlace cuenta como una visita única por sesión.',
        route: 'Barra lateral → Negocio → Métricas',
        screenshotDesc: 'Panel de métricas con gráfica de visitas por día',
      },
      {
        id: 'periodo',
        title: 'Cambia el período de análisis',
        description:
          'Usa el selector de período (esquina superior derecha) para ver las métricas de hoy, esta semana, este mes o un rango personalizado.',
        route: 'Métricas → Selector de período (esquina superior derecha)',
        screenshotDesc: 'Selector de período desplegado con opciones de rango',
      },
      {
        id: 'productos-vistos',
        title: 'Productos más vistos',
        description:
          'El listado muestra qué productos llaman más la atención de tus clientes. Si un producto se ve mucho pero se pide poco, puede ser un problema de precio o descripción.',
        route: 'Métricas → Sección "Más vistos"',
        screenshotDesc: 'Lista de productos más vistos con contador de vistas',
      },
    ],
  },

  /* ────────────── POPULAR ─────────────────────────────── */

  {
    id: 'pedidos',
    title: 'Configurar pedidos en línea',
    description: 'Activa y configura todo para recibir pedidos desde tu menú QR.',
    icon: 'list',
    planLevel: 'popular',
    steps: [
      {
        id: 'activar',
        title: 'Activa el módulo de pedidos',
        description:
          'El módulo de pedidos en línea debe estar habilitado por Leogin en tu plan. Si ya lo tienes, ve a Módulos y actívalo. Desde ese momento tus clientes podrán hacer pedidos directamente desde el menú.',
        route: 'Barra lateral → Cuenta → Módulos → "Pedidos en línea" → Toggle para activar',
        screenshotDesc: 'Panel de módulos con el módulo de Pedidos activo',
      },
      {
        id: 'tipos-orden',
        title: 'Define qué tipos de orden aceptas',
        description:
          'Elige si aceptas Entrega a domicilio (Delivery), Retiro en local (Pick-up), o Consumo en mesa (Dine-in). Puedes activar varios tipos a la vez.',
        route: 'Perfil → Sección "Pedidos" → Activa cada tipo que ofreces',
        screenshotDesc: 'Opciones de tipo de orden con toggles para cada tipo',
      },
      {
        id: 'tarifa-envio',
        title: 'Configura la tarifa de envío',
        description:
          'Si ofreces delivery, define el costo que se le carga al cliente. Puedes poner Q0 si ofreces envío gratis o un monto fijo para toda la zona de entrega.',
        route: 'Perfil → Sección "Entrega" → Campo "Tarifa de envío"',
        screenshotDesc: 'Campo de tarifa de envío con ejemplo de Q25',
      },
      {
        id: 'pausa',
        title: 'Pausa los pedidos cuando lo necesites',
        description:
          'Si tu cocina se satura o necesitas parar momentáneamente (por limpieza, falta de gas, etc.), activa la pausa desde el panel de pedidos. Los clientes verán un mensaje de que no están tomando pedidos en este momento.',
        route: 'Pedidos → Botón "Pausar pedidos" (parte superior del panel)',
        tip: 'Recuerda desactivar la pausa cuando estés listo para recibir pedidos de nuevo. La pausa no se quita sola.',
        screenshotDesc: 'Botón de pausar pedidos y estado de pausa activa',
      },
      {
        id: 'notificaciones',
        title: 'Notificaciones de nuevos pedidos',
        description:
          'El sistema hace sonar una alerta en el navegador cada vez que llega un pedido nuevo. Si tienes tu número de WhatsApp en el perfil, también recibirás un mensaje. Mantén el panel de pedidos abierto en una pantalla para no perderte nada.',
        route: 'El navegador te pedirá permiso de notificaciones la primera vez → Acepta',
        tip: 'Usa una tablet fija en la caja o cocina con el panel de pedidos siempre visible. Es la mejor forma de no perder ningún pedido.',
        screenshotDesc: 'Alerta de nuevo pedido en el navegador y notificación de WhatsApp',
      },
    ],
  },

  {
    id: 'panel-pedidos',
    title: 'Panel de pedidos en tiempo real',
    description: 'Gestiona todos los pedidos activos, avanza sus estados y lleva el control de tu operación.',
    icon: 'list',
    planLevel: 'popular',
    steps: [
      {
        id: 'vista-live',
        title: 'Vista en tiempo real',
        description:
          'El panel de pedidos se actualiza automáticamente sin necesidad de recargar la página. Cada pedido nuevo aparece al instante con el detalle completo: productos, cantidades, opciones, dirección y total.',
        route: 'Barra lateral → Operación → Pedidos',
        screenshotDesc: 'Panel de pedidos con varias tarjetas activas en diferentes estados',
      },
      {
        id: 'estados',
        title: 'Avanza el estado de cada pedido',
        description:
          'Cada pedido tiene un flujo de estados: Nuevo → En preparación → Listo → Entregado. Haz clic en el botón de avance de estado en la tarjeta del pedido para moverlo al siguiente paso. El cliente puede ver el estado en tiempo real si tiene el enlace de seguimiento.',
        route: 'Pedidos → Tarjeta del pedido → Botón de avance de estado',
        tip: 'Avanzar el estado rápidamente mantiene al cliente informado y reduce los mensajes de "¿cuándo llega mi pedido?".',
        screenshotDesc: 'Tarjeta de pedido con botones de estado resaltados',
      },
      {
        id: 'detalle',
        title: 'Ve el detalle completo',
        description:
          'Haz clic en una tarjeta de pedido para ver el desglose completo: cada producto con sus opciones, el tipo de orden (delivery/pickup/mesa), la dirección, notas especiales del cliente y el total desglosado (subtotal, envío, descuentos).',
        route: 'Pedidos → Clic en la tarjeta del pedido → Panel de detalle',
        screenshotDesc: 'Vista de detalle de un pedido con todos los productos y totales',
      },
      {
        id: 'imprimir',
        title: 'Imprime el recibo de cocina',
        description:
          'Si tienes una impresora térmica conectada con el agente de impresión Leogin, el recibo se imprime automáticamente cuando llega un pedido. Si no, puedes imprimirlo manualmente desde el detalle del pedido.',
        route: 'Detalle del pedido → Botón "Imprimir recibo"',
        screenshotDesc: 'Botón de imprimir en el detalle de pedido',
      },
      {
        id: 'historial',
        title: 'Historial de pedidos anteriores',
        description:
          'Los pedidos completados y cancelados se mueven al historial. Usa los filtros de fecha para encontrar un pedido específico o ver el resumen de un día o período.',
        route: 'Pedidos → Tab "Historial" → Filtros de fecha',
        screenshotDesc: 'Tab de historial con lista de pedidos completados',
      },
    ],
  },

  {
    id: 'inventario',
    title: 'Inventario y control de stock',
    description: 'Controla cuántas unidades tienes disponibles y evita que lleguen pedidos de lo que no tienes.',
    icon: 'box',
    planLevel: 'popular',
    steps: [
      {
        id: 'activar-inv',
        title: 'Activa el control de inventario',
        description:
          'El inventario se activa por producto. Edita cualquier producto, activa el toggle "Controlar inventario" e ingresa la cantidad disponible. Cuando llegue a cero, el sistema lo desactiva automáticamente.',
        route: 'Catálogo → Editar producto → Toggle "Controlar inventario" → Cantidad inicial',
        screenshotDesc: 'Formulario de producto con el toggle de inventario activado y campo de cantidad',
      },
      {
        id: 'ver-inventario',
        title: 'Panel de inventario',
        description:
          'El panel de inventario muestra todos tus productos con stock activado, la cantidad actual, alertas de nivel bajo y botones de reposición rápida.',
        route: 'Barra lateral → Operación → Inventario',
        screenshotDesc: 'Panel de inventario con lista de productos y sus niveles de stock',
      },
      {
        id: 'reponer',
        title: 'Repón el stock',
        description:
          'Cuando recibes mercadería nueva, ve al inventario, clic en el producto y usa el botón "Reponer" para agregar unidades. El sistema suma al stock actual y registra el movimiento.',
        route: 'Inventario → Clic en el producto → Botón "Reponer" → Ingresa cantidad → Confirmar',
        screenshotDesc: 'Modal de reposición de stock con campo de cantidad',
      },
      {
        id: 'alerta-bajo',
        title: 'Alerta de stock bajo',
        description:
          'Define un umbral de alerta (ej. 5 unidades). Cuando el stock baje de ese número, el producto aparece resaltado en el panel de inventario para que recuerdes reponer a tiempo.',
        route: 'Inventario → Editar producto → Campo "Alerta de stock bajo" → Número de unidades mínimas',
        screenshotDesc: 'Producto con alerta de stock bajo resaltada en rojo/amarillo',
      },
    ],
  },

  {
    id: 'analitica',
    title: 'Analítica avanzada',
    description: 'Entiende a fondo el rendimiento de tu restaurante con datos detallados de pedidos y ventas.',
    icon: 'dashboard',
    planLevel: 'popular',
    steps: [
      {
        id: 'horas-pico',
        title: 'Horas pico',
        description:
          'El mapa de calor muestra en qué horas y días de la semana recibes más pedidos. Úsalo para planear el horario de tu personal y para saber cuándo tener más insumos preparados.',
        route: 'Barra lateral → Negocio → Analítica → Tab "Horas pico"',
        screenshotDesc: 'Mapa de calor de horas pico por día de la semana y hora',
      },
      {
        id: 'mas-vendidos',
        title: 'Productos más vendidos',
        description:
          'Ranking de tus productos con más unidades vendidas en el período seleccionado. Ideal para saber cuáles son tus estrellas, en cuáles invertir más insumos y cuáles necesitan más promoción.',
        route: 'Analítica → Tab "Más vendidos"',
        screenshotDesc: 'Ranking de productos más vendidos con gráfica de barras',
      },
      {
        id: 'cancelaciones',
        title: 'Tasa de cancelación',
        description:
          'Porcentaje de pedidos cancelados sobre el total recibido. Si supera el 10%, es señal de tiempos de espera demasiado largos, problemas de comunicación o falta de stock frecuente.',
        route: 'Analítica → Tab "Cancelaciones"',
        screenshotDesc: 'Gráfica de tasa de cancelación con porcentaje y número de pedidos',
      },
      {
        id: 'tiempos',
        title: 'Tiempos de atención',
        description:
          'Tiempo promedio desde que entra un pedido hasta que se marca como Listo. Es la métrica de eficiencia de tu cocina. Un tiempo alto puede significar que necesitas más personal o que tus procesos de preparación se pueden optimizar.',
        route: 'Analítica → Tab "Tiempos"',
        screenshotDesc: 'Gráfica de tiempos de preparación promedio por período',
      },
    ],
  },

  {
    id: 'finanzas',
    title: 'Finanzas y reportes',
    description: 'Revisa tus ventas, haz cortes de caja y exporta reportes para tu contabilidad.',
    icon: 'wallet',
    planLevel: 'popular',
    steps: [
      {
        id: 'resumen',
        title: 'Resumen de ventas',
        description:
          'El panel de finanzas muestra el total facturado, el número de pedidos y el ticket promedio para el período que elijas. Es el primer número que deberías revisar cada mañana.',
        route: 'Barra lateral → Negocio → Finanzas',
        screenshotDesc: 'Panel de finanzas con KPIs de ventas totales, pedidos y ticket promedio',
      },
      {
        id: 'corte-caja',
        title: 'Corte de caja',
        description:
          'Al final de tu turno o del día, realiza un corte de caja. El sistema calcula el monto esperado en base a los pedidos del período y puedes registrar el monto real contado para detectar diferencias.',
        route: 'Finanzas → Botón "Corte de caja" → Selecciona el período → Registra el efectivo contado',
        screenshotDesc: 'Formulario de corte de caja con campos de efectivo esperado y contado',
      },
      {
        id: 'periodo-reporte',
        title: 'Reportes por período',
        description:
          'Filtra las ventas por día específico, semana, mes o un rango de fechas personalizado para ver exactamente cómo te fue en ese período.',
        route: 'Finanzas → Selector de período (esquina superior) → Actualiza el reporte',
        screenshotDesc: 'Selector de rango de fechas con vista de ventas del período',
      },
      {
        id: 'exportar',
        title: 'Exporta tus datos',
        description:
          'Descarga el reporte de ventas en formato CSV para abrirlo en Excel, Google Sheets o enviarlo a tu contador.',
        route: 'Finanzas → Botón "Exportar" (esquina superior derecha) → Elige el formato',
        screenshotDesc: 'Botón de exportar con opciones de formato CSV/Excel',
      },
      {
        id: 'por-producto',
        title: 'Desglose por producto',
        description:
          'El reporte incluye qué productos vendiste, cuántas unidades de cada uno y cuánto generó cada platillo. Es útil para saber cuáles son tus productos estrella en términos de ingresos.',
        route: 'Finanzas → Sección "Ventas por producto"',
        screenshotDesc: 'Tabla de ventas desglosada por producto con unidades e ingresos',
      },
    ],
  },

  {
    id: 'clientes',
    title: 'Base de clientes',
    description: 'Consulta el historial de tus clientes y entiende quiénes son tus mejores compradores.',
    icon: 'users',
    planLevel: 'popular',
    steps: [
      {
        id: 'lista-clientes',
        title: 'Lista de clientes',
        description:
          'Leogin registra automáticamente a los clientes que hacen pedidos en línea. Verás su nombre, teléfono, número de pedidos total y cuándo fue su último pedido.',
        route: 'Barra lateral → Negocio → Clientes',
        screenshotDesc: 'Lista de clientes con nombre, teléfono y estadísticas',
      },
      {
        id: 'historial-cliente',
        title: 'Historial por cliente',
        description:
          'Clic en cualquier cliente para ver todos sus pedidos anteriores, el total que ha gastado en tu restaurante y cuál es su pedido más frecuente.',
        route: 'Clientes → Clic en el nombre del cliente → Panel de detalle',
        screenshotDesc: 'Perfil del cliente con historial de pedidos y total gastado',
      },
      {
        id: 'buscar-cliente',
        title: 'Busca un cliente',
        description:
          'Usa la barra de búsqueda para encontrar a un cliente específico por nombre o número de teléfono.',
        route: 'Clientes → Barra de búsqueda (parte superior)',
        screenshotDesc: 'Barra de búsqueda con resultados filtrados',
      },
    ],
  },

  {
    id: 'personal',
    title: 'Personal y permisos',
    description: 'Da acceso al panel a tus empleados y define exactamente qué pueden ver y hacer.',
    icon: 'userPlus',
    planLevel: 'popular',
    steps: [
      {
        id: 'nuevo-staff',
        title: 'Da acceso a un empleado',
        description:
          'Clic en "+ Nuevo staff". Ingresa el nombre completo, email y contraseña. Luego selecciona qué secciones del panel puede ver este empleado: pedidos, catálogo, inventario, finanzas, etc.',
        route: 'Barra lateral → Cuenta → Personal → Sección "Staff admin" → "+ Nuevo staff"',
        screenshotDesc: 'Formulario de nuevo staff con campos de nombre, email y permisos',
      },
      {
        id: 'permisos',
        title: 'Define los permisos por sección',
        description:
          'Al crear o editar un staff, marca las secciones a las que tendrá acceso. Un cajero típico necesita Pedidos y Finanzas. Un cocinero solo Cocina (KDS). Un encargado puede tener acceso completo.',
        route: 'Personal → Editar staff → Sección "Permisos" → Marca las secciones',
        tip: 'Empieza dando solo los permisos mínimos necesarios. Es más fácil agregar permisos después que corregir un error de acceso no autorizado.',
        screenshotDesc: 'Panel de permisos con checkboxes por sección del admin',
      },
      {
        id: 'nuevo-mesero',
        title: 'Da de alta un mesero',
        description:
          'Los meseros tienen un panel especial táctil para tomar pedidos en mesa. Se crean en la sección "Meseros" (distinta al staff admin). Ingresan con sus propias credenciales y el sistema los redirige automáticamente a su pantalla de mesero.',
        route: 'Personal → Sección "Meseros" → "+ Nuevo mesero" → Nombre, email y contraseña',
        screenshotDesc: 'Sección de meseros con formulario de alta',
      },
      {
        id: 'cambiar-contrasena',
        title: 'Restablece la contraseña de un empleado',
        description:
          'Si un empleado olvida su contraseña, el dueño puede cambiarla directamente desde el panel de personal, sin necesidad de contactar a Leogin.',
        route: 'Personal → Clic en el nombre del empleado → "Cambiar contraseña"',
        screenshotDesc: 'Modal para cambio de contraseña del empleado',
      },
      {
        id: 'desactivar',
        title: 'Desactiva el acceso de un empleado',
        description:
          'Cuando un empleado ya no trabaja en tu restaurante, desactiva su acceso de inmediato. El sistema le impide ingresar al instante. No elimines el registro para conservar el historial.',
        route: 'Personal → Toggle de activación al lado del nombre del empleado',
        screenshotDesc: 'Toggle de activación/desactivación del empleado',
      },
    ],
  },

  {
    id: 'cocina',
    title: 'Pantalla de cocina (KDS)',
    description: 'La pantalla de cocina muestra los pedidos activos para que tu equipo sepa exactamente qué preparar.',
    icon: 'flame',
    planLevel: 'popular',
    steps: [
      {
        id: 'que-es-kds',
        title: '¿Qué es la pantalla de cocina?',
        description:
          'El KDS (Kitchen Display System) es una pantalla de tiempo real para tu cocina que muestra todos los pedidos activos con el detalle de cada platillo, en qué orden llegaron y cuánto tiempo lleva cada uno.',
        route: 'Barra lateral → Operación → Cocina',
        screenshotDesc: 'Pantalla KDS con tarjetas de pedidos activos en la cocina',
      },
      {
        id: 'tablet-cocina',
        title: 'Configura una tablet en la cocina',
        description:
          'Recomendamos instalar una tablet fija en la cocina, apuntando a tu.dominio.com/admin/cocina en pantalla completa. La pantalla está optimizada para pantalla táctil y no tiene elementos que distraigan.',
        route: 'En la tablet: Abre el navegador → Ingresa a turestaurante.leogin.app/admin/cocina → Login → Cocina',
        tip: 'Activa la opción "No bloquear pantalla" en la tablet y ponla a cargar para que siempre esté disponible durante el servicio.',
        screenshotDesc: 'Tablet en modo pantalla completa con el KDS activo',
      },
      {
        id: 'gestionar-pedidos-cocina',
        title: 'Gestiona pedidos desde cocina',
        description:
          'Cada pedido aparece como una tarjeta. Toca "Comenzar" cuando inicias su preparación (el pedido pasa a "En preparación"). Cuando está listo, toca "Marcar listo" para notificar al personal de sala.',
        route: 'Cocina → Tarjeta del pedido → "Comenzar" → "Marcar listo"',
        screenshotDesc: 'Tarjeta de pedido en cocina con botones Comenzar y Marcar listo',
      },
      {
        id: 'semaforo',
        title: 'Semáforo de tiempo',
        description:
          'El borde de cada tarjeta cambia de color según el tiempo que lleva el pedido: Verde (dentro del tiempo normal), Amarillo (está tardando), Rojo (se pasó del límite). Los umbrales se configuran según la capacidad de tu cocina.',
        route: 'Cocina → Borde de color en cada tarjeta',
        tip: 'Configura los umbrales según tu tipo de cocina. Una cocina rápida puede tener umbrales de 10/20 min. Una cocina de fine dining, 20/35 min.',
        screenshotDesc: 'Tarjetas de pedido con bordes de diferentes colores según el tiempo',
      },
      {
        id: 'configurar-umbrales',
        title: 'Configura los umbrales de tiempo',
        description:
          'Define cuántos minutos son "tiempo normal" (verde) y cuántos son "tardado" (amarillo/rojo) según la velocidad de tu cocina.',
        route: 'Barra lateral → Cuenta → Personalizar → Sección "Cocina" → Umbrales de tiempo',
        screenshotDesc: 'Configuración de umbrales de tiempo verde/amarillo/rojo',
      },
    ],
  },

  {
    id: 'meseros',
    title: 'Rol de mesero',
    description: 'Permite que tu personal tome pedidos en mesa directamente desde una tablet o celular.',
    icon: 'userPlus',
    planLevel: 'popular',
    steps: [
      {
        id: 'que-hace-mesero',
        title: '¿Qué puede hacer un mesero?',
        description:
          'El rol de mesero tiene su propio panel táctil, separado del admin del dueño. Desde él puede seleccionar productos, elegir la mesa, agregar notas y enviar el pedido directamente a cocina y al panel de pedidos, sin que el cliente tenga que escanear el QR.',
        route: 'Panel del mesero: turestaurante.leogin.app/admin/mesero',
        screenshotDesc: 'Panel del mesero con categorías y productos en vista táctil',
      },
      {
        id: 'alta-mesero',
        title: 'Da de alta a un mesero',
        description:
          'Ve a Personal, sección "Meseros", y crea el acceso del mesero con su nombre, email y contraseña. El sistema identifica automáticamente que es mesero y lo redirige a su pantalla especial al hacer login.',
        route: 'Personal → Sección "Meseros" → "+ Nuevo mesero" → Nombre + Email + Contraseña',
        screenshotDesc: 'Formulario de alta de mesero con campos de datos',
      },
      {
        id: 'login-mesero',
        title: 'Cómo ingresa el mesero',
        description:
          'El mesero va a la misma URL de login de tu restaurante y entra con sus credenciales. El sistema lo detecta automáticamente como mesero y lo lleva a su panel táctil, no al admin del dueño.',
        route: 'turestaurante.leogin.app/admin → Login con las credenciales del mesero',
        screenshotDesc: 'Login del restaurante y redirección automática al panel de mesero',
      },
      {
        id: 'tomar-pedido',
        title: 'Toma un pedido en mesa',
        description:
          'En el panel del mesero: elige "Nuevo pedido", navega por las categorías y toca los productos que el cliente pide. Selecciona el número de mesa, agrega el nombre o referencia del cliente (opcional) y confirma. El pedido llega instantáneamente al panel de pedidos y a cocina.',
        route: 'Panel mesero → "Nuevo pedido" → Selecciona productos → Elige mesa → Confirmar pedido',
        screenshotDesc: 'Flujo de toma de pedido del mesero con carrito y selección de mesa',
      },
      {
        id: 'pedidos-turno',
        title: 'Pedidos del turno del mesero',
        description:
          'El mesero solo ve sus propios pedidos activos en la tab "Mis pedidos". Puede ver el estado de cada uno y avanzarlos. El dueño, en el panel principal, ve todos los pedidos con la nota del mesero asignado.',
        route: 'Panel mesero → Tab "Mis pedidos"',
        screenshotDesc: 'Tab de pedidos del mesero con sus pedidos activos del turno',
      },
    ],
  },

  {
    id: 'kiosko',
    title: 'Kiosko de autoservicio',
    description: 'Convierte cualquier tablet del mostrador en un tótem donde tus clientes ordenan solos.',
    icon: 'grid',
    planLevel: 'popular',
    moduleKey: 'orders',
    steps: [
      {
        id: 'que-es-kiosko',
        title: '¿Qué es el modo kiosko?',
        description:
          'Es tu menú digital en modo autoservicio, pensado para una tablet fija en el mostrador (estilo McDonald’s): el cliente arma su pedido solo, lo confirma "para recoger" y la pantalla vuelve automáticamente al menú para el siguiente cliente. No necesitas hardware especial ni licencias extra.',
        route: 'Cualquier tablet o pantalla táctil con navegador',
      },
      {
        id: 'activar-kiosko',
        title: 'Activa el kiosko en la tablet',
        description:
          'En la tablet del mostrador, abre el navegador y entra a turestaurante.leogin.online/kiosko — el menú se abre en modo autoservicio (verás el distintivo "Autoservicio" arriba). Pon el navegador en pantalla completa o instala el menú como app para que no se salgan del modo.',
        route: 'Navegador de la tablet → turestaurante.leogin.online/kiosko',
        tip: 'Activa "No bloquear pantalla" en la tablet y déjala conectada a la corriente durante el servicio.',
      },
      {
        id: 'flujo-kiosko',
        title: 'Así ordena tu cliente',
        description:
          'El cliente navega el menú, agrega al carrito y confirma con su nombre y teléfono. El pedido entra como "para recoger" a tu panel de pedidos y a cocina, igual que cualquier otro. Al final ve su número de pedido en grande y la pantalla regresa sola al menú a los 45 segundos (o con el botón "Hacer otro pedido").',
        route: 'Kiosko → Carrito → Confirmar → Número de pedido → Vuelve al menú',
      },
      {
        id: 'privacidad-kiosko',
        title: 'Privacidad en el aparato compartido',
        description:
          'En modo kiosko el menú oculta las pestañas de cuenta, fidelidad y mis pedidos, no autocompleta los datos del cliente anterior y no guarda los del actual. Así nadie ve la información de quien ordenó antes.',
        tip: 'Los clientes que quieran acumular puntos pueden pedir desde SU teléfono escaneando el QR — el kiosko es para ordenar rápido en el mostrador.',
      },
      {
        id: 'salir-kiosko',
        title: 'Salir del modo kiosko',
        description:
          'Para desactivarlo (por ejemplo, para usar esa tablet en otra cosa), entra a turestaurante.leogin.online/kiosko?salir=1 en la misma tablet. El modo solo afecta al dispositivo donde se activó.',
        route: 'Navegador de la tablet → turestaurante.leogin.online/kiosko?salir=1',
      },
    ],
  },

  /* ────────────── PREMIUM ─────────────────────────────── */

  {
    id: 'grupo',
    title: 'Panel de grupo multi-sucursal',
    description: 'Gestiona todas tus sucursales desde un único panel central con métricas consolidadas.',
    icon: 'grid',
    planLevel: 'premium',
    steps: [
      {
        id: 'que-es-grupo',
        title: '¿Qué es el panel de grupo?',
        description:
          'Si tienes varias sucursales (mismo concepto de restaurante en distintas ubicaciones), el panel central te da una vista consolidada de todas ellas: ventas totales, pedidos, comparativas y acceso rápido a cada sucursal.',
        route: 'Subdominio especial: turestaurante-central.leogin.app',
        screenshotDesc: 'Dashboard del panel central con resumen de todas las sucursales',
      },
      {
        id: 'acceder-central',
        title: 'Accede al panel central',
        description:
          'El panel de grupo tiene su propio subdominio con el sufijo "-central". Ingresa con tus credenciales de dueño de grupo. Leogin configura este acceso cuando activas el plan Premium con más de una sucursal.',
        route: 'Navegador → turestaurante-central.leogin.app → Login con tus credenciales',
        screenshotDesc: 'Login del panel central con nombre del grupo',
      },
      {
        id: 'resumen-consolidado',
        title: 'Resumen consolidado del grupo',
        description:
          'La página de inicio del panel central muestra las ventas totales sumadas de todas las sucursales, los pedidos del día, el ticket promedio global y el rendimiento frente al período anterior.',
        route: 'Panel central → Inicio',
        screenshotDesc: 'KPIs consolidados del grupo: ventas, pedidos, ticket promedio',
      },
      {
        id: 'comparativa',
        title: 'Compara el rendimiento de sucursales',
        description:
          'La pantalla de comparativa muestra cada sucursal lado a lado: ventas, pedidos completados, tasa de cancelación y ticket promedio. Identifica cuál sucursal lidera y cuál necesita atención.',
        route: 'Panel central → Comparativa',
        screenshotDesc: 'Tabla comparativa de sucursales con métricas lado a lado',
      },
      {
        id: 'acceso-sucursal',
        title: 'Accede al admin de cada sucursal',
        description:
          'Desde el panel central puedes saltar directamente al admin de cualquier sucursal con un clic, sin necesidad de cerrar sesión y volver a entrar.',
        route: 'Panel central → Sucursales → Clic en el nombre de la sucursal → "Abrir admin"',
        screenshotDesc: 'Lista de sucursales con botón para acceder al admin de cada una',
      },
    ],
  },

  /* ────────────── MÓDULOS OPCIONALES ─────────────────── */

  {
    id: 'loyalty',
    title: 'Programa de lealtad y puntos',
    description: 'Premia a tus clientes frecuentes con puntos que pueden canjear como descuento.',
    icon: 'star',
    planLevel: 'all',
    moduleKey: 'loyalty',
    steps: [
      {
        id: 'como-funciona',
        title: '¿Cómo funciona el programa de puntos?',
        description:
          'Tus clientes acumulan puntos automáticamente cada vez que hacen un pedido. Cuando acumulan suficientes, pueden canjearlos como descuento directo en su próxima compra al momento del checkout.',
        route: 'Barra lateral → Negocio → Lealtad',
        screenshotDesc: 'Panel de lealtad con configuración y estadísticas del programa',
      },
      {
        id: 'configurar',
        title: 'Configura el programa',
        description:
          'Define la tasa de acumulación (ej. 1 punto por Q1 gastado), el valor de canje (ej. Q1 por cada 10 puntos) y el mínimo de puntos para canjear. Estos parámetros los puedes ajustar en cualquier momento.',
        route: 'Lealtad → Sección "Configuración" → Define la tasa de acumulación y el valor de canje',
        tip: 'Una tasa de 1 punto/Q1 con canje de Q1/10 pts da un 10% de retorno efectivo. Empieza ahí y ajusta según tu margen.',
        screenshotDesc: 'Formulario de configuración del programa de puntos',
      },
      {
        id: 'bono-bienvenida',
        title: 'Bono de bienvenida',
        description:
          'Puedes regalar puntos cuando un cliente hace su primera compra (ej. 50 puntos de bienvenida). Es una excelente forma de motivar que los clientes nuevos se registren y vuelvan.',
        route: 'Lealtad → Configuración → Campo "Bono de bienvenida (puntos)"',
        screenshotDesc: 'Campo de bono de bienvenida en la configuración del programa',
      },
      {
        id: 'como-canjea',
        title: 'Cómo canjea el cliente en el checkout',
        description:
          'En el checkout, el cliente ingresa su número de teléfono. Si tiene puntos disponibles y supera el mínimo para canjear, aparece la opción "Canjear puntos" con el descuento calculado automáticamente. El cliente elige si quiere canjear o no.',
        route: 'Menú del cliente → Checkout → "Tienes [N] puntos" → "Canjear puntos"',
        screenshotDesc: 'Checkout del cliente con opción de canje de puntos visible',
      },
      {
        id: 'ver-saldos',
        title: 'Consulta saldos de clientes',
        description:
          'Desde el panel de lealtad puedes ver el saldo de puntos de cada cliente y el historial de acumulación y canje.',
        route: 'Lealtad → Tab "Clientes" → Busca por nombre o teléfono',
        screenshotDesc: 'Lista de clientes con sus saldos de puntos',
      },
      {
        id: 'ajuste-manual',
        title: 'Ajusta puntos manualmente',
        description:
          'Si necesitas corregir el saldo de un cliente (error, compensación por mala experiencia, puntos de bienvenida especiales), puedes sumar o restar puntos manualmente desde el panel.',
        route: 'Lealtad → Buscar cliente → "Ajustar puntos" → Ingresa cantidad (positiva para sumar, negativa para restar)',
        screenshotDesc: 'Modal de ajuste manual de puntos con campo de cantidad y nota',
      },
    ],
  },

  {
    id: 'fel',
    title: 'Facturación electrónica FEL',
    description: 'Emite facturas electrónicas válidas ante el SAT de Guatemala directamente desde tu panel.',
    icon: 'receipt',
    planLevel: 'all',
    moduleKey: 'fel',
    steps: [
      {
        id: 'que-es-fel',
        title: '¿Qué es FEL?',
        description:
          'FEL (Factura Electrónica en Línea) es el sistema del SAT de Guatemala para emitir facturas electrónicas válidas fiscalmente. Si tus clientes te piden factura, este módulo te permite emitirla directamente desde el panel, con el IVA (12%) calculado automáticamente.',
        route: 'Barra lateral → Negocio → Facturación',
        screenshotDesc: 'Panel de facturación con tabs de Emitir, Configuración e Historial',
      },
      {
        id: 'configurar-fiscal',
        title: 'Configura tus datos fiscales',
        description:
          'Antes de emitir la primera factura, ingresa los datos de tu restaurante como emisor: nombre comercial, NIT, dirección fiscal y la serie de facturación que te asignó tu certificador FEL.',
        route: 'Facturación → Tab "Configuración" → Completa todos los campos fiscales → Guardar',
        screenshotDesc: 'Formulario de datos fiscales con campos de NIT, nombre y serie',
      },
      {
        id: 'emitir-desde-pedido',
        title: 'Emite una factura desde un pedido',
        description:
          'Selecciona el pedido a facturar, ingresa el NIT del cliente (o CF para consumidor final) y da clic en "Emitir factura". El sistema genera la factura con el desglose itemizado del pedido y el IVA del 12% calculado.',
        route: 'Facturación → Tab "Emitir" → Selecciona pedido → NIT del cliente → "Emitir"',
        screenshotDesc: 'Formulario de emisión de factura con pedido seleccionado y NIT del cliente',
      },
      {
        id: 'factura-libre',
        title: 'Factura libre (sin pedido)',
        description:
          'Para ventas que no vienen de un pedido en línea (ventas en efectivo en el local, catering, eventos), emite una factura libre ingresando el NIT, el concepto y el monto total.',
        route: 'Facturación → Tab "Emitir" → Sección "Factura libre" → NIT + Concepto + Monto',
        screenshotDesc: 'Formulario de factura libre con campos de concepto y monto',
      },
      {
        id: 'historial-facturas',
        title: 'Historial de facturas',
        description:
          'Consulta todas las facturas emitidas. Puedes filtrar por fecha o número de factura, y descargar el XML o PDF de cualquier factura.',
        route: 'Facturación → Tab "Historial" → Filtros de fecha',
        screenshotDesc: 'Historial de facturas con estados y opciones de descarga',
      },
      {
        id: 'anular',
        title: 'Anula una factura',
        description:
          'Si cometiste un error en una factura, puedes anularla desde el historial dentro de las 48 horas de emisión (límite del SAT). La anulación queda registrada y genera el documento correspondiente.',
        route: 'Facturación → Historial → Clic en la factura → "Anular" → Confirma',
        tip: 'Anula solo si es absolutamente necesario. El SAT lleva registro de todas las anulaciones. Si el error es solo en los datos del cliente, a veces es mejor emitir una nueva factura.',
        screenshotDesc: 'Modal de confirmación de anulación de factura',
      },
    ],
  },

  {
    id: 'proveedores',
    title: 'Proveedores y compras',
    description: 'Lleva el registro de tus proveedores y órdenes de compra de insumos.',
    icon: 'truck',
    planLevel: 'all',
    moduleKey: 'proveedores',
    steps: [
      {
        id: 'que-es',
        title: '¿Para qué sirve el módulo de proveedores?',
        description:
          'Te permite llevar un registro ordenado de las compras que haces a tus proveedores: qué compraste, a quién, cuánto pagaste, cuándo lo pediste y cuándo lo recibiste. Es tu historial de compras centralizado.',
        route: 'Barra lateral → Operación → Proveedores',
        screenshotDesc: 'Panel de proveedores con lista de proveedores y órdenes',
      },
      {
        id: 'nuevo-proveedor',
        title: 'Agrega un proveedor',
        description:
          'Registra los datos de cada proveedor: nombre de la empresa, nombre del contacto, teléfono, correo y qué tipo de productos te surten (ej. "Carnes y embutidos", "Vegetales", "Bebidas").',
        route: 'Proveedores → Tab "Proveedores" → "+ Nuevo proveedor" → Completa los datos',
        screenshotDesc: 'Formulario de nuevo proveedor con datos de contacto',
      },
      {
        id: 'orden-compra',
        title: 'Crea una orden de compra',
        description:
          'Cuando vayas a hacer un pedido a un proveedor, crea una OC. Selecciona el proveedor, agrega los productos con cantidades y precios unitarios. El sistema asigna un folio automático.',
        route: 'Proveedores → Tab "Órdenes" → "+ Nueva orden" → Selecciona proveedor → Agrega productos',
        screenshotDesc: 'Formulario de nueva orden de compra con productos y cantidades',
      },
      {
        id: 'actualizar-estado',
        title: 'Actualiza el estado de la orden',
        description:
          'Cuando recibes la mercadería, cambia la orden a "Recibida". Si el proveedor cancela o hay un problema, cámbiala a "Cancelada". El historial queda registrado para futuras referencias.',
        route: 'Proveedores → Órdenes → Clic en la OC → Cambiar estado',
        screenshotDesc: 'Tarjeta de orden de compra con selector de estado',
      },
    ],
  },

  {
    id: 'encuestas',
    title: 'Encuestas de satisfacción',
    description: 'Conoce la opinión de tus clientes con calificaciones y reseñas automáticas.',
    icon: 'thumbsUp',
    planLevel: 'all',
    moduleKey: 'encuestas',
    steps: [
      {
        id: 'como-dejan',
        title: '¿Cómo dejan reseña tus clientes?',
        description:
          'Después de que un cliente recibe su pedido, puede calificar su experiencia (1 a 5 estrellas) y dejar un comentario. El enlace de reseña aparece en el seguimiento del pedido y en el menú.',
        route: 'Barra lateral → Negocio → Encuestas',
        screenshotDesc: 'Panel de encuestas con métricas de satisfacción y feed de reseñas',
      },
      {
        id: 'ver-metricas',
        title: 'Métricas de satisfacción',
        description:
          'El panel muestra tu calificación promedio general, el promedio del mes actual, el total de reseñas recibidas y la distribución por estrella (cuántos dieron 5★, 4★, 3★, etc.).',
        route: 'Encuestas → Sección de métricas (parte superior del panel)',
        screenshotDesc: 'KPIs de satisfacción: promedio general, este mes, distribución por estrella',
      },
      {
        id: 'ver-resenas',
        title: 'Lee las reseñas de tus clientes',
        description:
          'El feed de reseñas muestra los comentarios más recientes con la calificación, nombre del cliente (si lo proporcionó) y la fecha. Úsalas para identificar qué valoran más y qué mejorar.',
        route: 'Encuestas → Feed de reseñas recientes',
        tip: 'Las reseñas negativas de 1-2 estrellas son las más valiosas para mejorar. Léelas sin defensividad y analiza si hay un patrón.',
        screenshotDesc: 'Feed de reseñas con calificaciones y comentarios de clientes',
      },
    ],
  },

  {
    id: 'reservaciones',
    title: 'Reservaciones de mesa',
    description: 'Gestiona las reservas de tus clientes con un flujo de estados claro.',
    icon: 'calendar',
    planLevel: 'all',
    moduleKey: 'reservaciones',
    steps: [
      {
        id: 'ver-reservaciones',
        title: 'Panel de reservaciones',
        description:
          'El panel muestra las reservas agrupadas por fecha: las de hoy, las pendientes de confirmar y las próximas. Cada reserva incluye el nombre del cliente, teléfono, número de personas, fecha, hora y notas especiales.',
        route: 'Barra lateral → Operación → Reservaciones',
        screenshotDesc: 'Panel de reservaciones con tarjetas agrupadas por fecha',
      },
      {
        id: 'confirmar',
        title: 'Confirma una reservación',
        description:
          'Cuando llega una reserva (hecha en línea o que tú registras manualmente), cámbiala a "Confirmada" para que el cliente sepa que su mesa está asegurada. El cambio de estado es instantáneo.',
        route: 'Reservaciones → Tarjeta de reserva → Botón "Confirmar"',
        screenshotDesc: 'Tarjeta de reservación con botón Confirmar resaltado',
      },
      {
        id: 'registrar-manual',
        title: 'Crea una reserva manual',
        description:
          'Para reservas que llegan por teléfono o en persona, las registras tú directamente. Ingresa nombre, teléfono, número de personas, fecha y hora.',
        route: 'Reservaciones → Tab "Nueva reservación" → Completa el formulario → Guardar',
        screenshotDesc: 'Formulario de nueva reservación manual',
      },
      {
        id: 'estados-reserva',
        title: 'Flujo de estados de una reserva',
        description:
          'Una reserva pasa por los siguientes estados: Pendiente (recién creada) → Confirmada (confirmaste la mesa) → En mesa (llegó el cliente y está sentado) → Completada (terminó su visita) o Cancelada.',
        route: 'Reservaciones → Tarjeta de reserva → Botones de estado en la parte inferior',
        screenshotDesc: 'Flujo de estados de la reservación con botones de avance',
      },
    ],
  },

  {
    id: 'cupones',
    title: 'Cupones y códigos de descuento',
    description: 'Crea y gestiona códigos de descuento que tus clientes usan en el checkout.',
    icon: 'ticket',
    planLevel: 'all',
    moduleKey: 'cupones',
    steps: [
      {
        id: 'nuevo-cupon',
        title: 'Crea un cupón',
        description:
          'Un cupón es un código que el cliente escribe en el checkout para obtener un descuento. Clic en "+ Nuevo cupón", define el código (ej. PROMO20), el tipo de descuento y configura los límites.',
        route: 'Barra lateral → Negocio → Cupones → "+ Nuevo cupón"',
        screenshotDesc: 'Formulario de nuevo cupón con campo de código y configuración',
      },
      {
        id: 'tipos-descuento',
        title: 'Tipos de descuento',
        description:
          'Porcentaje: descuenta un porcentaje del subtotal (ej. 15% off → en un pedido de Q100, descuenta Q15). Monto fijo: descuenta una cantidad exacta (ej. Q20 off → en cualquier pedido, descuenta Q20).',
        route: 'Cupones → Formulario → Campo "Tipo" → Porcentaje o Monto fijo',
        screenshotDesc: 'Selector de tipo de descuento: porcentaje vs monto fijo',
      },
      {
        id: 'limites-cupon',
        title: 'Configura los límites',
        description:
          'Define cuántas veces en total se puede usar el cupón, el monto mínimo de compra para que aplique, y las fechas de vigencia (desde/hasta). Después de la fecha de vencimiento, el sistema rechaza el cupón automáticamente.',
        route: 'Cupones → Formulario → Sección "Restricciones" → Máximo usos, Monto mínimo, Fechas',
        screenshotDesc: 'Campos de restricciones del cupón: límites, mínimo y fechas',
      },
      {
        id: 'estado-cupon',
        title: 'Estado del cupón',
        description:
          'Cada cupón muestra su estado calculado automáticamente: Activo (vigente y con usos disponibles), Vencido (pasó la fecha de fin), Agotado (llegó al máximo de usos), o Pausado (desactivado manualmente).',
        route: 'Cupones → Lista → Columna "Estado" de cada cupón',
        screenshotDesc: 'Lista de cupones con badges de estado de cada uno',
      },
    ],
  },

  {
    id: 'recetas',
    title: 'Recetas e ingredientes',
    description: 'Vincula tus platillos con sus ingredientes para conocer el costo real de cada uno.',
    icon: 'flask',
    planLevel: 'all',
    moduleKey: 'recetas',
    steps: [
      {
        id: 'para-que',
        title: '¿Para qué sirven las recetas?',
        description:
          'Al definir la receta de cada platillo (ingredientes y cantidades), el sistema calcula automáticamente el costo de producción. Así sabes exactamente cuánto te cuesta preparar cada platillo y cuál es tu margen de ganancia real.',
        route: 'Barra lateral → Operación → Ingredientes',
        screenshotDesc: 'Panel de ingredientes con lista y costos',
      },
      {
        id: 'registrar-ingrediente',
        title: 'Registra tus ingredientes',
        description:
          'Primero crea cada ingrediente con nombre, unidad de medida (kg, litro, unidad, etc.) y el costo que pagas por esa unidad. Por ejemplo: "Tomate / kg / Q8.50".',
        route: 'Ingredientes → "+ Nuevo ingrediente" → Nombre + Unidad + Costo por unidad',
        screenshotDesc: 'Formulario de nuevo ingrediente con nombre, unidad y costo',
      },
      {
        id: 'crear-receta',
        title: 'Crea la receta de un platillo',
        description:
          'Edita el producto desde el catálogo. En la sección "Receta", selecciona qué ingredientes lleva y en qué cantidad. Por ejemplo: "Tomate: 0.15 kg".',
        route: 'Catálogo → Editar producto → Sección "Receta" → "+ Agregar ingrediente" → Elige ingrediente + cantidad',
        screenshotDesc: 'Editor de receta con ingredientes y cantidades del platillo',
      },
      {
        id: 'ver-costo',
        title: 'Revisa el costo calculado',
        description:
          'El costo del platillo se calcula sumando el costo de todos sus ingredientes según las cantidades de la receta. El catálogo muestra el precio de venta, el costo y el margen de ganancia en porcentaje.',
        route: 'Catálogo → Columnas "Precio", "Costo" y "Margen" de cada producto',
        tip: 'Un margen saludable en restaurantes suele estar entre 60-70% (el platillo se vende a 3-3.5 veces su costo). Si un platillo tiene menos del 50%, considera ajustar el precio o la receta.',
        screenshotDesc: 'Lista del catálogo con columnas de precio, costo y margen',
      },
    ],
  },
];
