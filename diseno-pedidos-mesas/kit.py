# -*- coding: utf-8 -*-
"""Piezas compartidas del lienzo "Tomar pedidos y mesas".

Mismo vocabulario visual que diseno-panel-hig/ y diseno-widgets-panel/:
los valores salen de plataforma/src/app/globals.css (tokens --adm-*) y de
los componentes ui/list.tsx, ui/card.tsx y ui/section.tsx.
"""
import io

NL = '\n'

I = {
 'hoy': "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3.5 2",
 'pedidos': "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
 'menu': "M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 0 1 6 0v2",
 'clientes': "M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-2a4 4 0 0 0-3-3.8",
 'negocio': "M3 20h18M7 20v-6M12 20V8M17 20v-10",
 'ajustes': "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
 'buscar': "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3",
 'campana': "M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M10.3 21a2 2 0 0 0 3.4 0",
 'luna': "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z",
 'mas': "M12 5v14M5 12h14",
 'menos': "M5 12h14",
 'chevron': "M9 6l6 6-6 6",
 'chevleft': "M15 6l-6 6 6 6",
 'chevdown': "M6 9l6 6 6-6",
 'servicio': "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
 'qr': "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2M18 14h2v2h-2M14 18h2v2h-2M18 18h2v2h-2",
 'grid': "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
 'sala': "M4 20V9l8-5 8 5v11M4 20h16M9 20v-5h6v5",
 'bolsa': "M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 0 1 6 0v2",
 'reloj': "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3.5 2",
 'check': "M4 12.5l5 5L20 6.5",
 'x': "M6 6l12 12M18 6L6 18",
 'user': "M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
 'nota': "M5 4h14v16H5zM8.5 9h7M8.5 13h7M8.5 17h4",
 'dividir': "M4 12h16M9 7l-5 5 5 5M15 7l5 5-5 5",
 'wallet': "M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a1 1 0 0 1-1-1V7zM3 7l1-2h12M16.5 13h.01",
 'aviso': "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 8v5M12 16h.01",
 'flecha': "M5 12h14M13 6l6 6-6 6",
 'puntos': "M6 12h.01M12 12h.01M18 12h.01",
 'mano': "M8 13V5.5a1.5 1.5 0 0 1 3 0V12V4a1.5 1.5 0 0 1 3 0v8V6a1.5 1.5 0 0 1 3 0v9a6 6 0 0 1-6 6h-1a5 5 0 0 1-5-5v-3.5a1.5 1.5 0 0 1 3 0z",
}

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
    .sc .i-lg { width: 22px; height: 22px; flex: 0 0 22px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
    .sc .group { background: var(--surf); border: 1px solid var(--hair); border-radius: 12px; overflow: hidden; box-shadow: var(--sh); }
    .sc .row { display: flex; align-items: center; gap: 14px; padding: 13px 16px; min-height: 44px; }
    .sc .hr { height: 1px; background: var(--hair); margin-left: 16px; }
    .sc .hrf { height: 1px; background: var(--hair); }
    .sc .lbl { font-size: 12.5px; font-weight: 600; color: var(--ink3); padding: 0 4px 8px; display: flex; align-items: baseline; gap: 12px; }
    .sc .lbl > span:first-child { flex: 1; }
    .sc .act { font-weight: 600; color: var(--acc-ink); }
    .sc .seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 9px; background: color-mix(in srgb, var(--ink) 8%, transparent); }
    .sc .seg > div { padding: 6px 13px; border-radius: 7px; font-size: 13.5px; font-weight: 500; color: var(--ink2); white-space: nowrap; }
    .sc .seg > div[data-on="1"] { background: var(--surf); color: var(--ink); font-weight: 600; box-shadow: var(--sh); }
    .sc .btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 32px; padding: 0 14px; border-radius: 8px; background: var(--acc); color: #ffffff; font-size: 13.5px; font-weight: 600; }
    .sc .btn2 { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 32px; padding: 0 13px; border-radius: 8px; color: var(--ink2); border: 1px solid var(--hair2); font-size: 13.5px; font-weight: 500; }
    .sc .ghost { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; color: var(--ink2); border: 1px solid var(--hair2); flex-shrink: 0; }
    .sc .pill { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink2); }
    .sc .dot { width: 7px; height: 7px; border-radius: 99px; flex-shrink: 0; background: currentColor; }
    .sc .ttl { font-size: 14.5px; font-weight: 500; color: var(--ink); }
    .sc .sub { font-size: 13px; color: var(--ink3); margin-top: 1px; line-height: 1.35; }
    .sc .tile { width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; flex-shrink: 0; background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--ink2); }

    .sc .mesa { border-radius: 14px; border: 1px solid var(--hair); background: var(--surf); box-shadow: var(--sh); padding: 11px 12px 10px; display: flex; flex-direction: column; gap: 3px; min-height: 96px; }
    .sc .mesa .n { font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; font-size: 21px; line-height: 1.1; color: var(--ink); }
    .sc .mesa .st { font-size: 12px; color: var(--ink3); line-height: 1.35; margin-top: auto; }
    .sc .mesa .amt { font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 600; font-variant-numeric: tabular-nums; font-size: 12.5px; color: var(--ink2); letter-spacing: -0.02em; }
    .sc .mesa[data-s="libre"] { background: transparent; border-style: dashed; box-shadow: none; }
    .sc .mesa[data-s="libre"] .n { color: var(--ink4); }
    .sc .mesa[data-s="libre"] .st { color: var(--ink4); }
    .sc .mesa[data-s="atencion"] { border-color: var(--acc); box-shadow: 0 0 0 1px var(--acc), var(--sh); }
    .sc .mesa[data-s="atencion"] .st { color: var(--acc-ink); font-weight: 600; }

    .sc .ph { width: 390px; height: 844px; border-radius: 44px; overflow: hidden; background: var(--bg); color: var(--ink); display: flex; flex-direction: column; box-shadow: 0 18px 50px rgba(0,0,0,0.20); flex-shrink: 0; }
    .sc .ph-status { height: 46px; flex-shrink: 0; }
    .sc .tb { height: 74px; flex-shrink: 0; display: flex; align-items: stretch; padding-bottom: 14px; border-top: 1px solid var(--hair); background: var(--side); }
    .sc .tb > div { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font-size: 11px; font-weight: 500; color: var(--ink4); }
    .sc .tb > div[data-on="1"] { color: var(--acc-ink); font-weight: 600; }
    .sc .bar { flex-shrink: 0; border-top: 1px solid var(--hair); background: color-mix(in srgb, var(--bg) 86%, transparent); padding: 12px 16px 22px; }
    .sc .cta { display: flex; align-items: center; justify-content: space-between; gap: 12px; height: 52px; padding: 0 18px; border-radius: 14px; background: var(--acc); color: #ffffff; font-size: 15.5px; font-weight: 600; }
    .sc .step { width: 40px; height: 40px; border-radius: 11px; border: 1px solid var(--hair2); display: grid; place-items: center; color: var(--ink2); flex-shrink: 0; }
    .sc .cap { font-size: 13px; color: rgba(23,22,26,0.55); text-align: center; max-width: 390px; line-height: 1.45; }

    .sc .doc-h1 { font-family: 'Unbounded', 'Geist', system-ui, sans-serif; font-weight: 800; letter-spacing: -0.03em; }
    .sc .card { background: var(--surf); border: 1px solid var(--hair); border-radius: 14px; box-shadow: var(--sh); }
    .sc .h2 { font-size: 12.5px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink3); }
    .sc .body { font-size: 15px; line-height: 1.55; color: var(--ink2); }
    .sc .num { width: 25px; height: 25px; border-radius: 99px; flex-shrink: 0; display: grid; place-items: center; font-size: 12px; font-weight: 600; background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--ink2); font-family: 'JetBrains Mono', ui-monospace, monospace; }
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


def chev():
    return svg('chevron', 'i-sm', 'color: var(--ink4)')


def write(path, text):
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('  %-20s %6d bytes' % (path, len(text.encode('utf-8'))))


def wrap(w, h, body, bg='#e9e9ee', pad='48px 44px', theme='light', flow=False, gap=34):
    """Envuelve un tablero suelto (no pantalla de panel) en formato DC."""
    d = HEAD.replace('__CSS__', CSS)
    hh = 'min-height' if flow else 'height'
    d += ('<div class="sc" data-t="%s" style="width: %dpx; %s: %dpx; background: %s; padding: %s; '
          'display: flex; flex-direction: column; gap: %dpx">\n' % (theme, w, hh, h, bg, pad, gap))
    d += body
    d += '</div>\n' + TAIL.replace('__W__', str(w)).replace('__H__', str(h))
    return d


def phone(inner, caption, theme='light'):
    return ('  <div style="display: flex; flex-direction: column; gap: 14px; align-items: center">\n'
            '    <div class="sc ph" data-t="%s">\n'
            '      <div class="ph-status"></div>\n'
            '%s'
            '    </div>\n'
            '    <div class="cap">%s</div>\n'
            '  </div>\n' % (theme, inner, caption))


def largetitle(title, sub, right=''):
    return ('        <div style="display: flex; align-items: flex-start; gap: 12px; padding: 4px 16px 14px">\n'
            '          <div style="flex: 1; min-width: 0">\n'
            '            <div class="disp" style="font-size: 26px; line-height: 1.15; color: var(--ink)">%s</div>\n'
            '            <div style="font-size: 14px; color: var(--ink3); margin-top: 4px">%s</div>\n'
            '          </div>\n'
            '%s'
            '        </div>\n' % (title, sub, right))


def navbar(title, sub='', left=True, right=''):
    l = ('<div class="ghost" style="width: 40px; height: 40px; border-radius: 11px">%s</div>'
         % svg('chevleft', 'i')) if left else '<div style="width: 40px"></div>'
    subhtml = ('<div style="font-size: 12.5px; color: var(--ink3); margin-top: 1px">%s</div>' % sub) if sub else ''
    return ('        <div style="display: flex; align-items: center; gap: 12px; padding: 2px 14px 12px; border-bottom: 1px solid var(--hair)">\n'
            '          %s\n'
            '          <div style="flex: 1; min-width: 0; text-align: center">\n'
            '            <div style="font-size: 16px; font-weight: 600; color: var(--ink); letter-spacing: -0.01em">%s</div>\n'
            '            %s\n'
            '          </div>\n'
            '          %s\n'
            '        </div>\n' % (l, title, subhtml, right or '<div style="width: 40px"></div>'))


def group(rows, label=None, action=None, style='', foot=None):
    lbl = ''
    if label:
        act = '<span class="act">%s</span>' % action if action else ''
        lbl = '          <div class="lbl"><span>%s</span>%s</div>\n' % (label, act)
    inner = []
    for i, r in enumerate(rows):
        if i:
            inner.append('            <div class="hr"></div>\n')
        inner.append(r)
    st = (' style="%s"' % style) if style else ''
    footh = ('          <div style="font-size: 12.5px; color: var(--ink3); line-height: 1.45; padding: 8px 4px 0">%s</div>\n' % foot) if foot else ''
    return ('        <div>\n' + lbl + '          <div class="group"%s>\n' % st +
            ''.join(inner) + '          </div>\n' + footh + '        </div>\n')


def tabbar(items, active):
    out = []
    for key, label, icon in items:
        on = ' data-on="1"' if key == active else ''
        out.append('<div%s>%s<span>%s</span></div>' % (on, svg(icon, 'i'), label))
    return '        <div class="tb">%s</div>\n' % ''.join(out)
