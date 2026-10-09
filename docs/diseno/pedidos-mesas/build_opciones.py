# -*- coding: utf-8 -*-
"""Genera Main.dc.html (Opción A), OpcionB.dc.html y OpcionC.dc.html.

Las tres usan EXACTAMENTE el vocabulario del panel nuevo: grupos con
pelo de 1 px, filas de 44 px mínimo, Geist 500/600 (nada de 800 suelto),
Unbounded solo en el título grande de pantalla, JetBrains Mono con cifras
tabulares en todo número, e iconos SVG de trazo — nunca ＋ ⚠ ● →.
"""
import os
from kit import HEAD, TAIL, CSS, svg, chev, write, phone, largetitle, navbar, group, tabbar

here = os.path.dirname(os.path.abspath(__file__))
os.chdir(here)

WAITER_TABS = [('sala', 'Sala', 'sala'), ('pedidos', 'Pedidos', 'pedidos'), ('mas', 'Más', 'puntos')]


def board(w, h, phones, theme='light'):
    d = HEAD.replace('__CSS__', CSS)
    d += ('<div class="sc" data-t="%s" style="width: %dpx; height: %dpx; background: #e9e9ee; padding: 44px 40px; '
          'display: flex; align-items: flex-start; justify-content: center; gap: 40px">\n' % (theme, w, h))
    for inner, cap in phones:
        d += phone(inner, cap, theme)
    d += '</div>\n' + TAIL.replace('__W__', str(w)).replace('__H__', str(h))
    return d


def scroll(inner, pad='0 16px'):
    return ('        <div style="flex: 1; min-height: 0; overflow: hidden; padding: %s; display: flex; flex-direction: column; gap: 20px">\n'
            '%s'
            '        </div>\n' % (pad, inner))


def mesa(n, estado='libre', detalle='', monto='', ):
    """Ficha de mesa. Tres pesos visuales, no cinco colores:
       libre = calla, abierta = tinta normal, atencion = anillo de acento."""
    if estado == 'libre':
        return ('            <div class="mesa" data-s="libre"><div class="n">%d</div>'
                '<div class="st">Libre</div></div>\n' % n)
    amt = ('<div class="amt">%s</div>' % monto) if monto else ''
    return ('            <div class="mesa" data-s="%s"><div class="n">%d</div>%s'
            '<div class="st">%s</div></div>\n' % (estado, n, amt, detalle))


def row(main, sub='', right='', trail='', pad='13px 16px', lead=''):
    subh = ('<div class="sub">%s</div>' % sub) if sub else ''
    rh = ('<div style="flex-shrink: 0; text-align: right">%s</div>' % right) if right else ''
    th = ('<div style="flex-shrink: 0; display: flex; align-items: center">%s</div>' % trail) if trail else ''
    lh = lead or ''
    return ('            <div class="row" style="padding: %s">%s<div style="flex: 1; min-width: 0">'
            '<div class="ttl">%s</div>%s</div>%s%s</div>\n' % (pad, lh, main, subh, rh, th))


def mono(txt, size=14.5, color='var(--ink)'):
    return '<span class="mono" style="font-size: %spx; color: %s">%s</span>' % (size, color, txt)


def dot(color):
    return '<span class="dot" style="color: %s"></span>' % color


# ══════════════════════════════════════════════════════════════════
# OPCIÓN A · LA SALA
# ══════════════════════════════════════════════════════════════════
def a_sala():
    b = '        <div style="height: 0"></div>\n'
    right = ('          <div class="ghost" style="width: 40px; height: 40px; border-radius: 12px">%s</div>\n'
             % svg('buscar', 'i'))
    head = largetitle('Sala', 'Jueves 21 · 5 mesas con gente', right)
    grid = ''
    grid += mesa(1, 'libre')
    grid += mesa(2, 'abierta', '2 platos · 18 min', 'Q186.00')
    grid += mesa(3, 'libre')
    grid += mesa(4, 'abierta', 'Servida · 42 min', 'Q210.00')
    grid += mesa(5, 'libre')
    grid += mesa(6, 'atencion', 'Pidió la cuenta', 'Q340.00')
    grid += mesa(7, 'atencion', 'Lista hace 12 min', 'Q128.00')
    grid += mesa(8, 'libre')
    grid += mesa(9, 'abierta', '1 plato · 6 min', 'Q95.00')
    body = ('        <div>\n          <div class="lbl"><span>Mesas</span><span class="act">Plano del salón</span></div>\n'
            '          <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px">\n'
            + grid + '          </div>\n        </div>\n')
    body += group([
        row('Ana L.', 'Para llevar · 1 hamburguesa doble',
            right='<div class="pill" style="color: var(--ok)">%sLista</div>' % dot('var(--ok)'), trail=chev()),
        row('Nuevo pedido para llevar', '', trail=svg('mas', 'i-sm', 'color: var(--acc-ink)')),
    ], label='Barra y para llevar')
    body += ('        <div style="font-size: 12.5px; color: var(--ink3); line-height: 1.45; padding: 0 4px">'
             'Una mesa libre no dice nada. Solo hablan las que tienen gente, y solo se pintan de acento '
             'las que te necesitan ahora.</div>\n')
    return b + head + scroll(body) + tabbar(WAITER_TABS, 'sala')


def a_mesa():
    b = '        <div style="height: 0"></div>\n'
    b += navbar('Mesa 4', 'Abierta hace 42 min · Carlos',
                right='<div class="ghost" style="width: 40px; height: 40px; border-radius: 11px">%s</div>' % svg('user', 'i'))

    def plato(nombre, det, estado, color, precio):
        return row(nombre, det,
                   right='<div class="pill" style="color: %s; justify-content: flex-end">%s%s</div>'
                         '<div style="margin-top: 3px">%s</div>' % (color, dot(color), estado, mono(precio, 13.5, 'var(--ink2)')),
                   pad='12px 16px')

    body = group([
        plato('2 · Carne asada', 'Término medio · sin cebolla', 'En cocina', 'var(--warn)', 'Q210.00'),
        plato('1 · Sopa del día', '', 'Servida', 'var(--ok)', 'Q38.00'),
        plato('2 · Limonada', 'Con hielo', 'Servida', 'var(--ok)', 'Q36.00'),
        ('            <div class="row" style="padding: 13px 16px; background: color-mix(in srgb, var(--ink) 3%%, transparent)">'
         '<div style="flex: 1; font-size: 14.5px; font-weight: 600; color: var(--ink)">Total</div>'
         '<div>%s</div></div>\n' % mono('Q284.00', 16)),
    ], label='En la mesa', action='Editar')

    body += group([
        row('Ver cuenta y dividir', 'Por persona o por platos', trail=chev()),
        row('Cobrar y cerrar mesa', 'Efectivo, tarjeta o transferencia', trail=chev()),
        row('Imprimir comanda otra vez', '', trail=chev()),
    ], label='Cuenta')

    body += group([
        row('Liberar sin cobrar', 'Queda anotado quién la liberó',
            right='<span style="font-size: 13px; color: var(--ink4)">Requiere PIN</span>', trail=chev()),
    ], foot='Liberar sin cobrar deja de ser un botón rojo junto a "Agregar platos": '
            'vive aparte, al final, donde no se toca por accidente.')

    bar = ('        <div class="bar">\n'
           '          <div class="cta"><span style="display: inline-flex; align-items: center; gap: 9px">%s Agregar platos</span>'
           '<span class="mono" style="font-size: 14px; color: rgba(255,255,255,0.82)">Mesa 4</span></div>\n'
           '        </div>\n' % svg('mas', 'i'))
    return b + scroll(body, pad='16px 16px 0') + bar


def a_agregar():
    b = '        <div style="height: 0"></div>\n'
    b += navbar('Agregar a Mesa 4', '',
                right='<div style="font-size: 15px; font-weight: 600; color: var(--acc-ink); width: 46px; text-align: right">Listo</div>')
    body = ('        <div style="display: flex; align-items: center; gap: 9px; height: 44px; padding: 0 13px; border-radius: 11px; '
            'background: color-mix(in srgb, var(--ink) 7%%, transparent); color: var(--ink4)">%s'
            '<span style="font-size: 16px">Buscar plato</span></div>\n' % svg('buscar', 'i'))
    body += ('        <div style="display: flex; gap: 8px; overflow: hidden"><div class="seg" style="flex-shrink: 0">'
             '<div data-on="1">Todos</div><div>Entradas</div><div>Fuertes</div><div>Bebidas</div></div></div>\n')

    def plato(nombre, det, precio, qty=0):
        if qty:
            ctrl = ('<div style="display: flex; align-items: center; gap: 10px">'
                    '<div class="step">%s</div>'
                    '<span class="mono" style="font-size: 15px; min-width: 14px; text-align: center">%d</span>'
                    '<div class="step" style="border-color: var(--acc); color: var(--acc-ink)">%s</div></div>'
                    % (svg('menos', 'i-sm'), qty, svg('mas', 'i-sm')))
        else:
            ctrl = '<div class="step">%s</div>' % svg('mas', 'i-sm')
        return ('            <div class="row" style="padding: 11px 12px 11px 16px">'
                '<div style="flex: 1; min-width: 0"><div class="ttl">%s</div>%s</div>'
                '<div style="flex-shrink: 0; margin-right: 12px">%s</div>%s</div>\n'
                % (nombre, ('<div class="sub">%s</div>' % det) if det else '',
                   mono(precio, 14, 'var(--ink2)'), ctrl))

    body += group([
        plato('Carne asada', 'Elige término', 'Q105.00', qty=2),
        plato('Pollo a la plancha', 'Elige guarnición', 'Q95.00'),
        plato('Sopa del día', '', 'Q38.00'),
        plato('Limonada', '', 'Q18.00', qty=1),
        plato('Café', '', 'Q15.00'),
        plato('Flan de la casa', '', 'Q32.00'),
    ], label='Platos fuertes')

    bar = ('        <div class="bar">\n'
           '          <div class="cta"><span>Enviar 3 platos a cocina</span><span class="mono" style="font-size: 16px">Q228.00</span></div>\n'
           '          <div style="text-align: center; font-size: 12.5px; color: var(--ink3); margin-top: 10px">'
           'Se suman a lo que la mesa 4 ya tiene. No hay pantalla de repaso: el repaso es la mesa.</div>\n'
           '        </div>\n')
    return b + scroll(body, pad='14px 16px 0') + bar


# ══════════════════════════════════════════════════════════════════
# OPCIÓN B · LA COMANDA
# ══════════════════════════════════════════════════════════════════
def b_pedidos():
    b = '        <div style="height: 0"></div>\n'
    right = ('          <div class="btn" style="height: 40px; border-radius: 12px; padding: 0 15px">%s<span>Nueva</span></div>\n'
             % svg('mas', 'i-sm'))
    head = largetitle('Pedidos', '8 en curso · 24 hoy', right)
    body = ('        <div><div class="seg" style="display: flex; width: 100%">'
            '<div data-on="1" style="flex: 1; text-align: center">En vivo</div>'
            '<div style="flex: 1; text-align: center">Mesas</div>'
            '<div style="flex: 1; text-align: center">Historial</div></div></div>\n')

    def ped(quien, det, estado, color, total):
        return ('            <div class="row" style="padding: 13px 16px">'
                '<div style="flex: 1; min-width: 0"><div class="ttl" style="font-weight: 600">%s</div>'
                '<div class="pill" style="color: %s; margin-top: 3px">%s%s · %s</div></div>'
                '<div style="flex-shrink: 0">%s</div>'
                '<div style="flex-shrink: 0; margin-left: 10px">%s</div></div>\n'
                % (quien, color, dot(color), estado, det, mono(total, 15), chev()))

    body += group([
        ped('Mesa 4', 'hace 2 min', 'Nuevo', 'var(--acc-ink)', 'Q210.00'),
        ped('Llevar · Ana L.', 'hace 4 min', 'Nuevo', 'var(--acc-ink)', 'Q95.00'),
        ped('Mesa 7', 'hace 9 min', 'En cocina', 'var(--warn)', 'Q340.00'),
        ped('Mesa 2', 'hace 6 min', 'En cocina', 'var(--warn)', 'Q120.00'),
        ped('Mesa 9', 'hace 14 min', 'Lista', 'var(--ok)', 'Q260.00'),
    ], label='En curso')
    body += ('        <div style="font-size: 12.5px; color: var(--ink3); line-height: 1.45; padding: 0 4px">'
             'La misma lista, las mismas filas y los mismos estados que ve el dueño en el panel. '
             'Mesa, llevar y domicilio se leen igual porque son la misma cosa: una comanda.</div>\n')
    return b + head + scroll(body) + tabbar(WAITER_TABS, 'pedidos')


def b_nueva():
    b = '        <div style="height: 0"></div>\n'
    b += navbar('Nueva comanda', '',
                left=False,
                right='<div style="font-size: 15px; font-weight: 500; color: var(--acc-ink); width: 60px; text-align: right">Cancelar</div>')
    body = group([
        row('Mesa 4', 'Salón · junto a la ventana',
            right='<span style="font-size: 14px; color: var(--ink3)">Cambiar</span>', trail=chev(),
            lead='<span class="tile">%s</span>' % svg('sala', 'i-sm')),
    ], label='Para')

    def linea(nombre, det, precio, qty):
        return ('            <div class="row" style="padding: 11px 12px 11px 16px">'
                '<div style="flex: 1; min-width: 0"><div class="ttl">%s</div>%s</div>'
                '<div style="flex-shrink: 0; margin-right: 12px">%s</div>'
                '<div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0">'
                '<div class="step">%s</div><span class="mono" style="font-size: 15px; min-width: 14px; text-align: center">%d</span>'
                '<div class="step">%s</div></div></div>\n'
                % (nombre, ('<div class="sub">%s</div>' % det) if det else '',
                   mono(precio, 14, 'var(--ink2)'), svg('menos', 'i-sm'), qty, svg('mas', 'i-sm')))

    body += group([
        linea('Carne asada', 'Término medio · sin cebolla', 'Q210.00', 2),
        linea('Limonada', 'Con hielo', 'Q18.00', 1),
        ('            <div class="row" style="padding: 13px 16px; color: var(--acc-ink)">%s'
         '<div style="flex: 1; font-size: 14.5px; font-weight: 600">Agregar plato</div></div>\n'
         % svg('mas', 'i', 'color: var(--acc-ink)')),
    ], label='Platos', action='3 platos')

    body += group([
        row('Nota para cocina', 'Alergias, sin sal, extra salsa', trail=chev()),
        row('Nombre o referencia', 'Opcional', right='<span style="font-size: 14px; color: var(--ink4)">Mesa 4</span>', trail=chev()),
    ], label='Detalles')

    bar = ('        <div class="bar">\n'
           '          <div style="display: flex; align-items: baseline; padding: 0 4px 10px">'
           '<span style="flex: 1; font-size: 14px; color: var(--ink3)">Subtotal Q228.00 · propina 10%%</span>'
           '<span class="mono" style="font-size: 20px; color: var(--ink)">Q250.80</span></div>\n'
           '          <div class="cta"><span>Enviar a cocina</span>%s</div>\n'
           '        </div>\n' % svg('flecha', 'i'))
    return b + scroll(body, pad='16px 16px 0') + bar


def b_hoja():
    """La comanda de fondo con la hoja del menú encima."""
    b = '        <div style="height: 0"></div>\n'
    b += navbar('Nueva comanda', '', left=False,
                right='<div style="font-size: 15px; font-weight: 500; color: var(--ink4); width: 60px; text-align: right">Cancelar</div>')
    fondo = group([
        row('Mesa 4', 'Salón · junto a la ventana', trail=chev(),
            lead='<span class="tile">%s</span>' % svg('sala', 'i-sm')),
    ], label='Para')
    fondo += group([
        row('Carne asada', 'Término medio · sin cebolla'),
        row('Limonada', 'Con hielo'),
    ], label='Platos', action='2 platos')
    fondo += group([
        row('Nota para cocina', 'Alergias, sin sal, extra salsa'),
        row('Nombre o referencia', 'Opcional'),
    ], label='Detalles')
    atenuado = ('        <div style="flex: 1; min-height: 0; overflow: hidden; padding: 16px 16px 0; position: relative; '
                'display: flex; flex-direction: column; gap: 20px">\n%s'
                '          <div style="position: absolute; inset: -16px 0 0; background: rgba(0,0,0,0.34)"></div>\n'
                '        </div>\n' % fondo)

    def pl(nombre, precio, qty=0):
        if qty:
            ctrl = ('<div style="display: flex; align-items: center; gap: 10px"><div class="step">%s</div>'
                    '<span class="mono" style="font-size: 15px; min-width: 14px; text-align: center">%d</span>'
                    '<div class="step" style="border-color: var(--acc); color: var(--acc-ink)">%s</div></div>'
                    % (svg('menos', 'i-sm'), qty, svg('mas', 'i-sm')))
        else:
            ctrl = '<div class="step">%s</div>' % svg('mas', 'i-sm')
        return ('            <div class="row" style="padding: 11px 12px 11px 16px">'
                '<div style="flex: 1; min-width: 0"><div class="ttl">%s</div></div>'
                '<div style="flex-shrink: 0; margin-right: 12px">%s</div>%s</div>\n'
                % (nombre, mono(precio, 14, 'var(--ink2)'), ctrl))

    hoja = ('        <div style="flex-shrink: 0; background: var(--bg); border-top: 1px solid var(--hair); '
            'border-radius: 20px 20px 0 0; box-shadow: 0 -12px 40px rgba(0,0,0,0.14); padding: 8px 0 0">\n'
            '          <div style="width: 38px; height: 5px; border-radius: 99px; background: var(--hair2); margin: 0 auto 12px"></div>\n'
            '          <div style="padding: 0 16px 12px; display: flex; align-items: center; gap: 9px; height: 44px; border-radius: 11px">\n'
            '            <div style="flex: 1; display: flex; align-items: center; gap: 9px; height: 44px; padding: 0 13px; border-radius: 11px; background: color-mix(in srgb, var(--ink) 7%%, transparent); color: var(--ink4)">%s<span style="font-size: 16px">Buscar plato</span></div>\n'
            '          </div>\n'
            '          <div style="padding: 0 16px 12px">%s</div>\n'
            '          <div style="padding: 0 16px 22px">\n'
            '            <div class="cta"><span>Listo · 3 platos</span><span class="mono" style="font-size: 16px">Q228.00</span></div>\n'
            '          </div>\n'
            '        </div>\n'
            % (svg('buscar', 'i'),
               ('<div class="group">\n' + pl('Carne asada', 'Q105.00', 2) + '            <div class="hr"></div>\n'
                + pl('Pollo a la plancha', 'Q95.00') + '            <div class="hr"></div>\n'
                + pl('Sopa del día', 'Q38.00') + '            <div class="hr"></div>\n'
                + pl('Limonada', 'Q18.00', 1) + '            <div class="hr"></div>\n'
                + pl('Café', 'Q15.00') + '          </div>')))
    return b + atenuado + hoja


# ══════════════════════════════════════════════════════════════════
# OPCIÓN C · DOS PANELES
# ══════════════════════════════════════════════════════════════════
def c_ipad():
    izq = ('      <div style="width: 340px; flex-shrink: 0; display: flex; flex-direction: column; background: var(--side); border-right: 1px solid var(--hair)">\n'
           '        <div style="padding: 20px 18px 12px">\n'
           '          <div class="disp" style="font-size: 24px; color: var(--ink)">Sala</div>\n'
           '          <div style="font-size: 13.5px; color: var(--ink3); margin-top: 4px">5 mesas con gente · 2 te necesitan</div>\n'
           '        </div>\n'
           '        <div style="padding: 0 18px 14px"><div class="seg" style="display: flex; width: 100%">'
           '<div data-on="1" style="flex: 1; text-align: center">Sala</div>'
           '<div style="flex: 1; text-align: center">Pedidos</div></div></div>\n'
           '        <div style="padding: 0 18px 18px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px">\n')
    for n, st, det, amt in ((1, 'libre', '', ''), (2, 'abierta', '18 min', 'Q186'), (3, 'libre', '', ''),
                            (4, 'sel', '42 min', 'Q284'), (5, 'libre', '', ''), (6, 'atencion', 'Cuenta', 'Q340'),
                            (7, 'atencion', 'Lista 12 min', 'Q128'), (8, 'libre', '', ''), (9, 'abierta', '6 min', 'Q95')):
        if st == 'sel':
            izq += ('          <div class="mesa" style="background: var(--acc); border-color: var(--acc); box-shadow: none">'
                    '<div class="n" style="color: #ffffff">%d</div>'
                    '<div class="amt" style="color: rgba(255,255,255,0.86)">%s</div>'
                    '<div class="st" style="color: rgba(255,255,255,0.86)">%s</div></div>\n' % (n, amt, det))
        elif st == 'libre':
            izq += '          <div class="mesa" data-s="libre"><div class="n">%d</div><div class="st">Libre</div></div>\n' % n
        else:
            izq += ('          <div class="mesa" data-s="%s"><div class="n">%d</div><div class="amt">%s</div>'
                    '<div class="st">%s</div></div>\n' % (st, n, amt, det))
    izq += ('        </div>\n'
            '        <div style="margin-top: auto; padding: 14px 18px 18px; border-top: 1px solid var(--hair); display: flex; align-items: center; gap: 10px">\n'
            '          <span class="tile">%s</span><div style="flex: 1; font-size: 13.5px; color: var(--ink2); font-weight: 500">Para llevar</div>%s\n'
            '        </div>\n'
            '      </div>\n' % (svg('bolsa', 'i-sm'), svg('mas', 'i-sm', 'color: var(--acc-ink)')))

    def plato(nombre, det, estado, color, precio):
        return ('            <div class="row" style="padding: 13px 18px">'
                '<div style="flex: 1; min-width: 0"><div class="ttl">%s</div><div class="sub">%s</div></div>'
                '<div class="pill" style="color: %s; width: 118px; flex-shrink: 0">%s%s</div>'
                '<div style="width: 86px; text-align: right; flex-shrink: 0">%s</div></div>\n'
                % (nombre, det, color, dot(color), estado, mono(precio)))

    der = ('      <div style="flex: 1; min-width: 0; display: flex; flex-direction: column">\n'
           '        <div style="height: 56px; flex-shrink: 0; display: flex; align-items: center; gap: 12px; padding: 0 22px; border-bottom: 1px solid var(--hair)">\n'
           '          <div style="flex: 1"><span style="font-size: 15.5px; font-weight: 600; color: var(--ink)">Mesa 4</span>'
           '<span style="font-size: 13.5px; color: var(--ink3); margin-left: 10px">Abierta hace 42 min · Carlos</span></div>\n'
           '          <div class="btn2">%s<span>Cuenta y dividir</span></div>\n'
           '          <div class="btn">%s<span>Cobrar y cerrar</span></div>\n'
           '        </div>\n'
           '        <div style="flex: 1; min-height: 0; overflow: hidden; padding: 16px 22px; display: flex; flex-direction: column; gap: 16px">\n'
           % (svg('dividir', 'i-sm'), svg('wallet', 'i-sm')))
    der += ('          <div>\n            <div class="lbl"><span>En la mesa</span><span class="act">Editar</span></div>\n'
            '            <div class="group">\n'
            + plato('2 · Carne asada', 'Término medio · sin cebolla', 'En cocina', 'var(--warn)', 'Q210.00')
            + '            <div class="hr"></div>\n'
            + plato('1 · Sopa del día', 'Va de entrada', 'Servida', 'var(--ok)', 'Q38.00')
            + '            <div class="hr"></div>\n'
            + plato('2 · Limonada', 'Con hielo', 'Servida', 'var(--ok)', 'Q36.00')
            + '            <div class="hrf"></div>\n'
            + '            <div class="row" style="padding: 13px 18px; background: color-mix(in srgb, var(--ink) 3%, transparent)">'
              '<div style="flex: 1; font-size: 14.5px; font-weight: 600; color: var(--ink)">Total</div>'
              '<div>' + mono('Q284.00', 16) + '</div></div>\n'
            '            </div>\n          </div>\n')
    # Buscador persistente con resultados en línea
    der += ('          <div>\n            <div class="lbl"><span>Agregar sin salir de la mesa</span></div>\n'
            '            <div style="display: flex; align-items: center; gap: 9px; height: 44px; padding: 0 14px; border-radius: 11px; background: var(--surf); border: 1px solid var(--acc); box-shadow: 0 0 0 3px var(--acc-soft)">%s'
            '<span style="font-size: 15px; color: var(--ink)">carn</span>'
            '<span style="width: 1.5px; height: 18px; background: var(--acc); margin-left: 1px"></span></div>\n'
            % svg('buscar', 'i', 'color: var(--ink3)'))

    def res(nombre, cat, precio, qty=0):
        if qty:
            ctrl = ('<div style="display: flex; align-items: center; gap: 10px"><div class="step">%s</div>'
                    '<span class="mono" style="font-size: 15px; min-width: 14px; text-align: center">%d</span>'
                    '<div class="step" style="border-color: var(--acc); color: var(--acc-ink)">%s</div></div>'
                    % (svg('menos', 'i-sm'), qty, svg('mas', 'i-sm')))
        else:
            ctrl = '<div class="step">%s</div>' % svg('mas', 'i-sm')
        return ('              <div class="row" style="padding: 11px 14px 11px 18px">'
                '<div style="flex: 1; min-width: 0"><div class="ttl">%s</div><div class="sub">%s</div></div>'
                '<div style="flex-shrink: 0; margin-right: 14px">%s</div>%s</div>\n'
                % (nombre, cat, mono(precio, 14, 'var(--ink2)'), ctrl))

    der += ('            <div class="group" style="margin-top: 10px">\n'
            + res('Carne asada', 'Platos fuertes · elige término', 'Q105.00', 1)
            + '              <div class="hr"></div>\n'
            + res('Carnitas de cerdo', 'Platos fuertes', 'Q98.00')
            + '              <div class="hr"></div>\n'
            + res('Caldo de carne', 'Sopas', 'Q45.00')
            + '            </div>\n'
            '            <div style="display: flex; align-items: center; gap: 14px; margin-top: 12px">\n'
            '              <div style="flex: 1; font-size: 13px; color: var(--ink3)">Lo que agregues se manda a cocina sin salir de esta pantalla.</div>\n'
            '              <div class="btn" style="height: 40px; border-radius: 11px; padding: 0 18px">Enviar 1 plato · Q105.00</div>\n'
            '            </div>\n'
            '          </div>\n')

    def hito(hora, que, quien):
        return ('              <div class="row" style="padding: 11px 18px">'
                '<div class="mono" style="width: 58px; flex-shrink: 0; font-size: 13px; color: var(--ink3)">%s</div>'
                '<div style="flex: 1; min-width: 0; font-size: 13.5px; color: var(--ink2)">%s</div>'
                '<div style="font-size: 13px; color: var(--ink4); flex-shrink: 0">%s</div></div>\n'
                % (hora, que, quien))

    der += ('          <div>\n            <div class="lbl"><span>Cómo va la mesa</span></div>\n'
            '            <div class="group">\n'
            + hito('12:07', 'Se abrió la mesa · 3 platos a cocina', 'Carlos')
            + '              <div class="hr"></div>\n'
            + hito('12:21', 'Sopa y limonadas servidas', 'Carlos')
            + '            </div>\n          </div>\n')

    der += ('        </div>\n      </div>\n')

    return ('  <div style="display: flex; flex-direction: column; gap: 14px; align-items: center">\n'
            '    <div class="sc" data-t="light" style="width: 1194px; height: 834px; border-radius: 26px; overflow: hidden; '
            'background: var(--bg); color: var(--ink); display: flex; box-shadow: 0 18px 50px rgba(0,0,0,0.20); flex-shrink: 0">\n'
            + izq + der +
            '    </div>\n'
            '    <div class="cap" style="max-width: 760px">iPad o tablet del local · la comanda de la mesa nunca desaparece; '
            'agregar un plato no navega a ninguna parte.</div>\n  </div>\n')


def c_phone():
    b = '        <div style="height: 0"></div>\n'
    b += largetitle('Sala', '5 mesas con gente',
                    '          <div class="ghost" style="width: 40px; height: 40px; border-radius: 12px">%s</div>\n' % svg('buscar', 'i'))
    grid = (mesa(1, 'libre') + mesa(2, 'abierta', '18 min', 'Q186.00') + mesa(3, 'libre')
            + mesa(4, 'abierta', 'Servida · 42 min', 'Q284.00') + mesa(5, 'libre')
            + mesa(6, 'atencion', 'Pidió la cuenta', 'Q340.00'))
    body = ('        <div>\n          <div class="lbl"><span>Mesas</span></div>\n'
            '          <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px">\n'
            + grid + '          </div>\n        </div>\n')
    body += group([row('Ana L.', 'Para llevar · lista', trail=chev())], label='Barra y para llevar')
    return b + scroll(body) + tabbar(WAITER_TABS, 'sala')


def build():
    write('Main.dc.html', board(1370, 1030, [
        (a_sala(), 'La sala — lo primero y lo único que se abre. Sin pasos, sin bandas apiladas.'),
        (a_mesa(), 'Mesa 4 — la mesa ES el pedido: lo que hay, en qué va cada plato y qué se puede hacer.'),
        (a_agregar(), 'Agregar platos — una lista, un toque por plato, y se suma a la mesa. No hay paso 3.'),
    ]))
    write('OpcionB.dc.html', board(1370, 1030, [
        (b_pedidos(), 'Pedidos — la misma lista que ve el dueño; mesa, llevar y domicilio se leen igual.'),
        (b_nueva(), 'Nueva comanda — una sola pantalla: destino, platos y nota, todo editable en su sitio.'),
        (b_hoja(), 'La hoja del menú sube sobre la comanda: se agregan varios platos sin perderla de vista.'),
    ]))
    d = HEAD.replace('__CSS__', CSS)
    d += ('<div class="sc" data-t="light" style="width: 1720px; height: 1000px; background: #e9e9ee; padding: 44px 40px; '
          'display: flex; align-items: flex-start; justify-content: center; gap: 40px">\n')
    d += c_ipad()
    d += phone(c_phone(), 'En el teléfono la columna derecha se vuelve la pantalla siguiente: '
                          'ahí Opción C es exactamente Opción A.')
    d += '</div>\n' + TAIL.replace('__W__', '1720').replace('__H__', '1000')
    write('OpcionC.dc.html', d)


if __name__ == '__main__':
    build()
