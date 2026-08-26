# -*- coding: utf-8 -*-
"""Genera Diagnostico.dc.html y Comparar.dc.html."""
import os
from kit import CSS, HEAD, TAIL, svg, write

here = os.path.dirname(os.path.abspath(__file__))
os.chdir(here)


def doc(w, h, body, theme='light'):
    d = HEAD.replace('__CSS__', CSS)
    d += ('<div class="sc" data-t="%s" style="width: %dpx; min-height: %dpx; background: var(--bg); color: var(--ink); '
          'padding: 56px 52px 52px; display: flex; flex-direction: column; gap: 38px">\n' % (theme, w, h))
    d += body
    d += '</div>\n' + TAIL.replace('__W__', str(w)).replace('__H__', str(h))
    return d


def h1(txt, sub):
    return ('  <div>\n'
            '    <div class="doc-h1" style="font-size: 40px; line-height: 1.08; color: var(--ink)">%s</div>\n'
            '    <div style="font-size: 17px; line-height: 1.5; color: var(--ink3); margin-top: 14px; max-width: 640px">%s</div>\n'
            '  </div>\n' % (txt, sub))


def h2(txt):
    return '  <div class="h2" style="margin-bottom: -20px">%s</div>\n' % txt


def punto(n, titulo, cuerpo, donde=''):
    d = ('<div style="font-size: 12.5px; color: var(--ink4); margin-top: 8px; font-family: \'JetBrains Mono\', ui-monospace, monospace">%s</div>' % donde) if donde else ''
    return ('    <div style="display: flex; gap: 16px; padding: 18px 20px">\n'
            '      <div class="num">%s</div>\n'
            '      <div style="flex: 1; min-width: 0">\n'
            '        <div style="font-size: 16px; font-weight: 600; color: var(--ink); line-height: 1.35">%s</div>\n'
            '        <div class="body" style="margin-top: 6px">%s</div>%s\n'
            '      </div>\n'
            '    </div>\n' % (n, titulo, cuerpo, d))


def card(inner):
    parts = []
    for i, p in enumerate(inner):
        if i:
            parts.append('    <div class="hrf"></div>\n')
        parts.append(p)
    return '  <div class="card">\n%s  </div>\n' % ''.join(parts)


# ══════════════════════════════════════════════════════════════════
def diagnostico():
    b = h1('Lo que no encaja',
           'Tomar pedidos y mesas es lo que más se usa del sistema y es lo único que quedó fuera del '
           'rediseño. No es que esté mal hecho: está hecho con otro idioma. Esto es lo que encontré '
           'leyendo el código de hoy, no lo que me imagino.')
    b += h2('Diez cosas concretas')
    b += card([
        punto('01', 'Un asistente de tres pasos para la tarea que más se repite',
              'La primera pantalla dice «Paso 1 de 3 · Elige la mesa» en versalitas. Un mesero toma sesenta '
              'comandas por turno; no necesita que le numeren los pasos. Apple no le pone un asistente a '
              'marcar un número de teléfono.',
              'waiter-panel.tsx:1163'),
        punto('02', 'Es otra aplicación dentro de la aplicación',
              'Vive en su propio grupo de rutas, con su propio encabezado, su propio vidrio y sus propios '
              'pesos. El panel nuevo usa grupos con pelo de 1 px, superficie blanca y tinta 500/600; el '
              'mesero usa tarjetas de vidrio con blur, radios de 16 a 20 px y peso 800 en casi todo. '
              'Son dos productos.',
              'admin/(waiter)/ · waiter-panel.tsx'),
        punto('03', 'El color grita antes de decir algo',
              'Toda mesa ocupada se pinta ámbar, y pasado el umbral se pinta roja, con halo de color '
              'alrededor. Cinco mesas ocupadas son cinco alarmas encendidas. Y con todo eso encendido '
              'sigue sin decir lo único que el mesero necesita: quién lo necesita ahora.',
              'floor-map.tsx:69-108'),
        punto('04', 'Cinco bandas de aviso pueden apilarse antes de la primera mesa',
              'Borrador sin enviar, mesas abandonadas hace 24 h, mensaje de archivado, pedidos sin '
              'sincronizar y error de estado. Cada una con su color, su borde y su botón. Cuando todo '
              'es urgente, nada lo es.',
              'waiter-panel.tsx:1176-1245'),
        punto('05', 'Glifos donde hay iconos',
              'El signo ＋ de ancho completo, el ⚠ de las notas, el ● del temporizador de mesa y la flecha → '
              'del botón del carrito conviven con el juego de iconos SVG propio del sistema. Un glifo no '
              'escala, no se recolorea y se dibuja distinto en cada teléfono.',
              'waiter-panel.tsx · floor-map.tsx:112'),
        punto('06', 'Versalitas de tablero de control',
              '«ORDEN (3)», «NOMBRE / REFERENCIA (OPCIONAL)», «NOTAS ESPECIALES», a 11 px con espaciado '
              'entre letras. Eso es lenguaje de panel de analítica. El panel nuevo escribe los rótulos '
              'en frase normal, a 12.5 px, y deja que el grupo haga la separación.',
              'waiter-panel.tsx:1414 · 1456'),
        punto('07', 'Tres controles en una tarjeta de 12 px de acolchado',
              'La tarjeta del plato responde al toque, trae un botón «+ Agregar» adentro y, si ya hay uno '
              'agregado, cambia a un par −/+ más una insignia con la cantidad. Tres formas de hacer lo '
              'mismo en el espacio de un pulgar.',
              'waiter-panel.tsx:1587-1640'),
        punto('08', 'Dos carritos para un solo pedido',
              '«Ver pedido actual» despliega un mini-carrito con las líneas y sus −/+; «Revisar pedido» '
              'abre otra pantalla con las mismas líneas y los mismos −/+. La misma información editada '
              'en dos lugares distintos.',
              'waiter-panel.tsx:1657-1690'),
        punto('09', 'Tres verbos sin relación en la misma hoja',
              'Al tocar una mesa ocupada aparecen juntos «Agregar platos», «Ver cuenta / dividir» y '
              '«Marcar como libre» —este último en rojo— a un toque de distancia. Cerrar una mesa por '
              'error en hora pico es la peor cosa que le puede pasar a un turno.',
              'waiter-panel.tsx:1310-1345'),
        punto('10', '«Mesas» significa dos cosas distintas',
              'En el panel del dueño, Mesas es una pantalla de configuración: cantidad de mesas, códigos '
              'QR, plano del salón, propina. En el mesero, Mesas es el estado del salón. Y ninguna de las '
              'dos contesta la pregunta del dueño: qué está pasando en mi salón en este momento.',
              'mesas/page.tsx · tables-panel.tsx'),
    ])
    b += h2('Lo que sí está bien y las tres opciones conservan')
    b += card([
        punto('✓', 'El trabajo fino que ya está hecho',
              'El borrador que rescata la comanda a medias cuando alguien sale sin querer. La cola local '
              'con identificador idempotente y el respaldo contra el hub del local cuando no hay señal. '
              'La anulación con motivo y PIN. Dividir la cuenta. El plano del salón con zoom y niveles. '
              'El cronómetro por etapa. Nada de eso se toca: cambia dónde se toca, no qué hace.'),
    ])
    b += ('  <div style="font-size: 13.5px; color: var(--ink3); line-height: 1.55; max-width: 640px">'
          'Todo lo anterior sale de leer el código actual. Si algo de esto ya cambió y no me di cuenta, '
          'decímelo y lo corrijo antes de que elijamos dirección.</div>\n')
    return doc(880, 2120, b)


# ══════════════════════════════════════════════════════════════════
def opcion_card(letra, nombre, eje, gana, cuesta, cuando, esfuerzo):
    return ('  <div class="card" style="padding: 24px 26px; display: flex; flex-direction: column; gap: 16px">\n'
            '    <div style="display: flex; align-items: baseline; gap: 12px">\n'
            '      <div class="mono" style="font-size: 15px; color: var(--acc-ink)">%s</div>\n'
            '      <div style="flex: 1; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; color: var(--ink)">%s</div>\n'
            '      <div style="font-size: 13px; color: var(--ink3)">%s</div>\n'
            '    </div>\n'
            '    <div class="body" style="font-size: 15.5px">%s</div>\n'
            '    <div class="hrf"></div>\n'
            '    <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px">\n'
            '      <div><div class="h2" style="margin-bottom: 7px">Qué gana</div><div style="font-size: 14px; line-height: 1.5; color: var(--ink2)">%s</div></div>\n'
            '      <div><div class="h2" style="margin-bottom: 7px">Qué cuesta</div><div style="font-size: 14px; line-height: 1.5; color: var(--ink2)">%s</div></div>\n'
            '      <div><div class="h2" style="margin-bottom: 7px">Le queda a</div><div style="font-size: 14px; line-height: 1.5; color: var(--ink2)">%s</div></div>\n'
            '    </div>\n'
            '  </div>\n' % (letra, nombre, esfuerzo, eje, gana, cuesta, cuando))


def comparar():
    b = h1('Tres direcciones',
           'No son tres estilos del mismo dibujo: cada una decide algo distinto sobre cuál es el objeto '
           'principal de la pantalla. Esa decisión es la que hay que tomar; el resto se deriva sola.')

    b += opcion_card(
        'A', 'La sala', 'El objeto principal es la MESA. Un pedido no es un formulario que se llena: es '
        'algo que se le va agregando a una mesa que ya está abierta. Se abre la sala, se toca una mesa, '
        'se agregan platos, se cierra. No hay pasos porque no hay un principio ni un final que numerar.',
        'Es como piensa el mesero: en el salón, no en formularios. La mesa se convierte en el expediente '
        'completo —qué pidieron, en qué va cada plato, cuánto llevan, cuánto deben— y el estado del salón '
        'por fin se lee de un vistazo.',
        'Para llevar y domicilio quedan de segunda clase: viven en un grupo aparte porque no son mesas. '
        'Un local que hace más llevar que salón lo va a sentir raro.',
        'Restaurantes de mesa y mantel, donde el salón es el negocio.',
        'Esfuerzo medio')

    b += opcion_card(
        'B', 'La comanda', 'El objeto principal es el PEDIDO. Mesa, llevar y domicilio son un campo del '
        'mismo objeto. Nueva comanda abre UNA pantalla —destino, platos, nota— editable en su sitio, como '
        'redactar un correo. La sala es una pestaña, no la casa.',
        'Un solo camino para los tres tipos de pedido, y exactamente la misma lista, las mismas filas y '
        'los mismos estados que el dueño ya ve en Pedidos. Es la opción que menos idioma nuevo inventa y '
        'la que más código comparte con el panel.',
        'Se pierde la lectura espacial del salón. Con seis mesas encima hay que leer nombres en una lista '
        'en vez de mirar el mapa. Y agregar un plato a una mesa que ya comió sigue siendo «otra comanda».',
        'Locales mixtos: mucho llevar, mucho domicilio, salón mediano.',
        'Esfuerzo bajo')

    b += opcion_card(
        'C', 'Dos paneles', 'El objeto principal son LOS DOS a la vez. En tablet: sala a la izquierda, '
        'comanda de la mesa a la derecha, siempre visible. Buscar y agregar un plato no navega a ninguna '
        'parte. En teléfono se pliega y es exactamente la Opción A.',
        'Cero navegación en el momento de más presión. La comanda nunca desaparece, así que nunca hay que '
        'preguntarse qué llevás agregado. Es lo que hace un punto de venta serio, con el idioma del panel '
        'nuevo en vez del idioma de un TPV de los noventa.',
        'Solo brilla en tablet. En teléfono es la Opción A, así que en la práctica se mantienen dos '
        'disposiciones. Es la más cara de las tres y la que más tarda en salir.',
        'Locales que ya tienen tablet en el salón o en la barra.',
        'Esfuerzo alto')

    b += h2('Lo que las tres comparten')
    b += card([
        punto('1', 'Un solo idioma visual',
              'Grupos con pelo de 1 px, filas de 44 px mínimo, Geist 500/600, Unbounded solo en el título '
              'grande, JetBrains Mono con cifras tabulares en todo número. Los mismos tokens del panel, '
              'claro y oscuro. Se acaban los pesos 800 sueltos y las versalitas.'),
        punto('2', 'El color solo lo usa lo que te necesita',
              'Una mesa libre no dice nada. Una mesa con gente se ve en tinta normal, con una línea que '
              'dice qué está pasando. Solo se pinta de acento la que te necesita ahora: pidió la cuenta, '
              'o tiene un plato listo esperando desde hace rato. Tres pesos, no cinco colores.'),
        punto('3', 'Se acaban las bandas apiladas',
              'Como mucho una línea arriba de la lista. El borrador rescatado deja de ser una tarjeta con '
              'dos botones y pasa a ser una fila más. Las mesas abandonadas se archivan solas y se cuentan '
              'en Ajustes, no le gritan al mesero en hora pico.'),
        punto('4', 'Iconos SVG, nunca glifos',
              'Ni ＋ ni ⚠ ni ● ni →. El mismo juego de trazo de 1.8 px que usa el panel, en rejilla de '
              '17 y 14 px.'),
        punto('5', 'Liberar una mesa deja de estar junto a agregar platos',
              'Cerrar y cobrar es una cosa. Liberar sin cobrar es otra, vive al final, aparte, y queda '
              'anotado quién lo hizo — el PIN ya existe en el código de anulaciones.'),
        punto('6', '«Mesas» pasa a significar una sola cosa',
              'El estado del salón se vuelve una pestaña de Pedidos en el panel del dueño (como ya lo '
              'promete el rediseño) y la casa del mesero en su teléfono. La configuración —cantidad de '
              'mesas, códigos QR, plano, propina— se va a Ajustes → Salón, que es lo que siempre fue.'),
    ])

    b += h2('La decisión · 25 de agosto de 2026')
    b += ('  <div class="card" style="padding: 24px 26px; border-color: var(--acc); box-shadow: 0 0 0 1px var(--acc)">\n'
          '    <div style="display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px">\n'
          '      <div class="mono" style="font-size: 15px; color: var(--acc-ink)">C</div>\n'
          '      <div style="flex: 1; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; color: var(--ink)">Dos paneles</div>\n'
          '    </div>\n'
          '    <div class="body" style="font-size: 15.5px; max-width: 700px">Elegida, asumiendo que tarda más en construirse. '
          'Vale aclarar qué implica: <b style="color: var(--ink); font-weight: 600">C no descarta A</b> — en el teléfono, C '
          '<i>es</i> A, así que las pantallas de A se construyen igual; lo que se gana al ir directo a C es diseñarlas junto '
          'con la tablet desde el principio, en vez de rehacerlas después.<br><br>'
          'Y lo que se acepta al elegirla: <b style="color: var(--ink); font-weight: 600">C solo brilla si hay tablet en el '
          'salón o en la barra.</b> En un local que solo tiene teléfonos, C y A son exactamente lo mismo, y todo el trabajo '
          'de la columna doble queda esperando un aparato que no está. Eso no la hace mala elección: la hace una apuesta a '
          'que la tablet llega.</div>\n'
          '  </div>\n')
    b += ('  <div style="font-size: 13.5px; color: var(--ink3); line-height: 1.55; max-width: 660px">'
          'Las reglas, los seis estados de mesa y lo que hay que construir por debajo están en la página '
          '<b style="color: var(--ink2); font-weight: 600">Opción C a fondo</b>.</div>\n')
    return doc(880, 2060, b)


if __name__ == '__main__':
    write('Diagnostico.dc.html', diagnostico())
    write('Comparar.dc.html', comparar())
