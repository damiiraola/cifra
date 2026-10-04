# Observabilidad (errores y mails)

## Qué hace la app
- **Servidor:** cualquier error inesperado en una función del servidor (las que usan login), los errores que Better Auth registra y **todo mail que no sale** se escriben en el log de Vercel (`[cifra] …`, sin direcciones de mail). Si está `SENTRY_DSN`, también se mandan a Sentry.
- **Navegador:** si se hizo el build con `VITE_SENTRY_DSN`, los errores sin atrapar y los que muestra la pantalla de error se mandan a Sentry (máximo 20 por página). Sin la variable no se manda nada.
- **Mails caídos:** cada envío deja registro en la tabla `app_status` (último OK / último error, sin datos de nadie). Si el último envío falló hace menos de 30 minutos, las pantallas "Revisá tu mail" y "Te mandamos el enlace" muestran: *"Ahora mismo no estamos pudiendo mandar mails…"*. No revela si un mail tiene cuenta.
- No se manda a Sentry: cookies, cuerpos de pedidos, montos, ni direcciones de mail (se reemplazan por `[mail]`). Sin SDK: es un `fetch` al endpoint de Sentry (`src/lib/observability.ts`).

## Lo que tiene que hacer Damián (una vez)
1. Crear una cuenta/proyecto en https://sentry.io (el plan gratis alcanza). Tipo de proyecto: "Browser JavaScript" (sirve para los dos lados).
2. Copiar el **DSN** (Settings → Client Keys). Tiene la forma `https://<clave>@o123456.ingest.us.sentry.io/789`.
3. En Vercel → proyecto `cifra-prpfe-ye` → Settings → Environment Variables, agregar en **Production** (y Preview si querés):
   - `SENTRY_DSN` = el DSN (servidor).
   - `VITE_SENTRY_DSN` = el mismo DSN (navegador; se lee en el build, así que hay que redeployar).
4. Redeploy. Para probar: mirar Sentry → Issues después de un error, o pedir un reset de clave en un preview sin `RESEND_API_KEY`.
5. (Opcional) En Sentry, crear una alerta por mail para issues nuevos con tag `where:mail`.

El DSN de Sentry es público por diseño (va en el navegador); igual no hace falta pegarlo en el repo.

Si usás un Sentry propio o GlitchTip con otro dominio, hay que sumarlo a `connect-src` de la CSP (`scripts/security-headers.mjs`, PR de seguridad).
