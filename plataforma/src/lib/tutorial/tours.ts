/* ============================================================
   Tours guiados — "Muéstramelo en mi panel"
   ------------------------------------------------------------
   Reemplazo de las capturas de pantalla del centro de ayuda: en
   vez de mantener imágenes que caducan con cada cambio de UI, la
   ayuda SEÑALA la interfaz real con un spotlight (mismo mecanismo
   del tour de bienvenida) y navega entre páginas del panel.

   · Cada tour pertenece a una sección del centro de ayuda
     (TUTORIAL_SECTIONS.id) y se ofrece ahí como botón.
   · `target` apunta a un [data-tour-step="..."] del DOM. Los ítems
     del sidebar ya lo traen (key del nav); los botones/paneles
     clave de cada página se etiquetan a mano.
   · `path` es la ruta donde vive el paso: el motor navega solo.
   · Si el target no existe (módulo apagado, plan menor, móvil),
     el motor muestra la burbuja centrada sin spotlight — el tour
     NUNCA se rompe, solo pierde el señalamiento.
   ============================================================ */

export interface GuidedTourStep {
  /** Valor de data-tour-step a señalar; null = burbuja centrada. */
  target: string | null;
  /** Ruta del panel donde vive el paso (el motor navega si hace falta). */
  path: string;
  title: string;
  desc: string;
}

export interface GuidedTourDef {
  /** Coincide con TUTORIAL_SECTIONS.id para ofrecerlo en esa sección. */
  id: string;
  /** Nombre corto para el botón ("Ver en mi panel: Catálogo"). */
  label: string;
  steps: GuidedTourStep[];
}

export const GUIDED_TOURS: GuidedTourDef[] = [
  {
    id: 'catalogo',
    label: 'Catálogo',
    steps: [
      {
        target: 'catalogo',
        path: '/admin/menu',
        title: 'Tu catálogo vive aquí',
        desc: 'En esta sección del menú lateral encuentras todos tus platillos y bebidas. Vamos a verla.',
      },
      {
        target: 'catalogo-nuevo',
        path: '/admin/menu',
        title: 'Crea un platillo nuevo',
        desc: 'Con este botón agregas un producto: nombre, precio, foto, descripción y sus opciones (tamaños, extras). Queda visible en tu menú digital al instante.',
      },
      {
        target: null,
        path: '/admin/menu',
        title: 'Disponibilidad y orden',
        desc: 'En la lista, el interruptor de cada platillo lo publica u oculta sin borrarlo (útil cuando algo se agota), y arrastrando desde el ícono ≡ cambias el orden en que los ve tu cliente.',
      },
    ],
  },
  {
    id: 'categorias',
    label: 'Categorías',
    steps: [
      {
        target: 'categorias',
        path: '/admin/categorias',
        title: 'Categorías del menú',
        desc: 'Las categorías agrupan tus platillos (Entradas, Platos fuertes, Bebidas…). Tu cliente las ve como pestañas para llegar rápido a lo que busca.',
      },
      {
        target: 'categorias-nueva',
        path: '/admin/categorias',
        title: 'Crea una categoría',
        desc: 'Escribe el nombre (el ícono se sugiere solo) y guarda. Si la categoría es un menú por horario (ej. Desayunos), aquí mismo defines su franja.',
      },
      {
        target: null,
        path: '/admin/categorias',
        title: 'El orden importa',
        desc: 'Arrastra las categorías para ordenarlas: el mismo orden que ves aquí es el que verá tu cliente. Pon las más vendidas al inicio.',
      },
    ],
  },
  {
    id: 'personalizar',
    label: 'Personalización',
    steps: [
      {
        target: 'personalizar',
        path: '/admin/personalizacion',
        title: 'La identidad de tu menú',
        desc: 'Aquí controlas cómo se ve tu menú digital: logo, colores, tipografía, fondo y textos. El panel admin no cambia — solo lo que ven tus clientes.',
      },
      {
        target: 'personalizar-tabs',
        path: '/admin/personalizacion',
        title: 'Todo organizado en pestañas',
        desc: 'Identidad (logo y nombre), Color, Tipografía, Fondo, Portada, Catálogo… explóralas: cada cambio se refleja en la vista previa antes de guardar.',
      },
      {
        target: 'personalizar-guardar',
        path: '/admin/personalizacion',
        title: 'Guarda y publica',
        desc: 'Nada cambia para tus clientes hasta que tocas "Guardar cambios". Después de guardar, escanea tu QR para verlo tal como lo verán ellos.',
      },
    ],
  },
  {
    id: 'qr',
    label: 'Código QR',
    steps: [
      {
        target: 'qr',
        path: '/admin/qr',
        title: 'Tu puerta de entrada',
        desc: 'El QR conecta a tus clientes con tu menú. Esta sección tiene todo lo necesario para compartirlo.',
      },
      {
        target: 'qr-enlace',
        path: '/admin/qr',
        title: 'El enlace directo',
        desc: 'Este es el enlace de tu menú. Cópialo y compártelo por WhatsApp, Instagram o donde quieras — funciona igual que el QR.',
      },
      {
        target: 'qr-descargar',
        path: '/admin/qr',
        title: 'Descárgalo e imprímelo',
        desc: 'Descarga el PNG en alta resolución e imprímelo mínimo a 8×8 cm: sobre las mesas, en la vitrina y en el empaque para llevar.',
      },
    ],
  },
  {
    id: 'perfil',
    label: 'Perfil',
    steps: [
      {
        target: 'perfil',
        path: '/admin/perfil',
        title: 'Los datos de tu restaurante',
        desc: 'Nombre, dirección, WhatsApp, horarios y zona de entrega: todo lo operativo vive en el perfil.',
      },
      {
        target: 'perfil-whatsapp',
        path: '/admin/perfil',
        title: 'Tu WhatsApp',
        desc: 'Con tu número aquí, tus clientes pueden contactarte desde el menú con un toque. Formato: 8 dígitos o con el +502 delante.',
      },
      {
        target: 'perfil-pausa',
        path: '/admin/perfil',
        title: 'Pausa de emergencia',
        desc: '¿Cocina saturada o se fue el gas? Este interruptor pausa los pedidos al instante sin tocar tus horarios. Recuerda reanudar: no se quita solo.',
      },
    ],
  },
  {
    id: 'panel-pedidos',
    label: 'Pedidos',
    steps: [
      {
        target: 'pedidos',
        path: '/admin/pedidos',
        title: 'Pedidos en tiempo real',
        desc: 'Cada pedido nuevo aparece aquí al instante, sin recargar la página, con sonido de alerta para que no se te escape ninguno.',
      },
      {
        target: null,
        path: '/admin/pedidos',
        title: 'Avanza los estados',
        desc: 'Cada tarjeta lleva su pedido por el flujo Nuevo → En preparación → Listo → Entregado. Tu cliente ve el avance en vivo desde su enlace de seguimiento, así dejas de recibir mensajes de "¿ya va?".',
      },
      {
        target: 'cocina',
        path: '/admin/pedidos',
        title: 'Y para la cocina…',
        desc: 'La pantalla de Cocina (KDS) muestra solo lo que hay que preparar, con semáforo de tiempos, pensada para una tablet en la cocina.',
      },
    ],
  },
];

export function getGuidedTour(id: string): GuidedTourDef | null {
  return GUIDED_TOURS.find((t) => t.id === id) ?? null;
}
