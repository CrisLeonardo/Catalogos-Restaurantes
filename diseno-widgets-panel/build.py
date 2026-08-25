# -*- coding: utf-8 -*-
"""Genera los tableros .dc.html del lienzo de widgets."""

import io
import os

from kit import CHEV, NAV_ICONS, NAV_LABEL, block, group, page, sidebar, topbar
import widgets as W

HERE = os.path.dirname(os.path.abspath(__file__))


def write(name, text):
    with io.open(os.path.join(HERE, name), 'w', encoding='utf-8') as fh:
        fh.write(text)
    print('  %-22s %6d bytes' % (name, len(text.encode('utf-8'))))


# ── Piezas que ya existen hoy en /admin (para el contexto) ────────────

def cab(titulo, sub):
    return ('<div><div class="disp" style="font-size: 26px; line-height: 1.15; color: var(--ink)">%s</div>'
            '<div style="font-size: 14.5px; color: var(--ink3); margin-top: 6px">%s</div></div>'
            % (titulo, sub))


def atencion(filas):
    rows = []
    for tono, titulo, sub, accion in filas:
        rows.append(
            '<div class="row"><span class="dot" style="background: var(--%s); width: 9px; height: 9px"></span>'
            '<div style="flex: 1; min-width: 0"><div class="ttl">%s</div><div class="sub">%s</div></div>'
            '<span class="act" style="font-size: 13.5px">%s</span></div>' % (tono, titulo, sub, accion))
    return block('Necesita tu atención', group(rows))


def resumen(ventas, pedidos, ticket):
    inner = ('<div class="group stat3">'
             '<div><div class="slab">Ventas</div><div class="mono snum" style="font-size: 28px">%s</div></div>'
             '<div><div class="slab">Pedidos</div><div class="mono snum" style="font-size: 28px">%s</div></div>'
             '<div><div class="slab">Ticket promedio</div><div class="mono snum" style="font-size: 28px">%s</div></div>'
             '</div>' % (ventas, pedidos, ticket))
    return block('Resumen del día', inner, 'Ver el mes en Negocio')


def en_curso(filas, total):
    rows = []
    for donde, detalle, tono, estado, monto in filas:
        rows.append(
            '<div class="row" style="padding: 12px 16px">'
            '<div style="width: 96px; flex-shrink: 0; font-size: 14.5px; font-weight: 600; color: var(--ink)">%s</div>'
            '<div style="flex: 1; min-width: 0; font-size: 13.5px; color: var(--ink3)">%s</div>'
            '<div class="pill" style="width: 112px; flex-shrink: 0"><span class="dot" style="background: var(--%s)"></span>%s</div>'
            '<div class="mono" style="width: 92px; text-align: right; flex-shrink: 0; font-size: 14.5px; color: var(--ink)">%s</div>'
            '<div style="margin-left: 4px">%s</div></div>'
            % (donde, detalle, tono, estado, monto, CHEV))
    return block('En curso', group(rows), 'Ver los %d pedidos' % total)


def pantalla(tema, activo, titulo_barra, bloques, ancho=1280, alto=1200, badge=None, cta='Tomar pedido'):
    cuerpo = '<div style="display: flex; flex-direction: column; gap: 24px">%s</div>' % ''.join(bloques)
    return ("""<div class="sc" data-t="%s" style="width: %dpx; min-height: %dpx; display: flex; background: var(--bg); color: var(--ink)">
%s
  <div style="flex: 1; min-width: 0; display: flex; flex-direction: column">
%s
    <div style="padding: 28px 32px 32px">%s</div>
  </div>
</div>""" % (tema, ancho, alto, sidebar(activo, badge), topbar(titulo_barra, cta), cuerpo))


# ── 1 · Hoy, un jueves ocupado ────────────────────────────────────────

def main_dc():
    cuerpo = [
        cab('Hoy', 'Jueves 21 de agosto · abierto desde las 11:00'),
        atencion([('warn', 'La PC del local dejó de responder',
                   'Hace 20 minutos. No se imprimen comandas solas.', 'Revisar')]),
        resumen('Q3,480.00', '24', 'Q145.00'),
        en_curso([
            ('Mesa 4', '2 Carne asada · 1 Limonada · hace 2 min', 'acc-ink', 'Nuevo', 'Q210.00'),
            ('Llevar', 'Ana L. · 1 Hamburguesa doble · hace 6 min', 'warn', 'En cocina', 'Q95.00'),
            ('Domicilio', 'Zona 10 · reparte Luis M. · hace 12 min', 'ok', 'Listo', 'Q180.00'),
        ], 8),
        W.ritmo(),
        W.top_platillos(),
        W.casa(),
    ]
    return page(1280, 1330, pantalla('light', 'hoy', 'Hoy', cuerpo, alto=1330, badge='8'))


# ── 2 · Hoy de noche, en oscuro ───────────────────────────────────────

def hoy_oscuro():
    cuerpo = [
        cab('Hoy', 'Jueves 21 de agosto · cierra a las 22:00'),
        # Sin "Necesita tu atención": a esta hora no hay nada roto y el
        # bloque entero desaparece, igual que ya hace hoy.
        resumen('Q7,920.00', '58', 'Q136.55'),
        en_curso([
            ('Mesa 9', '4 Carne asada · 2 Cerveza · hace 3 min', 'acc-ink', 'Nuevo', 'Q420.00'),
            ('Domicilio', 'Zona 15 · sin repartidor asignado · hace 11 min', 'warn', 'En cocina', 'Q265.00'),
        ], 5),
        W.ritmo(7920,
                'Un día como hoy a esta hora va en <span class="mono">Q7,050.00</span>. '
                'Vas <span class="mono" style="color: var(--ok)">12%</span> arriba.'),
        W.casa(),
        W.stock(),
    ]
    return page(1280, 1120, pantalla('dark', 'hoy', 'Hoy', cuerpo, alto=1120, badge='5'))


# ── 3 · Hoy, un martes tranquilo ──────────────────────────────────────

def hoy_tranquilo():
    r = ('<div class="row"><div class="mono" style="width: 71px; flex-shrink: 0; font-size: 15px; color: var(--ink2)">20:00</div>'
         '<div style="flex: 1; min-width: 0"><div class="ttl">Cumpleaños Morales · 8 personas</div>'
         '<div class="sub">La única reserva de hoy. Pidieron mesa en la terraza.</div></div>%s</div>' % CHEV)
    cuerpo = [
        cab('Hoy', 'Martes 19 de agosto · abre en 45 minutos'),
        resumen('Q0.00', '0', 'Q0.00'),
        W.ritmo(0,
                'Todavía no abres. Un martes normal cierras cerca de <span class="mono">Q5,300.00</span>.'),
        W.online('41', '38', '0%',
                 'Cuarenta y una personas ya vieron tu menú antes de que abras.'),
        block('La casa', group([r]), 'Ver mesas'),
    ]
    return page(1280, 850, pantalla('light', 'hoy', 'Hoy', cuerpo, alto=850, cta=None))


# ── 4 · El catálogo ───────────────────────────────────────────────────

def catalogo():
    fichas = [
        (W.ritmo(), 'Siempre que haya pedidos en los últimos 14 días.',
         'Contesta “¿vamos bien?” sin abrir Negocio. No repite el total de hoy —lo tiene justo '
         'arriba, en “Resumen del día”—: lo que añade es con qué compararlo, y la comparación es '
         'contra lo que un día igual llevaba A ESTA HORA, no contra su cierre. La gráfica sale de '
         '<b>getOrderStats</b>, que ya la calculaba y la tiraba a la basura.'),
        (W.top_platillos(), 'Cuando ya hubo al menos un pedido hoy.',
         'Sirve para decidir qué preparar en la siguiente tanda. <b>topToday</b> también sale ya '
         'calculado de la misma consulta.'),
        (W.casa(), 'Con “comer en local” activo, y solo las filas que tengan algo: mesas ocupadas, '
         'gente esperando, reservas de hoy.',
         'Tres módulos en un widget y no tres widgets: quien mira la sala tiene una sola pregunta.'),
        (W.stock(), 'Con inventario activo y al menos un platillo bajo o agotado.',
         'Habla de EXISTENCIAS, no de si el platillo se ve en el menú: son dos preguntas distintas '
         '—lo marcado agotado vuelve solo a las doce horas— y la segunda la contesta el widget de '
         'la pantalla Menú.'),
        (W.opiniones(), 'Con encuestas activas y 3 o más opiniones en la semana.',
         'Semanal, no diario: por eso va abajo. Con menos de tres el widget no aparece — una sola '
         'opinión no dice nada y ocuparía el mismo espacio que un dato de verdad.'),
        (W.online(), 'Siempre que el menú haya recibido visitas hoy.',
         'En el plan Básico —sin pedidos en línea— este es el <b>único</b> widget que aparece, y sin '
         'él esa portada se ve completamente vacía. La columna “Piden” solo sale si hay pedidos.'),
    ]
    partes = []
    for pieza, cuando, por_que in fichas:
        partes.append(
            '<div>%s<div class="when"><span style="flex-shrink: 0; color: var(--ink4)">Aparece</span>'
            '<span><b>%s</b> %s</span></div></div>' % (pieza, cuando, por_que))
    cuerpo = """<div class="sc" data-t="light" style="width: 880px; min-height: 1800px; background: var(--bg); color: var(--ink); padding: 40px">
  <div class="disp" style="font-size: 24px; line-height: 1.15">Los seis widgets de Hoy</div>
  <div style="font-size: 14px; color: var(--ink3); margin-top: 8px; max-width: 640px; line-height: 1.5">
    En orden de aparición. Ninguno se configura y ninguno se pinta vacío: si no tiene nada que decir,
    ese día no existe. Un jueves lleno se ven tres o cuatro; un martes a las diez de la mañana, uno.
  </div>
  <div style="display: flex; flex-direction: column; gap: 28px; margin-top: 26px">%s</div>
</div>""" % ''.join(partes)
    return page(880, 1800, cuerpo)


# ── 5 · Anatomía y reglas ─────────────────────────────────────────────

def anatomia():
    def callout(n, titulo, texto):
        return ('<div style="display: flex; gap: 12px">'
                '<div class="mono" style="width: 20px; height: 20px; flex-shrink: 0; border-radius: 99px; '
                'background: var(--acc); color: #fff; font-size: 11px; display: grid; place-items: center">%d</div>'
                '<div style="flex: 1; min-width: 0"><div style="font-size: 13.5px; font-weight: 600; color: var(--ink)">%s</div>'
                '<div style="font-size: 13px; color: var(--ink3); margin-top: 2px; line-height: 1.5">%s</div></div></div>'
                % (n, titulo, texto))

    reglas = [
        ('Un widget aparece solo cuando tiene algo que decir',
         'Sin datos no hay tarjeta vacía: no hay tarjeta. Es la misma regla que ya sigue “Necesita tu '
         'atención”, que desaparece entero cuando no hay avisos.'),
        ('Nadie lo configura',
         'No hay pantalla de “personalizar Hoy”, ni arrastrar, ni marcar casillas. El restaurante que '
         'compra Leogin no quiere armar un tablero, quiere abrir el panel y ver cómo va el día.'),
        ('Un widget, una pregunta',
         '¿Vamos bien? ¿Qué preparo? ¿Cómo está la sala? ¿Qué se está acabando? Si un widget contesta '
         'dos preguntas, son dos widgets — o ninguno.'),
        ('Máximo una acción',
         'La misma regla que ya tiene <b>Section</b>: un enlace a la derecha del rótulo. Si hace falta un '
         'segundo, es que la sección está haciendo demasiado.'),
        ('El color va en el dato, no en la tarjeta',
         'Ninguna tarjeta se tiñe de ámbar ni de rojo. Se tiñe la cifra o el punto, como ya hace '
         '<b>Stat</b> con <b>tone</b>. Cinco tarjetas de colores compiten entre ellas y pierde el ojo.'),
        ('Todo número en mono tabular',
         'JetBrains Mono con <b>tabular-nums</b>, igual que el resto del panel: las cifras se alinean solas '
         'y no bailan al actualizarse en vivo.'),
        ('Orden fijo por urgencia',
         'Lo que se rompe, arriba. Lo que sirve para decidir, en medio. Lo que se mira una vez por semana, '
         'abajo. El orden no cambia entre restaurantes, así que se aprende una sola vez.'),
        ('En el teléfono es la misma pieza',
         'No hay una versión móvil aparte: el mismo bloque a lo ancho, con las tres columnas de cifras '
         'reducidas a dos —y la impar ocupando el renglón entero, sin medio hueco— y el resto igual. '
         'Ninguna fila baja de 44 px.'),
        ('Manda el ancho del CONTENEDOR, no el de la pantalla',
         'La gráfica de 14 días vive en la columna de Hoy (~970 px) y también en la de Pedidos '
         '(300 px). Un punto de ruptura no sirve: en esa columna estrecha, dentro de un monitor '
         'grande, cualquier media query diría “escritorio”. Se resuelve con mínimos y salto de '
         'renglón — y los mínimos van en las DOS columnas, porque si una puede encogerse hasta cero '
         'el navegador siempre “encuentra sitio” y acaba recortando el texto en vez de bajarlo.'),
    ]
    lista = ''.join(callout(i + 1, t, d) for i, (t, d) in enumerate(reglas))

    marcado = """<div style="position: relative">
  %s
  <div style="position: absolute; left: -14px; top: 0; bottom: 0; width: 3px; background: var(--acc); border-radius: 2px; opacity: 0.5"></div>
</div>""" % W.casa()

    partes = """<div class="sc" data-t="light" style="width: 900px; min-height: 1290px; background: var(--bg); color: var(--ink); padding: 40px 52px">
  <div class="disp" style="font-size: 24px; line-height: 1.15">Anatomía y reglas</div>
  <div style="font-size: 14px; color: var(--ink3); margin-top: 8px; max-width: 620px; line-height: 1.5">
    Un widget no es una pieza nueva: es un bloque del panel, con el mismo rótulo, la misma tarjeta
    agrupada y las mismas filas que ya usan Pedidos, Menú y Ajustes. Por eso no se ve como un injerto.
  </div>

  <div style="margin-top: 30px; padding: 0 14px">%s</div>

  <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px 26px; margin-top: 22px; padding-top: 20px; border-top: 1px solid var(--hair)">
    <div><div style="font-size: 12.5px; font-weight: 600; color: var(--ink2)">Rótulo</div><div style="font-size: 12.5px; color: var(--ink3); line-height: 1.5; margin-top: 3px">12,5 px, peso 600, <span class="mono" style="font-size: 11.5px">--ink3</span>. La clase <b style="color: var(--ink2)">.adm-label</b>, sin mayúsculas ni espaciado.</div></div>
    <div><div style="font-size: 12.5px; font-weight: 600; color: var(--ink2)">Tarjeta</div><div style="font-size: 12.5px; color: var(--ink3); line-height: 1.5; margin-top: 3px">Radio 12 px, borde de un pelo, sombra <span class="mono" style="font-size: 11.5px">--adm-shadow-sm</span>. Es <b style="color: var(--ink2)">&lt;List&gt;</b> tal cual.</div></div>
    <div><div style="font-size: 12.5px; font-weight: 600; color: var(--ink2)">Filas</div><div style="font-size: 12.5px; color: var(--ink3); line-height: 1.5; margin-top: 3px">44 px mínimo, 13/16 de relleno, divisoria puesta por el contenedor y sangrada 16 px.</div></div>
    <div><div style="font-size: 12.5px; font-weight: 600; color: var(--ink2)">Columna guía</div><div style="font-size: 12.5px; color: var(--ink3); line-height: 1.5; margin-top: 3px">Lo de la izquierda de cada fila mide siempre lo mismo dentro del widget: 71 px aquí. Así las filas se leen en columna.</div></div>
    <div><div style="font-size: 12.5px; font-weight: 600; color: var(--ink2)">Separación</div><div style="font-size: 12.5px; color: var(--ink3); line-height: 1.5; margin-top: 3px">24 px entre bloques, los mismos que ya separan “Resumen del día” de “En curso”.</div></div>
    <div><div style="font-size: 12.5px; font-weight: 600; color: var(--ink2)">Ancho</div><div style="font-size: 12.5px; color: var(--ink3); line-height: 1.5; margin-top: 3px">El de la columna de contenido, con tope en 1040 px. Un widget nunca es media columna.</div></div>
  </div>

  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px 34px; margin-top: 26px; padding-top: 22px; border-top: 1px solid var(--hair)">%s</div>
</div>""" % (marcado, lista)
    return page(900, 1290, partes)


# ── 6 · En el teléfono ────────────────────────────────────────────────

def movil():
    def nav(activo='hoy'):
        items = []
        for key in ('hoy', 'pedidos', 'menu', 'clientes', 'negocio', 'ajustes'):
            on = key == activo
            color = 'var(--acc-ink)' if on else 'var(--ink3)'
            peso = '600' if on else '500'
            items.append(
                '<div style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; '
                'justify-content: center; gap: 3px; padding: 5px 2px; color: %s">'
                '<svg class="i" viewBox="0 0 24 24" style="width: 19px; height: 19px; flex: none">%s</svg>'
                '<span style="font-size: 10px; font-weight: %s; line-height: 1.2">%s</span></div>'
                % (color, NAV_ICONS[key], peso, NAV_LABEL[key]))
        return ('<div style="display: flex; align-items: stretch; padding: 6px 4px 10px; '
                'border-top: 1px solid var(--hair); background: var(--side)">%s</div>' % ''.join(items))

    def barra(titulo):
        return ('<div style="min-height: 54px; display: flex; align-items: center; gap: 6px; '
                'padding: 0 12px 0 16px; border-bottom: 1px solid var(--hair); background: var(--bg)">'
                '<div style="flex: 1; font-size: 19px; font-weight: 600; color: var(--ink)">%s</div>'
                '<div class="ghost" style="width: 34px; height: 34px; border: none">'
                '<svg class="i" viewBox="0 0 24 24"><path d="M5 12h.01M12 12h.01M19 12h.01"></path></svg></div></div>'
                % titulo)

    def telefono(titulo, contenido, alto):
        return ("""<div style="width: 372px; min-height: %dpx; display: flex; flex-direction: column; border: 1px solid var(--hair2); border-radius: 26px; overflow: hidden; background: var(--bg); box-shadow: 0 18px 44px rgba(0,0,0,0.10)">
  %s
  <div style="flex: 1; padding: 16px 14px 18px; display: flex; flex-direction: column; gap: 20px">%s</div>
  %s
</div>""" % (alto, barra(titulo), contenido, nav()))

    # Cifras a dos columnas: es lo que hace de verdad StatGroup en un
    # teléfono (auto-fit con mínimo de 170 px). La tercera se va abajo,
    # a lo ancho, con su divisoria arriba en vez de a la izquierda.
    def cifras2(a, b, c):
        celda = ('<div style="padding: 13px 16px"><div class="slab" style="font-size: 12.5px">%s</div>'
                 '<div class="mono" style="font-size: 22px; color: var(--ink); margin-top: 4px">%s</div></div>')
        return ('<div class="group">'
                '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr))">'
                '%s<div style="border-left: 1px solid var(--hair)">%s</div></div>'
                '<div class="hrf"></div>%s</div>'
                % (celda % a, (celda % b).replace('<div style="padding: 13px 16px">', '<div style="padding: 13px 16px">'),
                   celda % c))

    # En el teléfono la pieza es la MISMA, solo que la gráfica se baja al
    # renglón de abajo y las barras se estiran para llenar el ancho. No hay
    # versión móvil aparte: lo decide el ancho del contenedor.
    ritmo_movil = W.ritmo(3480, apilado=True)
    ritmo_movil_quieto = W.ritmo(
        0,
        'Todavía no abres. Un martes normal cierras cerca de <span class="mono">Q5,300.00</span>.',
        apilado=True)

    top_movil = []
    for nombre, qty, pct in (('Carne asada', 14, 100), ('Pollo a la plancha', 11, 79),
                             ('Hamburguesa doble', 9, 64)):
        top_movil.append(
            '<div class="row" style="padding: 11px 16px; min-height: 44px; gap: 10px">'
            '<div style="flex: 1; min-width: 0; font-size: 14px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis">%s</div>'
            '<div class="track" style="width: 72px; flex-shrink: 0"><i style="width: %d%%"></i></div>'
            '<div class="mono" style="width: 24px; text-align: right; flex-shrink: 0; font-size: 14px; color: var(--ink)">%d</div>'
            '</div>' % (nombre, pct, qty))

    dots = ''.join('<i%s></i>' % (' data-on="1"' if i < 7 else '') for i in range(12))
    casa_movil = group([
        ('<div class="row" style="gap: 12px"><div class="tables">%s</div>'
         '<div style="flex: 1; min-width: 0"><div class="ttl">7 de 12 mesas</div>'
         '<div class="sub">La 4 lleva 1 h 20 min sin pedir.</div></div>%s</div>' % (dots, CHEV)),
        ('<div class="row" style="gap: 12px"><div class="mono" style="width: 52px; flex-shrink: 0; font-size: 20px; color: var(--ink)">3</div>'
         '<div style="flex: 1; min-width: 0"><div class="ttl">Esperando mesa</div>'
         '<div class="sub">El primero, hace 14 min.</div></div>'
         '<span class="act" style="font-size: 13.5px">Avisar</span></div>'),
        ('<div class="row" style="gap: 12px"><div class="mono" style="width: 52px; flex-shrink: 0; font-size: 14px; color: var(--ink2)">19:00</div>'
         '<div style="flex: 1; min-width: 0"><div class="ttl">Familia Pérez · 4</div>'
         '<div class="sub">Y otra de 2 a las 20:30.</div></div>%s</div>' % CHEV),
    ])

    ocupado = ''.join([
        block('Necesita tu atención', group([
            '<div class="row"><span class="dot" style="background: var(--warn); width: 9px; height: 9px"></span>'
            '<div style="flex: 1; min-width: 0"><div class="ttl">La PC dejó de responder</div>'
            '<div class="sub">No se imprimen comandas solas.</div></div>'
            '<span class="act" style="font-size: 13.5px">Ver</span></div>'])),
        block('Resumen del día', cifras2(('Ventas', 'Q3,480'), ('Pedidos', '24'), ('Ticket promedio', 'Q145.00'))),
        block('En curso', group([
            '<div class="row" style="gap: 10px"><div style="flex: 1; min-width: 0">'
            '<div class="ttl">Mesa 4 · <span class="mono" style="font-weight: 600">Q210.00</span></div>'
            '<div class="sub">2 Carne asada · hace 2 min</div></div>'
            '<div class="pill" style="flex-shrink: 0"><span class="dot" style="background: var(--acc-ink)"></span>Nuevo</div></div>',
            '<div class="row" style="gap: 10px"><div style="flex: 1; min-width: 0">'
            '<div class="ttl">Llevar · <span class="mono" style="font-weight: 600">Q95.00</span></div>'
            '<div class="sub">Ana L. · hace 6 min</div></div>'
            '<div class="pill" style="flex-shrink: 0"><span class="dot" style="background: var(--warn)"></span>En cocina</div></div>',
        ]), 'Ver los 8'),
        ritmo_movil,
        block('Lo que más sale hoy', group(top_movil)),
        block('La casa', casa_movil, 'Ver mesas'),
    ])

    tranquilo = ''.join([
        block('Resumen del día', cifras2(('Ventas', 'Q0.00'), ('Pedidos', '0'), ('Ticket promedio', 'Q0.00'))),
        ritmo_movil_quieto,
        W.online('41', '38', '0%',
                 'Cuarenta y una personas ya vieron tu menú antes de que abras.',
                 dos_columnas=True),
    ])

    cuerpo = """<div class="sc" data-t="light" style="width: 1000px; min-height: 1600px; background: var(--bg); color: var(--ink); padding: 40px">
  <div class="disp" style="font-size: 24px; line-height: 1.15">En el teléfono</div>
  <div style="font-size: 14px; color: var(--ink3); margin-top: 8px; max-width: 620px; line-height: 1.5">
    El mismo bloque, a lo ancho. Dos bandas de armazón —el nombre de la pantalla arriba, los destinos
    abajo— y nada más. No se dibuja barra de estado ni teclado: eso lo pone el sistema encima.
  </div>
  <div style="display: flex; gap: 44px; margin-top: 28px; align-items: flex-start">
    <div>%s<div class="cap" style="max-width: 372px; padding-top: 12px">Jueves 20:10. Seis bloques, todos a lo ancho.</div></div>
    <div>%s<div class="cap" style="max-width: 372px; padding-top: 12px">Martes 10:15, el mismo panel. Tres bloques y se acabó: lo demás no tiene nada que decir todavía.</div></div>
  </div>
</div>""" % (telefono('Hoy', ocupado, 1349), telefono('Hoy', tranquilo, 913))
    return page(1000, 1600, cuerpo)


# ── 7 · En otras pantallas ────────────────────────────────────────────

def otras():
    fichas = [
        ('Pedidos', 'Justo debajo de las cifras del día.', W.tiempos(),
         'La cocina no sabe si va lenta hasta que alguien se queja. Contesta la otra mitad de la '
         'pregunta de arriba: cuánto se vendió y cuánto se hizo esperar a la gente por ello. Sale '
         'de <b>created_at</b> y de la marca de cierre de los pedidos que la pantalla ya carga.'),
        ('Menú', 'Arriba de la lista, solo si hay algo que no se pueda pedir.', W.apagados(),
         'Un platillo marcado agotado desaparece de la vista del comensal, así que nadie echa de '
         'menos lo que no ve. Solo entra lo que está fuera EN ESTE MOMENTO: lo marcado hace más de '
         'doce horas ya volvió solo al menú, y anunciarlo como apagado sería mentirle al '
         'restaurante.'),
        ('Clientes', 'No lleva widget: crece el resumen que ya estaba.', W.vuelven(),
         'Esta pantalla YA tenía un “Resumen” con dos de los tres números. Añadirle un bloque '
         'aparte habría sido decir lo mismo dos veces, así que se le sumaron la cifra que faltaba '
         '—cuántos vuelven— y la comparación de gasto. Sale del mapa por cliente que '
         '<b>getCustomersSummary</b> ya armaba: cero consultas nuevas. Por debajo de cinco '
         'compradores no se enseña, porque “vuelve el 0%” calculado sobre una persona no es un dato.'),
    ]
    partes = []
    for pantalla_nombre, donde, pieza, por_que in fichas:
        partes.append(
            '<div><div style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px">'
            '<div style="font-size: 15px; font-weight: 600; color: var(--ink)">%s</div>'
            '<div style="font-size: 12.5px; color: var(--ink3)">%s</div></div>%s'
            '<div class="cap">%s</div></div>' % (pantalla_nombre, donde, pieza, por_que))
    cuerpo = """<div class="sc" data-t="light" style="width: 900px; min-height: 980px; background: var(--bg); color: var(--ink); padding: 40px">
  <div class="disp" style="font-size: 24px; line-height: 1.15">Fuera de Hoy</div>
  <div style="font-size: 14px; color: var(--ink3); margin-top: 8px; max-width: 620px; line-height: 1.5">
    Dos pantallas más se ganan un widget, y una tercera no lo necesita: ya tenía dónde crecer.
    En las tres, la pregunta que contestan no se responde mirando la lista que está debajo.
    Negocio y Ajustes no llevan nada.
  </div>
  <div style="display: flex; flex-direction: column; gap: 30px; margin-top: 26px">%s</div>
</div>""" % ''.join(partes)
    return page(900, 980, cuerpo)


CANVAS = """{
  "pages": [
    { "id": "hoy", "name": "Hoy" },
    { "id": "widgets", "name": "Los widgets" },
    { "id": "movil", "name": "En el teléfono" },
    { "id": "otras", "name": "Otras pantallas" }
  ],
  "artboards": [
    { "file": "Main.dc.html", "title": "Hoy · jueves ocupado", "page": "hoy", "x": 0, "y": 0, "w": 1280, "h": 1330 },
    { "file": "HoyOscuro.dc.html", "title": "Hoy · la noche, en oscuro", "page": "hoy", "x": 1360, "y": 0, "w": 1280, "h": 1120 },
    { "file": "HoyTranquilo.dc.html", "title": "Hoy · martes tranquilo", "page": "hoy", "x": 2720, "y": 0, "w": 1280, "h": 850 },
    { "file": "Catalogo.dc.html", "title": "Los seis widgets", "page": "widgets", "x": 0, "y": 0, "w": 880, "h": 1800 },
    { "file": "Anatomia.dc.html", "title": "Anatomía y reglas", "page": "widgets", "x": 960, "y": 0, "w": 900, "h": 1290 },
    { "file": "Movil.dc.html", "title": "En el teléfono", "page": "movil", "x": 0, "y": 0, "w": 1000, "h": 1600 },
    { "file": "Otras.dc.html", "title": "Fuera de Hoy", "page": "otras", "x": 0, "y": 0, "w": 900, "h": 980 }
  ],
  "annotations": [
    { "id": "nota-orden", "page": "hoy", "x": 0, "y": -170, "w": 420, "text": "Los tres bloques de arriba son los que YA existen y no se tocan: atención, resumen y en curso. Los widgets entran DEBAJO, nunca por delante de un aviso." },
    { "id": "nota-noche", "page": "hoy", "x": 1360, "y": -170, "w": 420, "text": "Mismo panel a las nueve de la noche. Ya no hay bloque de avisos: no hay nada roto y desaparece entero. Aparece \\"Se está acabando\\" y ya no está \\"Lo que más sale\\", porque a esa hora ya no se decide qué preparar. Claro y oscuro son el MISMO marcado: solo cambian las variables de color." },
    { "id": "nota-tranquilo", "page": "hoy", "x": 2720, "y": -170, "w": 420, "text": "Este es el tablero que prueba la regla: martes, diez de la mañana, cero pedidos. Tres bloques y la pantalla termina. Un tablero configurable habría dejado seis tarjetas vacías." },
    { "id": "nota-datos", "page": "widgets", "x": 0, "y": -150, "w": 420, "text": "Cinco de los seis salen de consultas que el panel YA hace en /admin. La serie de 14 días y el top de hoy los calcula getOrderStats y hoy se descartan sin usarse: ese widget no cuesta ni una consulta más." },
    { "id": "nota-basico", "page": "widgets", "x": 960, "y": -150, "w": 420, "text": "Hueco que esto tapa: en el plan Básico (sin pedidos en línea) la portada Hoy se ve HOY completamente vacía, porque el resumen del día depende del módulo de pedidos. Con \\"Tu menú en línea\\" ya no." },
    { "id": "nota-cifras", "page": "movil", "x": 0, "y": -170, "w": 420, "text": "Detalle CORREGIDO al construirlo: StatGroup repartía las columnas con auto-fit y le ponía borde izquierdo a todo hijo que no fuera el primero, así que la tercera cifra, al bajar sola al segundo renglón del teléfono, arrastraba una rayita suelta a su izquierda. Ahora la rejilla lleva el número EXACTO de columnas y reglas de divisoria distintas para teléfono y escritorio." },
    { "id": "nota-compartida", "page": "otras", "x": 0, "y": -300, "w": 420, "text": "La gráfica de 14 días y \\"Lo que más sale hoy\\" son UNA sola pieza compartida con Hoy. Pedidos tenía sus propias copias, con el aspecto anterior al rediseño; se borraron. Ojo al construirla: vive en la columna de Hoy (~970 px) y en la de Pedidos (300 px), así que no puede usar puntos de ruptura — en una columna de 300 px dentro de un monitor grande, cualquier media query dice \\"escritorio\\". Lo que manda es el ancho del CONTENEDOR." },
    { "id": "nota-otras", "page": "otras", "x": 480, "y": -300, "w": 420, "text": "La tentación es poner un widget en cada pantalla. Negocio y Ajustes no llevan: Negocio ES el tablero de números, y en Ajustes cada fila ya muestra su estado a la derecha." }
  ],
  "launch": { "view": "canvas", "page": "hoy" }
}
"""

if __name__ == '__main__':
    print('Tableros:')
    write('Main.dc.html', main_dc())
    write('HoyOscuro.dc.html', hoy_oscuro())
    write('HoyTranquilo.dc.html', hoy_tranquilo())
    write('Catalogo.dc.html', catalogo())
    write('Anatomia.dc.html', anatomia())
    write('Movil.dc.html', movil())
    write('Otras.dc.html', otras())
    write('canvas.json', CANVAS)
