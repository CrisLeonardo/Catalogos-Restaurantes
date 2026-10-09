# -*- coding: utf-8 -*-
"""Genera Movil.dc.html, Detalles.dc.html y Sistema.dc.html."""
import io, os
from build_screens import I, svg, switch, HEAD, TAIL, CSS

here = os.path.dirname(os.path.abspath(__file__))
os.chdir(here)

DOC_CSS = CSS + """
    .sc .doc-h1 { font-family: 'Unbounded', 'Geist', system-ui, sans-serif; font-weight: 800; letter-spacing: -0.03em; }
    .sc .card { background: var(--surf); border: 1px solid var(--hair); border-radius: 14px; box-shadow: var(--sh); }
    .sc .h2 { font-size: 13px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink3); }
"""

def doc(theme, w, h, body):
    d = HEAD.replace('__CSS__', DOC_CSS).replace(
        "family=Geist", "family=Anton&family=Geist")
    d += ('<div class="sc" data-t="%s" style="width: %dpx; min-height: %dpx; background: var(--bg); color: var(--ink); padding: 52px 48px 48px; display: flex; flex-direction: column; gap: 40px">\n'
          % (theme, w, h))
    d += body
    d += '</div>\n' + TAIL.replace('__W__', str(w)).replace('__H__', str(h))
    return d

def write(path, text):
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('  %-22s %6d bytes' % (path, len(text.encode('utf-8'))))

# ══ Móvil ════════════════════════════════════════════════════════════
def phone(theme, inner, caption):
    return ('''  <div style="display: flex; flex-direction: column; gap: 14px; align-items: center">
    <div class="sc" data-t="%s" style="width: 390px; height: 844px; border-radius: 44px; overflow: hidden; background: var(--bg); color: var(--ink); display: flex; flex-direction: column; box-shadow: 0 18px 50px rgba(0,0,0,0.22)">
      <div style="height: 46px; flex-shrink: 0"></div>
%s    </div>
    <div style="font-size: 13px; color: rgba(23,22,26,0.60)">%s</div>
  </div>''' % (theme, inner, caption))

def tabbar(active):
    items = [('hoy', 'Hoy'), ('pedidos', 'Pedidos'), ('menu', 'Menú'), ('clientes', 'Clientes'), ('ajustes', 'Más')]
    out = []
    for key, label in items:
        on = key == active
        col = 'var(--acc-ink)' if on else 'var(--ink4)'
        fw = '600' if on else '500'
        out.append('<div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: %s; font-size: 11px; font-weight: %s">%s<span>%s</span></div>'
                   % (col, fw, svg(key, 'i'), label))
    return ('      <div style="height: 74px; flex-shrink: 0; display: flex; align-items: stretch; padding-bottom: 14px; border-top: 1px solid var(--hair); background: var(--side)">%s</div>\n'
            % ''.join(out))

def phone_hoy():
    b = '      <div style="flex: 1; min-height: 0; padding: 4px 16px 16px; display: flex; flex-direction: column; gap: 20px">\n'
    b += ('        <div style="display: flex; align-items: flex-start; gap: 12px">\n'
          '          <div style="flex: 1">\n'
          '            <div class="disp" style="font-size: 26px; color: var(--ink)">Hoy</div>\n'
          '            <div style="font-size: 14px; color: var(--ink3); margin-top: 4px">Jueves 21 de agosto</div>\n'
          '          </div>\n'
          '          <div class="ghost" style="width: 44px; height: 44px; border-radius: 12px">%s</div>\n'
          '        </div>\n' % svg('campana'))
    b += ('        <div class="group">\n'
          '          <div class="row" style="padding: 15px 16px">\n'
          '            <span class="dot" style="background: var(--warn); width: 9px; height: 9px"></span>\n'
          '            <div style="flex: 1; min-width: 0">\n'
          '              <div style="font-size: 15px; font-weight: 500">La PC del local no responde</div>\n'
          '              <div style="font-size: 13px; color: var(--ink3); margin-top: 2px">No se imprimen comandas solas.</div>\n'
          '            </div>\n'
          '            %s\n          </div>\n        </div>\n' % svg('chevron', 'i-sm', 'color: var(--ink4)'))
    def nr(l, v, last=False):
        return ('          <div class="row" style="padding: 14px 16px"><div style="flex: 1; font-size: 15px">%s</div>'
                '<div class="mono" style="font-size: 15px">%s</div></div>\n' % (l, v)) + ('' if last else '          <div class="hr"></div>\n')
    b += ('        <div>\n          <div class="lbl">Resumen del día</div>\n          <div class="group">\n'
          + nr('Ventas', 'Q3,480.00') + nr('Pedidos', '24') + nr('Ticket promedio', 'Q145.00', True)
          + '          </div>\n        </div>\n')
    def orow(who, det, est, col, tot, last=False):
        return ('          <div class="row" style="padding: 14px 16px">\n'
                '            <div style="flex: 1; min-width: 0">\n'
                '              <div style="font-size: 15px; font-weight: 600">%s</div>\n'
                '              <div class="pill" style="margin-top: 3px"><span class="dot" style="background: %s"></span>%s · %s</div>\n'
                '            </div>\n'
                '            <div class="mono" style="font-size: 15px">%s</div>\n'
                '          </div>\n' % (who, col, est, det, tot)) + ('' if last else '          <div class="hr"></div>\n')
    b += ('        <div>\n          <div class="lbl">En curso · 8 pedidos</div>\n          <div class="group">\n'
          + orow('Mesa 4', 'hace 2 min', 'Nuevo', 'var(--acc-ink)', 'Q210.00')
          + orow('Llevar · Ana L.', 'hace 6 min', 'En cocina', 'var(--warn)', 'Q95.00')
          + '          <div class="row" style="padding: 14px 16px"><div style="font-size: 14.5px; font-weight: 600; color: var(--acc-ink)">Ver los 8 pedidos</div></div>\n'
          + '          </div>\n        </div>\n')
    b += '      </div>\n'
    b += tabbar('hoy')
    return b

def phone_pedidos():
    b = '      <div style="flex: 1; min-height: 0; padding: 4px 16px 16px; display: flex; flex-direction: column; gap: 18px">\n'
    b += ('        <div style="display: flex; align-items: flex-start; gap: 12px">\n'
          '          <div style="flex: 1">\n'
          '            <div class="disp" style="font-size: 26px; color: var(--ink)">Pedidos</div>\n'
          '            <div style="font-size: 14px; color: var(--ink3); margin-top: 4px">8 en curso</div>\n'
          '          </div>\n'
          '          <div class="btn" style="height: 44px; border-radius: 12px">%s<span>Nuevo</span></div>\n'
          '        </div>\n' % svg('mas', 'i-sm'))
    b += '        <div><div class="seg" style="width: 100%"><div data-on="1" style="flex: 1; text-align: center">En vivo</div><div style="flex: 1; text-align: center">Cocina</div><div style="flex: 1; text-align: center">Mesas</div></div></div>\n'
    def card(who, det, est, col, tot, accion):
        return ('        <div class="group" style="padding: 16px; display: flex; flex-direction: column; gap: 12px">\n'
                '          <div style="display: flex; align-items: baseline; gap: 10px">\n'
                '            <div style="flex: 1; font-size: 18px; font-weight: 600; letter-spacing: -0.01em">%s</div>\n'
                '            <div class="pill"><span class="dot" style="background: %s"></span>%s</div>\n'
                '          </div>\n'
                '          <div style="font-size: 14px; color: var(--ink3); line-height: 1.45">%s</div>\n'
                '          <div style="display: flex; align-items: center; gap: 12px">\n'
                '            <div class="mono" style="flex: 1; font-size: 17px">%s</div>\n'
                '            <div class="btn" style="height: 44px; border-radius: 12px; font-size: 14.5px">%s</div>\n'
                '          </div>\n        </div>\n' % (who, col, est, det, tot, accion))
    b += card('Mesa 4', '2 Carne asada · 1 Limonada · hace 2 min', 'Nuevo', 'var(--acc-ink)', 'Q210.00', 'Mandar a cocina')
    b += card('Llevar · Ana L.', '1 Hamburguesa doble · hace 4 min', 'Nuevo', 'var(--acc-ink)', 'Q95.00', 'Mandar a cocina')
    b += '      </div>\n'
    b += tabbar('pedidos')
    return b

def movil():
    d = HEAD.replace('__CSS__', DOC_CSS)
    d += ('<div style="width: 1000px; height: 1060px; background: #e9e9ee; padding: 48px 0; box-sizing: border-box; display: flex; align-items: flex-start; justify-content: center; gap: 44px; font-family: \'Geist\', system-ui, sans-serif">\n')
    d += phone('light', phone_hoy(), 'Hoy · modo claro') + '\n'
    d += phone('dark', phone_pedidos(), 'Pedidos · modo oscuro') + '\n'
    d += '</div>\n' + TAIL.replace('__W__', '1000').replace('__H__', '1060')
    return d

# ══ Detalles ═════════════════════════════════════════════════════════
DET = [
 ("Al Inicio no se llega desde el menú",
  "El menú lateral tiene 35 entradas y ninguna es «Inicio»: solo se entra tocando el logo.",
  "«Hoy» es la primera entrada del menú, siempre.",
  "Si una pantalla existe, tiene que tener una puerta."),
 ("Cuatro avisos apilados",
  "Prueba gratis, visitas, PC caída y primeros pasos, uno encima de otro, todos del mismo tamaño.",
  "Un solo grupo «Necesita tu atención», ordenado por urgencia, y desaparece cuando no hay nada.",
  "Si todo grita, nada se oye."),
 ("Confirmar para todo",
  "«¿Eliminar producto? Aceptar / Cancelar» — una pregunta antes de cada acción.",
  "La acción se hace y aparece «Platillo eliminado · Deshacer» durante unos segundos.",
  "Deshacer respeta más al usuario que preguntarle si está seguro."),
 ("Candados vendiendo en el menú",
  "Hasta cinco entradas con candado mezcladas con el trabajo diario.",
  "El menú solo muestra lo que tenés. Lo bloqueado aparece donde se usa, con una frase concreta de qué hace.",
  "El menú es para trabajar, no para vender."),
 ("Nombres del sistema, no del negocio",
  "«Módulos», «Canales», «Respaldo», «Mi PC del local».",
  "«Funciones», «Apps de delivery», «Copia de tus datos», «La PC del local».",
  "Las cosas se llaman como las llama el dueño."),
 ("Pantallas vacías sin salida",
  "«No hay productos.» Y ahí termina.",
  "«Todavía no tenés platillos» + el botón «Agregar el primero».",
  "Una pantalla vacía es la mejor oportunidad de enseñar."),
 ("Guardar siempre encendido",
  "El botón «Guardar» se ve igual hayas cambiado algo o no.",
  "Se enciende solo si hay cambios; al guardar dice «Guardado» y se apaga.",
  "El botón dice la verdad sobre el estado de la pantalla."),
 ("Errores técnicos",
  "«Error 500» / «Failed to fetch».",
  "«No se pudo guardar. Revisá tu internet e intentá otra vez.» + Reintentar.",
  "Un error explica qué pasó y qué hacer ahora."),
 ("Tres pantallas para ver números",
  "Métricas, Analítica y Finanzas, cada una con su propio inicio.",
  "Una sola pantalla, Negocio, con pestañas: Resumen, Analítica, Finanzas, Facturación, Canales, Respaldo.",
  "La misma pregunta se responde en un solo lugar."),
 ("Etiquetas en versalitas",
  "«ACCESOS RÁPIDOS» en Anton, mayúsculas y con mucho espacio entre letras.",
  "«Accesos rápidos» en la tipografía del panel, sin mayúsculas.",
  "Es el ÚNICO cambio de tipografía que propongo — decidilo vos."),
]

def detalles():
    b = ('  <div style="display: flex; flex-direction: column; gap: 16px">\n'
         '    <div style="font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--acc-ink)">Dirección B · Claridad</div>\n'
         '    <div class="doc-h1" style="font-size: 40px; line-height: 1.05">Las cosas pequeñas</div>\n'
         '    <div style="font-size: 16px; line-height: 1.5; color: var(--ink2); max-width: 640px">Diez detalles que hoy no tienen sentido y que, arreglados, cambian más la sensación de uso que cualquier rediseño de color. Ninguno quita una función.</div>\n'
         '  </div>\n')
    items = []
    for i, (titulo, antes, ahora, por) in enumerate(DET, 1):
        items.append(
          '    <div class="card" style="padding: 22px 24px; display: flex; flex-direction: column; gap: 14px">\n'
          '      <div style="display: flex; align-items: baseline; gap: 12px">\n'
          '        <div class="mono" style="font-size: 13px; color: var(--ink4)">%02d</div>\n'
          '        <div style="font-size: 17px; font-weight: 600; letter-spacing: -0.01em">%s</div>\n'
          '      </div>\n'
          '      <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px">\n'
          '        <div style="display: flex; flex-direction: column; gap: 6px">\n'
          '          <div style="font-size: 12px; font-weight: 600; color: var(--ink4)">Hoy</div>\n'
          '          <div style="font-size: 14px; line-height: 1.5; color: var(--ink3)">%s</div>\n'
          '        </div>\n'
          '        <div style="display: flex; flex-direction: column; gap: 6px">\n'
          '          <div style="font-size: 12px; font-weight: 600; color: var(--acc-ink)">Propuesta</div>\n'
          '          <div style="font-size: 14px; line-height: 1.5; color: var(--ink)">%s</div>\n'
          '        </div>\n'
          '      </div>\n'
          '      <div style="font-size: 13px; line-height: 1.5; color: var(--ink4); border-top: 1px solid var(--hair); padding-top: 12px">%s</div>\n'
          '    </div>\n' % (i, titulo, antes, ahora, por))
    b += '  <div style="display: flex; flex-direction: column; gap: 14px">\n' + ''.join(items) + '  </div>\n'
    return b

# ══ Sistema ══════════════════════════════════════════════════════════
def swatch(nombre, valor, uso):
    return ('        <div style="display: flex; align-items: center; gap: 12px; padding: 9px 0">\n'
            '          <div style="width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0; background: %s; border: 1px solid var(--hair2)"></div>\n'
            '          <div style="flex: 1; min-width: 0">\n'
            '            <div class="mono" style="font-size: 12.5px; color: var(--ink)">%s</div>\n'
            '            <div style="font-size: 12px; color: var(--ink4); margin-top: 1px">%s</div>\n'
            '          </div>\n'
            '          <div class="mono" style="font-size: 12px; color: var(--ink3)">%s</div>\n'
            '        </div>\n' % (valor, nombre, uso, valor))

def sistema():
    b = ('  <div style="display: flex; flex-direction: column; gap: 16px">\n'
         '    <div style="font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--acc-ink)">Dirección B · Claridad</div>\n'
         '    <div class="doc-h1" style="font-size: 40px; line-height: 1.05">El sistema</div>\n'
         '    <div style="font-size: 16px; line-height: 1.5; color: var(--ink2); max-width: 640px">Lo mínimo para que esto se pueda programar sin inventar valores. La tipografía y los colores salen de <span class="mono" style="font-size: 14px">globals.css</span>: son los que ya usa el panel.</div>\n'
         '  </div>\n')

    b += ('  <div style="display: flex; flex-direction: column; gap: 16px">\n'
          '    <div class="h2">Tipografía · se conserva la actual</div>\n'
          '    <div class="card" style="padding: 24px; display: flex; flex-direction: column; gap: 20px">\n'
          '      <div style="display: flex; align-items: baseline; gap: 24px">\n'
          '        <div style="width: 150px; flex-shrink: 0; font-size: 13px; color: var(--ink3)">Títulos<br><span class="mono" style="font-size: 12px; color: var(--ink4)">--font-display</span></div>\n'
          '        <div><div class="disp" style="font-size: 30px">Hoy · Pedidos</div><div style="font-size: 12.5px; color: var(--ink4); margin-top: 6px">Unbounded 800 · 26 px en el título de pantalla. Un solo tamaño, un solo lugar.</div></div>\n'
          '      </div>\n'
          '      <div style="height: 1px; background: var(--hair)"></div>\n'
          '      <div style="display: flex; align-items: baseline; gap: 24px">\n'
          '        <div style="width: 150px; flex-shrink: 0; font-size: 13px; color: var(--ink3)">Texto<br><span class="mono" style="font-size: 12px; color: var(--ink4)">--ui-font-sans</span></div>\n'
          '        <div><div style="font-size: 22px; font-weight: 500">Mesa 4 · 3 platillos</div><div style="font-size: 12.5px; color: var(--ink4); margin-top: 6px">Geist · 12,5 / 13,5 / 14,5 / 16 px. Peso 400 normal, 500 fila de lista, 600 énfasis.</div></div>\n'
          '      </div>\n'
          '      <div style="height: 1px; background: var(--hair)"></div>\n'
          '      <div style="display: flex; align-items: baseline; gap: 24px">\n'
          '        <div style="width: 150px; flex-shrink: 0; font-size: 13px; color: var(--ink3)">Números<br><span class="mono" style="font-size: 12px; color: var(--ink4)">--ui-font-mono</span></div>\n'
          '        <div><div class="mono" style="font-size: 30px">Q3,480.00 · 24 · Q145</div><div style="font-size: 12.5px; color: var(--ink4); margin-top: 6px">JetBrains Mono 600 con cifras tabulares: todo precio, cantidad y hora del panel. Las columnas quedan alineadas solas.</div></div>\n'
          '      </div>\n'
          '    </div>\n'
          '    <div class="card" style="padding: 20px 24px; display: flex; flex-direction: column; gap: 10px; border-color: var(--acc-soft); background: var(--acc-soft)">\n'
          '      <div style="font-size: 14.5px; font-weight: 600">La única excepción que propongo</div>\n'
          '      <div style="font-size: 14px; line-height: 1.55; color: var(--ink2)">Las etiquetas de sección hoy van en Anton, mayúsculas y con mucho espacio entre letras (<span class="mono" style="font-size: 13px">.t-kicker</span>). Es lo que más ruido mete en pantallas llenas de listas. Propuesta: la misma etiqueta en Geist 600, 12,5 px, sin mayúsculas. Anton se queda para la marca. Si preferís conservarlo, se cambia en una línea.</div>\n'
          '      <div style="display: flex; align-items: center; gap: 20px; margin-top: 4px">\n'
          '        <div style="font-family: \'Anton\', sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink3)">Accesos rápidos</div>\n'
          '        <div style="color: var(--ink4)">→</div>\n'
          '        <div style="font-size: 12.5px; font-weight: 600; color: var(--ink)">Accesos rápidos</div>\n'
          '      </div>\n'
          '    </div>\n'
          '  </div>\n')

    b += ('  <div style="display: flex; flex-direction: column; gap: 16px">\n'
          '    <div class="h2">Color · los dos modos, uno al lado del otro</div>\n'
          '    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px">\n'
          '      <div class="sc card" data-t="light" style="padding: 18px 20px; background: #f4f4f6; color: #17161a">\n'
          '        <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px">Claro</div>\n'
          + swatch('--bg', '#f4f4f6', 'Fondo de la pantalla')
          + swatch('--surf', '#ffffff', 'Tarjetas y listas')
          + swatch('--side', '#ebebef', 'Barra lateral')
          + swatch('--ink', '#17161a', 'Texto principal')
          + swatch('--acc', '#c2542f', 'Acento (AA sobre blanco)')
          + '      </div>\n'
          '      <div class="sc card" data-t="dark" style="padding: 18px 20px; background: #0a0a0d; color: #f5f3ef">\n'
          '        <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px">Oscuro</div>\n'
          + swatch('--bg', '#0a0a0d', 'Fondo de la pantalla')
          + swatch('--surf', '#141418', 'Tarjetas y listas')
          + swatch('--side', '#101014', 'Barra lateral')
          + swatch('--ink', '#f5f3ef', 'Texto principal')
          + swatch('--acc-ink', '#e58a5f', 'Acento en texto')
          + '      </div>\n'
          '    </div>\n'
          '    <div style="font-size: 13px; line-height: 1.55; color: var(--ink4)">El interruptor de tema se queda donde está hoy, arriba a la derecha, y sigue recordando la elección de cada usuario. Los dos modos usan exactamente el mismo marcado: solo cambian estas variables.</div>\n'
          '  </div>\n')

    b += ('  <div style="display: flex; flex-direction: column; gap: 16px">\n'
          '    <div class="h2">Piezas</div>\n'
          '    <div class="card" style="padding: 24px; display: flex; flex-direction: column; gap: 22px">\n'
          '      <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap">\n'
          '        <div class="btn">%s<span>Acción principal</span></div>\n'
          '        <div class="btn2">Acción secundaria</div>\n'
          '        <div class="seg"><div data-on="1">Segmentado</div><div>Otra</div><div>Otra más</div></div>\n'
          '        %s\n        %s\n'
          '        <div class="pill"><span class="dot" style="background: var(--ok)"></span>Listo</div>\n'
          '        <div class="pill"><span class="dot" style="background: var(--warn)"></span>En cocina</div>\n'
          '      </div>\n'
          '      <div style="height: 1px; background: var(--hair)"></div>\n'
          '      <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px">\n'
          '        <div class="group">\n'
          '          <div class="row"><span class="tile">%s</span><div style="flex: 1; font-size: 14.5px">Fila de lista</div><div style="font-size: 13.5px; color: var(--ink3)">Valor</div>%s</div>\n'
          '          <div class="hr"></div>\n'
          '          <div class="row"><span class="tile">%s</span><div style="flex: 1; font-size: 14.5px">Con número</div><div class="mono" style="font-size: 14.5px">Q145.00</div></div>\n'
          '        </div>\n'
          '        <div class="group" style="padding: 22px 18px; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center">\n'
          '          <div style="font-size: 14.5px; font-weight: 600">Todavía no tenés platillos</div>\n'
          '          <div style="font-size: 13px; color: var(--ink3); line-height: 1.45">Agregá el primero y tu menú queda en línea al instante.</div>\n'
          '          <div class="btn" style="margin-top: 4px">Agregar el primero</div>\n'
          '        </div>\n'
          '      </div>\n'
          '      <div style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 12px; background: var(--ink); color: var(--bg); max-width: 420px">\n'
          '        <div style="flex: 1; font-size: 14px; font-weight: 500">Platillo eliminado</div>\n'
          '        <div style="font-size: 14px; font-weight: 600; color: var(--bg); opacity: 0.85">Deshacer</div>\n'
          '      </div>\n'
          '      <div style="font-size: 13px; line-height: 1.55; color: var(--ink4)">Radios 8 · 12 · 14 px. Espacios 4 · 8 · 12 · 16 · 24 px. Altura mínima de cualquier cosa tocable en teléfono o tablet: 44 px.</div>\n'
          '    </div>\n'
          '  </div>\n'
          % (svg('mas', 'i-sm'), switch(True), switch(False), svg('user'),
             svg('chevron', 'i-sm', 'color: var(--ink4)'), svg('wallet')))
    return b

write('Movil.dc.html', movil())
write('Detalles.dc.html', doc('light', 900, 2500, detalles()))
write('Sistema.dc.html', doc('light', 900, 1760, sistema()))
print('listo')
