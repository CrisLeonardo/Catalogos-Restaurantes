# Checklist: sesión de dueño/gerente resumible desde el aparato compartido

> Origen (2026-08-25): un mesero puede entrar como dueño/gerente en el
> dispositivo compartido del local si le da a "Continuar como {nombre}",
> sin PIN ni contraseña. Confirmado leyendo el código, no es una sospecha.
>
> Marca cada casilla al terminarla. Los "Dónde" ya traen archivo y línea de
> hoy — puede que se corran unas líneas según lo que se toque antes.

---

## 0. La causa, en una frase

`login-client.tsx` decide abrir en la grilla de PIN solo si **no** hay una
sesión de correo/Google viva (`openInPin = pinTrusted && !!restaurantId &&
!resume`). O sea: en el aparato del local, si el dueño o un gerente entró ahí
alguna vez y no cerró sesión, esa sesión de alto privilegio gana siempre sobre
la grilla de PIN, y "Continuar como {nombre}" queda ofrecido a quien sea que
use ese aparato después — sin límite de tiempo, porque esa sesión no expira
por inactividad como sí lo hace el PIN (30 min).

No es un fallo de `tenant-guard.ts` (eso decide *a qué restaurante*, está
bien). Es que nunca se aplicó al dueño/gerente la misma idea de "dispositivo
de confianza del local" que ya existe para el PIN (`trusted-device.ts`).

---

## 1. Arreglo principal — invertir la prioridad en dispositivo de confianza

- [x] **En un aparato marcado como del local (`pinTrusted === true`), nunca
      ofrecer "Continuar como {nombre}" para roles OWNER/MANAGER/SUPER_ADMIN.**
      La grilla de PIN gana siempre ahí, sin importar si hay sesión viva.
      Dónde: `src/app/login/login-client.tsx:49` (`openInPin`) — ahora es
      `openInPin = pinTrusted && !!restaurantId && !(resume &&
      resume.lowPrivilege)`. Cinturón y tirantes sobre el punto 2: el servidor
      ya no debería mandar un `resume` de rol alto en este caso, pero la UI no
      depende solo de eso.
      Hecho 2026-08-25.

- [x] **Que sea el servidor el que decide, no solo la UI.** `getResumeSession()`
      ya no devuelve una sesión resumible de rol alto si el aparato que pide
      el login es de confianza del local.
      Dónde: `src/lib/auth/resume.ts` — ahora recibe `{ restaurantId,
      pinTrusted }` y devuelve `null` cuando `pinTrusted && !lowPrivilege`.
      Los dos `page.tsx` (`src/app/login/page.tsx`,
      `src/app/admin/login/page.tsx`) se reordenaron: `getPinAccess()` se
      resuelve ANTES de `getResumeSession()`, porque este último ahora
      depende de ese resultado.
      Hecho 2026-08-25. Pendiente de verificación real con BD (ver §5).

- [x] **Distinguir el rol dentro de `ResumeSession`.** El tipo ahora es
      `{ name: string; url: string; lowPrivilege: boolean }` — `true` para
      RESTAURANT_STAFF/RESTAURANT_WAITER (ya conviven con el PIN, sin
      restricción nueva), `false` para cualquier otro rol (dueño, super
      admin — este proyecto no tiene un rol `MANAGER` separado hoy).
      Dónde: `src/lib/auth/resume.ts`.
      Hecho 2026-08-25.

---

## 2. Expiración por inactividad para sesión de dueño/gerente

- [x] **Poner un límite de inactividad a la sesión de correo/Google**, igual
      que ya tiene el PIN.
      Decisión de producto (2026-08-25): **30 minutos, parejo en cualquier
      aparato** — mismo umbral que el PIN, sin excepción para el aparato de
      confianza del local. Se descartó variar el umbral por dispositivo por
      simplicidad (un solo mecanismo que razonar y probar).
      Implementación: mismo patrón que `operator-session.ts`, pero en un
      módulo aparte (`src/lib/auth/session-activity.ts`) — mezclar las dos
      cookies habría hecho que "es sesión de operador" (que además cambia
      texto de UI, p. ej. "Cambiar de usuario" en `logout-button.tsx`)
      significara dos cosas distintas.
      - `src/lib/auth/session-activity.ts` — cookie `leogin_seen`,
        `isSessionStale()` (lectura pura), `writeSessionActivity()`.
      - `src/lib/actions/session-activity.ts` (`touchSessionActivity()`) +
        `src/components/admin/session-heartbeat.tsx` — renuevan la marca en
        cada clic/tecla/toque, montados SIEMPRE (a diferencia de
        `OperatorHeartbeat`, que solo corre en sesión de PIN).
      - La marca se escribe de una vez al CREAR la sesión (no solo al
        primer heartbeat), en los cuatro sitios donde nace una sesión de
        correo/Google: `login()` (`lib/actions/auth.ts`), el callback de
        Google (`admin/auth/google/callback/route.ts`), el enlace de
        verificar correo (`admin/auth/verificar/route.ts`) y
        `setNewPassword()` (`lib/actions/password-reset.ts`) — mismo cuidado
        que el PIN, que escribe su marca al validar, no espera al heartbeat.
      - El candado se revisa en los 5 layouts protegidos:
        `admin/(protected)`, `admin/(waiter)`, `admin/(kitchen)`,
        `super/layout.tsx` y `mi-cuenta/(panel)/layout.tsx` — estos dos
        últimos no tenían NINGÚN candado de inactividad antes, ni siquiera
        el del PIN (ahí nunca aterriza una sesión de operador).
      - Vencida, redirige a `/admin/logout-operator` (reusado: ya hacía
        signOut + limpiar cookie; ahora también borra `leogin_seen`).
      Alcance real: no quedó limitado a "dueño/gerente" — como no hay forma
      barata de excepcionar solo esos roles sin tocar cada layout con lógica
      de rol, el candado quedó parejo para CUALQUIER sesión de correo/Google
      (incluye super admin y staff que entra por correo en vez de PIN).
      **Verificado con el ciclo real 2026-08-25** (Docker levantado, Supabase
      local, cuenta `dueno@tacosdelnorte.test` con contraseña puesta a mano
      para la prueba): login por correo → esperar más que la ventana, sin
      tocar nada → la siguiente visita a una página protegida cierra la
      sesión de verdad (Supabase `signOut`, no solo la cookie) y vuelve al
      login limpio. Probado con la ventana bajada temporalmente a 15s (no 30
      min reales) para no esperar de verdad; revertido a 30 min después de
      confirmar.
      **Bug real encontrado y corregido durante la prueba:** el `maxAge` de
      la cookie `leogin_seen` estaba igualado a `SESSION_WINDOW_MS`. Eso
      hace que el navegador BORRE la cookie justo cuando toca detectarla
      como vencida — una cookie ausente se lee como "recién ingresó" (a
      propósito, para no trabar un login legítimo), así que el candado
      nunca llegaba a dispararse: la sesión vencida simplemente parecía
      "sin marca todavía" y pasaba. Con la prueba real esto se vio de
      inmediato (200 en vez del redirect esperado); sin probar el ciclo de
      verdad se habría quedado sin detectar. Arreglado: el `maxAge` de la
      cookie ahora es fijo en 24 h (limpieza de basura del navegador, no el
      mecanismo que cierra sesión) — la ventana de 30 min la sigue
      imponiendo `isSessionStale()` comparando el reloj de adentro.
      **Hallazgo relacionado — investigado y corregido 2026-08-25:**
      `operator-session.ts` (el mecanismo del PIN, ya en producción) tenía
      el mismo bug — `OPERATOR_COOKIE`'s `maxAge` = `OPERATOR_WINDOW_MS`
      (línea 59). Confirmado con el mismo método (ventana bajada a 15s,
      cuenta `staff-6c7f3dd5562f4d21b2e50ef1@staff.leogin.internal`
      "Mesero Test" del restaurante `azucar-negra`, ruta de depuración
      temporal que llamaba a `writeOperatorCookie` y leía
      `isOperatorSessionStale`): login por PIN (simulado) → esperar más
      que la ventana → la cookie SEGUÍA viva (a diferencia de antes del
      arreglo, donde habría desaparecido) y `isOperatorSessionStale` la
      marcó vencida correctamente → la siguiente visita al panel de mesero
      cerró la sesión de verdad y devolvió al login limpio.
      Antes de este arreglo, el cierre por inactividad de 30 min del PIN
      **nunca se había disparado de verdad en producción**: la cookie se
      autodestruía justo al cumplirse la ventana, así que
      `isOperatorSessionStale` siempre la encontraba ausente y la leía como
      "recién entró" en vez de "vencida". Mismo arreglo que
      `session-activity.ts`: `maxAge` fijo en 24 h (limpieza de basura del
      navegador, no el mecanismo que cierra sesión); `OPERATOR_WINDOW_MS`
      revertido a 30 min reales tras confirmar. `tsc`/`eslint` limpios,
      405 pruebas del proyecto en verde.
      Nota: este bug es de expiración de cookie en el navegador, no de la
      lógica pura de `isOperatorSessionStale` — por eso ni
      `resume-policy.test.ts` ni un futuro `operator-session.test.ts` lo
      habrían atrapado por sí solos; hacía falta la corrida real.

---

## 3. Salida explícita, visible, en el propio "Continuar como"

- [x] **Agregar "No soy yo / cerrar esta sesión" junto al botón de
      "Continuar como {nombre}"**, no solo el texto pequeño "o entra con otra
      cuenta" que ya existe debajo.
      Dónde: `src/app/login/login-client.tsx`, dentro de `{resume && (...)}` —
      reusa la server action `logout()` de `lib/actions/auth.ts` (mismo scope
      `local` que el botón de salir del panel), que redirige a `/admin/login`
      ya sin sesión.
      Hecho 2026-08-25.

---

## 4. Opcional — step-up para acciones sensibles (si se quiere mantener el atajo en todos lados)

- [ ] **Evaluar si, en vez de (o adicional a) los puntos 1-3, se prefiere
      dejar "Continuar como" disponible siempre pero pedir contraseña otra
      vez para acciones sensibles** (cobro, cambiar plan, borrar el
      restaurante, tocar al personal). Es más trabajo — cada acción sensible
      necesita su propio candado — y no resuelve que un mesero vea el panel
      completo del dueño, solo que no pueda ejecutar lo más grave. Dejar como
      decisión explícita de producto antes de construir, no como default.

---

## 5. Verificación antes de dar por cerrado

- [x] Simular el caso real: entrar como dueño en un aparato marcado de
      confianza del local (o marcarlo a mano en `restaurant_devices`), no
      cerrar sesión, abrir `/admin/login` de nuevo desde ese mismo aparato →
      debe abrir en la grilla de PIN, no ofrecer "Continuar como Dueño".
      **Verificado 2026-08-25** con datos reales: restaurante
      `tacos-del-norte-test` (`15fe3b20-262e-4404-80ae-4ea58d40ae0a`), cuenta
      `dueno@tacosdelnorte.test` (RESTAURANT_OWNER). Se leyó el id real del
      aparato (`leogin_device`, puesto por `getDeviceId()`), se insertó a
      mano en `restaurant_devices`, se hizo login por correo en
      `tacos-del-norte-test.localhost:3000` sin cerrar sesión, y al volver a
      `/admin/login` en ese mismo aparato apareció directo "¿Quién eres?"
      (grilla de PIN) — sin rastro de "Continuar como Dueño Tacos" en ningún
      lado de la página. Fila de prueba borrada de `restaurant_devices` al
      terminar.
- [x] Confirmar que en un aparato **no** marcado de confianza (el celular
      personal del dueño, por ejemplo) "Continuar como {nombre}" se sigue
      ofreciendo normal — el arreglo no debe romper el atajo donde sí tiene
      sentido.
      **Verificado 2026-08-25**, mismo aparato y misma sesión de arriba:
      se borró la cookie `leogin_device` (simula "es otro aparato, nunca
      autorizado") y al recargar `/admin/login` volvió a aparecer
      "Continuar como Dueño Tacos" con normalidad — junto con el botón
      nuevo del §3 ("No soy yo · cerrar esta sesión"), confirmando también
      esa pieza en el flujo real.
- [x] Confirmar que STAFF/WAITER con sesión por correo (el caso del §12d del
      plan de multicuenta, gerente con usuario propio) sigue pudiendo
      resumir su propia sesión en el aparato que sea — la restricción es
      solo por rol alto + aparato del local, no un candado general.
      Cubierto por una prueba automatizada
      (`shouldHideResume(true, 'RESTAURANT_STAFF')` → `false` en
      `resume-policy.test.ts`) **y verificado con datos reales 2026-08-25**:
      restaurante `azucar-negra`, cuenta
      `staff-6c7f3dd5562f4d21b2e50ef1@staff.leogin.internal` "Mesero Test"
      (RESTAURANT_STAFF, permisos `["mesero"]`, contraseña puesta a mano
      para la prueba). Mismo aparato marcado de confianza que en los dos
      bullets de arriba: login por correo sin cerrar sesión → al volver a
      `/admin/login` en ese mismo aparato apareció normal "Continuar como
      Mesero Test" — sin esconderse, a diferencia del caso del dueño.
      Nota aparte (no es un bug de este arreglo): en el camino se topó con
      la trampa ya conocida del proyecto — `.next` cacheado sirve rutas
      viejas y `/admin/mesero` daba 404 hasta borrar la carpeta `.next` y
      reiniciar el server.
- [x] Revisar `tenant-guard.test.ts` y sumar un caso de prueba para esta
      combinación (aparato de confianza + rol alto) si el archivo de tests
      es el lugar natural, o crear `resume.test.ts` si no existe.
      `tenant-guard.test.ts` prueba una decisión distinta (a qué
      *restaurante* se entra, no si se esconde "Continuar como"), así que no
      era el lugar — un caso ahí no habría probado nada de este arreglo.
      En su lugar, siguiendo el mismo patrón que `pin-policy.ts` /
      `trusted-device.ts` (decisión pura separada de la parte que habla con
      Supabase, para que se pueda probar de verdad): se extrajo
      `src/lib/auth/resume-policy.ts` (`shouldHideResume`,
      `isLowPrivilegeRole`) de `resume.ts`, y se creó
      `resume-policy.test.ts` con la matriz completa — confianza×rol,
      incluyendo el caso borde de rol ausente/desconocido (se esconde: el
      error prudente). `resume.ts` ahora llama a `shouldHideResume` en vez
      de repetir la regla a mano.
      12 casos nuevos, 405 pruebas totales del proyecto en verde
      (`npx vitest run`), `tsc`/`eslint` limpios.
- [x] Actualizar `PLAN_ACCESO_MULTICUENTA.md` §8 una vez cerrado esto: la
      nota actual ("mantener siempre visible Continuar como {nombre}") queda
      desactualizada — precisar que aplica solo fuera del aparato del local.
      Corrección agregada en `PLAN_ACCESO_MULTICUENTA.md` §8 (raíz del
      repo), fechada 2026-08-25, con enlace a este mismo checklist.

---

## Referencia — de dónde sale cada afirmación

- `src/app/login/login-client.tsx:42` — prioridad `openInPin` vs `resume`.
- `src/lib/auth/resume.ts` — `getResumeSession()`, no distingue rol ni
  dispositivo.
- `src/lib/auth/tenant-guard.ts` — confirmado que NO es la causa (decide
  restaurante, no identidad).
- `src/lib/auth/trusted-device.ts` — el mecanismo de "dispositivo de
  confianza" que ya existe para PIN y que este arreglo reutiliza.
- `PLAN_ACCESO_MULTICUENTA.md` §8 — de donde sale el "Continuar como" y su
  razonamiento original (pensado para dispositivo personal, no compartido).
