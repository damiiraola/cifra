# Cifra

Libro personal de gastos para Argentina. ARS, USD y USDT. Cotización en vivo, cajas, fijos, analítica e IA.

Cada usuario entra con Google o X y ve solo su libro.

## Stack

| Pieza | Qué es |
|---|---|
| App | TanStack Start + React 19 + Tailwind |
| Hosting | Vercel |
| Base de datos | **Postgres** — Neon en producción, PGLite en el preview |
| Auth | Better Auth (Google / X) |
| Cotizaciones | [DolarApi](https://dolarapi.com) |
| IA | xAI Grok |

## Base de datos

Hay dos modos. El código es el mismo (`getSql()`).

- **Preview / desarrollo local:** si no hay `DATABASE_URL`, corre **PGLite** (Postgres compilado a WASM). Los datos viven en memoria del proceso: se pierden al reiniciar el servidor.
- **Producción:** `DATABASE_URL` apunta a **Neon Postgres**. Ahí el libro queda persistente, por usuario, listo para un servidor externo.

Las tablas están en `migrations/` (`ledger_transactions`, `ledger_accounts`, `ledger_recurring`, auth, etc.). Se aplican solas al levantar o al hacer `npm run build`.

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
| `GROK_AUTH_ISSUER` / `GROK_AUTH_CLIENT_ID` / `GROK_AUTH_CLIENT_SECRET` | servidor | login Google / X |
| `XAI_API_KEY` | servidor | asistente IA |
| `VITE_AUTH_ENABLED` | build | `true` en producción |
| `RESEND_API_KEY` | servidor | mails (confirmar cuenta + olvidé clave) |
| `MAIL_FROM` | servidor | opcional. Default de prueba Resend hasta verificar dominio |

Sin `DATABASE_URL` la app igual arranca (PGLite). No uses ese modo para testers reales: el libro se borra al reiniciar.

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
- `GROK_AUTH_*`
- `XAI_API_KEY`
- `VITE_AUTH_ENABLED=true`

## Scripts

- `npm run dev` — desarrollo
- `npm run build` — build + migraciones
- `npm run typecheck`

## Licencia

Uso privado. Todos los derechos reservados.
