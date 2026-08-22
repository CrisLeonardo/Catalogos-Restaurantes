# -*- coding: utf-8 -*-
"""Genera los artboards de pantalla de la dirección B (Claridad).

Fuente única: cambiá aquí y volvé a correr `python build_screens.py`.
La barra lateral, la barra de herramientas y los tokens de color son
compartidos; cada pantalla solo aporta su cuerpo. `data-t` en la raíz
elige modo claro u oscuro con exactamente el mismo marcado.
"""
import io, os

I = {
 'hoy': "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3.5 2",
 'pedidos': "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
 'menu': "M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 0 1 6 0v2",
 'clientes': "M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-2a4 4 0 0 0-3-3.8",
 'negocio': "M3 20h18M7 20v-6M12 20V8M17 20v-10",
 'ajustes': "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
 'buscar': "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3",
 'campana': "M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M10.3 21a2 2 0 0 0 3.4 0",
 'sol': "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
 'luna': "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z",
 'mas': "M12 5v14M5 12h14",
 'chevron': "M9 6l6 6-6 6",
 'chevdown': "M6 9l6 6 6-6",
 'servicio': "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
 'qr': "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2M18 14h2v2h-2M14 18h2v2h-2M18 18h2v2h-2",
 'monitor': "M3 5h18v11H3zM9 20h6M12 16v4",
 'user': "M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
 'sparkle': "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z",
 'wallet': "M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a1 1 0 0 1-1-1V7zM3 7l1-2h12M16.5 13h.01",
 'grid': "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
 'descarga': "M12 3v12M7 11l5 5 5-5M4 21h16",
 'ayuda': "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M9.6 9.5a2.5 2.5 0 1 1 3.2 2.4c-.5.2-.8.6-.8 1.1v.5M12 17h.01",
 'salir': "M15 4h4v16h-4M11 16l4-4-4-4M15 12H3",
 'escudo': "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z",
 'propina': "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v10M9.5 9.5h3.5a1.5 1.5 0 0 1 0 3h-2a1.5 1.5 0 0 0 0 3H14",
 'reloj': "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3.5 2",
 'imagen': "M4 5h16v14H4zM4 16l4.5-4.5 4 4L16 12l4 4M9 9.5h.01",
 'caja': "M3 8l9-5 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v10",
}

NL = '\n'

CSS = """
    body { margin: 0; }
    a { color: #c2542f; } a:hover { color: #a8461f; }
    .sc, .sc *, .sc *::before, .sc *::after { box-sizing: border-box; }
    .sc { font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; -webkit-font-smoothing: antialiased; text-wrap: pretty; }
    .sc[data-t="light"] { --bg:#f4f4f6; --side:#ebebef; --surf:#ffffff; --hair:rgba(0,0,0,0.07); --hair2:rgba(0,0,0,0.13); --ink:#17161a; --ink2:rgba(23,22,26,0.72); --ink3:rgba(23,22,26,0.56); --ink4:rgba(23,22,26,0.40); --acc:#c2542f; --acc-ink:#c2542f; --acc-soft:rgba(194,84,47,0.10); --sh:0 1px 2px rgba(0,0,0,0.04); --warn:#b45309; --ok:#15803d; }
    .sc[data-t="dark"]  { --bg:#0a0a0d; --side:#101014; --surf:#141418; --hair:rgba(245,243,239,0.09); --hair2:rgba(245,243,239,0.16); --ink:#f5f3ef; --ink2:rgba(245,243,239,0.72); --ink3:rgba(245,243,239,0.52); --ink4:rgba(245,243,239,0.40); --acc:#c2603f; --acc-ink:#e58a5f; --acc-soft:rgba(217,119,87,0.16); --sh:0 1px 2px rgba(0,0,0,0.30); --warn:#fb923c; --ok:#4ade80; }
    .sc .disp { font-family: 'Unbounded', 'Geist', system-ui, sans-serif; font-weight: 800; letter-spacing: -0.02em; }
    .sc .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
    .sc .i { width: 17px; height: 17px; flex: 0 0 17px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .sc .i-sm { width: 14px; height: 14px; flex: 0 0 14px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
    .sc .nl { display: flex; align-items: center; gap: 11px; padding: 7px 10px; border-radius: 8px; color: var(--ink); font-size: 14px; font-weight: 500; }
    .sc .tile { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; flex-shrink: 0; background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--ink2); }
    .sc .group { background: var(--surf); border: 1px solid var(--hair); border-radius: 12px; overflow: hidden; box-shadow: var(--sh); }
    .sc .row { display: flex; align-items: center; gap: 14px; padding: 13px 16px; }
    .sc .hr { height: 1px; background: var(--hair); margin-left: 16px; }
    .sc .lbl { font-size: 12.5px; font-weight: 600; color: var(--ink3); padding: 0 4px 8px; }
    .sc .seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 9px; background: color-mix(in srgb, var(--ink) 8%, transparent); }
    .sc .seg > div { padding: 6px 13px; border-radius: 7px; font-size: 13.5px; font-weight: 500; color: var(--ink2); white-space: nowrap; }
    .sc .seg > div[data-on="1"] { background: var(--surf); color: var(--ink); font-weight: 600; box-shadow: var(--sh); }
    .sc .btn { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 14px; border-radius: 8px; background: var(--acc); color: #ffffff; font-size: 13.5px; font-weight: 600; }
    .sc .btn2 { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 13px; border-radius: 8px; color: var(--ink2); border: 1px solid var(--hair2); font-size: 13.5px; font-weight: 500; }
    .sc .ghost { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; color: var(--ink2); border: 1px solid var(--hair2); flex-shrink: 0; }
    .sc .pill { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink2); }
    .sc .dot { width: 7px; height: 7px; border-radius: 99px; flex-shrink: 0; }
"""

HEAD = """<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@600&family=Unbounded:wght@800&display=swap">
  <style>__CSS__  </style>
</helmet>
"""

TAIL = """</x-dc>
<script data-dc-script data-props='{"$preview":{"width":__W__,"height":__H__}}'>
class Component extends DCLogic {
  renderVals() {
    return {};
  }
}
</script>
</body>
</html>
"""

def svg(name, cls='i', style=''):
    st = (' style="%s"' % style) if style else ''
    return '<svg class="%s" viewBox="0 0 24 24"%s><path d="%s"></path></svg>' % (cls, st, I[name])

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
    return NL.join(out)

def toolbar(theme, title, actions_html):
    tema = svg('luna' if theme == 'light' else 'sol', 'i-sm')
    return ('    <div style="height: 52px; flex-shrink: 0; display: flex; align-items: center; gap: 10px; padding: 0 32px; border-bottom: 1px solid var(--hair); background: color-mix(in srgb, var(--bg) 82%%, transparent)">' + NL +
            '      <div style="flex: 1; font-size: 13.5px; font-weight: 600; color: var(--ink2)">%s</div>' + NL +
            '%s      <div class="ghost">%s</div>' + NL +
            '      <div class="ghost">%s</div>' + NL +
            '    </div>') % (title, actions_html, tema, svg('campana', 'i-sm'))

def screen(theme, active, toolbar_title, actions, body, w=1280, h=860):
    doc = HEAD.replace('__CSS__', CSS)
    doc += ('<div class="sc" data-t="%s" style="width: %dpx; height: %dpx; display: flex; background: var(--bg); color: var(--ink); overflow: hidden">' % (theme, w, h)) + NL + NL
    doc += sidebar(active) + NL + NL
    doc += '  <div style="flex: 1; min-width: 0; display: flex; flex-direction: column">' + NL + NL
    doc += toolbar(theme, toolbar_title, actions) + NL + NL
    doc += '    <div style="padding: 28px 32px; overflow: hidden">' + NL
    doc += '      <div style="display: flex; flex-direction: column; gap: 24px">' + NL
    doc += body
    doc += '      </div>' + NL + '    </div>' + NL + '  </div>' + NL + NL + '</div>' + NL
    doc += TAIL.replace('__W__', str(w)).replace('__H__', str(h))
    return doc

def title_block(big, sub):
    return ('        <div>' + NL +
            '          <div class="disp" style="font-size: 26px; line-height: 1.15; color: var(--ink)">%s</div>' % big + NL +
            '          <div style="font-size: 14.5px; color: var(--ink3); margin-top: 6px">%s</div>' % sub + NL +
            '        </div>' + NL)

def seg(items, on):
    inner = ''.join('<div%s>%s</div>' % (' data-on="1"' if it == on else '', it) for it in items)
    return '        <div><div class="seg">%s</div></div>' % inner + NL

def group(label, rows_html, trailing=''):
    if label and trailing:
        lbl = ('          <div class="lbl" style="display: flex; align-items: baseline; gap: 12px">'
               '<span style="flex: 1">%s</span>'
               '<span style="font-weight: 600; color: var(--acc-ink)">%s</span></div>' % (label, trailing)) + NL
    elif label:
        lbl = '          <div class="lbl">%s</div>' % label + NL
    else:
        lbl = ''
    return ('        <div>' + NL + lbl + '          <div class="group">' + NL +
            rows_html + '          </div>' + NL + '        </div>' + NL)

def hr():
    return '            <div class="hr"></div>' + NL

def switch(on):
    if on:
        return ('<div style="width: 40px; height: 24px; border-radius: 99px; background: var(--acc); display: flex; align-items: center; justify-content: flex-end; padding: 2px; flex-shrink: 0">'
                '<div style="width: 20px; height: 20px; border-radius: 99px; background: #ffffff"></div></div>')
    return ('<div style="width: 40px; height: 24px; border-radius: 99px; background: color-mix(in srgb, var(--ink) 16%, transparent); display: flex; align-items: center; padding: 2px; flex-shrink: 0">'
            '<div style="width: 20px; height: 20px; border-radius: 99px; background: var(--surf); box-shadow: 0 1px 2px rgba(0,0,0,0.25)"></div></div>')

def chev():
    return svg('chevron', 'i-sm', 'color: var(--ink4)')

# ── Hoy ───────────────────────────────────────────────────────────────
def aviso(color, titulo, detalle):
    return ('            <div class="row">' + NL +
            '              <span class="dot" style="background: %s; width: 9px; height: 9px"></span>' % color + NL +
            '              <div style="flex: 1; min-width: 0">' + NL +
            '                <div style="font-size: 14.5px; font-weight: 500; color: var(--ink)">%s</div>' % titulo + NL +
            '                <div style="font-size: 13px; color: var(--ink3); margin-top: 1px">%s</div>' % detalle + NL +
            '              </div>' + NL +
            '              ' + chev() + NL + '            </div>' + NL)

def hoy_body():
    b = title_block('Hoy', 'Jueves 21 de agosto · abierto desde las 11:00')
    b += group('Necesita tu atención',
               aviso('var(--warn)', 'La PC del local dejó de responder',
                     'Hace 20 minutos. No se imprimen comandas solas.') + hr() +
               aviso('var(--ink4)', 'Te quedan 12 días de prueba',
                     'Después seguís en el plan Estándar, sin cortes.'))

    def num_col(label, value, first=False):
        borde = '' if first else '; border-left: 1px solid var(--hair)'
        return ('            <div style="padding: 18px 22px%s">' % borde + NL +
                '              <div style="font-size: 13.5px; color: var(--ink3)">%s</div>' % label + NL +
                '              <div class="mono" style="font-size: 28px; color: var(--ink); margin-top: 6px">%s</div>' % value + NL +
                '            </div>' + NL)
    b += ('        <div>' + NL +
          '          <div class="lbl" style="display: flex; align-items: baseline; gap: 12px">'
          '<span style="flex: 1">Resumen del día</span>'
          '<span style="font-weight: 600; color: var(--acc-ink)">Ver el mes en Negocio</span></div>' + NL +
          '          <div class="group" style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr))">' + NL +
          num_col('Ventas', 'Q3,480.00', True) + num_col('Pedidos', '24') + num_col('Ticket promedio', 'Q145.00') +
          '          </div>' + NL + '        </div>' + NL)

    def ord_row(who, det, estado, color, total):
        return ('            <div class="row">' + NL +
                '              <div style="width: 96px; flex-shrink: 0; font-size: 14.5px; font-weight: 600; color: var(--ink)">%s</div>' % who + NL +
                '              <div style="flex: 1; min-width: 0; font-size: 13.5px; color: var(--ink3)">%s</div>' % det + NL +
                '              <div class="pill" style="width: 112px; flex-shrink: 0"><span class="dot" style="background: %s"></span>%s</div>' % (color, estado) + NL +
                '              <div class="mono" style="width: 92px; text-align: right; flex-shrink: 0; font-size: 14.5px; color: var(--ink)">%s</div>' % total + NL +
                '              <div style="margin-left: 4px">' + chev() + '</div>' + NL +
                '            </div>' + NL)
    b += group('En curso',
               ord_row('Mesa 4', '2 Carne asada · 1 Limonada · hace 2 min', 'Nuevo', 'var(--acc-ink)', 'Q210.00') + hr() +
               ord_row('Llevar', 'Ana L. · 1 Hamburguesa doble · hace 6 min', 'En cocina', 'var(--warn)', 'Q95.00') + hr() +
               ord_row('Mesa 7', '3 Pollo a la plancha · 3 Sopa del día · hace 9 min', 'En cocina', 'var(--warn)', 'Q340.00') + hr() +
               ord_row('Domicilio', 'Zona 10 · reparte Luis M. · hace 12 min', 'Listo', 'var(--ok)', 'Q180.00'),
               trailing='Ver los 8 pedidos')
    return b

HOY_ACTIONS = '      <div class="btn">%s<span>Tomar pedido</span></div>' % svg('mas', 'i-sm') + NL

# ── Pedidos ───────────────────────────────────────────────────────────
def pedidos_body():
    b = title_block('Pedidos', '8 en curso · 24 hoy · Q3,480 vendidos')
    b += seg(['En vivo', 'Cocina', 'Mesas', 'Repartidores', 'Historial'], 'En vivo')
    def r(who, tiempo, det, estado, color, total):
        return ('            <div class="row">' + NL +
                '              <div style="width: 150px; flex-shrink: 0">' + NL +
                '                <div style="font-size: 14.5px; font-weight: 600; color: var(--ink)">%s</div>' % who + NL +
                '                <div style="font-size: 12.5px; color: var(--ink4); margin-top: 1px">%s</div>' % tiempo + NL +
                '              </div>' + NL +
                '              <div style="flex: 1; min-width: 0; font-size: 13.5px; color: var(--ink3)">%s</div>' % det + NL +
                '              <div class="pill" style="width: 112px; flex-shrink: 0"><span class="dot" style="background: %s"></span>%s</div>' % (color, estado) + NL +
                '              <div class="mono" style="width: 92px; text-align: right; flex-shrink: 0; font-size: 14.5px; color: var(--ink)">%s</div>' % total + NL +
                '              <div style="margin-left: 4px">' + chev() + '</div>' + NL +
                '            </div>' + NL)
    rows = (r('Mesa 4', 'hace 2 min', '2 Carne asada · 1 Limonada', 'Nuevo', 'var(--acc-ink)', 'Q210.00') + hr() +
            r('Llevar · Ana L.', 'hace 4 min', '1 Hamburguesa doble', 'Nuevo', 'var(--acc-ink)', 'Q95.00') + hr() +
            r('Mesa 7', 'hace 9 min', '3 Pollo a la plancha · 3 Sopa del día', 'En cocina', 'var(--warn)', 'Q340.00') + hr() +
            r('Mesa 2', 'hace 6 min', '2 Tacos de res', 'En cocina', 'var(--warn)', 'Q120.00') + hr() +
            r('Domicilio · Zona 10', 'hace 12 min', '1 Pizza familiar · reparte Luis M.', 'Listo', 'var(--ok)', 'Q180.00') + hr() +
            r('Mesa 9', 'hace 14 min', '4 Desayuno chapín', 'Listo', 'var(--ok)', 'Q260.00'))
    b += group(None, rows)
    b += '        <div style="font-size: 13px; color: var(--ink4); padding: 0 4px">Los entregados de hoy están en Historial. El sonido y el aviso de pedido nuevo siguen sonando en todo el panel, como hasta ahora.</div>' + NL
    return b

PEDIDOS_ACTIONS = ('      <div class="btn2">%s<span>Modo servicio</span></div>' % svg('servicio', 'i-sm') + NL +
                   '      <div class="btn">%s<span>Tomar pedido</span></div>' % svg('mas', 'i-sm') + NL)

# ── Menú ──────────────────────────────────────────────────────────────
def menu_body():
    b = title_block('Menú', '84 platillos · 9 categorías · 3 sin existencia')
    b += seg(['Platillos', 'Categorías', 'Ingredientes', 'Inventario', 'Proveedores'], 'Platillos')
    def p(nombre, cat, precio, on):
        return ('            <div class="row">' + NL +
                '              <div style="width: 38px; height: 38px; border-radius: 9px; flex-shrink: 0; background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--ink4); display: grid; place-items: center">' + svg('imagen', 'i-sm') + '</div>' + NL +
                '              <div style="flex: 1; min-width: 0">' + NL +
                '                <div style="font-size: 14.5px; font-weight: 500; color: var(--ink)">%s</div>' % nombre + NL +
                '                <div style="font-size: 12.5px; color: var(--ink4); margin-top: 1px">%s</div>' % cat + NL +
                '              </div>' + NL +
                '              <div class="mono" style="width: 92px; text-align: right; flex-shrink: 0; font-size: 14.5px; color: var(--ink)">%s</div>' % precio + NL +
                '              <div style="width: 120px; flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: 10px">'
                '<span style="font-size: 13px; color: var(--ink3)">%s</span>%s</div>' % ('Visible' if on else 'Oculto', switch(on)) + NL +
                '              <div style="margin-left: 4px">' + chev() + '</div>' + NL +
                '            </div>' + NL)
    rows = (p('Carne asada', 'Platos fuertes', 'Q105.00', True) + hr() +
            p('Pollo a la plancha', 'Platos fuertes', 'Q95.00', True) + hr() +
            p('Hamburguesa doble', 'Hamburguesas', 'Q95.00', True) + hr() +
            p('Pizza familiar', 'Pizzas', 'Q180.00', True) + hr() +
            p('Sopa del día', 'Entradas', 'Q35.00', False) + hr() +
            p('Limonada natural', 'Bebidas', 'Q15.00', True))
    b += group(None, rows)
    b += '        <div style="font-size: 13px; color: var(--ink4); padding: 0 4px">Las variantes, los combos, las recetas y los alérgenos siguen dentro de cada platillo — se abren al tocarlo, no ocupan una pantalla aparte.</div>' + NL
    return b

MENU_ACTIONS = ('      <div class="btn2">%s<span>Buscar</span></div>' % svg('buscar', 'i-sm') + NL +
                '      <div class="btn">%s<span>Agregar platillo</span></div>' % svg('mas', 'i-sm') + NL)

# ── Negocio ───────────────────────────────────────────────────────────
def negocio_body():
    b = title_block('Negocio', 'Agosto · del 1 al 21')
    b += seg(['Resumen', 'Analítica', 'Finanzas', 'Facturación', 'Canales', 'Respaldo'], 'Resumen')
    b += '        <div class="group" style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr))">' + NL
    for idx, (lab, val) in enumerate([('Vendido', 'Q84,200'), ('Pedidos', '581'),
                                      ('Ticket promedio', 'Q145'), ('Clientes nuevos', '96')]):
        borde = '' if idx == 0 else '; border-left: 1px solid var(--hair)'
        b += ('          <div style="padding: 18px 22px%s">' % borde + NL +
              '            <div style="font-size: 13.5px; color: var(--ink3)">%s</div>' % lab + NL +
              '            <div class="mono" style="font-size: 26px; color: var(--ink); margin-top: 6px">%s</div>' % val + NL +
              '          </div>' + NL)
    b += '        </div>' + NL
    vals = [42, 55, 48, 61, 70, 96, 88, 52, 58, 51, 66, 74, 99, 92, 47, 54, 60, 68, 77, 95, 84]
    bars = ''.join('<div style="flex: 1; height: %dpx; border-radius: 3px 3px 0 0; background: %s"></div>'
                   % (v, 'var(--acc)' if k == len(vals) - 1 else 'color-mix(in srgb, var(--ink) 20%, transparent)')
                   for k, v in enumerate(vals))
    b += ('        <div>' + NL + '          <div class="lbl">Ventas por día</div>' + NL +
          '          <div class="group" style="padding: 18px 22px 14px">' + NL +
          '            <div style="display: flex; align-items: flex-end; gap: 6px; height: 110px">%s</div>' % bars + NL +
          '            <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 12px; color: var(--ink4)"><span>1 ago</span><span>21 ago</span></div>' + NL +
          '          </div>' + NL + '        </div>' + NL)
    def top(nombre, cat, uds, total):
        return ('            <div class="row">' + NL +
                '              <div style="flex: 1; min-width: 0">' + NL +
                '                <div style="font-size: 14.5px; color: var(--ink)">%s</div>' % nombre + NL +
                '                <div style="font-size: 12.5px; color: var(--ink4); margin-top: 1px">%s</div>' % cat + NL +
                '              </div>' + NL +
                '              <div class="mono" style="width: 90px; text-align: right; flex-shrink: 0; font-size: 13.5px; color: var(--ink3)">%s</div>' % uds + NL +
                '              <div class="mono" style="width: 110px; text-align: right; flex-shrink: 0; font-size: 14.5px; color: var(--ink)">%s</div>' % total + NL +
                '            </div>' + NL)
    b += group('Lo más vendido',
               top('Carne asada', 'Platos fuertes', '118 uds', 'Q12,390') + hr() +
               top('Pizza familiar', 'Pizzas', '74 uds', 'Q13,320') + hr() +
               top('Hamburguesa doble', 'Hamburguesas', '96 uds', 'Q9,120'))
    return b

NEGOCIO_ACTIONS = ('      <div class="btn2">%s<span>Agosto</span></div>' % svg('reloj', 'i-sm') + NL +
                   '      <div class="btn2">%s<span>Exportar</span></div>' % svg('descarga', 'i-sm') + NL)

# ── Ajustes ───────────────────────────────────────────────────────────
def ajustes_body():
    b = title_block('Ajustes', 'Todo lo que antes vivía suelto en el menú, ordenado por tema')
    def row(icon, label, valor=''):
        val = ('<div style="font-size: 13.5px; color: var(--ink3)">%s</div>' % valor) if valor else ''
        return ('            <div class="row">' + NL +
                '              <span class="tile">%s</span>' % svg(icon) + NL +
                '              <div style="flex: 1; min-width: 0; font-size: 14.5px; color: var(--ink)">%s</div>' % label + NL +
                '              %s' % val + NL + '              ' + chev() + NL + '            </div>' + NL)
    c1 = group('El restaurante',
               row('user', 'Perfil y datos del negocio') + hr() +
               row('reloj', 'Horarios y pausa del menú', 'Abierto') + hr() +
               row('sparkle', 'Personalizar el sitio', 'Plantilla Marfil') + hr() +
               row('qr', 'Código QR de las mesas') + hr() +
               row('monitor', 'La PC del local', 'Sin responder'))
    c2a = group('El equipo',
                row('clientes', 'Personal y permisos', '6 personas') + hr() +
                row('propina', 'Propinas') + hr() +
                row('escudo', 'Dispositivos y accesos'))
    c2b = group('La cuenta',
                row('wallet', 'Mi suscripción', 'Plan Estándar') + hr() +
                row('grid', 'Funciones', '9 activas') + hr() +
                row('descarga', 'Copia de tus datos') + hr() +
                row('ayuda', 'Ayuda y tutoriales') + hr() +
                '            <div class="row">' + NL +
                '              <span class="tile" style="color: var(--acc-ink)">%s</span>' % svg('salir') + NL +
                '              <div style="flex: 1; min-width: 0; font-size: 14.5px; color: var(--acc-ink); font-weight: 500">Cerrar sesión</div>' + NL +
                '            </div>' + NL)
    b += ('        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; align-items: start">' + NL +
          '          <div style="display: flex; flex-direction: column; gap: 24px">' + NL + c1 + '          </div>' + NL +
          '          <div style="display: flex; flex-direction: column; gap: 24px">' + NL + c2a + c2b + '          </div>' + NL +
          '        </div>' + NL)
    return b

AJUSTES_ACTIONS = ''

def write(path, text):
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('  %-22s %6d bytes' % (path, len(text.encode('utf-8'))))

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    write('Main.dc.html',      screen('light', 'hoy', 'Hoy', HOY_ACTIONS, hoy_body()))
    write('HoyOscuro.dc.html', screen('dark',  'hoy', 'Hoy', HOY_ACTIONS, hoy_body()))
    write('Pedidos.dc.html',   screen('light', 'pedidos', 'Pedidos', PEDIDOS_ACTIONS, pedidos_body()))
    write('Menu.dc.html',      screen('light', 'menu', 'Menú', MENU_ACTIONS, menu_body()))
    write('Negocio.dc.html',   screen('dark',  'negocio', 'Negocio', NEGOCIO_ACTIONS, negocio_body()))
    write('Ajustes.dc.html',   screen('light', 'ajustes', 'Ajustes', AJUSTES_ACTIONS, ajustes_body()))
    print('listo')
