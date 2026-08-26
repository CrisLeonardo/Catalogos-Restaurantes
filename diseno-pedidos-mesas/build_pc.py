# -*- coding: utf-8 -*-
"""El tercer tamaño: la PC. Y las reglas que unen los tres.

Genera PC.dc.html, PCTeclado.dc.html y Adaptacion.dc.html.

La PC no es una tablet grande: cambia el dedo por ratón Y TECLADO. Ese es
el aparato del restaurante que apunta los pedidos en papel y los teclea
en la caja, que para un SaaS es probablemente el caso más común.
"""
import os
from kit import CSS, HEAD, TAIL, svg, chev, write

here = os.path.dirname(os.path.abspath(__file__))
os.chdir(here)

EXTRA = """
    .sc .key { display: inline-grid; place-items: center; min-width: 24px; height: 24px; padding: 0 7px; border-radius: 6px;
               background: var(--surf); border: 1px solid var(--hair2); box-shadow: 0 1px 0 var(--hair2);
               font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px; font-weight: 600; color: var(--ink2); }
    .sc .keys { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; }
    .sc .keys span.p { font-size: 12px; color: var(--ink4); }
    .sc .doc-h1 { font-family: 'Unbounded', 'Geist', system-ui, sans-serif; font-weight: 800; letter-spacing: -0.03em; }
"""


def mono(t, s=14.5, c='var(--ink)'):
    return '<span class="mono" style="font-size: %spx; color: %s">%s</span>' % (s, c, t)


def dot(c):
    return '<span class="dot" style="color: %s"></span>' % c


def keys(*ks):
    inner = []
    for k in ks:
        if k == '+':
            inner.append('<span class="p">+</span>')
        elif k == 'o':
            inner.append('<span class="p">o</span>')
        else:
            inner.append('<span class="key">%s</span>' % k)
    return '<span class="keys">%s</span>' % ''.join(inner)


def row(main, sub='', right='', trail='', pad='13px 18px', lead=''):
    subh = ('<div class="sub">%s</div>' % sub) if sub else ''
    rh = ('<div style="flex-shrink: 0; text-align: right">%s</div>' % right) if right else ''
    th = ('<div style="flex-shrink: 0; display: flex; align-items: center; margin-left: 14px">%s</div>' % trail) if trail else ''
    return ('            <div class="row" style="padding: %s">%s<div style="flex: 1; min-width: 0">'
            '<div class="ttl">%s</div>%s</div>%s%s</div>\n' % (pad, lead, main, subh, rh, th))


def hr():
    return '            <div class="hr"></div>\n'


def blk(label, inner, action=None, foot=None):
    act = '<span class="act">%s</span>' % action if action else ''
    lbl = '          <div class="lbl"><span>%s</span>%s</div>\n' % (label, act) if label else ''
    footh = ('          <div style="font-size: 12.5px; color: var(--ink3); line-height: 1.45; padding: 8px 4px 0">%s</div>\n' % foot) if foot else ''
    return '        <div>\n' + lbl + '          <div class="group">\n' + inner + '          </div>\n' + footh + '        </div>\n'


def board(w, h, inner, theme='light', bg='#e9e9ee'):
    d = HEAD.replace('__CSS__', CSS + EXTRA)
    d += ('<div class="sc" data-t="%s" style="width: %dpx; height: %dpx; background: %s; padding: 44px 40px; '
          'display: flex; align-items: flex-start; justify-content: center; gap: 40px">\n' % (theme, w, h, bg))
    d += inner + '</div>\n' + TAIL.replace('__W__', str(w)).replace('__H__', str(h))
    return d


def doc(w, h, body):
    d = HEAD.replace('__CSS__', CSS + EXTRA)
    d += ('<div class="sc" data-t="light" style="width: %dpx; min-height: %dpx; background: var(--bg); color: var(--ink); '
          'padding: 56px 52px 52px; display: flex; flex-direction: column; gap: 38px">\n' % (w, h))
    return d + body + '</div>\n' + TAIL.replace('__W__', str(w)).replace('__H__', str(h))


# ══════════════════════════════════════════════════════════════════
# PC · Modo servicio a pantalla completa
# ══════════════════════════════════════════════════════════════════
SALON = [
    (1, 'libre', '', ''), (2, 'abierta', '18 min', 'Q186'), (3, 'libre', '', ''),
    (4, 'libre', '', ''), (5, 'libre', '', ''), (6, 'atencion', 'Cuenta', 'Q340'),
    (7, 'sel', '9 min', 'Q248'), (8, 'libre', '', ''), (9, 'abierta', '6 min', 'Q95'),
    (10, 'libre', '', ''), (11, 'libre', '', ''), (12, 'libre', '', ''),
]


def pc_rail():
    o = ('      <div style="width: 320px; flex-shrink: 0; display: flex; flex-direction: column; '
         'background: var(--side); border-right: 1px solid var(--hair)">\n'
         '        <div style="padding: 18px 18px 12px"><div class="seg" style="display: flex; width: 100%">'
         '<div data-on="1" style="flex: 1; text-align: center">Sala</div>'
         '<div style="flex: 1; text-align: center">Pedidos</div></div></div>\n'
         '        <div style="padding: 0 18px 16px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px">\n')
    for n, st, det, amt in SALON:
        if st == 'sel':
            o += ('          <div class="mesa" style="background: var(--acc); border-color: var(--acc); box-shadow: none">'
                  '<div class="n" style="color: #ffffff">%d</div>'
                  '<div class="amt" style="color: rgba(255,255,255,0.86)">%s</div>'
                  '<div class="st" style="color: rgba(255,255,255,0.86)">%s</div></div>\n' % (n, amt, det))
        elif st == 'libre':
            o += '          <div class="mesa" data-s="libre"><div class="n">%d</div><div class="st">Libre</div></div>\n' % n
        else:
            o += ('          <div class="mesa" data-s="%s"><div class="n">%d</div><div class="amt">%s</div>'
                  '<div class="st">%s</div></div>\n' % (st, n, amt, det))
    o += ('        </div>\n'
          '        <div style="margin-top: auto; padding: 12px 18px 16px; border-top: 1px solid var(--hair); '
          'display: flex; align-items: center; gap: 10px">\n'
          '          <span class="tile">%s</span>'
          '<div style="flex: 1; font-size: 13.5px; color: var(--ink2); font-weight: 500">Para llevar</div>\n'
          '          %s\n        </div>\n      </div>\n' % (svg('bolsa', 'i-sm'), keys('⌘', '+', 'K')))
    return o


def pc_screen():
    # Comanda
    def linea(n, nombre, det, precio, activo=False):
        bg = ' background: var(--acc-soft);' if activo else ''
        return ('            <div class="row" style="padding: 11px 18px;%s">'
                '<div class="mono" style="width: 26px; flex-shrink: 0; font-size: 14px; color: var(--ink3)">%s</div>'
                '<div style="flex: 1; min-width: 0"><div class="ttl">%s</div>%s</div>'
                '<div style="flex-shrink: 0">%s</div></div>\n'
                % (bg, n, nombre, ('<div class="sub">%s</div>' % det) if det else '', mono(precio)))

    inner = blk('Mesa 7 · comanda nueva',
                linea('2×', 'Carne asada', 'Término medio', 'Q210.00') +
                hr() + linea('1×', 'Sopa del día', '', 'Q38.00') +
                hr() + linea('3×', 'Limonada', 'Con hielo', 'Q54.00', activo=True),
                action='6 platos · Q302.00')

    # Buscador tipo paleta de comandos, enfocado
    res = ''
    for i, (nombre, cat, precio, on) in enumerate((
            ('Flan de la casa', 'Postres', 'Q32.00', True),
            ('Flautas de pollo', 'Entradas', 'Q48.00', False),
            ('Fresas con crema', 'Postres', 'Q35.00', False))):
        bg = ' background: var(--acc-soft);' if on else ''
        marca = ('<span style="color: var(--acc-ink); margin-left: 14px">%s</span>' % svg('flecha', 'i-sm')) if on else ''
        res += ('              <div class="row" style="padding: 10px 18px;%s">'
                '<div style="flex: 1; min-width: 0"><div class="ttl">%s</div><div class="sub">%s</div></div>'
                '<div style="flex-shrink: 0">%s</div>%s</div>\n'
                % (bg, nombre, cat, mono(precio, 14, 'var(--ink2)'), marca))
        if i < 2:
            res += '              <div class="hr"></div>\n'

    inner += ('        <div>\n          <div class="lbl"><span>Escribe para agregar</span>'
              '<span style="font-weight: 500; color: var(--ink3)">no hace falta tocar nada</span></div>\n'
              '          <div style="display: flex; align-items: center; gap: 10px; height: 48px; padding: 0 16px; '
              'border-radius: 12px 12px 0 0; background: var(--surf); border: 1px solid var(--acc); border-bottom: none; '
              'box-shadow: 0 0 0 3px var(--acc-soft)">%s'
              '<span class="mono" style="font-size: 15px; color: var(--ink3)">2</span>'
              '<span style="font-size: 16px; color: var(--ink)">fla</span>'
              '<span style="width: 1.5px; height: 20px; background: var(--acc)"></span>'
              '<span style="flex: 1"></span>'
              '<span style="font-size: 12.5px; color: var(--ink4)">cantidad + nombre</span></div>\n'
              '          <div class="group" style="border-radius: 0 0 12px 12px; border-top: none">\n%s          </div>\n'
              '        </div>\n' % (svg('buscar', 'i', 'color: var(--ink3)'), res))

    # Atajos
    def atajo(k, que):
        return ('            <div style="display: flex; align-items: center; gap: 12px; padding: 9px 0">'
                '<div style="width: 96px; flex-shrink: 0">%s</div>'
                '<div style="flex: 1; font-size: 13.5px; color: var(--ink2)">%s</div></div>\n' % (k, que))

    inner += ('        <div style="margin-top: auto">\n'
              '          <div class="lbl"><span>Sin soltar el teclado</span></div>\n'
              '          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0 32px">\n'
              + atajo(keys('↑', '↓'), 'Moverse entre resultados')
              + atajo(keys('Enter'), 'Agregar y seguir escribiendo')
              + atajo(keys('2', 'Enter'), 'Agregar dos de una vez')
              + atajo(keys('Tab'), 'Nota para cocina del plato')
              + atajo(keys('⌘', '+', 'K'), 'Cambiar de mesa')
              + atajo(keys('⌘', '+', 'Enter'), 'Enviar a cocina')
              + '          </div>\n        </div>\n')

    top = ('        <div style="height: 56px; flex-shrink: 0; display: flex; align-items: center; gap: 14px; '
           'padding: 0 22px; border-bottom: 1px solid var(--hair)">\n'
           '          <div style="flex: 1; min-width: 0"><span style="font-size: 15.5px; font-weight: 600; color: var(--ink)">Mesa 7</span>'
           '<span style="font-size: 13.5px; color: var(--ink3); margin-left: 10px">Comanda nueva · Carlos</span></div>\n'
           '          <div style="font-size: 13px; color: var(--ink3)">Total</div><div>%s</div>\n'
           '          <div class="btn" style="height: 38px; border-radius: 10px; padding: 0 16px">Enviar a cocina %s</div>\n'
           '        </div>\n' % (mono('Q302.00', 18), keys('⌘', '+', 'Enter')))

    pane = ('      <div style="flex: 1; min-width: 0; display: flex; flex-direction: column">\n' + top +
            '        <div style="flex: 1; min-height: 0; overflow: hidden; padding: 18px 22px; '
            'display: flex; flex-direction: column; gap: 18px">\n' + inner + '        </div>\n      </div>\n')

    chrome = ('    <div class="sc" data-t="light" style="width: 1440px; height: 900px; border-radius: 12px; overflow: hidden; '
              'background: var(--bg); color: var(--ink); display: flex; flex-direction: column; '
              'box-shadow: 0 18px 50px rgba(0,0,0,0.20); flex-shrink: 0">\n'
              '      <div style="height: 46px; flex-shrink: 0; display: flex; align-items: center; gap: 12px; '
              'padding: 0 20px; border-bottom: 1px solid var(--hair); background: var(--side)">\n'
              '        <span class="tile">%s</span>\n'
              '        <div style="font-size: 14px; font-weight: 600; color: var(--ink)">El Rincón</div>\n'
              '        <div style="font-size: 13.5px; color: var(--ink3)">Modo servicio</div>\n'
              '        <div style="flex: 1"></div>\n'
              '        <div class="mono" style="font-size: 13.5px; color: var(--ink3)">12:41</div>\n'
              '        <div style="display: flex; align-items: center; gap: 8px; margin-left: 8px">'
              '<span style="font-size: 13px; color: var(--ink3)">Salir</span>%s</div>\n'
              '      </div>\n'
              '      <div style="flex: 1; min-height: 0; display: flex">\n' % (svg('servicio', 'i-sm'), keys('Esc')))
    return ('  <div style="display: flex; flex-direction: column; gap: 14px; align-items: center">\n'
            + chrome + pc_rail() + pane +
            '      </div>\n    </div>\n'
            '    <div class="cap" style="max-width: 1000px">En PC, tomar pedidos es un <b>modo a pantalla completa</b>: '
            'la barra lateral del panel desaparece y queda el mismo armazón de dos columnas de la tablet — pero manejado '
            'con teclado. Se sale con Esc.</div>\n  </div>\n')


# ══════════════════════════════════════════════════════════════════
# PC · Del papel al sistema
# ══════════════════════════════════════════════════════════════════
def pc_teclado():
    b = ('  <div>\n'
         '    <div class="doc-h1" style="font-size: 38px; line-height: 1.08; color: var(--ink)">Del papel al sistema</div>\n'
         '    <div style="font-size: 17px; line-height: 1.5; color: var(--ink3); margin-top: 14px; max-width: 640px">'
         'El restaurante que apunta en una libreta y teclea en la caja es, para un SaaS, probablemente el caso más común. '
         'Hoy ese usuario ve la pantalla del teléfono estirada y centrada en 960 px, con aire a los lados y todo hecho '
         'para el dedo. Con teclado, la misma comanda entra en catorce pulsaciones.</div>\n  </div>\n')

    b += '  <div class="h2" style="margin-bottom: -20px">Una comanda real, tecla por tecla</div>\n'
    b += ('  <div class="card" style="padding: 22px 26px">\n'
          '    <div style="font-size: 14px; color: var(--ink3); margin-bottom: 18px">'
          'La nota de papel dice: <b style="color: var(--ink2); font-weight: 600">Mesa 7 — 2 carne asada, 1 sopa, '
          '3 limonadas</b>.</div>\n')

    def paso(n, k, que, resultado):
        return ('    <div style="display: flex; align-items: flex-start; gap: 16px; padding: 12px 0">\n'
                '      <div class="num">%s</div>\n'
                '      <div style="width: 150px; flex-shrink: 0; padding-top: 1px">%s</div>\n'
                '      <div style="flex: 1; min-width: 0">\n'
                '        <div style="font-size: 14.5px; color: var(--ink); font-weight: 500">%s</div>\n'
                '        <div style="font-size: 13px; color: var(--ink3); margin-top: 2px">%s</div>\n'
                '      </div>\n    </div>\n' % (n, k, que, resultado))

    b += paso('1', keys('⌘', '+', 'K') + ' ' + keys('7'), 'Elegir la mesa 7',
              'Se abre la comanda de la mesa. Si ya tenía platos, se le suman.')
    b += '    <div class="hrf"></div>\n'
    b += paso('2', keys('2') + ' <span class="p">c a r</span>', 'Cantidad y las primeras letras',
              'El número antes del nombre ES la cantidad. «car» ya deja Carne asada de primera.')
    b += '    <div class="hrf"></div>\n'
    b += paso('3', keys('Enter'), 'Agregado, y el campo se limpia solo',
              'Esto es lo que hace posible teclear la comanda de corrido: no hay que volver a hacer clic en el buscador.')
    b += '    <div class="hrf"></div>\n'
    b += paso('4', keys('1') + ' <span class="p">s o p</span> ' + keys('Enter'), 'Segundo plato', 'Sopa del día, uno.')
    b += '    <div class="hrf"></div>\n'
    b += paso('5', keys('3') + ' <span class="p">l i m</span> ' + keys('Enter'), 'Tercer plato', 'Limonada, tres.')
    b += '    <div class="hrf"></div>\n'
    b += paso('6', keys('⌘', '+', 'Enter'), 'A cocina', 'Se imprime la comanda y la mesa 7 queda abierta.')
    b += ('    <div class="hrf"></div>\n'
          '    <div style="padding: 16px 0 4px; font-size: 14.5px; color: var(--ink2); line-height: 1.55">'
          '<b style="color: var(--ink); font-weight: 600">Catorce pulsaciones, cero clics.</b> Con el ratón y las tarjetas '
          'de hoy son unos veinte clics repartidos por tres pantallas.</div>\n'
          '  </div>\n')

    b += '  <div class="h2" style="margin-bottom: -20px">Las reglas del teclado</div>\n'
    b += ('  <div class="card">\n'
          + row('El buscador siempre tiene el foco', 'Escribir es la acción por defecto. No hay que ir a buscarlo.',
                trail=keys('/') + ' <span class="p">lo devuelve</span>')
          + '    <div class="hrf"></div>\n'
          + row('Un número al principio es la cantidad', '«3 lim» son tres limonadas. Sin número, es uno.',
                trail=keys('1') + '<span class="p">–</span>' + keys('9'))
          + '    <div class="hrf"></div>\n'
          + row('Enter agrega y deja listo lo siguiente', 'El campo se limpia y el foco se queda. Nunca se sale del ritmo.',
                trail=keys('Enter'))
          + '    <div class="hrf"></div>\n'
          + row('Nada se envía sin querer', 'Enviar a cocina pide las dos teclas. Un Enter suelto jamás manda la comanda.',
                trail=keys('⌘', '+', 'Enter'))
          + '    <div class="hrf"></div>\n'
          + row('Todo atajo tiene su botón', 'El teclado acelera, no es obligatorio. Quien prefiera el ratón hace lo mismo.',
                trail='<span style="font-size: 13px; color: var(--ink3)">sin excepciones</span>')
          + '  </div>\n')

    b += ('  <div style="font-size: 13.5px; color: var(--ink3); line-height: 1.55; max-width: 640px">'
          'Los atajos se muestran en la pantalla, junto a la acción, no escondidos en una ayuda. Así el mesero que empieza '
          'con el ratón los va aprendiendo solo.</div>\n')
    return doc(980, 1900, b)


# ══════════════════════════════════════════════════════════════════
# Adaptación · un diseño, tres tamaños
# ══════════════════════════════════════════════════════════════════
def adaptacion():
    b = ('  <div>\n'
         '    <div class="doc-h1" style="font-size: 40px; line-height: 1.08; color: var(--ink)">Un diseño, tres tamaños</div>\n'
         '    <div style="font-size: 17px; line-height: 1.5; color: var(--ink3); margin-top: 14px; max-width: 660px">'
         'Tus clientes no tienen el mismo equipo y no lo van a tener nunca. Así que la pregunta deja de ser «¿A o C?» y pasa '
         'a ser otra: <b style="color: var(--ink2); font-weight: 600">una sola interfaz que se acomoda al aparato que haya.</b> '
         'La buena noticia es que la decisión de ayer no se cae — C <i>es</i> el ancho, y ahora el ancho también es la PC.</div>\n  </div>\n')

    b += '  <div class="h2" style="margin-bottom: -20px">Lo que cambia y lo que no</div>\n'

    def col(titulo, sub, filas, nota, first=False):
        f = ''.join('        <div style="display: flex; gap: 10px; padding: 7px 0; font-size: 13.5px; color: var(--ink2); line-height: 1.45">'
                    '<span style="color: var(--ink4); flex-shrink: 0">·</span><span>%s</span></div>\n' % x for x in filas)
        borde = '' if first else '; border-left: 1px solid var(--hair)'
        return ('    <div style="padding: 20px 22px' + borde + '">\n'
                '      <div style="font-size: 17px; font-weight: 600; color: var(--ink)">%s</div>\n'
                '      <div class="mono" style="font-size: 12.5px; color: var(--ink4); margin-top: 4px">%s</div>\n'
                '      <div style="margin-top: 12px">%s</div>\n'
                '      <div style="font-size: 12.5px; color: var(--ink3); line-height: 1.45; margin-top: 10px; '
                'padding-top: 10px; border-top: 1px solid var(--hair)">%s</div>\n'
                '    </div>\n' % (titulo, sub, f, nota))

    b += ('  <div class="card" style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr))">\n'
          + col('Teléfono', 'menos de 1024 px · dedo',
                ['Una columna. La sala es la casa.',
                 'La mesa se abre como pantalla siguiente.',
                 'Barra de pestañas abajo, al pulgar.',
                 'Nada tocable baja de 44 px.'],
                'El mesero que camina el salón.', first=True)
          + col('Tablet', '1024 px o más · dedo',
                ['Dos columnas: sala + comanda.',
                 'Agregar un plato no navega.',
                 'Sin nada elegido: «te necesitan ahora».',
                 'Mismos 44 px: se sigue tocando.'],
                'La tablet fija en la barra o en la caja.')
          + col('PC', '1024 px o más · ratón y teclado',
                ['Las mismas dos columnas que la tablet.',
                 'Modo servicio a pantalla completa.',
                 'El buscador siempre enfocado.',
                 'Atajos a la vista, junto a cada acción.'],
                'Quien teclea la comanda desde la libreta.')
          + '  </div>\n')

    b += ('  <div class="card" style="padding: 20px 22px">\n'
          '    <div style="font-size: 15.5px; line-height: 1.55; color: var(--ink2)">'
          '<b style="color: var(--ink); font-weight: 600">Tablet y PC comparten TODO el marcado.</b> La única diferencia '
          'entre las dos es la capa de teclado, que en una pantalla táctil simplemente no se dibuja. No son dos diseños: '
          'es uno con una capa de más.</div>\n  </div>\n')

    b += '  <div class="h2" style="margin-bottom: -20px">Lo que nunca cambia, mida lo que mida</div>\n'

    def item(t, c):
        return ('    <div style="padding: 16px 22px">\n'
                '      <div style="font-size: 15.5px; font-weight: 600; color: var(--ink)">%s</div>\n'
                '      <div class="body" style="margin-top: 5px; font-size: 14.5px">%s</div>\n    </div>\n' % (t, c))

    b += ('  <div class="card">\n'
          + item('La mesa es el expediente',
                 'Lo que hay, en qué va cada plato, cuánto lleva y cuánto debe. Igual en los tres.')
          + '    <div class="hrf"></div>\n'
          + item('El color solo lo usa lo que te necesita',
                 'Libre calla, abierta en tinta normal, acento solo para lo que pide acción. Tres pesos, no cinco colores.')
          + '    <div class="hrf"></div>\n'
          + item('No hay pasos numerados',
                 'Ni en el teléfono ni en la PC. Se elige mesa, se agregan platos, se envía.')
          + '    <div class="hrf"></div>\n'
          + item('Los mismos nombres y los mismos estados',
                 'Un mesero que aprendió en el teléfono se sienta en la PC y sabe dónde está todo.')
          + '  </div>\n')

    b += '  <div class="h2" style="margin-bottom: -20px">Y el que no tiene ningún aparato</div>\n'
    b += ('  <div class="card" style="padding: 22px 26px">\n'
          '    <div class="body" style="font-size: 15.5px; max-width: 700px">'
          'Ese caso ya lo resuelve el producto y conviene decirlo en la venta: <b style="color: var(--ink); font-weight: 600">'
          'el aparato lo pone el comensal.</b> El QR de la mesa abre el menú en su teléfono, el pedido entra solo y en la '
          'caja aparece la mesa abierta sin que nadie teclee nada. El local sin equipo no necesita comprar nada — necesita '
          'que la PC de la caja sepa mostrar el salón, que es justo lo que arregla esto.<br><br>'
          'Y si ni PC hay: queda el teléfono del dueño, que es el mismo diseño de una columna.</div>\n  </div>\n')

    b += '  <div class="h2" style="margin-bottom: -20px">Qué cambia en el plan de construcción</div>\n'
    b += ('  <div class="card">\n'
          + item('1 · Quitar el techo de 960 px',
                 'Hoy <code>.waiter-wrap</code> topa el panel de mesero en 960 px y lo centra: en una PC de 1440 son '
                 '480 px de aire a los lados y una columna de tarjetas pensada para el pulgar. Ese techo pasa a ser '
                 'la regla de dos columnas.')
          + '    <div class="hrf"></div>\n'
          + item('2 · Modo servicio a pantalla completa',
                 'No existe todavía; el botón está dibujado en el panel nuevo pero no hace nada. Es lo que hace usable '
                 'la PC: esconde la barra lateral y deja el salón y la comanda.')
          + '    <div class="hrf"></div>\n'
          + item('3 · La capa de teclado',
                 'Foco permanente en el buscador, número como cantidad, Enter que agrega y limpia, dos teclas para enviar. '
                 'Es lo último que se construye y lo primero que se nota.')
          + '    <div class="hrf"></div>\n'
          + item('4 · Todo lo demás del plan sigue igual',
                 'Ampliar lo que sabe una mesa, la regla única de estados y el motivo en la llamada al mesero no cambian: '
                 'alimentan a los tres tamaños por igual.')
          + '  </div>\n')
    return doc(980, 2500, b)


if __name__ == '__main__':
    write('PC.dc.html', board(1520, 1080, pc_screen()))
    write('PCTeclado.dc.html', pc_teclado())
    write('Adaptacion.dc.html', adaptacion())
