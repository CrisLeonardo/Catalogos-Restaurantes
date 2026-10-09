# -*- coding: utf-8 -*-
"""Genera Diagnostico.dc.html — portada: por qué y qué se decidió."""
import io, os
from build_docs import doc, write

os.chdir(os.path.dirname(os.path.abspath(__file__)))

MAPA = [
 ('Hoy', 'Lo que está pasando ahora y lo único que necesita tu atención'),
 ('Pedidos', 'Pedidos en vivo · Cocina · Mesas · Tomar pedidos · Repartidores · Historial'),
 ('Menú', 'Platillos · Categorías · Ingredientes · Inventario · Proveedores'),
 ('Clientes', 'Clientes · Lealtad · Cupones · Encuestas · Reservaciones · Lista de espera'),
 ('Negocio', 'Métricas · Analítica · Finanzas · Facturación · Canales · Respaldo'),
 ('Ajustes', 'Perfil · Horarios · Personal · Propinas · Personalizar · Funciones · La PC · QR · Suscripción · Ayuda'),
]

NUEVO = [
 ('Buscador en todo el panel',
  'Escribís «propina» y te lleva. Con 84 platillos y 30 pantallas, buscar es más rápido que recordar dónde estaba.'),
 ('Un solo lugar para los avisos',
  '«Necesita tu atención» junta prueba, PC caída, visitas y primeros pasos, ordenados por urgencia, y desaparece cuando no hay nada.'),
 ('Modo servicio',
  'Un interruptor pone Pedidos a pantalla completa para la tablet del mostrador. Es lo bueno de la idea C sin partir el panel en dos.'),
 ('Deshacer en vez de confirmar',
  'Las acciones se hacen y se pueden revertir unos segundos, en lugar de preguntar «¿estás seguro?» cada vez.'),
 ('Estados vacíos que enseñan',
  'Cada pantalla sin datos dice qué hacer y trae el botón para hacerlo.'),
]

def body():
    b = ('  <div style="display: flex; flex-direction: column; gap: 18px">\n'
         '    <div style="font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--acc-ink)">Panel de restaurante · Rediseño</div>\n'
         '    <div class="doc-h1" style="font-size: 46px; line-height: 1.04">Menos es más</div>\n'
         '    <div style="font-size: 17px; line-height: 1.5; color: var(--ink2); max-width: 620px">El panel no necesita más funciones: necesita menos puertas. Se eligió la dirección <strong style="font-weight: 600; color: var(--ink)">Claridad</strong> — claro y oscuro, la tipografía de siempre, y todo lo que ya hace el panel intacto.</div>\n'
         '  </div>\n')

    b += ('  <div style="display: flex; flex-direction: column; gap: 18px">\n'
          '    <div class="h2">Lo que había</div>\n'
          '    <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px">\n')
    for n, t in [('35', 'destinos en el menú lateral, en tres grupos'),
                 ('3', 'pantallas distintas para ver números'),
                 ('6', 'bloques podían competir en el inicio')]:
        b += ('      <div class="card" style="padding: 20px; display: flex; flex-direction: column; gap: 6px">\n'
              '        <div class="mono" style="font-size: 34px; color: var(--ink)">%s</div>\n'
              '        <div style="font-size: 13px; line-height: 1.4; color: var(--ink3)">%s</div>\n'
              '      </div>\n' % (n, t))
    b += ('    </div>\n'
          '    <div style="font-size: 13px; line-height: 1.5; color: var(--ink4)">Contado sobre el código, no sobre una impresión. Y un detalle chico: ninguna entrada del menú llevaba al Inicio — solo se llegaba tocando el logo.</div>\n'
          '  </div>\n')

    b += ('  <div style="display: flex; flex-direction: column; gap: 18px">\n'
          '    <div class="h2">Las tres reglas</div>\n'
          '    <div class="card" style="padding: 6px 24px">\n')
    reglas = [('Claridad', 'Cada pantalla dice una cosa. El texto se lee de un vistazo y el énfasis se gana: si todo resalta, nada resalta.'),
              ('Deferencia', 'La interfaz se aparta y deja mandar al contenido: los pedidos y el menú. Menos cajas, menos bordes, menos candados en medio del trabajo.'),
              ('Profundidad', 'Siempre se sabe dónde se está y cómo volver. Lo que se usa una vez al mes vive un nivel adentro.'),
              ('Y una más', 'Una sola acción principal por pantalla. Dos botones del mismo peso son una decisión que le estamos pasando al dueño.')]
    for i, (t, d) in enumerate(reglas):
        borde = '' if i == 0 else ' border-top: 1px solid var(--hair);'
        b += ('      <div style="display: flex; gap: 20px; align-items: flex-start; padding: 18px 0;%s">\n'
              '        <div style="width: 104px; flex-shrink: 0; font-size: 15px; font-weight: 600; color: var(--acc-ink)">%s</div>\n'
              '        <div style="font-size: 15px; line-height: 1.55; color: var(--ink2)">%s</div>\n'
              '      </div>\n' % (borde, t, d))
    b += '    </div>\n  </div>\n'

    b += ('  <div style="display: flex; flex-direction: column; gap: 18px">\n'
          '    <div class="h2">El mapa: 35 destinos → 6</div>\n'
          '    <div style="font-size: 14px; line-height: 1.55; color: var(--ink2)">No se borra ninguna pantalla. Se agrupan por la pregunta que se está haciendo el dueño, no por el módulo que las creó. Lo que antes era una entrada del menú ahora es una pestaña adentro.</div>\n'
          '    <div class="card">\n')
    for i, (nombre, dentro) in enumerate(MAPA):
        borde = '' if i == 0 else ' border-top: 1px solid var(--hair);'
        b += ('      <div style="display: flex; gap: 18px; align-items: baseline; padding: 15px 22px;%s">\n'
              '        <div style="width: 84px; flex-shrink: 0; font-size: 15px; font-weight: 600; color: var(--ink)">%s</div>\n'
              '        <div style="font-size: 13.5px; line-height: 1.45; color: var(--ink3)">%s</div>\n'
              '      </div>\n' % (borde, nombre, dentro))
    b += '    </div>\n  </div>\n'

    b += ('  <div style="display: flex; flex-direction: column; gap: 18px">\n'
          '    <div class="h2">Lo que se agrega</div>\n'
          '    <div style="font-size: 14px; line-height: 1.55; color: var(--ink2)">Cinco cosas que hoy no existen y que hacen falta para que la reducción funcione.</div>\n'
          '    <div class="card">\n')
    for i, (t, d) in enumerate(NUEVO):
        borde = '' if i == 0 else ' border-top: 1px solid var(--hair);'
        b += ('      <div style="padding: 16px 22px;%s">\n'
              '        <div style="font-size: 15px; font-weight: 600; color: var(--ink)">%s</div>\n'
              '        <div style="font-size: 13.5px; line-height: 1.5; color: var(--ink3); margin-top: 4px">%s</div>\n'
              '      </div>\n' % (borde, t, d))
    b += '    </div>\n  </div>\n'

    b += ('  <div style="border-top: 1px solid var(--hair); padding-top: 24px">\n'
          '    <div style="font-size: 14px; line-height: 1.6; color: var(--ink3)">Las pestañas de arriba llevan a las pantallas (claro y oscuro), al teléfono, y a las dos hojas que hacen falta para programarlo: <strong style="font-weight: 600; color: var(--ink2)">Las cosas pequeñas</strong> y <strong style="font-weight: 600; color: var(--ink2)">El sistema</strong>.</div>\n'
          '  </div>\n')
    return b

write('Diagnostico.dc.html', doc('light', 860, 1980, body()))
print('listo')
