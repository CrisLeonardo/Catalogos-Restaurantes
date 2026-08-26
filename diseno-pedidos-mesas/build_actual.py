# -*- coding: utf-8 -*-
"""Genera Actual.dc.html — el panel de mesero de HOY, recreado con los
valores reales de src/components/admin/waiter-panel.tsx y floor-map.tsx.

No es una caricatura: pesos 800, radios 14/16, vidrio con blur(13px),
tokens --u-text-*/--c-warn y los glifos ＋ ⚠ ● → que están en el código.
Sirve para comparar lado a lado con las tres opciones.
"""
import os
from kit import HEAD, TAIL, write

here = os.path.dirname(os.path.abspath(__file__))
os.chdir(here)

# Tokens REALES del panel de mesero (tema del restaurante, oscuro por
# defecto): globals.css líneas 78-99 y 230-258.
ACT_CSS = """
    body { margin: 0; }
    a { color: #D97757; } a:hover { color: #c2542f; }
    .w, .w *, .w *::before, .w *::after { box-sizing: border-box; }
    .w {
      font-family: 'Geist', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      --brand-bg: #0b0b0c; --brand-bg-2: #141416;
      --brand-accent: #D97757; --brand-accent-ink: #D97757;
      --u-text: #f5f3ef; --u-text-2: rgba(245,243,239,0.74); --u-text-3: rgba(245,243,239,0.50); --u-text-4: rgba(245,243,239,0.48);
      --u-hair: rgba(245,243,239,0.10); --u-hair-2: rgba(245,243,239,0.18);
      --c-ok: #4ade80; --c-danger: #f87171; --c-warn: #fbbf24;
      --c-warn-line: rgba(251,191,36,0.36); --c-danger-bg: rgba(248,113,113,0.14); --c-danger-line: rgba(248,113,113,0.34);
      --glass-fill: rgba(255,255,255,0.045); --glass-fill-2: rgba(255,255,255,0.085);
      --glass-stroke: rgba(255,255,255,0.14); --glass-hi: rgba(255,255,255,0.42);
    }
    .w .glass {
      background: linear-gradient(145deg, var(--glass-fill-2), var(--glass-fill));
      border: 1px solid var(--glass-stroke);
      box-shadow: inset 0 1px 0 var(--glass-hi), inset 0 -1px 1px rgba(255,255,255,0.05), 0 10px 34px rgba(0,0,0,0.45);
      border-radius: 20px;
    }
    .w .glass-quiet { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.10); }
    .w .btn-accent { background: var(--brand-accent); color: #ffffff; }
    .w .i { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .w .t-mono { font-family: ui-monospace, 'JetBrains Mono', monospace; }
    .w .chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 99px; font-size: 11px; font-weight: 700; }
    .w .phone {
      width: 390px; height: 844px; border-radius: 44px; overflow: hidden;
      background: var(--brand-bg); color: var(--u-text);
      display: flex; flex-direction: column; flex-shrink: 0;
      box-shadow: 0 18px 50px rgba(0,0,0,0.40);
    }
    .w .cap { font-size: 13px; color: rgba(23,22,26,0.55); text-align: center; max-width: 390px; line-height: 1.45; }
    .w .up { font-size: 11px; color: var(--u-text-3); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
"""


def ico(d, size=16, style=''):
    return ('<svg class="i" width="%d" height="%d" viewBox="0 0 24 24" style="%s">'
            '<path d="%s"></path></svg>' % (size, size, style, d))


P_USER = "M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8"
P_LIST = "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
P_BACK = "M15 6l-6 6 6 6"
P_BAG = "M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 0 1 6 0v2"
P_CHEVR = "M9 6l6 6-6 6"
P_ALERT = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 8v5M12 16h.01"
P_SEARCH = "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3"
P_BELL = "M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M10.3 21a2 2 0 0 0 3.4 0"
P_DOWN = "M6 9l6 6 6-6"


def header(title, back=False, orders='Pedidos (3)'):
    b = ''
    if back:
        b = ('<div class="glass-quiet" style="width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; flex-shrink: 0">%s</div>'
             % ico(P_BACK, 20))
    o = ''
    if orders:
        o = ('<div class="glass-quiet" style="display: flex; align-items: center; gap: 7px; padding: 9px 13px; border-radius: 99px; color: var(--u-text-2); font-size: 13px; font-weight: 600; flex-shrink: 0">%s %s</div>'
             % (ico(P_LIST, 14), orders))
    return ('      <div style="margin: 0 14px; border-radius: 16px; border-bottom: 1px solid var(--u-hair); background: rgba(245,243,239,0.04)">\n'
            '        <div style="display: flex; align-items: center; gap: 12px; padding: 12px 14px">\n'
            '          %s\n'
            '          <div style="flex: 1; min-width: 0">\n'
            '            <div style="font-weight: 800; font-size: 15px; color: var(--u-text)">%s</div>\n'
            '            <div style="font-size: 11px; color: var(--u-text-3); margin-top: 1px; display: flex; align-items: center; gap: 5px">%s Carlos</div>\n'
            '          </div>\n'
            '          %s\n'
            '        </div>\n'
            '      </div>\n' % (b, title, ico(P_USER, 12), o))


def token(n, occupied, mins=None, who=None, danger=False):
    if occupied:
        col = 'var(--c-danger)' if danger else 'var(--c-warn)'
        border = 'color-mix(in srgb, %s 55%%, transparent)' % col
        bg = 'color-mix(in srgb, %s 14%%, transparent)' % col
        shadow = '0 4px 14px color-mix(in srgb, %s 18%%, transparent)' % col
        extra = ('<span style="font-size: 11px; font-weight: 700; margin-top: 1px">● %s</span>'
                 '<span style="font-size: 9.5px; font-weight: 600; opacity: 0.85">%s</span>' % (mins, who))
        numcol = col
        lblcol = 'color-mix(in srgb, %s 85%%, transparent)' % col
    else:
        border = 'var(--u-hair-2)'
        bg = 'color-mix(in srgb, var(--u-text) 5%, transparent)'
        shadow = '0 2px 10px rgba(0,0,0,0.18)'
        extra = ''
        numcol = 'var(--u-text)'
        lblcol = 'var(--u-text-4)'
    return ('<div style="aspect-ratio: 1 / 1; border-radius: 16px; border: 1.5px solid %s; background: %s; box-shadow: %s; color: %s; '
            'display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px">'
            '<span style="font-size: 11px; font-weight: 600; color: %s">Mesa</span>'
            '<span style="font-size: 28px; font-weight: 800; line-height: 1">%d</span>%s</div>'
            % (border, bg, shadow, numcol, lblcol, n, extra))


def p_mesas():
    b = '      <div style="height: 46px; flex-shrink: 0"></div>\n'
    b += header('El Rincón', back=False)
    b += '      <div style="flex: 1; min-height: 0; padding: 18px 14px 0; overflow: hidden">\n'
    b += '        <div class="up" style="margin-bottom: 4px">Paso 1 de 3</div>\n'
    b += '        <div style="font-size: 24px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; margin-bottom: 4px">Elige la mesa</div>\n'
    b += ('        <div style="font-size: 13px; color: var(--u-text-4); margin-bottom: 16px; display: flex; gap: 14px; flex-wrap: wrap">\n'
          '          <span style="display: inline-flex; align-items: center; gap: 6px"><span style="width: 10px; height: 10px; border-radius: 3px; background: rgba(245,243,239,0.10); border: 1px solid var(--u-hair)"></span> Libre</span>\n'
          '          <span style="display: inline-flex; align-items: center; gap: 6px"><span style="width: 10px; height: 10px; border-radius: 3px; background: var(--c-warn-line); border: 1px solid var(--c-warn-line)"></span> Con pedido activo</span>\n'
          '        </div>\n')
    # Banda 1: borrador rescatado
    b += ('        <div class="glass" style="display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 14px; margin-bottom: 14px; border: 1px solid rgba(251,191,36,0.35)">\n'
          '          <span style="color: var(--c-warn); flex-shrink: 0">%s</span>\n'
          '          <div style="flex: 1; min-width: 0">\n'
          '            <div style="font-size: 13.5px; font-weight: 700">Pedido sin enviar</div>\n'
          '            <div style="font-size: 12.5px; color: var(--u-text-3); margin-top: 1px">3 platos para la mesa 7</div>\n'
          '          </div>\n'
          '          <div class="btn-accent" style="padding: 9px 15px; border-radius: 99px; font-weight: 700; font-size: 13px">Retomar</div>\n'
          '          <div class="glass-quiet" style="padding: 9px 13px; border-radius: 99px; font-weight: 600; font-size: 13px; color: var(--u-text-3)">Descartar</div>\n'
          '        </div>\n' % ico(P_ALERT, 17))
    # Banda 2: para llevar (borde punteado)
    b += ('        <div class="glass" style="display: flex; align-items: center; gap: 12px; padding: 13px 15px; margin-bottom: 16px; border-radius: 14px; border: 1.5px dashed var(--u-hair-2)">\n'
          '          <span style="width: 38px; height: 38px; border-radius: 11px; flex-shrink: 0; display: grid; place-items: center; background: color-mix(in srgb, var(--brand-accent) 14%%, transparent); color: var(--brand-accent-ink)">%s</span>\n'
          '          <span style="flex: 1; min-width: 0">\n'
          '            <span style="display: block; font-size: 15px; font-weight: 700">Para llevar · sin mesa</span>\n'
          '            <span style="display: block; font-size: 12.5px; color: var(--u-text-3); margin-top: 1px">Mostrador, barra o alguien que pasa a recoger</span>\n'
          '          </span>\n'
          '          <span style="color: var(--u-text-4); flex-shrink: 0">%s</span>\n'
          '        </div>\n' % (ico(P_BAG, 19), ico(P_CHEVR, 18)))
    # Banda 3: mesas abandonadas
    b += ('        <div style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; margin-bottom: 14px; background: rgba(248,113,113,0.10); border: 1px solid rgba(248,113,113,0.25)">\n'
          '          <span style="color: var(--c-danger); flex-shrink: 0">%s</span>\n'
          '          <span style="flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; color: var(--c-danger)">2 mesas con más de 24h ocupadas — probablemente un pedido olvidado.</span>\n'
          '          <span style="padding: 7px 13px; border-radius: 99px; font-weight: 700; font-size: 12.5px; background: var(--c-danger); color: #fff; flex-shrink: 0">Archivar</span>\n'
          '        </div>\n' % ico(P_ALERT, 16))
    b += '        <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px">\n'
    b += '          ' + token(1, False) + '\n'
    b += '          ' + token(2, True, '18 min', 'Carlos') + '\n'
    b += '          ' + token(3, False) + '\n'
    b += '          ' + token(4, True, '42 min', 'Cliente') + '\n'
    b += '          ' + token(5, False) + '\n'
    b += '          ' + token(6, True, '2 h 10 min', 'Ana', danger=True) + '\n'
    b += '        </div>\n'
    b += '      </div>\n'
    return b


def p_menu():
    b = '      <div style="height: 46px; flex-shrink: 0"></div>\n'
    b += header('Mesa 4', back=True)
    b += ('      <div style="padding: 12px 14px 6px; flex-shrink: 0">\n'
          '        <div style="position: relative">\n'
          '          <span style="position: absolute; left: 13px; top: 50%%; transform: translateY(-50%%); color: var(--u-text-4)">%s</span>\n'
          '          <div style="background: rgba(245,243,239,0.05); border: 1px solid var(--u-hair); border-radius: 12px; padding: 12px 14px 12px 40px; font-size: 15px; color: var(--u-text-4)">Buscar plato…</div>\n'
          '        </div>\n'
          '      </div>\n' % ico(P_SEARCH, 17))
    cats = [('Todos', True), ('Entradas', False), ('Platos fuertes', False), ('Bebidas', False)]
    b += '      <div style="display: flex; gap: 8px; padding: 6px 14px 10px; flex-shrink: 0; overflow: hidden">\n'
    for name, on in cats:
        if on:
            b += ('        <div style="white-space: nowrap; padding: 9px 16px; border-radius: 99px; font-weight: 600; font-size: 13.5px; background: var(--brand-accent); color: #fff; flex-shrink: 0">%s</div>\n' % name)
        else:
            b += ('        <div style="white-space: nowrap; padding: 9px 16px; border-radius: 99px; font-weight: 600; font-size: 13.5px; background: rgba(245,243,239,0.07); color: var(--u-text-2); flex-shrink: 0">%s</div>\n' % name)
    b += '      </div>\n'

    def card(name, price, qty=0, opts=False):
        badge = ''
        border = '1.5px solid transparent'
        if qty:
            badge = ('<span style="position: absolute; top: 8px; right: 8px; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 99px; background: var(--brand-accent); color: #fff; font-size: 13px; font-weight: 800; display: grid; place-items: center">%d</span>' % qty)
            border = '1.5px solid var(--brand-accent)'
        if opts:
            ctrl = ('<div style="margin-top: 2px; padding: 10px; border-radius: 10px; border: 1px solid var(--u-hair); background: rgba(245,243,239,0.04); color: var(--u-text-2); font-size: 13px; font-weight: 600; text-align: center">+ Elegir opciones</div>')
        elif qty:
            ctrl = ('<div style="margin-top: 2px; display: flex; align-items: center; gap: 8px">'
                    '<div style="flex: 1; height: 38px; border-radius: 10px; border: 1px solid var(--u-hair); background: rgba(245,243,239,0.04); font-size: 19px; display: grid; place-items: center">−</div>'
                    '<div style="flex: 1; height: 38px; border-radius: 10px; border: 1px solid var(--u-hair); background: rgba(245,243,239,0.04); font-size: 19px; display: grid; place-items: center">+</div>'
                    '</div>')
        else:
            ctrl = ('<div style="margin-top: 2px; padding: 10px; border-radius: 10px; background: color-mix(in srgb, var(--brand-accent) 14%, transparent); color: var(--brand-accent-ink); font-size: 13px; font-weight: 700; text-align: center">+ Agregar</div>')
        return ('          <div class="glass" style="border-radius: 14px; padding: 12px 12px 11px; position: relative; display: flex; flex-direction: column; gap: 6px; border: %s">%s\n'
                '            <div style="display: flex; flex-direction: column; gap: 5px">\n'
                '              <span style="font-size: 15px; font-weight: 700; line-height: 1.3">%s</span>\n'
                '              <span style="font-size: 14px; font-weight: 700; color: var(--brand-accent-ink)">%s</span>\n'
                '            </div>\n'
                '%s\n          </div>\n' % (border, badge, name, price, ctrl))

    b += '      <div style="flex: 1; min-height: 0; padding: 4px 14px 0; overflow: hidden">\n'
    b += '        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px">\n'
    b += card('Carne asada', 'Q105.00', qty=2)
    b += card('Pollo a la plancha', 'Q95.00', opts=True)
    b += card('Sopa del día', 'Q38.00')
    b += card('Limonada', 'Q18.00', qty=1)
    b += '        </div>\n      </div>\n'
    # Barra flotante del carrito + mini-carrito
    b += ('      <div style="flex-shrink: 0; padding: 0 14px 14px; background: linear-gradient(to top, var(--brand-bg) 60%, transparent)">\n'
          '        <div style="display: flex; align-items: center; justify-content: center; gap: 6px; padding: 5px; margin-bottom: 6px; color: var(--u-text-3); font-size: 11.5px; font-weight: 600">'
          + ico(P_DOWN, 12) + ' Ver pedido actual</div>\n'
          '        <div class="btn-accent" style="padding: 15px 18px; border-radius: 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-weight: 700; font-size: 15.5px">\n'
          '          <span style="display: inline-flex; align-items: center; gap: 8px"><span style="min-width: 26px; height: 26px; border-radius: 99px; background: rgba(0,0,0,0.18); display: grid; place-items: center; font-size: 13.5px; font-weight: 800">3</span> Revisar pedido</span>\n'
          '          <span>Q228.00 →</span>\n'
          '        </div>\n'
          '      </div>\n')
    return b


def p_revisar():
    b = '      <div style="height: 46px; flex-shrink: 0"></div>\n'
    b += header('Revisar · Mesa 4', back=True)
    b += '      <div style="flex: 1; min-height: 0; padding: 16px 14px 0; overflow: hidden; display: flex; flex-direction: column; gap: 16px">\n'
    b += '        <div>\n          <div class="up" style="margin-bottom: 10px">Orden (3)</div>\n          <div style="display: flex; flex-direction: column; gap: 8px">\n'

    def line(name, sub, price, note=None):
        n = ('<div style="font-size: 11.5px; color: var(--c-warn); font-weight: 600; margin-top: 1px">⚠ %s</div>' % note) if note else ''
        return ('            <div class="glass" style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px">\n'
                '              <div style="flex: 1; min-width: 0">\n'
                '                <div style="font-size: 14px; font-weight: 600">%s</div>\n'
                '                <div style="font-size: 11.5px; color: var(--u-text-4); margin-top: 1px">%s</div>%s\n'
                '                <div style="font-size: 12.5px; color: var(--u-text-3); margin-top: 2px">%s c/u</div>\n'
                '              </div>\n'
                '              <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0">\n'
                '                <div class="glass-quiet" style="width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; color: var(--u-text-3)">%s</div>\n'
                '                <div style="width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--u-hair); background: rgba(245,243,239,0.04); font-size: 19px; display: grid; place-items: center">−</div>\n'
                '                <span style="min-width: 22px; text-align: center; font-weight: 700; font-size: 15px">2</span>\n'
                '                <div style="width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--u-hair); background: rgba(245,243,239,0.04); font-size: 19px; display: grid; place-items: center">+</div>\n'
                '              </div>\n'
                '            </div>\n' % (name, sub, n, price,
                                         ico("M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4z", 14)))

    b += line('Carne asada', 'término medio', 'Q105.00', note='sin cebolla')
    b += line('Limonada', 'con hielo', 'Q18.00')
    b += '          </div>\n        </div>\n'
    b += ('        <div>\n          <div class="up" style="margin-bottom: 6px">Nombre / referencia (opcional)</div>\n'
          '          <div style="background: rgba(245,243,239,0.05); border: 1px solid var(--u-hair); border-radius: 12px; padding: 12px 14px; font-size: 15px; color: var(--u-text-4)">Mesa 4</div>\n        </div>\n')
    b += ('        <div>\n          <div class="up" style="margin-bottom: 6px">Notas especiales</div>\n'
          '          <div style="background: rgba(245,243,239,0.05); border: 1px solid var(--u-hair); border-radius: 12px; padding: 12px 14px; font-size: 15px; color: var(--u-text-4)">Alergias, sin sal, extra salsa…</div>\n        </div>\n')
    b += '      </div>\n'
    b += ('      <div style="flex-shrink: 0; border-top: 1px solid var(--u-hair); background: rgba(11,11,12,0.82); padding: 14px 14px 22px; display: flex; flex-direction: column; gap: 10px">\n'
          '        <div style="display: flex; justify-content: space-between"><span style="font-size: 13px; color: var(--u-text-3)">Subtotal</span><span style="font-size: 13px; color: var(--u-text-3)">Q228.00</span></div>\n'
          '        <div style="display: flex; justify-content: space-between"><span style="font-size: 13px; color: var(--u-text-3)">Propina (10%)</span><span style="font-size: 13px; color: var(--u-text-3)">Q22.80</span></div>\n'
          '        <div style="display: flex; justify-content: space-between; align-items: center"><span style="font-size: 15px; color: var(--u-text-2); font-weight: 600">Total</span><span style="font-size: 22px; font-weight: 800">Q250.80</span></div>\n'
          '        <div class="btn-accent" style="padding: 16px; border-radius: 14px; font-weight: 700; font-size: 16px; text-align: center">' + ico(P_BELL, 16, 'vertical-align: -3px') + ' Enviar a cocina</div>\n'
          '      </div>\n')
    return b


def build():
    W, H = 1370, 1030
    d = HEAD.replace('__CSS__', ACT_CSS)
    d += ('<div class="w" style="width: %dpx; height: %dpx; background: #e9e9ee; padding: 44px 40px; display: flex; align-items: flex-start; justify-content: center; gap: 40px">\n' % (W, H))
    for inner, cap in (
        (p_mesas(), 'Paso 1 · Elige la mesa — tres bandas de aviso apiladas antes de ver una sola mesa'),
        (p_menu(), 'Paso 2 · Menú — tres controles por tarjeta y un mini-carrito que duplica el paso 3'),
        (p_revisar(), 'Paso 3 · Revisar y enviar — rótulos en versalitas y pesos 800 por todos lados'),
    ):
        d += ('  <div style="display: flex; flex-direction: column; gap: 14px; align-items: center">\n'
              '    <div class="phone">\n%s    </div>\n'
              '    <div class="cap">%s</div>\n  </div>\n' % (inner, cap))
    d += '</div>\n' + TAIL.replace('__W__', str(W)).replace('__H__', str(H))
    write('Actual.dc.html', d)


if __name__ == '__main__':
    build()
