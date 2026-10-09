# -*- coding: utf-8 -*-
"""Opción C a fondo: las pantallas que faltaban para poder construirla.

Tablet a 1194x834 (iPad 11" horizontal). El armazón —riel izquierdo de
340 px + panel derecho fluido— es el mismo en las cuatro pantallas de
tablet; solo cambia qué hay elegido y qué muestra la derecha.
"""
import os
from kit import CSS, HEAD, TAIL, svg, chev, write, phone, largetitle, navbar, group, tabbar

here = os.path.dirname(os.path.abspath(__file__))
os.chdir(here)

TAB_W, TAB_H = 1194, 834
WAITER_TABS = [('sala', 'Sala', 'sala'), ('pedidos', 'Pedidos', 'pedidos'), ('mas', 'Más', 'puntos')]


def mono(txt, size=14.5, color='var(--ink)'):
    return '<span class="mono" style="font-size: %spx; color: %s">%s</span>' % (size, color, txt)


def dot(color):
    return '<span class="dot" style="color: %s"></span>' % color


def row(main, sub='', right='', trail='', pad='13px 18px', lead=''):
    subh = ('<div class="sub">%s</div>' % sub) if sub else ''
    rh = ('<div style="flex-shrink: 0; text-align: right">%s</div>' % right) if right else ''
    th = ('<div style="flex-shrink: 0; display: flex; align-items: center">%s</div>' % trail) if trail else ''
    return ('            <div class="row" style="padding: %s">%s<div style="flex: 1; min-width: 0">'
            '<div class="ttl">%s</div>%s</div>%s%s</div>\n' % (pad, lead, main, subh, rh, th))


def blk(label, inner, action=None, foot=None):
    act = '<span class="act">%s</span>' % action if action else ''
    lbl = '          <div class="lbl"><span>%s</span>%s</div>\n' % (label, act) if label else ''
    footh = ('          <div style="font-size: 12.5px; color: var(--ink3); line-height: 1.45; padding: 8px 4px 0">%s</div>\n' % foot) if foot else ''
    return '        <div>\n' + lbl + '          <div class="group">\n' + inner + '          </div>\n' + footh + '        </div>\n'


def hr():
    return '            <div class="hr"></div>\n'


# ── Riel izquierdo ────────────────────────────────────────────────
SALON = [
    (1, 'libre', '', ''), (2, 'abierta', '18 min', 'Q186'), (3, 'libre', '', ''),
    (4, 'abierta', '42 min', 'Q284'), (5, 'libre', '', ''), (6, 'atencion', 'Cuenta', 'Q340'),
    (7, 'atencion', 'Lista 12 min', 'Q128'), (8, 'libre', '', ''), (9, 'abierta', '6 min', 'Q95'),
]


def rail(tab='sala', sel=None, llevar_sel=False):
    o = ('      <div style="width: 340px; flex-shrink: 0; display: flex; flex-direction: column; '
         'background: var(--side); border-right: 1px solid var(--hair)">\n'
         '        <div style="padding: 20px 18px 12px">\n'
         '          <div class="disp" style="font-size: 24px; color: var(--ink)">El Rincón</div>\n'
         '          <div style="font-size: 13.5px; color: var(--ink3); margin-top: 4px">5 mesas con gente · 2 te necesitan</div>\n'
         '        </div>\n'
         '        <div style="padding: 0 18px 14px"><div class="seg" style="display: flex; width: 100%%">'
         '<div%s style="flex: 1; text-align: center">Sala</div>'
         '<div%s style="flex: 1; text-align: center">Pedidos</div></div></div>\n'
         % (' data-on="1"' if tab == 'sala' else '', ' data-on="1"' if tab == 'pedidos' else ''))

    if tab == 'sala':
        o += '        <div style="padding: 0 18px 18px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px">\n'
        for n, st, det, amt in SALON:
            if n == sel:
                o += ('          <div class="mesa" style="background: var(--acc); border-color: var(--acc); box-shadow: none">'
                      '<div class="n" style="color: #ffffff">%d</div>'
                      '<div class="amt" style="color: rgba(255,255,255,0.86)">%s</div>'
                      '<div class="st" style="color: rgba(255,255,255,0.86)">%s</div></div>\n' % (n, amt, det))
            elif st == 'libre':
                o += '          <div class="mesa" data-s="libre"><div class="n">%d</div><div class="st">Libre</div></div>\n' % n
            else:
                o += ('          <div class="mesa" data-s="%s"><div class="n">%d</div><div class="amt">%s</div>'
                      '<div class="st">%s</div></div>\n' % (st, n, amt, det))
        o += '        </div>\n'
        sel_style = (' style="background: var(--acc); border-radius: 10px; color: #ffffff"' if llevar_sel else '')
        col = '#ffffff' if llevar_sel else 'var(--ink2)'
        o += ('        <div style="margin-top: auto; padding: 14px 18px 18px; border-top: 1px solid var(--hair)">\n'
              '          <div style="display: flex; align-items: center; gap: 10px; padding: 8px 10px"%s>\n'
              '            <span class="tile">%s</span>'
              '<div style="flex: 1; font-size: 13.5px; color: %s; font-weight: 500">Para llevar · 1 en curso</div>%s\n'
              '          </div>\n        </div>\n'
              % (sel_style, svg('bolsa', 'i-sm'), col, svg('mas', 'i-sm', 'color: var(--acc-ink)')))
    else:
        def ped(quien, det, estado, color, total, on=False):
            bg = ' background: var(--acc);' if on else ''
            c1 = '#ffffff' if on else 'var(--ink)'
            c2 = 'rgba(255,255,255,0.86)' if on else color
            c3 = 'rgba(255,255,255,0.92)' if on else 'var(--ink)'
            return ('          <div style="display: flex; align-items: center; gap: 12px; padding: 11px 12px; border-radius: 10px;%s">\n'
                    '            <div style="flex: 1; min-width: 0">\n'
                    '              <div style="font-size: 14.5px; font-weight: 600; color: %s">%s</div>\n'
                    '              <div class="pill" style="color: %s; margin-top: 2px; font-size: 12.5px">%s%s · %s</div>\n'
                    '            </div>\n'
                    '            <span class="mono" style="font-size: 14px; color: %s">%s</span>\n'
                    '          </div>\n' % (bg, c1, quien, c2, dot(c2), estado, det, c3, total))
        o += '        <div style="padding: 0 12px; display: flex; flex-direction: column; gap: 2px">\n'
        o += ped('Llevar · Ana L.', 'hace 4 min', 'Nuevo', 'var(--acc-ink)', 'Q95', on=llevar_sel)
        o += ped('Mesa 4', 'hace 42 min', 'Servida', 'var(--ok)', 'Q284')
        o += ped('Mesa 6', 'hace 51 min', 'Pidió la cuenta', 'var(--acc-ink)', 'Q340')
        o += ped('Mesa 7', 'hace 12 min', 'Lista sin llevar', 'var(--acc-ink)', 'Q128')
        o += ped('Mesa 2', 'hace 18 min', 'En cocina', 'var(--warn)', 'Q186')
        o += ped('Domicilio · Zona 10', 'hace 12 min', 'En camino', 'var(--warn)', 'Q180')
        o += ped('Mesa 9', 'hace 6 min', 'En cocina', 'var(--warn)', 'Q95')
        o += '        </div>\n'
        o += ('        <div style="margin-top: auto; padding: 14px 18px 18px; border-top: 1px solid var(--hair); '
              'font-size: 12.5px; color: var(--ink3); line-height: 1.45">Mesa, llevar y domicilio en una sola lista: '
              'el panel derecho se adapta a lo que elijas.</div>\n')
    return o + '      </div>\n'


def topbar(titulo, sub, botones):
    return ('        <div style="height: 56px; flex-shrink: 0; display: flex; align-items: center; gap: 12px; '
            'padding: 0 22px; border-bottom: 1px solid var(--hair)">\n'
            '          <div style="flex: 1; min-width: 0"><span style="font-size: 15.5px; font-weight: 600; color: var(--ink)">%s</span>'
            '<span style="font-size: 13.5px; color: var(--ink3); margin-left: 10px">%s</span></div>\n'
            '%s        </div>\n' % (titulo, sub, botones))


def pane(inner, top):
    return ('      <div style="flex: 1; min-width: 0; display: flex; flex-direction: column">\n'
            + top +
            '        <div style="flex: 1; min-height: 0; overflow: hidden; padding: 16px 22px; '
            'display: flex; flex-direction: column; gap: 16px">\n'
            + inner +
            '        </div>\n      </div>\n')


def tablet(body, theme='light', caption=''):
    d = ('  <div style="display: flex; flex-direction: column; gap: 14px; align-items: center">\n'
         '    <div class="sc" data-t="%s" style="width: %dpx; height: %dpx; border-radius: 26px; overflow: hidden; '
         'background: var(--bg); color: var(--ink); display: flex; box-shadow: 0 18px 50px rgba(0,0,0,0.20); flex-shrink: 0">\n'
         % (theme, TAB_W, TAB_H))
    d += body
    d += '    </div>\n'
    if caption:
        d += '    <div class="cap" style="max-width: 900px">%s</div>\n' % caption
    return d + '  </div>\n'


def board(w, h, inner, theme='light'):
    d = HEAD.replace('__CSS__', CSS)
    d += ('<div class="sc" data-t="%s" style="width: %dpx; height: %dpx; background: #e9e9ee; padding: 44px 40px; '
          'display: flex; align-items: flex-start; justify-content: center; gap: 40px">\n' % (theme, w, h))
    d += inner
    d += '</div>\n' + TAIL.replace('__W__', str(w)).replace('__H__', str(h))
    return d


# ══════════════════════════════════════════════════════════════════
# C · Sala sin nada elegido
# ══════════════════════════════════════════════════════════════════
def c_sala():
    def aten(mesa, motivo, desde, total, icono):
        return row(mesa, motivo,
                   lead='<span class="tile" style="background: var(--acc-soft); color: var(--acc-ink)">%s</span>' % svg(icono, 'i-sm'),
                   right='<div class="pill" style="color: var(--acc-ink); justify-content: flex-end">%s</div>'
                         '<div style="margin-top: 3px">%s</div>' % (desde, mono(total, 13.5, 'var(--ink2)')),
                   pad='12px 18px')

    inner = blk('Te necesitan ahora',
                aten('Mesa 6', 'Pidió la cuenta desde el menú', 'hace 3 min', 'Q340.00', 'mano') + hr() +
                aten('Mesa 7', 'La pizza lleva 12 minutos lista en la barra', 'hace 12 min', 'Q128.00', 'reloj'),
                foot='Las dos salen de datos que ya existen: la primera de <b>waiter_calls</b>, la segunda de un pedido '
                     'en READY con el reloj de etapa pasado de rojo.')

    def col(label, valor, primera=False):
        borde = '' if primera else '; border-left: 1px solid var(--hair)'
        return ('            <div style="padding: 16px 20px%s">\n'
                '              <div style="font-size: 13px; color: var(--ink3)">%s</div>\n'
                '              <div class="mono" style="font-size: 24px; color: var(--ink); margin-top: 5px">%s</div>\n'
                '            </div>\n' % (borde, label, valor))

    inner += ('        <div>\n          <div class="lbl"><span>El turno</span><span class="act">Ver el día en Negocio</span></div>\n'
              '          <div class="group" style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr))">\n'
              + col('Mesas con gente', '5 / 12', True) + col('En cocina', '3')
              + col('Sin cobrar', 'Q1,033') + col('Mesa más lenta', '51 min') +
              '          </div>\n        </div>\n')

    inner += blk('Mesas servidas sin cobrar',
                 row('Mesa 4', 'Servida hace 21 minutos · Carlos',
                     right=mono('Q284.00'),
                     trail='<div class="btn2" style="margin-left: 14px">Cobrar</div>') + hr() +
                 row('Mesa 6', 'Servida hace 34 minutos · Ana',
                     right=mono('Q340.00'),
                     trail='<div class="btn2" style="margin-left: 14px">Cobrar</div>'),
                 foot='Es la fuga de dinero más común de un salón lleno: mesas que ya comieron y nadie cerró.')

    top = topbar('Sala', 'Jueves 21 de agosto · abierto desde las 11:00',
                 '          <div class="btn2">%s<span>Modo servicio</span></div>\n'
                 '          <div class="btn">%s<span>Pedido para llevar</span></div>\n'
                 % (svg('servicio', 'i-sm'), svg('mas', 'i-sm')))
    return tablet(rail('sala', sel=None) + pane(inner, top),
                  caption='Sin nada elegido, el panel derecho no se queda en blanco: contesta la única pregunta '
                          'que importa en hora pico — <b>¿quién me necesita ahora?</b> Así la tablet sirve aunque nadie la toque.')


# ══════════════════════════════════════════════════════════════════
# C · Cobrar y cerrar
# ══════════════════════════════════════════════════════════════════
def c_cobrar():
    def linea(nombre, det, precio, marcado=True):
        box = ('<span style="width: 22px; height: 22px; border-radius: 7px; flex-shrink: 0; display: grid; place-items: center; '
               'background: var(--acc); color: #ffffff">%s</span>' % svg('check', 'i-sm')) if marcado else (
              '<span style="width: 22px; height: 22px; border-radius: 7px; flex-shrink: 0; border: 1.5px solid var(--hair2)"></span>')
        return row(nombre, det, lead=box, right=mono(precio), pad='12px 18px')

    inner = ('        <div><div class="seg" style="display: flex; width: 100%">'
             '<div style="flex: 1; text-align: center">Toda la cuenta</div>'
             '<div style="flex: 1; text-align: center">Por persona</div>'
             '<div data-on="1" style="flex: 1; text-align: center">Por platos</div></div></div>\n')

    inner += blk('Cobrando ahora · 3 de 5 platos',
                 linea('2 · Carne asada', 'Término medio · sin cebolla', 'Q210.00') + hr() +
                 linea('1 · Sopa del día', '', 'Q38.00') + hr() +
                 linea('2 · Limonada', 'Con hielo', 'Q36.00', marcado=False) + hr() +
                 linea('1 · Café', '', 'Q15.00', marcado=False),
                 action='Marcar todos')

    inner += ('        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px">\n'
              '          <div>\n            <div class="lbl"><span>Propina</span></div>\n'
              '            <div class="seg" style="display: flex; width: 100%"><div style="flex: 1; text-align: center">Sin</div>'
              '<div data-on="1" style="flex: 1; text-align: center">10 %</div>'
              '<div style="flex: 1; text-align: center">15 %</div>'
              '<div style="flex: 1; text-align: center">Otra</div></div>\n          </div>\n'
              '          <div>\n            <div class="lbl"><span>Cómo paga</span></div>\n'
              '            <div class="seg" style="display: flex; width: 100%"><div data-on="1" style="flex: 1; text-align: center">Efectivo</div>'
              '<div style="flex: 1; text-align: center">Tarjeta</div>'
              '<div style="flex: 1; text-align: center">Transferencia</div></div>\n          </div>\n'
              '        </div>\n')

    inner += ('        <div class="group" style="margin-top: auto">\n'
              '          <div class="row" style="padding: 11px 18px"><div style="flex: 1; font-size: 13.5px; color: var(--ink3)">Subtotal de lo marcado</div><div>%s</div></div>\n'
              '          <div class="hr"></div>\n'
              '          <div class="row" style="padding: 11px 18px"><div style="flex: 1; font-size: 13.5px; color: var(--ink3)">Propina 10 %%</div><div>%s</div></div>\n'
              '          <div class="hrf"></div>\n'
              '          <div class="row" style="padding: 14px 18px; background: color-mix(in srgb, var(--ink) 3%%, transparent)">'
              '<div style="flex: 1; font-size: 15px; font-weight: 600; color: var(--ink)">A cobrar</div><div>%s</div></div>\n'
              '        </div>\n'
              % (mono('Q248.00', 14, 'var(--ink2)'), mono('Q24.80', 14, 'var(--ink2)'), mono('Q272.80', 20)))

    inner += ('        <div style="display: flex; align-items: center; gap: 14px">\n'
              '          <div style="flex: 1; font-size: 12.5px; color: var(--ink3); line-height: 1.45">'
              'Quedan <b style="color: var(--ink2); font-weight: 600">Q51.00</b> sin cobrar en la mesa 4. '
              'La mesa NO se libera hasta que no quede nada pendiente.</div>\n'
              '          <div class="btn2" style="height: 40px; border-radius: 11px; padding: 0 16px">%s<span>Imprimir</span></div>\n'
              '          <div class="btn" style="height: 40px; border-radius: 11px; padding: 0 18px">Cobrar Q272.80</div>\n'
              '        </div>\n' % svg('nota', 'i-sm'))

    top = topbar('Mesa 4 · cobrar', 'Abierta hace 42 min · Carlos',
                 '          <div class="btn2">%s<span>Volver a la comanda</span></div>\n' % svg('chevleft', 'i-sm'))
    return tablet(rail('sala', sel=4) + pane(inner, top),
                  caption='Dividir la cuenta deja de ser una pantalla aparte: es el mismo panel derecho en otro modo. '
                          'La mesa sigue elegida a la izquierda todo el tiempo.')


# ══════════════════════════════════════════════════════════════════
# C · Para llevar
# ══════════════════════════════════════════════════════════════════
def c_llevar():
    def linea(nombre, det, precio, qty):
        return ('            <div class="row" style="padding: 11px 14px 11px 18px">'
                '<div style="flex: 1; min-width: 0"><div class="ttl">%s</div>%s</div>'
                '<div style="flex-shrink: 0; margin-right: 14px">%s</div>'
                '<div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0">'
                '<div class="step">%s</div><span class="mono" style="font-size: 15px; min-width: 14px; text-align: center">%d</span>'
                '<div class="step">%s</div></div></div>\n'
                % (nombre, ('<div class="sub">%s</div>' % det) if det else '',
                   mono(precio, 14, 'var(--ink2)'), svg('menos', 'i-sm'), qty, svg('mas', 'i-sm')))

    inner = blk('Quién recoge',
                row('Ana L.', 'Le avisamos por WhatsApp cuando esté lista',
                    lead='<span class="tile">%s</span>' % svg('user', 'i-sm'),
                    right='<span style="font-size: 14px; color: var(--ink3)">5512 4408</span>', trail=chev()) + hr() +
                row('Lista aproximadamente a las 12:45', 'La cocina lleva 18 minutos de retraso',
                    lead='<span class="tile">%s</span>' % svg('reloj', 'i-sm'), trail=chev()))

    inner += blk('Platos',
                 linea('Hamburguesa doble', 'Sin pepinillo', 'Q95.00', 1) + hr() +
                 linea('Papas grandes', '', 'Q28.00', 2) + hr() +
                 ('            <div class="row" style="padding: 13px 18px; color: var(--acc-ink)">%s'
                  '<div style="flex: 1; font-size: 14.5px; font-weight: 600">Agregar plato</div></div>\n'
                  % svg('mas', 'i', 'color: var(--acc-ink)')),
                 action='3 platos')

    inner += ('        <div style="display: flex; align-items: center; gap: 14px; margin-top: auto">\n'
              '          <div style="flex: 1; font-size: 12.5px; color: var(--ink3); line-height: 1.45">'
              'Un pedido para llevar usa el MISMO panel derecho que una mesa. Lo único que cambia es que arriba, '
              'donde una mesa dice cómo va, este dice quién lo recoge y a qué hora.</div>\n'
              '          <div style="text-align: right">\n'
              '            <div style="font-size: 13px; color: var(--ink3)">Total</div>\n'
              '            <div>%s</div>\n          </div>\n'
              '          <div class="btn" style="height: 42px; border-radius: 11px; padding: 0 20px">Enviar a cocina</div>\n'
              '        </div>\n' % mono('Q151.00', 20))

    top = topbar('Llevar · Ana L.', 'Nuevo · hace 4 min',
                 '          <div class="btn2">%s<span>Imprimir</span></div>\n' % svg('nota', 'i-sm'))
    return tablet(rail('pedidos', llevar_sel=True) + pane(inner, top),
                  caption='Para llevar y domicilio no son ciudadanos de segunda: en la pestaña Pedidos conviven con las '
                          'mesas en una sola lista, y abren en el mismo panel derecho.')


# ══════════════════════════════════════════════════════════════════
# C · Modo oscuro
# ══════════════════════════════════════════════════════════════════
def c_oscuro():
    def plato(nombre, det, estado, color, precio):
        return row(nombre, det,
                   right='<div class="pill" style="color: %s; justify-content: flex-end">%s%s</div>'
                         '<div style="margin-top: 3px">%s</div>' % (color, dot(color), estado, mono(precio, 13.5, 'var(--ink2)')),
                   pad='12px 18px')

    inner = blk('En la mesa',
                plato('2 · Carne asada', 'Término medio · sin cebolla', 'En cocina', 'var(--warn)', 'Q210.00') + hr() +
                plato('1 · Sopa del día', 'Va de entrada', 'Servida', 'var(--ok)', 'Q38.00') + hr() +
                plato('2 · Limonada', 'Con hielo', 'Servida', 'var(--ok)', 'Q36.00') +
                '            <div class="hrf"></div>\n'
                '            <div class="row" style="padding: 13px 18px; background: color-mix(in srgb, var(--ink) 4%, transparent)">'
                '<div style="flex: 1; font-size: 14.5px; font-weight: 600; color: var(--ink)">Total</div><div>'
                + mono('Q284.00', 16) + '</div></div>\n',
                action='Editar')

    inner += ('        <div>\n          <div class="lbl"><span>Agregar sin salir de la mesa</span></div>\n'
              '          <div style="display: flex; align-items: center; gap: 9px; height: 44px; padding: 0 14px; border-radius: 11px; '
              'background: var(--surf); border: 1px solid var(--acc); box-shadow: 0 0 0 3px var(--acc-soft)">%s'
              '<span style="font-size: 15px; color: var(--ink)">carn</span>'
              '<span style="width: 1.5px; height: 18px; background: var(--acc); margin-left: 1px"></span></div>\n'
              '        </div>\n' % svg('buscar', 'i', 'color: var(--ink3)'))

    def res(nombre, cat, precio, qty=0):
        if qty:
            ctrl = ('<div style="display: flex; align-items: center; gap: 10px"><div class="step">%s</div>'
                    '<span class="mono" style="font-size: 15px; min-width: 14px; text-align: center">%d</span>'
                    '<div class="step" style="border-color: var(--acc); color: var(--acc-ink)">%s</div></div>'
                    % (svg('menos', 'i-sm'), qty, svg('mas', 'i-sm')))
        else:
            ctrl = '<div class="step">%s</div>' % svg('mas', 'i-sm')
        return ('            <div class="row" style="padding: 11px 14px 11px 18px">'
                '<div style="flex: 1; min-width: 0"><div class="ttl">%s</div><div class="sub">%s</div></div>'
                '<div style="flex-shrink: 0; margin-right: 14px">%s</div>%s</div>\n'
                % (nombre, cat, mono(precio, 14, 'var(--ink2)'), ctrl))

    inner += ('        <div class="group">\n' + res('Carne asada', 'Platos fuertes · elige término', 'Q105.00', 1)
              + hr() + res('Carnitas de cerdo', 'Platos fuertes', 'Q98.00')
              + hr() + res('Caldo de carne', 'Sopas', 'Q45.00') + '        </div>\n')

    inner += ('        <div style="display: flex; align-items: center; gap: 14px; margin-top: auto">\n'
              '          <div style="flex: 1; font-size: 12.5px; color: var(--ink3)">Mismo marcado, mismas medidas: '
              'solo cambian las variables de color.</div>\n'
              '          <div class="btn" style="height: 40px; border-radius: 11px; padding: 0 18px">Enviar 1 plato · Q105.00</div>\n'
              '        </div>\n')

    top = topbar('Mesa 4', 'Abierta hace 42 min · Carlos',
                 '          <div class="btn2">%s<span>Cuenta y dividir</span></div>\n'
                 '          <div class="btn">%s<span>Cobrar y cerrar</span></div>\n'
                 % (svg('dividir', 'i-sm'), svg('wallet', 'i-sm')))
    return tablet(rail('sala', sel=4) + pane(inner, top), theme='dark',
                  caption='El salón de noche. El interruptor claro/oscuro es el mismo del panel y recuerda la elección de cada aparato.')


# ══════════════════════════════════════════════════════════════════
# C · El teléfono
# ══════════════════════════════════════════════════════════════════
def scroll(inner, pad='0 16px'):
    return ('        <div style="flex: 1; min-height: 0; overflow: hidden; padding: %s; display: flex; '
            'flex-direction: column; gap: 20px">\n%s        </div>\n' % (pad, inner))


def ph_sala():
    b = '        <div style="height: 0"></div>\n'
    b += largetitle('Sala', '5 mesas con gente',
                    '          <div class="ghost" style="width: 40px; height: 40px; border-radius: 12px">%s</div>\n' % svg('buscar', 'i'))

    def aten(mesa, motivo, icono):
        return ('            <div class="row" style="padding: 12px 16px">'
                '<span class="tile" style="background: var(--acc-soft); color: var(--acc-ink)">%s</span>'
                '<div style="flex: 1; min-width: 0"><div class="ttl">%s</div><div class="sub" style="color: var(--acc-ink); font-weight: 600">%s</div></div>'
                '%s</div>\n' % (svg(icono, 'i-sm'), mesa, motivo, chev()))

    body = ('        <div>\n          <div class="lbl"><span>Te necesitan ahora</span></div>\n          <div class="group">\n'
            + aten('Mesa 6', 'Pidió la cuenta', 'mano') + hr()
            + aten('Mesa 7', 'Lista hace 12 min', 'reloj') + '          </div>\n        </div>\n')

    grid = ''
    for n, st, det, amt in SALON[:6]:
        if st == 'libre':
            grid += '            <div class="mesa" data-s="libre"><div class="n">%d</div><div class="st">Libre</div></div>\n' % n
        else:
            grid += ('            <div class="mesa" data-s="%s"><div class="n">%d</div><div class="amt">%s.00</div>'
                     '<div class="st">%s</div></div>\n' % (st, n, amt, det))
    body += ('        <div>\n          <div class="lbl"><span>Mesas</span><span class="act">Plano</span></div>\n'
             '          <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px">\n'
             + grid + '          </div>\n        </div>\n')
    return b + scroll(body) + tabbar(WAITER_TABS, 'sala')


def ph_mesa():
    b = '        <div style="height: 0"></div>\n'
    b += navbar('Mesa 4', 'Abierta hace 42 min · Carlos',
                right='<div class="ghost" style="width: 40px; height: 40px; border-radius: 11px">%s</div>' % svg('user', 'i'))

    def plato(nombre, det, estado, color, precio):
        return ('            <div class="row" style="padding: 12px 16px"><div style="flex: 1; min-width: 0">'
                '<div class="ttl">%s</div>%s</div><div style="flex-shrink: 0; text-align: right">'
                '<div class="pill" style="color: %s; justify-content: flex-end">%s%s</div>'
                '<div style="margin-top: 3px">%s</div></div></div>\n'
                % (nombre, ('<div class="sub">%s</div>' % det) if det else '', color, dot(color), estado,
                   mono(precio, 13.5, 'var(--ink2)')))

    body = ('        <div>\n          <div class="lbl"><span>En la mesa</span><span class="act">Editar</span></div>\n'
            '          <div class="group">\n'
            + plato('2 · Carne asada', 'Término medio · sin cebolla', 'En cocina', 'var(--warn)', 'Q210.00') + hr()
            + plato('1 · Sopa del día', '', 'Servida', 'var(--ok)', 'Q38.00') + hr()
            + plato('2 · Limonada', 'Con hielo', 'Servida', 'var(--ok)', 'Q36.00')
            + '            <div class="hrf"></div>\n'
            + '            <div class="row" style="padding: 13px 16px; background: color-mix(in srgb, var(--ink) 3%, transparent)">'
              '<div style="flex: 1; font-size: 14.5px; font-weight: 600; color: var(--ink)">Total</div><div>'
            + mono('Q284.00', 16) + '</div></div>\n'
            '          </div>\n        </div>\n')
    body += ('        <div>\n          <div class="lbl"><span>Cuenta</span></div>\n          <div class="group">\n'
             + row('Cobrar y cerrar mesa', 'Efectivo, tarjeta o transferencia', trail=chev(), pad='13px 16px') + hr()
             + row('Ver cuenta y dividir', 'Por persona o por platos', trail=chev(), pad='13px 16px')
             + '          </div>\n        </div>\n')
    bar = ('        <div class="bar">\n'
           '          <div class="cta"><span style="display: inline-flex; align-items: center; gap: 9px">%s Agregar platos</span>'
           '<span class="mono" style="font-size: 14px; color: rgba(255,255,255,0.82)">Mesa 4</span></div>\n'
           '        </div>\n' % svg('mas', 'i'))
    return b + scroll(body, pad='16px 16px 0') + bar


def ph_cobrar():
    b = '        <div style="height: 0"></div>\n'
    b += navbar('Cobrar · Mesa 4', '',
                right='<div style="font-size: 15px; font-weight: 500; color: var(--acc-ink); width: 60px; text-align: right">Imprimir</div>')
    body = ('        <div><div class="seg" style="display: flex; width: 100%">'
            '<div data-on="1" style="flex: 1; text-align: center">Toda</div>'
            '<div style="flex: 1; text-align: center">Por persona</div>'
            '<div style="flex: 1; text-align: center">Por platos</div></div></div>\n')
    body += ('        <div>\n          <div class="lbl"><span>Propina</span></div>\n'
             '          <div class="seg" style="display: flex; width: 100%"><div style="flex: 1; text-align: center">Sin</div>'
             '<div data-on="1" style="flex: 1; text-align: center">10 %</div>'
             '<div style="flex: 1; text-align: center">15 %</div>'
             '<div style="flex: 1; text-align: center">Otra</div></div>\n        </div>\n')
    body += ('        <div>\n          <div class="lbl"><span>Cómo paga</span></div>\n          <div class="group">\n'
             + row('Efectivo', '', trail='<span style="color: var(--acc-ink)">%s</span>' % svg('check', 'i-sm'),
                   lead='<span class="tile">%s</span>' % svg('wallet', 'i-sm'), pad='13px 16px') + hr()
             + row('Tarjeta', '', lead='<span class="tile">%s</span>' % svg('qr', 'i-sm'), pad='13px 16px') + hr()
             + row('Transferencia', '', lead='<span class="tile">%s</span>' % svg('flecha', 'i-sm'), pad='13px 16px')
             + '          </div>\n        </div>\n')
    body += ('        <div class="group">\n'
             '          <div class="row" style="padding: 11px 16px"><div style="flex: 1; font-size: 13.5px; color: var(--ink3)">Subtotal</div><div>%s</div></div>\n'
             '          <div class="hr"></div>\n'
             '          <div class="row" style="padding: 11px 16px"><div style="flex: 1; font-size: 13.5px; color: var(--ink3)">Propina 10 %%</div><div>%s</div></div>\n'
             '        </div>\n' % (mono('Q284.00', 14, 'var(--ink2)'), mono('Q28.40', 14, 'var(--ink2)')))
    bar = ('        <div class="bar">\n'
           '          <div style="display: flex; align-items: baseline; padding: 0 4px 10px">'
           '<span style="flex: 1; font-size: 14px; color: var(--ink3)">A cobrar</span>%s</div>\n'
           '          <div class="cta"><span>Cobrar y liberar la mesa</span>%s</div>\n'
           '        </div>\n' % (mono('Q312.40', 20), svg('flecha', 'i')))
    return b + scroll(body, pad='16px 16px 0') + bar


def c_telefono():
    d = HEAD.replace('__CSS__', CSS)
    d += ('<div class="sc" data-t="light" style="width: 1370px; height: 1030px; background: #e9e9ee; padding: 44px 40px; '
          'display: flex; align-items: flex-start; justify-content: center; gap: 40px">\n')
    d += phone(ph_sala(), 'Sala — igual que la Opción A, más la tira «Te necesitan ahora» que nació del panel derecho de la tablet.')
    d += phone(ph_mesa(), 'Mesa 4 — idéntica a la Opción A. Esta pantalla es la misma en las dos, letra por letra.')
    d += phone(ph_cobrar(), 'Cobrar — no existía en A. Es el panel derecho de la tablet plegado en una pantalla.')
    d += '</div>\n' + TAIL.replace('__W__', '1370').replace('__H__', '1030')
    return d


# ══════════════════════════════════════════════════════════════════
# C · Reglas (documento)
# ══════════════════════════════════════════════════════════════════
def doc(w, h, body):
    d = HEAD.replace('__CSS__', CSS)
    d += ('<div class="sc" data-t="light" style="width: %dpx; min-height: %dpx; background: var(--bg); color: var(--ink); '
          'padding: 56px 52px 52px; display: flex; flex-direction: column; gap: 38px">\n' % (w, h))
    d += body
    return d + '</div>\n' + TAIL.replace('__W__', str(w)).replace('__H__', str(h))


def punto(n, titulo, cuerpo, donde=''):
    dd = ('<div style="font-size: 12.5px; color: var(--ink4); margin-top: 8px; font-family: \'JetBrains Mono\', ui-monospace, monospace">%s</div>' % donde) if donde else ''
    return ('    <div style="display: flex; gap: 16px; padding: 18px 20px">\n'
            '      <div class="num">%s</div>\n'
            '      <div style="flex: 1; min-width: 0">\n'
            '        <div style="font-size: 16px; font-weight: 600; color: var(--ink); line-height: 1.35">%s</div>\n'
            '        <div class="body" style="margin-top: 6px">%s</div>%s\n'
            '      </div>\n    </div>\n' % (n, titulo, cuerpo, dd))


def card(items):
    parts = []
    for i, p in enumerate(items):
        if i:
            parts.append('    <div class="hrf"></div>\n')
        parts.append(p)
    return '  <div class="card">\n%s  </div>\n' % ''.join(parts)


def c_reglas():
    b = ('  <div>\n'
         '    <div class="doc-h1" style="font-size: 40px; line-height: 1.08; color: var(--ink)">Cómo se construye C</div>\n'
         '    <div style="font-size: 17px; line-height: 1.5; color: var(--ink3); margin-top: 14px; max-width: 660px">'
         'Las reglas del armazón de dos paneles, de dónde sale cada dato y qué hay que construir por debajo. '
         'Esto es lo que hay que tener resuelto antes de escribir la primera línea.</div>\n  </div>\n')

    b += '  <div class="h2" style="margin-bottom: -20px">El armazón</div>\n'
    b += card([
        punto('1', 'Riel izquierdo: 340 px fijos, siempre presente',
              'Dos pestañas y nada más: <b>Sala</b> (la rejilla de mesas) y <b>Pedidos</b> (mesas, llevar y domicilio '
              'en una sola lista). Nunca navega: solo cambia qué está elegido.'),
        punto('2', 'Panel derecho: el objeto elegido, fluido',
              'Mesa abierta → su comanda. Pedido para llevar → su comanda. <b>Nada elegido → «Te necesitan ahora»</b>, '
              'que es lo que convierte la tablet en algo útil aunque nadie la toque.'),
        punto('3', 'Agregar un plato NUNCA navega',
              'El buscador vive al fondo del panel derecho y los resultados salen en línea, debajo. Se marca la cantidad, '
              'se envía, y la comanda de arriba se actualiza sola. Cero pantallas intermedias, cero pasos.'),
        punto('4', 'Se pliega a los 1024 px',
              'Por debajo de 1024 px de ancho, el panel derecho deja de ser columna y pasa a ser la pantalla siguiente. '
              'Ahí C <b>es</b> A, con la misma barra de pestañas abajo. Una tablet en vertical se comporta como teléfono, '
              'que es lo correcto.'),
        punto('5', 'Cobrar es un modo del panel derecho, no una pantalla nueva',
              'La mesa sigue elegida a la izquierda mientras se cobra. Al terminar, si no queda nada pendiente, la mesa '
              'se libera sola y la selección vuelve a «nada elegido».'),
    ])

    b += '  <div class="h2" style="margin-bottom: -20px">Los seis estados de una mesa y de dónde salen</div>\n'
    b += card([
        punto('✓', 'Libre — no hay pedido DINE_IN activo',
              'Ya funciona. <b>Se dibuja callada:</b> borde punteado, número apagado, sin monto.',
              'getActiveTableNumbers()'),
        punto('✓', 'Abierta — hay pedido activo',
              'Ya funciona el «desde cuándo» y el «quién atiende». <b>Falta</b> que el mismo dato traiga el estado del '
              'pedido, cuántos platos y el total, que es lo que la ficha necesita mostrar.',
              'TableOccupancy = { since, waiterName } → hay que ampliarlo'),
        punto('✓', 'En cocina — el pedido está en PREP',
              'Ya existe, con los umbrales de cocina configurables por restaurante.',
              'stageClock() · order-status.ts:125'),
        punto('!', 'Lista sin llevar — READY pasado de rojo',
              'El dato ya existe y el reloj ya está escrito (amarillo a los 5 min, rojo a los 10). <b>Nadie lo está '
              'usando para pintar la mesa.</b> Es el aviso más valioso de los seis y sale gratis.',
              'stageClock() · order-status.ts:132'),
        punto('!', 'Pidió la cuenta — el comensal la pidió desde el menú',
              'El módulo «Llamar al mesero» ya guarda la llamada con su mesa y ya viaja por Realtime. <b>Lo único que '
              'falta</b> es distinguir «llamar al mesero» de «pedir la cuenta»: una columna de motivo y un segundo botón '
              'en el menú público.',
              'waiter_calls (mig 048) · falta columna reason'),
        punto('!', 'Servida sin cobrar — SERVED y nadie la cerró',
              'El estado SERVED ya existe. Falta contar los minutos desde que se sirvió y sacarlo a la vista: es la fuga '
              'de dinero más común de un salón lleno.',
              'OrderStatus SERVED (mig 071)'),
    ])

    b += '  <div class="h2" style="margin-bottom: -20px">Lo que hay que construir</div>\n'
    b += card([
        punto('1', 'Ampliar lo que sabe una mesa',
              'Que <code>getActiveTableNumbers</code> devuelva también estado, número de platos, total y el momento en que '
              'se sirvió. Es una consulta, no una tabla nueva.'),
        punto('2', 'Una regla sola que decida «esta mesa te necesita»',
              'Un único sitio que reciba la ocupación y devuelva <b>libre / abierta / atención</b> con su motivo, para que '
              'la tablet, el teléfono y el panel del dueño pinten exactamente lo mismo. Hoy cada pantalla decide por su cuenta.'),
        punto('3', 'Motivo en la llamada al mesero',
              'Una columna en <code>waiter_calls</code> y un segundo botón en el menú público. Es el único cambio de base '
              'de datos de todo esto.'),
        punto('4', 'El armazón de dos paneles',
              'Riel + panel derecho, con la selección viviendo en la URL para que recargar no pierda la mesa. Y la regla '
              'de 1024 px que lo pliega.'),
        punto('5', 'Cobrar y dividir dentro del panel derecho',
              'La parte de dividir ya está hecha y probada; se muda de sitio, no se reescribe.',
              'waiter-bill.tsx'),
        punto('6', 'Quitar el techo de 960 px',
              'Hoy el panel de mesero se topa en 960 px y se centra: en una PC de 1440 son 480 px de aire a los lados. '
              'Ese techo se reemplaza por la regla de dos columnas.',
              'globals.css:2162 · .waiter-wrap'),
        punto('7', 'Modo servicio y la capa de teclado',
              'Pantalla completa sin barra lateral, y encima el teclado: foco permanente en el buscador, número como '
              'cantidad, Enter que agrega y limpia, dos teclas para enviar. Es lo que hace usable la PC. '
              'Ver la página «Los tres tamaños».'),
    ])

    b += '  <div class="h2" style="margin-bottom: -20px">Lo que NO se toca</div>\n'
    b += card([
        punto('=', 'Todo lo que ya funciona sigue igual',
              'El borrador que rescata la comanda a medias. La cola sin conexión con identificador idempotente y el '
              'respaldo contra el hub del local. La anulación con motivo y PIN. El plano del salón con zoom y niveles. '
              'Los sonidos y avisos de pedido nuevo. Cambia dónde se tocan, no qué hacen.'),
    ])

    b += ('  <div style="font-size: 13.5px; color: var(--ink3); line-height: 1.55; max-width: 660px">'
          'Un supuesto que conviene confirmar: esto está dibujado para una tablet de 11 pulgadas en horizontal '
          '(1194 × 834). Si las tablets que vas a usar son de 10" a 1280 × 800, el armazón aguanta igual — solo cambian '
          'las proporciones—, pero mejor saberlo antes que después.</div>\n')
    return doc(900, 2600, b)


if __name__ == '__main__':
    write('CSala.dc.html', board(TAB_W + 80, TAB_H + 150, c_sala()))
    write('CCobrar.dc.html', board(TAB_W + 80, TAB_H + 150, c_cobrar()))
    write('CLlevar.dc.html', board(TAB_W + 80, TAB_H + 150, c_llevar()))
    write('COscuro.dc.html', board(TAB_W + 80, TAB_H + 130, c_oscuro(), theme='dark'))
    write('CTelefono.dc.html', c_telefono())
    write('CReglas.dc.html', c_reglas())
