# -*- coding: utf-8 -*-
"""Los widgets, uno por función. Al día con lo que se construyó.

Cada widget es un BLOQUE del panel (rótulo + tarjeta agrupada), no una
tarjeta suelta flotando: la misma pieza que ya usan "Necesita tu atención",
"Resumen del día" y "En curso". Por eso no se ven como un cuerpo extraño.

Los datos de los ejemplos salen de consultas que el panel YA hace:
  · serie de 14 días y top de hoy → getOrderStats (lib/db/orders.ts), que
    calculaba ambas cosas y las tiraba a la basura.
  · con qué comparar el día → getDayPace, acotado a los CUATRO días iguales
    anteriores y midiendo lo que ese día llevaba A ESTA MISMA HORA.
  · mesas ocupadas → getActiveTableNumbers   · espera → waitlist_entries
  · reservas → getReservations                · opiniones → order_ratings
  · visitas → getVisitStats                   · existencias → products
"""

from kit import CHEV, block, group

# Cierres de los 13 días anteriores. El día de hoy se añade aparte, porque
# a mediodía va por la mitad y a las nueve de la noche ya está completo.
SERIE = [4900, 6100, 7400, 6800, 7900, 9600, 8700,
         5300, 6000, 7200, 6900, 8100, 9900]


def _spark(values, height=96, bar=21, gap=3):
    """Las barras. `bar=None` = crecen hasta llenar el ancho que haya."""
    top = max(values)
    barras = []
    for i, v in enumerate(values):
        h = max(6 if v > 0 else 2, round(v / top * height))
        on = ' data-on="1"' if i == len(values) - 1 else ''
        estilo = 'height: %dpx' % h
        if bar:
            estilo += '; width: %dpx' % bar
        barras.append('<i%s style="%s"></i>' % (on, estilo))
    fill = '' if bar else ' data-fill="1"'
    return ('<div class="spark"%s style="height: %dpx; gap: %dpx">%s</div>'
            % (fill, height, gap, ''.join(barras)))


def _quetzales(n):
    return 'Q%s' % format(n, ',.2f')


# ── 1 · Cómo va el día ────────────────────────────────────────────────
FRASE_RITMO = ('Un día como hoy a esta hora va en <span class="mono">Q2,940.00</span>. '
               'Vas <span class="mono" style="color: var(--ok)">18%</span> arriba.')


def ritmo(hoy=3480, frase=FRASE_RITMO, apilado=False):
    """La gráfica de 14 días y la frase que la interpreta.

    NO repite el total de hoy: las dos pantallas que la usan lo tienen a
    pocos centímetros —"Resumen del día" en Hoy, la fila de cifras en
    Pedidos— y el mismo número dos veces no informa, solo ocupa.

    `apilado` = el caso de la columna estrecha: la gráfica se va sola al
    renglón de abajo.
    """
    cifra = ("""<div style="min-width: 140px; flex: 1">
      <div style="font-size: 13px; color: var(--ink3)">Últimos 14 días</div>
      <div class="mono" style="font-size: 20px; color: var(--ink); margin-top: 4px; line-height: 1">%s</div>
    </div>""" % _quetzales(sum(SERIE) + hoy))

    grafica = ("""<div style="width: %s; max-width: 340px; min-width: 260px; flex: 2">
      %s
      <div style="display: flex; justify-content: space-between; margin-top: 6px; font-size: 11px; color: var(--ink4)"><span>hace 14 días</span><span>hoy</span></div>
    </div>""" % ('100%' if apilado else '340px',
                 _spark(SERIE + [hoy], 96, bar=None if apilado else 21)))

    inner = """<div class="group">
  <div class="row" style="align-items: flex-end; %sgap: 24px; padding: 16px">
    %s
    %s
  </div>
  <div class="hrf"></div>
  <div class="row" style="padding: 11px 16px; min-height: 0">
    <div style="font-size: 13.5px; color: var(--ink2); line-height: 1.45">%s</div>
  </div>
</div>""" % ('flex-wrap: wrap; ' if apilado else '', cifra, grafica, frase)
    return block('Cómo va el día', inner)


# ── 2 · Lo que más sale hoy ───────────────────────────────────────────
def top_platillos():
    datos = [('Carne asada', 14, 100), ('Pollo a la plancha', 11, 79),
             ('Hamburguesa doble', 9, 64), ('Sopa del día', 6, 43)]
    rows = []
    for nombre, qty, pct in datos:
        rows.append(
            '<div class="row" style="padding: 11px 16px; min-height: 44px; gap: 12px">'
            '<div style="flex: 2; min-width: 0; font-size: 14px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis">%s</div>'
            '<div class="track" style="flex: 1; max-width: 160px; min-width: 32px"><i style="width: %d%%"></i></div>'
            '<div class="mono" style="width: 28px; text-align: right; flex-shrink: 0; font-size: 14px; color: var(--ink)">%d</div>'
            '</div>' % (nombre, pct, qty))
    return block('Lo que más sale hoy', group(rows))


# ── 3 · La casa ───────────────────────────────────────────────────────
def casa(lead=44):
    dots = ''.join('<i%s></i>' % (' data-on="1"' if i < 7 else '') for i in range(12))
    r1 = ('<div class="row"><div class="tables">%s</div>'
          '<div style="flex: 1; min-width: 0"><div class="ttl">7 de 12 mesas ocupadas</div>'
          '<div class="sub">La 4 lleva abierta 1 h 20 min.</div></div>%s</div>'
          % (dots, CHEV))
    r2 = ('<div class="row"><div class="mono" style="width: %dpx; flex-shrink: 0; font-size: 19px; color: var(--ink)">3</div>'
          '<div style="flex: 1; min-width: 0"><div class="ttl">Grupos esperando mesa</div>'
          '<div class="sub">El primero de la fila llegó hace 14 min.</div></div>'
          '<span class="act" style="font-size: 13.5px">Ver la fila</span></div>' % lead)
    r3 = ('<div class="row"><div class="mono" style="width: %dpx; flex-shrink: 0; font-size: 14px; color: var(--ink2)">19:00</div>'
          '<div style="flex: 1; min-width: 0"><div class="ttl">Familia Pérez · 4 personas</div>'
          '<div class="sub">Y 1 reserva más hoy.</div></div>%s</div>' % (lead, CHEV))
    return block('La casa', group([r1, r2, r3]), 'Ver mesas')


# ── 4 · Se está acabando ──────────────────────────────────────────────
def stock():
    r1 = ('<div class="row"><span class="dot" style="background: var(--dang); width: 9px; height: 9px"></span>'
          '<div style="flex: 1; min-width: 0"><div class="ttl">Limonada natural</div>'
          '<div class="sub">Sin existencias. Se marcó agotado solo.</div></div>'
          '<div class="mono" style="font-size: 15px; color: var(--dang)">0</div></div>')
    r2 = ('<div class="row"><span class="dot" style="background: var(--warn); width: 9px; height: 9px"></span>'
          '<div style="flex: 1; min-width: 0"><div class="ttl">Carne asada</div>'
          '<div class="sub">Quedan pocas. Avisas por debajo de 6.</div></div>'
          '<div class="mono" style="font-size: 15px; color: var(--warn)">3</div></div>')
    return block('Se está acabando', group([r1, r2]), 'Ver inventario')


# ── 5 · Lo que dicen tus clientes ─────────────────────────────────────
def opiniones():
    barras = []
    for estrellas, pct in ((5, 74), (4, 17), (3, 9), (2, 0), (1, 0)):
        barras.append(
            '<div style="display: flex; align-items: center; gap: 8px">'
            '<div class="mono" style="width: 10px; font-size: 11.5px; color: var(--ink4)">%d</div>'
            '<div class="track" style="flex: 1; height: 6px"><i style="width: %d%%"></i></div>'
            '</div>' % (estrellas, pct))
    r1 = ('<div class="row" style="align-items: center">'
          '<div style="width: 112px; flex-shrink: 0">'
          '<div class="mono" style="font-size: 28px; color: var(--ink); line-height: 1">4.6</div>'
          '<div style="font-size: 13px; color: var(--ink3); margin-top: 4px">de 5 · 23 esta semana</div></div>'
          '<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px">%s</div>'
          '</div>' % ''.join(barras))
    r2 = ('<div class="row"><div style="flex: 1; min-width: 0">'
          '<div style="font-size: 13.5px; color: var(--ink2); line-height: 1.45">'
          '«Todo riquísimo, pero la espera se hizo larga.»</div>'
          '<div class="sub">Mesa 7 · hace 4 h · 3 estrellas</div></div></div>')
    return block('Lo que dicen tus clientes', group([r1, r2]), 'Ver encuestas')


# ── 6 · Tu menú en línea ──────────────────────────────────────────────
FRASE_ONLINE = ('Un día normal recibe <span class="mono">240</span> visitas. '
                'Hoy vas <span class="mono" style="color: var(--ok)">32%</span> arriba.')


def online(visitas='318', personas='214', piden='8%', frase=FRASE_ONLINE, dos_columnas=False):
    celdas = [('Visitas hoy', visitas), ('Personas distintas', personas), ('Piden', piden)]
    if dos_columnas:
        celda = ('<div style="padding: 13px 16px%s"><div style="font-size: 12.5px; color: var(--ink3)">%s</div>'
                 '<div class="mono" style="font-size: 23px; color: var(--ink); margin-top: 4px">%s</div></div>')
        cifras = ('<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr))">%s%s</div>'
                  '<div class="hrf"></div>%s'
                  % (celda % ('', celdas[0][0], celdas[0][1]),
                     celda % ('; border-left: 1px solid var(--hair)', celdas[1][0], celdas[1][1]),
                     celda % ('', celdas[2][0], celdas[2][1])))
    else:
        cifras = '<div class="stat3">%s</div>' % ''.join(
            '<div><div class="slab">%s</div><div class="mono snum">%s</div></div>' % c for c in celdas)
    inner = """<div class="group">
  %s
  <div class="hrf"></div>
  <div class="row" style="padding: 11px 16px; min-height: 0">
    <div style="font-size: 13.5px; color: var(--ink2); line-height: 1.45">%s</div>
  </div>
</div>""" % (cifras, frase)
    return block('Tu menú en línea', inner)


# ── Pedidos · Tiempos de hoy ──────────────────────────────────────────
def tiempos():
    inner = """<div class="group">
  <div class="stat3">
    <div><div class="slab">Del pedido a la mesa</div><div class="mono snum">18 min</div></div>
    <div><div class="slab">Pedidos medidos</div><div class="mono snum">37</div></div>
    <div><div class="slab">Pasaron de 30 min</div><div class="mono snum" style="color: var(--warn)">3</div></div>
  </div>
  <div class="hrf"></div>
  <div class="row" style="padding: 11px 20px; min-height: 0">
    <div style="flex: 1; font-size: 13.5px; color: var(--ink2)">El más lento fue la Mesa 7, con <span class="mono">41 min</span>.</div>
  </div>
</div>"""
    return block('Tiempos de hoy', inner)


# ── Menú · No se puede pedir ahora ────────────────────────────────────
def apagados():
    r1 = ('<div class="row"><span class="dot" style="background: var(--dang); width: 9px; height: 9px"></span>'
          '<div style="flex: 1; min-width: 0"><div class="ttl">Limonada natural</div>'
          '<div class="sub">Se quitó solo al llegar a cero existencias · hace 2 h.</div></div>'
          '<span class="act" style="font-size: 13.5px">Reactivar</span></div>')
    r2 = ('<div class="row"><span class="dot" style="background: var(--ink4); width: 9px; height: 9px"></span>'
          '<div style="flex: 1; min-width: 0"><div class="ttl">Sopa del día</div>'
          '<div class="sub">Marcado agotado a mano · hace 5 h.</div></div>'
          '<span class="act" style="font-size: 13.5px">Reactivar</span></div>')
    return block('No se puede pedir ahora', group([r1, r2]))


# ── Clientes · el resumen que YA existía, con dos datos más ───────────
def vuelven():
    celda = ('<div style="padding: 16px 20px%s"><div class="slab">%s</div>'
             '<div class="mono snum">%s</div></div>')
    cifras = ''.join([
        celda % ('', 'Clientes registrados', '142'),
        celda % ('; border-left: 1px solid var(--hair)', 'Recurrentes (2+ pedidos)', '38'),
        celda % ('; border-left: 1px solid var(--hair)', 'De los que piden, vuelven', '27%'),
        celda % ('; border-left: 1px solid var(--hair)', 'Total histórico', 'Q84,320'),
    ])
    inner = ('<div class="group" style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr))">%s</div>'
             '<div style="font-size: 12.5px; color: var(--ink3); line-height: 1.45; margin-top: 8px; padding: 0 16px">'
             'Quien vuelve gasta <span class="mono">Q168.00</span> por pedido; quien vino una sola vez, '
             '<span class="mono">Q112.00</span>.</div>' % cifras)
    return block('Resumen', inner)
