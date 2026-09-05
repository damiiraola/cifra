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

Sí. Cifra puede vivir en `cifra.com.ar`, `app.tudominio.com` o lo que compres.

Flujo:

1. Comprás el dominio (nic.ar para `.com.ar` / `.ar`, o Vercel/Namecheap para `.app` / `.com`).
2. Lo conectás al proyecto en Vercel → Domains.
3. DNS: registro `A` / `CNAME` como te indica Vercel. HTTPS sale solo.

`cifra.app` ya está tomado. Un `.com.ar` o un subdominio (`app.fixa.com.ar`) es la vía más limpia.

## Cómo levantar

```bash
npm install
npm run dev
```

Variables de entorno (no se commitean). En Vercel se cargan en Project → Settings → Environment Variables.

| Variable | Dónde | Para qué |
|---|---|---|
| `DATABASE_URL` | servidor | Neon Postgres (producción) |
| `BETTER_AUTH_URL` | servidor | URL pública, ej. `https://cifra.com.ar` |
| `BETTER_AUTH_SECRET` | servidor | secreto de sesión |
| `GROK_AUTH_ISSUER` / `GROK_AUTH_CLIENT_ID` / `GROK_AUTH_CLIENT_SECRET` | servidor | login Google / X |
| `XAI_API_KEY` | servidor | asistente IA |
| `VITE_AUTH_ENABLED` | build | `true` en producción |

Sin `DATABASE_URL` la app igual arranca (PGLite). No uses ese modo para testers reales: el libro se borra al reiniciar.

## Deploy (Vercel + Neon)

1. Repo en GitHub (este).
2. Proyecto en Vercel linkeado al repo.
3. Base Neon (gratis para empezar) → copiá el connection string a `DATABASE_URL`.
4. Completá las variables de auth e IA.
5. Push a `main` = deploy.

Cada usuario de la beta entra con su cuenta. Los datos no se mezclan.

## Scripts

- `npm run dev` — desarrollo
- `npm run build` — build + migraciones
- `npm run typecheck`

## Licencia

Uso privado. Todos los derechos reservados.
