# Cifra

Libro personal de gastos para Argentina. ARS, USD y USDT. Cotización en vivo, cajas, tarjetas de crédito, fijos, analítica e IA.

Cada usuario entra con mail y contraseña (no hay login con Google, X ni Grok) y ve solo su libro. Dos libros: Personal y Negocio.

Para que otro agente se haga cargo, el mapa operativo está en [HANDOFF.md](HANDOFF.md).

## Stack

| Pieza | Qué es |
|---|---|
| App | TanStack Start + React 19 + Tailwind |
| Hosting | Vercel |
| Base de datos | **Postgres** — Neon en producción, PGLite en el preview |
| Auth | Better Auth (solo mail y contraseña) |
| Cotizaciones | [DolarApi](https://dolarapi.com) |
| IA | Vercel AI Gateway (plan gratis, Grok 4.1 Fast por defecto; respaldo opcional en Groq) |

## Base de datos

Hay dos modos. El código es el mismo (`getSql()`).

- **Preview / desarrollo local:** si no hay `DATABASE_URL`, corre **PGLite** (Postgres compilado a WASM). Los datos viven en memoria del proceso: se pierden al reiniciar el servidor.
- **Producción:** `DATABASE_URL` apunta a **Neon Postgres**. Ahí el libro queda persistente, por usuario, listo para un servidor externo.

Las tablas están en `migrations/` (`ledger_transactions`, `ledger_accounts`, `ledger_recurring`, `ledger_cards`, auth, etc.). Se aplican solas al levantar (PGLite local) o en el build de **producción** de Vercel (`npm run build`); los previews no migran. Ver `docs/deploy.md`.

## Dominio propio

Producción: **[https://cifra.lol](https://cifra.lol)**.

Vercel apunta el DNS. HTTPS lo emite Vercel. `www.cifra.lol` también está permitido.

Si el login falla después de colgar el dominio, `BETTER_AUTH_URL` tiene que ser exactamente `https://cifra.lol` (sin barra al final).

## Cómo levantar

```bash
npm install
npm run dev
```

Variables de entorno (no se commitean). En Vercel se cargan en Project → Settings → Environment Variables.

| Variable | Dónde | Para qué |
|---|---|---|
| `DATABASE_URL` | servidor | Neon Postgres (producción) |
| `BETTER_AUTH_URL` | servidor | URL pública: `https://cifra.lol` |
| `BETTER_AUTH_SECRET` | servidor | secreto de sesión |
| `AI_GATEWAY_API_KEY` | servidor | **opcional**. Asistente IA vía Vercel AI Gateway. En Vercel no hace falta: usa el token OIDC del proyecto |
| `AI_MODEL` | servidor | **opcional**. Modelo del Gateway (default `spacexai/grok-4.1-fast-non-reasoning`, del plan gratis) |
| `GROQ_API_KEY` / `GROQ_MODEL` | servidor | **opcional**. Respaldo en Groq si el Gateway falla (default `openai/gpt-oss-120b`) |
| `AI_DAILY_LIMIT` | servidor | **opcional**. Preguntas por usuario por día (default 30; `0` apaga el asistente) |
| `AI_GLOBAL_DAILY_USD` | servidor | **opcional**. Tope diario de IA de toda la app en USD (default 0.12, máximo 0.16 para no pasar el crédito gratis de US$ 5 cada 30 días; `0` apaga la IA). El gasto se ve en `/costos` (solo el dueño) |
| `VITE_AUTH_ENABLED` | build | `true` en producción |
| `RESEND_API_KEY` | servidor | mails (confirmar cuenta + olvidé clave) |
| `MAIL_FROM` | servidor | `Cifra <hola@cifra.lol>` cuando el dominio está verificado en Resend |
| `MAIL_DRILL_TOKEN` | servidor | **opcional**. Prende `/api/mail-drill` (ver abajo). Sin esta variable la ruta da 404 |
| `ALERT_MAILS_ENABLED` | servidor | **opcional**. `1` prende los avisos por mail (opt-in en Ajustes). Sin esto, no aparece la opción y `/api/cron/alertas` da 404 |
| `CRON_SECRET` | servidor | **opcional**, obligatorio para los avisos por mail. Vercel Cron lo manda como `Authorization: Bearer …` al llamar `/api/cron/alertas` (todos los días a las 9:00 de Argentina) |

Sin `DATABASE_URL` la app igual arranca (PGLite). No uses ese modo para testers reales: el libro se borra al reiniciar.

### Probar los mails (`/api/mail-drill`)

Manda las 5 plantillas de mail a `iraoladamian@gmail.com`. Está **apagado por defecto**: si `MAIL_DRILL_TOKEN` no existe, la ruta responde 404 y no manda nada.

Para usarlo:

1. Generá un valor largo y aleatorio (`openssl rand -hex 32`) y cargalo como `MAIL_DRILL_TOKEN` en Vercel (y redeployá).
2. Llamalo con `POST` y el token en el header:

   ```bash
   curl -X POST https://cifra.lol/api/mail-drill \
     -H "Authorization: Bearer $MAIL_DRILL_TOKEN"
   ```

Abrirlo en el navegador (GET) ya no manda nada: responde 405. Sin token o con uno incorrecto, 401. El token no se acepta en la URL (`?token=`) para que no quede en logs ni en el historial. Cuando termines, podés borrar la variable y la ruta vuelve a dar 404.

## Deploy (Vercel + Neon)

1. Repo en GitHub (este).
2. Proyecto en Vercel linkeado al repo.
3. Base Neon (gratis para empezar) → copiá el connection string a `DATABASE_URL`.
4. Completá las variables de auth e IA.
5. Push a `main` = deploy.

Cada usuario de la beta entra con su cuenta. Los datos no se mezclan.

## GitHub Actions

Dos workflows:

| Workflow | Cuándo | Qué hace |
|---|---|---|
| **CI** | todo push y PR a `main` | `typecheck` + tests |
| **Deploy** | lo mismo, si hay secretos | preview en PRs, producción en `main` |

El deploy usa la CLI de Vercel. Hasta que no existan los 3 secretos, ese workflow se saltea (el CI corre igual).

En el repo: **Settings → Secrets and variables → Actions** y creá:

| Secreto | Dónde se saca |
|---|---|
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | Vercel → Team → Settings → Team ID (o el ID de la cuenta Hobby) |
| `VERCEL_PROJECT_ID` | Vercel → Project → Settings → General → Project ID |

La primera vez hay que **importar** `damiiraola/cifra` en [vercel.com/new](https://vercel.com/new). Después cada push a `main` publica solo.

En Vercel, Environment Variables (Production + Preview):

- `DATABASE_URL`
- `BETTER_AUTH_URL` (`https://cifra.lol`)
- `BETTER_AUTH_SECRET`
- `VITE_AUTH_ENABLED=true`

## Scripts

- `npm run dev` — desarrollo
- `npm run build` — en producción (Vercel): typecheck + tests, build y migraciones. En previews: solo build (sin migrar). Ver `docs/deploy.md`.
- `npm run typecheck`

## Licencia

Uso privado. Todos los derechos reservados.
