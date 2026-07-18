# Guía: pasar el DNS de leogin.online (Porkbun) a Cloudflare

> Objetivo: que Cloudflare administre el DNS del dominio (GRATIS) para que la
> plataforma pueda crear subdominios y certificados automáticos para los hubs
> (`xxxx.hub.leogin.online` → HTTPS del agente local). El dominio SIGUE
> comprado en Porkbun — esto NO es una transferencia de registrador, solo un
> cambio de nameservers. Complementa la Parte 4 de GUIA_DESPLIEGUE.md.
>
> Fecha: 2026-07-07. Tiempo estimado: 15–20 min de trabajo + espera de
> propagación (minutos a horas).

---

## Paso 1 — Crear la cuenta de Cloudflare

1. Entra a https://dash.cloudflare.com/sign-up
2. Crea la cuenta con tu correo y verifica el email.
3. No pide tarjeta. Todo lo de esta guía es del plan **Free**.

## Paso 2 — Agregar el dominio

1. En el dashboard: **Add a site** (o "Agregar un sitio").
2. Escribe `leogin.online` → **Continue**.
3. Elige el plan **Free** (hasta abajo) → **Continue**.
4. Cloudflare escanea y copia tus registros DNS actuales de Porkbun.

## Paso 3 — Revisar los registros copiados (EL PASO CRÍTICO)

Abre en otra pestaña Porkbun → tu dominio → **DNS Records**, y compara contra
lo que Cloudflare importó. Deben existir en Cloudflare al menos:

| Tipo | Nombre | Contenido | Proxy |
|------|--------|-----------|-------|
| CNAME | `leogin.online` (o `@`) | tu servicio de Render (`xxxx.onrender.com`) | **DNS only (nube gris)** |
| CNAME | `www` | el mismo | **DNS only (nube gris)** |
| CNAME | `*` | el mismo | **DNS only (nube gris)** |

⚠️ **El comodín `*` casi nunca lo detecta el escáner de Cloudflare** — es el
registro que hace funcionar `turestaurante.leogin.online`. Si no aparece,
agrégalo a mano: **Add record** → Type `CNAME` → Name `*` → Target tu
`xxxx.onrender.com` → y clic en la nubecita naranja para dejarla **gris (DNS
only)**.

⚠️ Si en Porkbun tienes registros de **correo** (MX, TXT/SPF) u otros, cópialos
también tal cual. Lo que no esté en Cloudflare **deja de existir** cuando
cambies los nameservers.

> ¿Por qué nube gris y no naranja? Con gris, Cloudflare solo hace de DNS y todo
> sigue funcionando EXACTAMENTE igual que hoy (Render sigue dando el candado).
> La nube naranja (CDN/protección de Cloudflare) es una optimización que se
> puede activar después con calma — un cambio a la vez.

## Paso 4 — Cambiar los nameservers en Porkbun

1. Al terminar el paso 3, Cloudflare te muestra **2 nameservers** propios
   (ej. `anna.ns.cloudflare.com` y `bob.ns.cloudflare.com`).
2. En Porkbun: **Domain Management** → tu dominio → opción **NS /
   Nameservers** (en "Details" → *Authoritative Nameservers* → **Edit**).
3. Borra los nameservers de Porkbun (`*.porkbun.com`, suelen ser 4) y pega los
   **2** de Cloudflare. Guarda.
4. **NO** uses la sección "Transfer" de Porkbun — eso es otra cosa (mover el
   registrador) y no se necesita.
5. Espera el correo de Cloudflare **"leogin.online is now active"** (típico:
   minutos a un par de horas; máximo teórico 24–48 h). El sitio sigue
   funcionando durante la espera.

## Paso 5 — Verificar que todo sigue vivo

Cuando llegue el correo de "active":

- [ ] `https://leogin.online` abre la portada.
- [ ] `https://<un-restaurante>.leogin.online` abre su menú (esto prueba el `*`).
- [ ] `https://<un-restaurante>.leogin.online/admin` deja iniciar sesión.
- [ ] Si algo no abre: Cloudflare → **DNS** → revisa que el registro exista y
      esté en **DNS only** (gris).

## Paso 6 — Ajuste de SSL (1 clic, preventivo)

Cloudflare → tu dominio → **SSL/TLS** → **Overview** → modo **Full (strict)**.
(Con la nube gris no cambia nada hoy; evita problemas si algún día activas la
naranja.)

## Paso 7 — Crear el token de API (el permiso que usa la plataforma)

1. Ícono de tu perfil (arriba derecha) → **My Profile** → **API Tokens** →
   **Create Token**.
2. Plantilla **"Edit zone DNS"** → **Use template**.
3. En *Zone Resources*: `Include` → `Specific zone` → `leogin.online`.
4. **Continue to summary** → **Create Token**.
5. **Cópialo ya** — solo se muestra una vez. Este token únicamente puede
   editar el DNS de leogin.online (nada de facturación ni cuenta) y se puede
   revocar cuando quieras desde esa misma pantalla.

## Paso 8 — Guardar el token en Render

Render → tu servicio → **Environment** → **Add Environment Variable**:

```
CLOUDFLARE_API_TOKEN = (el token del paso 7)
```

Guarda (Render redespliega solo). No compartas el token en chats ni archivos
del repo.

## Paso 9 — Avisar para continuar

Con los pasos 1–8 hechos, avisa en la sesión de desarrollo: se implementa
entonces el HTTPS del hub (subdominio automático por agente
`xxxx.hub.leogin.online`, certificados Let's Encrypt emitidos y renovados
solos, y `hub_url` en https) — ver ARQUITECTURA_OFFLINE.md §8.1.

---

## Preguntas rápidas

- **¿Esto cuesta algo?** No. Cloudflare Free es gratis permanente y el dominio
  se sigue pagando en Porkbun como siempre.
- **¿Se cae el sitio durante el cambio?** No, si el paso 3 se hizo bien: los
  registros idénticos hacen que el cambio sea invisible.
- **¿Y la transferencia de registrador a Cloudflare?** Opcional y sin prisa.
  Si algún día quieres, requiere primero tener el DNS activo en Cloudflare
  (esta guía) y luego Domain Registration → Transfer. No aporta nada técnico
  al plan; solo cambia dónde renuevas el dominio.
