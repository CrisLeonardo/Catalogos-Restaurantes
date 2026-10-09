# -*- coding: utf-8 -*-
"""Piezas compartidas de los tableros de widgets.

Mismo vocabulario visual que diseno-panel-hig/: los valores salen de
plataforma/src/app/globals.css (tokens --adm-*) y de los componentes
ui/list.tsx, ui/stat.tsx y ui/section.tsx.
"""

CSS = """
    body { margin: 0; }
    a { color: #c2542f; } a:hover { color: #a8461f; }
    .sc, .sc *, .sc *::before, .sc *::after { box-sizing: border-box; }
    .sc { font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; -webkit-font-smoothing: antialiased; text-wrap: pretty; }
    .sc[data-t="light"] { --bg:#f4f4f6; --side:#ebebef; --surf:#ffffff; --hair:rgba(0,0,0,0.07); --hair2:rgba(0,0,0,0.13); --ink:#17161a; --ink2:rgba(23,22,26,0.72); --ink3:rgba(23,22,26,0.56); --ink4:rgba(23,22,26,0.40); --acc:#c2542f; --acc-ink:#c2542f; --acc-soft:rgba(194,84,47,0.10); --sh:0 1px 2px rgba(0,0,0,0.04); --warn:#b45309; --ok:#15803d; --dang:#b91c1c; }
    .sc[data-t="dark"]  { --bg:#0a0a0d; --side:#101014; --surf:#141418; --hair:rgba(245,243,239,0.09); --hair2:rgba(245,243,239,0.16); --ink:#f5f3ef; --ink2:rgba(245,243,239,0.72); --ink3:rgba(245,243,239,0.52); --ink4:rgba(245,243,239,0.40); --acc:#c2603f; --acc-ink:#e58a5f; --acc-soft:rgba(217,119,87,0.16); --sh:0 1px 2px rgba(0,0,0,0.30); --warn:#fb923c; --ok:#4ade80; --dang:#f87171; }
    .sc .disp { font-family: 'Unbounded', 'Geist', system-ui, sans-serif; font-weight: 800; letter-spacing: -0.02em; }
    .sc .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
    .sc .i { width: 17px; height: 17px; flex: 0 0 17px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .sc .i-sm { width: 14px; height: 14px; flex: 0 0 14px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
    .sc .nl { display: flex; align-items: center; gap: 11px; padding: 7px 10px; border-radius: 8px; color: var(--ink); font-size: 14px; font-weight: 500; }
    .sc .tile { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; flex-shrink: 0; background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--ink2); }
    .sc .group { background: var(--surf); border: 1px solid var(--hair); border-radius: 12px; overflow: hidden; box-shadow: var(--sh); }
    .sc .row { display: flex; align-items: center; gap: 14px; padding: 13px 16px; min-height: 44px; }
    .sc .hr { height: 1px; background: var(--hair); margin-left: 16px; }
    .sc .hrf { height: 1px; background: var(--hair); }
    .sc .lbl { font-size: 12.5px; font-weight: 600; color: var(--ink3); padding: 0 4px 8px; display: flex; align-items: baseline; gap: 12px; }
    .sc .lbl > span:first-child { flex: 1; }
    .sc .act { font-weight: 600; color: var(--acc-ink); }
    .sc .btn { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 14px; border-radius: 8px; background: var(--acc); color: #ffffff; font-size: 13.5px; font-weight: 600; }
    .sc .btn2 { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 13px; border-radius: 8px; color: var(--ink2); border: 1px solid var(--hair2); font-size: 13.5px; font-weight: 500; }
    .sc .ghost { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; color: var(--ink2); border: 1px solid var(--hair2); flex-shrink: 0; }
    .sc .pill { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink2); }
    .sc .dot { width: 7px; height: 7px; border-radius: 99px; flex-shrink: 0; }
    .sc .ttl { font-size: 14.5px; font-weight: 500; color: var(--ink); }
    .sc .sub { font-size: 13px; color: var(--ink3); margin-top: 1px; line-height: 1.35; }
    .sc .stat3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .sc .stat3 > div { padding: 16px 20px; }
    .sc .stat3 > div + div { border-left: 1px solid var(--hair); }
    .sc .snum { font-size: 26px; color: var(--ink); margin-top: 5px; line-height: 1.1; }
    .sc .slab { font-size: 13px; color: var(--ink3); }
    .sc .spark { display: flex; align-items: flex-end; }
    .sc .spark > i { display: block; border-radius: 3px 3px 1px 1px; background: color-mix(in srgb, var(--ink) 13%, transparent); }
    .sc .spark[data-fill="1"] > i { flex: 1; min-width: 4px; }
    .sc .spark > i[data-on="1"] { background: var(--acc); }
    .sc .track { height: 6px; border-radius: 99px; background: color-mix(in srgb, var(--ink) 9%, transparent); overflow: hidden; }
    .sc .track > i { display: block; height: 100%; border-radius: 99px; background: var(--acc); }
    .sc .tables { display: grid; grid-template-columns: repeat(6, 10px); gap: 5px; flex-shrink: 0; }
    .sc .tables > i { display: block; width: 10px; height: 10px; border-radius: 2px; border: 1px solid var(--hair2); }
    .sc .tables > i[data-on="1"] { background: var(--acc); border-color: var(--acc); }
    .sc .cap { font-size: 12.5px; color: var(--ink3); line-height: 1.45; padding: 9px 4px 0; }
    .sc .cap b { color: var(--ink2); font-weight: 600; }
    .sc .when { display: flex; gap: 8px; align-items: baseline; font-size: 12.5px; color: var(--ink3); line-height: 1.45; padding: 9px 4px 0; }
    .sc .when b { color: var(--ink2); font-weight: 600; }
"""

FONTS = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
         'family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@600&'
         'family=Unbounded:wght@800&display=swap">')

CHEV = ('<svg class="i-sm" viewBox="0 0 24 24" style="color: var(--ink4)">'
        '<path d="M9 6l6 6-6 6"></path></svg>')

NAV_ICONS = {
    'hoy': '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3.5 2"></path>',
    'pedidos': '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"></path>',
    'menu': '<path d="M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 0 1 6 0v2"></path>',
    'clientes': '<path d="M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-2a4 4 0 0 0-3-3.8"></path>',
    'negocio': '<path d="M3 20h18M7 20v-6M12 20V8M17 20v-10"></path>',
    'ajustes': '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"></path>',
}
NAV_LABEL = {'hoy': 'Hoy', 'pedidos': 'Pedidos', 'menu': 'Menú',
             'clientes': 'Clientes', 'negocio': 'Negocio', 'ajustes': 'Ajustes'}


def page(width, height, body, fixed_height=True):
    """Envuelve un tablero en el formato Design Component."""
    return """<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  %s
  <style>%s  </style>
</helmet>
%s
</x-dc>
<script data-dc-script data-props='{"$preview":{"width":%d,"height":%d}}'>
class Component extends DCLogic {
  renderVals() {
    return {};
  }
}
</script>
</body>
</html>
""" % (FONTS, CSS, body, width, height)


def sidebar(active='hoy', badge=None):
    links = []
    for key in ('hoy', 'pedidos', 'menu', 'clientes', 'negocio', 'ajustes'):
        on = key == active
        style = ' style="background: var(--acc); color: #ffffff; font-weight: 600"' if on else ''
        tile = ' style="background: rgba(255,255,255,0.22); color: #ffffff"' if on else ''
        extra = ''
        if badge and key == 'pedidos':
            extra = '<span class="mono" style="font-size: 12.5px; color: %s">%s</span>' % (
                '#ffffff' if on else 'var(--ink3)', badge)
        links.append(
            '<div class="nl"%s><span class="tile"%s><svg class="i" viewBox="0 0 24 24">%s</svg></span>'
            '<span style="flex: 1">%s</span>%s</div>'
            % (style, tile, NAV_ICONS[key], NAV_LABEL[key], extra))
    return """
  <div style="width: 240px; flex-shrink: 0; display: flex; flex-direction: column; padding: 16px 12px; background: var(--side); border-right: 1px solid var(--hair)">

    <div style="display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 10px; border-radius: 8px; background: var(--surf); border: 1px solid var(--hair); margin-bottom: 16px; color: var(--ink4)">
      <svg class="i-sm" viewBox="0 0 24 24"><path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3"></path></svg>
      <span style="font-size: 13px; color: var(--ink4)">Buscar en el panel</span>
    </div>

    <div style="display: flex; align-items: center; gap: 10px; padding: 4px 8px 16px">
      <div style="width: 34px; height: 34px; border-radius: 9px; background: color-mix(in srgb, var(--ink) 9%%, transparent); display: grid; place-items: center; flex-shrink: 0; font-size: 14px; font-weight: 600; color: var(--ink)">R</div>
      <div style="min-width: 0">
        <div style="font-size: 14px; font-weight: 600; color: var(--ink); line-height: 1.2">El Rincón</div>
        <div style="font-size: 11.5px; color: var(--ink3); line-height: 1.2; margin-top: 1px">Centro · Plan Estándar</div>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 2px; flex: 1">%s</div>

    <div style="display: flex; align-items: center; gap: 10px; padding: 10px 8px 2px; border-top: 1px solid var(--hair)">
      <div style="width: 26px; height: 26px; border-radius: 99px; background: color-mix(in srgb, var(--ink) 11%%, transparent); display: grid; place-items: center; flex-shrink: 0; font-size: 11.5px; font-weight: 600; color: var(--ink)">C</div>
      <div style="flex: 1; min-width: 0; font-size: 13px; font-weight: 500; color: var(--ink2)">Carlos</div>
      <svg class="i-sm" viewBox="0 0 24 24" style="color: var(--ink4)"><path d="M6 9l6 6 6-6"></path></svg>
    </div>
  </div>
""" % ''.join(links)


def topbar(title, cta='Tomar pedido'):
    btn = ('<div class="btn"><svg class="i-sm" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg>'
           '<span>%s</span></div>' % cta) if cta else ''
    return """
    <div style="height: 52px; flex-shrink: 0; display: flex; align-items: center; gap: 10px; padding: 0 32px; border-bottom: 1px solid var(--hair); background: color-mix(in srgb, var(--bg) 82%%, transparent)">
      <div style="flex: 1; font-size: 13.5px; font-weight: 600; color: var(--ink2)">%s</div>
      %s
      <div class="ghost"><svg class="i-sm" viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"></path></svg></div>
      <div class="ghost"><svg class="i-sm" viewBox="0 0 24 24"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M10.3 21a2 2 0 0 0 3.4 0"></path></svg></div>
    </div>
""" % (title, btn)


def block(label, inner, action=None):
    act = '<span class="act">%s</span>' % action if action else ''
    return '<div><div class="lbl"><span>%s</span>%s</div>%s</div>' % (label, act, inner)


def group(rows, style=''):
    parts = []
    for i, r in enumerate(rows):
        if i:
            parts.append('<div class="hr"></div>')
        parts.append(r)
    return '<div class="group"%s>%s</div>' % (
        (' style="%s"' % style) if style else '', ''.join(parts))


def row(lead, title, sub=None, right='', pad=None):
    s = '<div class="sub">%s</div>' % sub if sub else ''
    style = ' style="padding: %s"' % pad if pad else ''
    return ('<div class="row"%s>%s<div style="flex: 1; min-width: 0">'
            '<div class="ttl">%s</div>%s</div>%s</div>'
            % (style, lead, title, s, right))
