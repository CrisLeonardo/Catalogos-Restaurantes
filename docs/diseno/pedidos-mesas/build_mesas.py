# -*- coding: utf-8 -*-
"""Genera Mesas.dc.html — el salón dentro del panel del dueño.

Es la pestaña «Mesas» de Pedidos que el rediseño ya prometía: el estado
real del salón, no la pantalla de configuración que hoy se llama así.
La barra lateral y la barra de herramientas son las mismas de
diseno-panel-hig/build_screens.py, sin tocar un valor.
"""
import os
from kit import CSS, HEAD, TAIL, svg, chev, write

here = os.path.dirname(os.path.abspath(__file__))
os.chdir(here)

EXTRA = """
    .sc .nl { display: flex; align-items: center; gap: 11px; padding: 7px 10px; border-radius: 8px; color: var(--ink); font-size: 14px; font-weight: 500; }
"""

NAV = [('hoy', 'Hoy', ''), ('pedidos', 'Pedidos', '8'), ('menu', 'Menú', ''),
       ('clientes', 'Clientes', ''), ('negocio', 'Negocio', ''), ('ajustes', 'Ajustes', '')]


def sidebar(active):
    out = ['  <div style="width: 240px; flex-shrink: 0; display: flex; flex-direction: column; padding: 16px 12px; background: var(--side); border-right: 1px solid var(--hair)">']
    out.append('''
    <div style="display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 10px; border-radius: 8px; background: var(--surf); border: 1px solid var(--hair); margin-bottom: 16px; color: var(--ink4)">
      %s
      <span style="font-size: 13px; color: var(--ink4)">Buscar en el panel</span>
    </div>

    <div style="display: flex; align-items: center; gap: 10px; padding: 4px 8px 16px">
      <div style="width: 34px; height: 34px; border-radius: 9px; background: color-mix(in srgb, var(--ink) 9%%, transparent); display: grid; place-items: center; flex-shrink: 0; font-size: 14px; font-weight: 600; color: var(--ink)">R</div>
      <div style="min-width: 0">
        <div style="font-size: 14px; font-weight: 600; color: var(--ink); line-height: 1.2">El Rincón</div>
        <div style="font-size: 11.5px; color: var(--ink3); line-height: 1.2; margin-top: 1px">Centro · Plan Estándar</div>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 2px; flex: 1">''' % svg('buscar', 'i-sm'))
    for key, label, badge in NAV:
        if key == active:
            out.append('      <div class="nl" style="background: var(--acc); color: #ffffff; font-weight: 600">'
                       '<span class="tile" style="background: rgba(255,255,255,0.22); color: #ffffff">%s</span>'
                       '<span style="flex: 1">%s</span>%s</div>'
                       % (svg(key), label,
                          ('<span class="mono" style="font-size: 12.5px; color: #ffffff">%s</span>' % badge) if badge else ''))
        else:
            out.append('      <div class="nl"><span class="tile">%s</span><span style="flex: 1">%s</span>%s</div>'
                       % (svg(key), label,
                          ('<span class="mono" style="font-size: 12.5px; color: var(--ink3)">%s</span>' % badge) if badge else ''))
    out.append('''    </div>

    <div style="display: flex; align-items: center; gap: 10px; padding: 10px 8px 2px; border-top: 1px solid var(--hair)">
      <div style="width: 26px; height: 26px; border-radius: 99px; background: color-mix(in srgb, var(--ink) 11%%, transparent); display: grid; place-items: center; flex-shrink: 0; font-size: 11.5px; font-weight: 600; color: var(--ink)">C</div>
      <div style="flex: 1; min-width: 0; font-size: 13px; font-weight: 500; color: var(--ink2)">Carlos</div>
      %s
    </div>
  </div>''' % svg('chevdown', 'i-sm', 'color: var(--ink4)'))
    return '\n'.join(out)


def toolbar(title):
    return ('    <div style="height: 52px; flex-shrink: 0; display: flex; align-items: center; gap: 10px; padding: 0 32px; border-bottom: 1px solid var(--hair); background: color-mix(in srgb, var(--bg) 82%, transparent)">\n'
            '      <div style="flex: 1; font-size: 13.5px; font-weight: 600; color: var(--ink2)">' + title + '</div>\n'
            '      <div class="btn2">' + svg('servicio', 'i-sm') + '<span>Modo servicio</span></div>\n'
            '      <div class="btn">' + svg('mas', 'i-sm') + '<span>Tomar pedido</span></div>\n'
            '      <div class="ghost">' + svg('luna', 'i-sm') + '</div>\n'
            '      <div class="ghost">' + svg('campana', 'i-sm') + '</div>\n'
            '    </div>\n')


def ficha(n, estado='libre', det='', amt='', quien=''):
    if estado == 'libre':
        return ('          <div class="mesa" data-s="libre"><div class="n">%d</div>'
                '<div class="st">Libre</div></div>\n' % n)
    q = ('<div class="st" style="color: var(--ink4)">%s</div>' % quien) if quien else ''
    return ('          <div class="mesa" data-s="%s"><div class="n">%d</div>'
            '<div class="amt">%s</div><div class="st">%s</div>%s</div>\n' % (estado, n, amt, det, q))


def fila(mesa, quien, det, estado, color, total):
    return ('            <div class="row">\n'
            '              <div style="width: 96px; flex-shrink: 0; font-size: 14.5px; font-weight: 600; color: var(--ink)">%s</div>\n'
            '              <div style="width: 108px; flex-shrink: 0; font-size: 13.5px; color: var(--ink3)">%s</div>\n'
            '              <div style="flex: 1; min-width: 0; font-size: 13.5px; color: var(--ink3)">%s</div>\n'
            '              <div class="pill" style="width: 132px; flex-shrink: 0; color: %s"><span class="dot" style="color: %s"></span>%s</div>\n'
            '              <div class="mono" style="width: 92px; text-align: right; flex-shrink: 0; font-size: 14.5px; color: var(--ink)">%s</div>\n'
            '              <div style="margin-left: 4px">%s</div>\n'
            '            </div>\n' % (mesa, quien, det, color, color, estado, total, chev()))


def build():
    W, H = 1280, 860
    d = HEAD.replace('__CSS__', CSS + EXTRA)
    d += ('<div class="sc" data-t="light" style="width: %dpx; height: %dpx; display: flex; background: var(--bg); '
          'color: var(--ink); overflow: hidden">\n\n' % (W, H))
    d += sidebar('pedidos') + '\n\n'
    d += '  <div style="flex: 1; min-width: 0; display: flex; flex-direction: column">\n\n'
    d += toolbar('Pedidos') + '\n'
    d += '    <div style="padding: 20px 32px; overflow: hidden">\n'
    d += '      <div style="display: flex; flex-direction: column; gap: 16px">\n'
    d += ('        <div>\n'
          '          <div class="disp" style="font-size: 26px; line-height: 1.15; color: var(--ink)">Pedidos</div>\n'
          '          <div style="font-size: 14.5px; color: var(--ink3); margin-top: 6px">8 en curso · 5 mesas con gente · Q3,480 vendidos hoy</div>\n'
          '        </div>\n')
    d += ('        <div><div class="seg"><div>En vivo</div><div>Cocina</div><div data-on="1">Mesas</div>'
          '<div>Repartidores</div><div>Historial</div></div></div>\n')

    # El salón
    grid = ''
    grid += ficha(1, 'libre')
    grid += ficha(2, 'abierta', '2 platos · 18 min', 'Q186.00', 'Carlos')
    grid += ficha(3, 'libre')
    grid += ficha(4, 'abierta', 'Servida · 42 min', 'Q284.00', 'Carlos')
    grid += ficha(5, 'libre')
    grid += ficha(6, 'atencion', 'Pidió la cuenta', 'Q340.00', 'Ana')
    grid += ficha(7, 'atencion', 'Lista hace 12 min', 'Q128.00', 'Ana')
    grid += ficha(8, 'libre')
    grid += ficha(9, 'abierta', '1 plato · 6 min', 'Q95.00', 'Luis')
    grid += ficha(10, 'libre')
    grid += ficha(11, 'libre')
    grid += ficha(12, 'libre')
    d += ('        <div>\n'
          '          <div class="lbl"><span>El salón ahora</span><span class="act">Ver el plano</span></div>\n'
          '          <div style="display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px">\n'
          + grid + '          </div>\n        </div>\n')

    filas = (fila('Mesa 2', 'Carlos', '2 Carne asada · 1 Limonada', 'En cocina', 'var(--warn)', 'Q186.00')
             + '            <div class="hr"></div>\n'
             + fila('Mesa 4', 'Carlos', '2 Carne asada · 1 Sopa · 2 Limonada', 'Servida', 'var(--ok)', 'Q284.00')
             + '            <div class="hr"></div>\n'
             + fila('Mesa 6', 'Ana', '4 Desayuno chapín · 2 Café', 'Pidió la cuenta', 'var(--acc-ink)', 'Q340.00')
             + '            <div class="hr"></div>\n'
             + fila('Mesa 7', 'Ana', '1 Pizza familiar', 'Lista hace 12 min', 'var(--acc-ink)', 'Q128.00')
             + '            <div class="hr"></div>\n'
             + fila('Mesa 9', 'Luis', '1 Pollo a la plancha', 'En cocina', 'var(--warn)', 'Q95.00'))
    d += ('        <div>\n          <div class="lbl"><span>Mesas abiertas</span><span class="act">Cerrar todas las servidas</span></div>\n'
          '          <div class="group">\n' + filas + '          </div>\n        </div>\n')

    d += ('        <div>\n          <div class="group">\n'
          '            <div class="row"><span class="tile">%s</span>'
          '<div style="flex: 1; min-width: 0"><div class="ttl">Configuración del salón</div>'
          '<div class="sub">Cuántas mesas, códigos QR y NFC, plano por niveles, propina</div></div>'
          '<span style="font-size: 13.5px; color: var(--ink3)">Ajustes › Salón</span><div style="margin-left: 10px">%s</div></div>\n'
          '          </div>\n'
          '          <div style="font-size: 12.5px; color: var(--ink3); line-height: 1.45; padding: 8px 4px 0">'
          'Hoy «Mesas» es una pantalla de ajustes con el nombre de una pantalla de operación. '
          'Esto separa las dos: acá vive lo que está pasando, en Ajustes vive cómo está armado el salón.</div>\n'
          '        </div>\n' % (svg('qr', 'i-sm'), chev()))

    d += '      </div>\n    </div>\n  </div>\n\n</div>\n'
    d += TAIL.replace('__W__', str(W)).replace('__H__', str(H))
    write('Mesas.dc.html', d)


if __name__ == '__main__':
    build()
