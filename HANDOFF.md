# Cifra — traspaso para otro agente

Leé esto antes de tocar código. Producción: https://cifra.lol. Repo: https://github.com/damiiraola/cifra (`main`). Dueño: Damian Iraola.

No hay secretos en el repo. Viven en Vercel → Settings → Environment Variables (Production y Preview). No los pidas por chat ni los commitees.

## Qué es

Libro de gastos para Argentina. Dos libros por usuario, separados: **Personal** y **Negocio**. Monedas ARS, USD y USDT. Cotización en vivo (DolarApi, días hábiles, cada 10 min). Cajas, gastos fijos, presupuestos por categoría, diario, analítica, asistente.

El libro de Negocio no hereda categorías, topes ni analítica del personal. Los presupuestos se guardan solos; el gastado del mes es el tope por defecto.

## Stack que no se negocia

| Pieza | Dónde |
|---|---|
| UI | TanStack Start + React 19 + Tailwind 4. Rutas en `src/routes/`. |
| Estado local | Zustand, `src/lib/store.ts`, vault v2 |
| DB | Neon Postgres en prod. PGLite solo si no hay `DATABASE_URL` (se pierde al reiniciar). |
| SQL | `src/lib/db.ts`. Migraciones en `migrations/0001`–`0008`. `npm run db:migrate` corre en el build. |
| Auth | Better Auth. Solo mail + contraseña (`src/lib/auth/email-password.ts`). Sin Google, X ni Grok/OAuth genérico. |
| Mail | Resend. Plantillas en `src/lib/mail.ts`. Remitente `Cifra <hola@cifra.lol>`. |
| IA | Vercel AI Gateway (OIDC o `AI_GATEWAY_API_KEY`), `src/lib/ai.ts` + `src/lib/ai-provider.ts` |
| Cotizaciones | `src/lib/fx-api.ts`, `src/lib/market-hours.ts` |
| Host | Vercel. Push a `main` despliega. Dominio `cifra.lol` y `www.cifra.lol`. |

`@tanstack/react-start` tiene que quedar en **>= 1.168.60**. Vercel rechaza el deploy por CVE-2026-102989 si baja de eso.

## Variables

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Neon |
| `BETTER_AUTH_URL` | Exacto `https://cifra.lol`, sin barra final |
| `BETTER_AUTH_SECRET` | Sesión |
| `VITE_AUTH_ENABLED` | `true` en el build de producción |
| `RESEND_API_KEY` | Empieza con `re_`. Sin comillas. |
| `MAIL_FROM` | `Cifra <hola@cifra.lol>` |
| `MAIL_DRILL_TOKEN` | Opcional. Prende `/api/mail-drill`. Sin ella, la ruta da 404 |
| `AI_GATEWAY_API_KEY` | Asistente (opcional en Vercel: usa OIDC) |

DNS de Resend ya está en `send.cifra.lol` (SPF, DKIM). Falta DMARC; no bloquea el envío.

## Mapa

- Diario y Analítica son las pantallas principales: `src/routes/_app/index.tsx`, `analitica.tsx`.
- Movimientos, fijos, presupuestos, ajustes, IA: el resto de `src/routes/_app/`.
- Shell y tabs: `src/components/app-shell.tsx`. En el teléfono, Fijos / Presupuestos / Ajustes entran por el sheet, no solo por la tab bar.
- Alta rápida: `src/components/quick-add.tsx`.
- Libros: `src/lib/books.ts`, `src/components/book-mode.tsx`. Entrar a Negocio tiene transición propia.
- Presupuestos por libro: migración `0008_book_budgets.sql`, `src/lib/budget-math.ts`.
- Escrituras: primero local, después Neon. Si Neon falla, el movimiento queda en la outbox (`src/lib/outbox.ts`, `outbox-flusher.tsx`) y se reintenta. No mostrar un gasto que después desaparece al recargar.
- Borrar cuenta: `deleteAccount` en `src/lib/ledger-api.ts`. Manda el mail y después borra.
- Privacidad: `src/routes/privacidad.tsx`.
- iOS no debe hacer zoom al enfocar un campo: inputs y selects en 16px (`src/styles.css`, `src/components/ui/input.tsx`).
- Ícono de inicio: `public/icon-192.png`, `public/icon-512.png`, `public/__grok/icon-180.png`. El nombre en `cifra.lol` sale de `appNameFromHost` en `scripts/grok-pwa-shared.mjs`. No lo vuelvas a “Grok App”.
- Mails: fondo `#09090B`, tarjeta `#121214`, wordmark Instrument Serif + barras, etiqueta con acento por mail, botón pastilla, versión texto. `MAIL` + `renderMailHtml` / `renderMailText` en `src/lib/mail.ts`. Todo en tablas con estilos inline y `bgcolor` en cada celda (si no, Apple Mail lo invierte); `color-scheme: dark`. Íconos: PNG en `public/mail/` servidos siempre desde `https://cifra.lol` (Gmail no muestra SVG).
- Referencia visual de los mails (no es el HTML que se envía): diseño Canva `DAHW-z99ex4` (rediseño oct 2026). El anterior era `DAHW-pSiQxA`.

## Auth, en corto

1. Crear cuenta con mail y clave (mínimo 8).
2. Si Resend está configurado, hay que confirmar el mail.
3. Bienvenida al confirmar. Reset en `/olvide` → `/reset`. Aviso al cambiar la clave. Aviso al borrar la cuenta.
4. `trustedOrigins` incluye `https://cifra.lol` y `https://www.cifra.lol` (`src/lib/auth/server.ts`).

## Comandos

```bash
npm install
npm run dev      # http://127.0.0.1:8080
npm test
npm run typecheck
npm run build
```

## Qué no hacer

- No bajar TanStack Start de 1.168.60.
- No mezclar datos de Personal y Negocio.
- No volver a abrir `/api/mail-drill`. Manda los 5 mails a `iraoladamian@gmail.com`, así que está apagado salvo que exista `MAIL_DRILL_TOKEN`, y solo manda con `POST` + `Authorization: Bearer <token>` (GET da 405, token mal o ausente da 401). Lógica y tests en `src/lib/mail-drill.ts`; uso en el README.
- No commitear `.env`.
- No reintroducir el login en inglés ni esconder Fijos en el teléfono.
- `/beta` y `/lanzar` no son para el usuario final.

## Estado al 2026-10-03

Prod responde en cifra.lol. Neon persiste. Resend envía. El deploy de Vercel pasa. `mail-drill` quedó protegido (apagado sin `MAIL_DRILL_TOKEN`). Falta para una beta abierta: DMARC. Login: se decidió solo mail y contraseña (sin Google, X ni Grok).
