# Login con Google para comensales (Lealtad v2)

El menú permite que el comensal **continúe con Google** para ver y canjear sus
puntos desde cualquier dispositivo. Es **opcional**: si no se configura, el botón
simplemente no aparece y todo sigue funcionando por teléfono (nadie pierde puntos).

El código ya está listo. Para activarlo hay 3 pasos: Google Cloud → Supabase → variable de entorno.

## 1. Google Cloud (cliente OAuth)

1. Entra a <https://console.cloud.google.com> → **APIs y servicios → Pantalla de consentimiento OAuth**.
   - Tipo: **Externo**. Llena nombre de la app, correo de soporte y logo (opcional).
   - En *Usuarios de prueba* agrega tu correo mientras esté en modo prueba, o **publica** la app.
2. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**.
3. En **URIs de redireccionamiento autorizados** agrega la URL de callback de Supabase:
   ```
   https://<TU-PROYECTO>.supabase.co/auth/v1/callback
   ```
   (La encuentras en Supabase → Authentication → Providers → Google.)
4. Copia el **Client ID** y el **Client Secret**.

## 2. Supabase (proveedor Google)

1. Supabase → **Authentication → Providers → Google** → activar.
2. Pega el **Client ID** y **Client Secret** del paso anterior. Guardar.
3. Supabase → **Authentication → URL Configuration → Redirect URLs**. Agrega las
   URLs a las que el comensal puede volver tras autenticar (un patrón por línea):
   ```
   https://leogin.online/auth/callback
   https://*.leogin.online/auth/callback
   ```
   El subdominio comodín cubre el menú de cada restaurante (`slug.leogin.online`).
   En desarrollo agrega también `http://localhost:3000/auth/callback`.

## 3. Variable de entorno

Activa el botón en la app (Render / `.env.local`):

```
NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1
```

Sin esta variable el botón no se muestra (el flujo por teléfono sigue intacto).

## Cómo funciona

- La sesión se comparte entre subdominios con cookie de dominio `.leogin.online`
  (igual que el panel admin), así que el saldo se ve en cualquier sucursal.
- Los puntos se llevan **por teléfono**. Google solo **enlaza** la cuenta al
  cliente (1:1 por restaurante) cuando el comensal hace un pedido con su número,
  o cuando usa "Enlazar este número a mi cuenta" en la sección de Recompensas.
- El callback `/auth/callback` intercambia el código por la sesión y regresa al
  menú. Si algo falla, vuelve con `?auth_error=1` sin romper la página.

## Nota sobre sesiones

Un navegador mantiene **una** sesión de Supabase por dominio. Si el dueño del
restaurante inicia sesión como comensal con Google y luego entra al panel admin
(o viceversa) en el mismo navegador, la última sesión gana. No es un problema de
seguridad (el comensal no tiene perfil de admin), solo a tener en cuenta al probar.
