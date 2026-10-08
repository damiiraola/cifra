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
| SQL | `src/lib/db.ts`. Migraciones en `migrations/0001`–`0015`. `npm run db:migrate` corre en el build. El pool de Neon (app y Better Auth) sale de `src/lib/pg-pool.ts`: idle 5 s, `attachDatabasePool` en Vercel, ping a conexiones que quedaron quietas y un reintento solo si la conexión se cortó (`pg-retry.ts`). |
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
| `ALERT_MAILS_ENABLED` | Opcional. `1` prende los avisos por mail. Hoy **no está** en prod: apagado |
| `CRON_SECRET` | Opcional (hace falta con la anterior). Secreto del cron diario `/api/cron/alertas`. Hoy **no está** en prod |
| `AI_GATEWAY_API_KEY` | Asistente (opcional en Vercel: usa OIDC) |

DNS de Resend ya está en `send.cifra.lol` (SPF, DKIM). Falta DMARC; no bloquea el envío.

## Mapa

- Diario y Analítica son las pantallas principales: `src/routes/_app/index.tsx`, `analitica.tsx`.
- Movimientos, fijos, presupuestos, ajustes, IA: el resto de `src/routes/_app/`.
- Shell y tabs: `src/components/app-shell.tsx`. En el teléfono, Fijos / Presupuestos / Ajustes entran por el sheet, no solo por la tab bar.
- Alta rápida: `src/components/quick-add.tsx`.
- Libros: `src/lib/books.ts`, `src/components/book-mode.tsx`. Entrar a Negocio tiene transición propia.
- Presupuestos por libro: migración `0008_book_budgets.sql`, `src/lib/budget-math.ts`.
- Tarjetas de crédito (fase 1): migración `0011_cards.sql` (`ledger_cards` + `card_period` en movimientos). Una tarjeta = fila en `ledger_cards` + dos cajas `kind = 'card'` (ARS y "<nombre> USD"). Su saldo negativo es lo que se debe; no suma a la plata. Cálculo puro en `src/lib/card-math.ts` (resumen = mes del cierre; comprar el día del cierre entra en ese resumen). Crédito va a la tarjeta (`inferAccount`), sin tarjeta cae al banco como antes. Alta en Ajustes → Tarjetas (`src/components/card-settings.tsx`), guardado con reintento (`saveCards`, `pendingCardIds`). Pagar el resumen = Cambio del banco a la tarjeta. Diseño completo: `cifra-design/tarjetas-y-asesor.md`.
- Cuotas y pantalla Tarjetas (fase 2): migración `0012_card_purchases.sql` (`ledger_card_purchases` + `purchase_id`, `installment_no`, `installment_count` en movimientos). Una compra en cuotas = fila en `ledger_card_purchases` + un movimiento por cuota (`cuo_<compra>_<k>`), derivados con `deriveInstallments` en `card-math.ts`: la primera cuota lleva la fecha de compra, las demás el 1 de cada mes siguiente, y cada una va un resumen después (`card_period` fijo). Sin interés: total / N con el redondeo en la última. "Ya la venía pagando" carga desde la cuota actual. Se editan solo desde la compra (`savePurchase` rehace las cuotas y borra las que sobran; `removePurchase` borra todo). Presupuestos y Analítica cuentan una cuota por mes (la proyección no extrapola cuotas ni fijos). `/tarjetas` (`src/routes/_app/tarjetas.tsx`, form en `src/components/purchase-form.tsx`): resumen cerrado y abierto, próximos 6 resúmenes (`upcomingStatements`, suma fijos con la tarjeta sin anotar), deuda total, uso del límite y lista de compras en cuotas. Presupuestos deja ir 12 meses adelante y muestra lo ya comprometido (`committedForMonth`).
- Importar resumen PDF (fase 3, beta): `src/components/statement-import.tsx` (en `/tarjetas`) → server fn `readStatementPdf` (`src/lib/statement-api.ts`). El PDF llega en base64 (máx. 3 MB), se lee en memoria con `unpdf` (`src/lib/statement-pdf.ts`) y no se guarda ni se loguea. `src/lib/statement-import.ts` (puro, con tests) arma las líneas, marca la columna de dólares con "U$S", deja solo líneas con montos o palabras de resumen y tapa nombre (del PDF y de la cuenta), CUIT, DNI, mail y número de tarjeta; después valida la respuesta del modelo (esquema JSON estricto), chequea que las líneas den el total del banco (±1 %), que cada monto esté impreso en el PDF, y cruza con lo cargado (misma cuota k/N, o fecha ±3 días y monto ±1 %). Nada entra sin que el usuario lo apruebe. Cuotas nuevas = compra "ya venía" desde esa cuota. Guarda el resumen en `ledger_card_statements` (migración `0015_card_statements.sql`: cierre/vencimiento reales, próximos, totales, mínimo, cargos); `periodForCard` / `closingOf` / `dueOf` en `card-math.ts` usan esas fechas. Cuenta 6 unidades del tope diario y máximo 3 por día (`ai_usage.pdf_count`, `takePdfQuota` en `src/lib/ai-call.ts`); si el modelo falla se devuelven. PDFs sintéticos de prueba en `test-fixtures/statements/` (generador `scripts/fixtures/make_statements.py`). Para probar local sin IA real: `AI_DEV_MOCK_URL` (ignorada en producción y en Vercel).
- Asistente con herramientas (fase 6): `/ia` → server fn `askAssistant` (`src/lib/assistant/ask.ts`). El servidor lee el libro con `readLedger` (user id de la sesión) y le suma hasta 20 movimientos de la outbox que manda el teléfono, solo en memoria (`context.ts`). **La app calcula, el modelo explica**: las 8 herramientas de `tools.ts` (resumen_mes, tendencia_categoria, tarjetas, proximos, metas, plan_mes, simular, plan_deuda) usan `src/lib/plan/`, tarjetas y metas, y devuelven cada número como un id (`f3`) con su valor formateado. El modelo contesta con la herramienta `responder` (forzada) y escribe `{f3}`; `answer.ts` reemplaza los ids y rechaza cualquier otro número, `$`, `%` o número en palabras que el usuario no escribió. Si falla, se muestra la plantilla de Cifra con los números de las herramientas y no se reintenta. Chips (`CHIPS` en `run.ts`): Cifra corre las herramientas y llama al modelo una vez. Texto libre: una ronda de hasta 3 herramientas y la respuesta (máximo 2 llamadas). Sin modelo o sin cupo, los chips igual contestan con la plantilla. Las propuestas (aplicar topes, cambiar una meta, cargar la compra o el gasto simulado) las arma la app y se aplican solo con un botón (`assistant-proposals.tsx`). Cuenta contra `AI_DAILY_LIMIT` (pregunta = 1, informe = 2). El modo "parse" (texto → movimiento) sigue en `askCifra`. Tests con un modelo falso en `src/lib/assistant/assistant.test.ts`.
- Pagar el resumen y USD (fase 4): `src/lib/card-pay.ts` (puro, con tests en `card-pay.test.ts`) y `src/components/pay-statement.tsx` (botón "Pagar" en `/tarjetas`). Sin migración nueva. `statementBalance` lee cada resumen como el banco: saldo al cierre P = deuda inicial + consumos de resúmenes ≤ P − pagos hasta el cierre P; lo que no se paga entra solo al siguiente como saldo financiado (`carriedArs/Usd`). "Pagos" = Cambios hacia una caja de la tarjeta (o desde ella, en negativo); el pago guarda en `card_period` el resumen que pagó (`cardPeriodFor` lo conserva solo en Cambios hacia una tarjeta). Si el resumen se importó, el total y el mínimo del banco ganan. Pesos: Cambio caja ARS → caja ARS de la tarjeta. Dólares con dólares propios: Cambio caja USD → caja USD, sin percepción. Dólares en pesos: Cambio caja ARS → caja USD (`amountTo` en USD, cotización oficial editable) + gasto en Impuestos por la percepción (`usdPerceptionPct` de la tarjeta) con la nota "percepción, recuperable solo si presentás Ganancias/Bienes Personales". Categoría nueva `intereses` ("Intereses y comisiones"); el importador manda ahí intereses, IVA sobre intereses y comisiones (`chargeCategory`). Conciliación: si el banco dice más que Cifra, botón para cargar la diferencia como cargo del banco (`gapCharge`). TNA opcional en la tarjeta (`ledger_cards.tna`, ya existía desde 0011) → interés estimado. Ajustes → Tarjetas: "Pasar N gastos con Crédito a esta tarjeta" (`planCreditMove` + `src/components/credit-move.tsx`), con opción de registrar como pagados los resúmenes ya vencidos para que los saldos no cambien.
- Planificador sin IA (fase 5, primera parte): `src/lib/plan/` (puro, tests en `plan.test.ts`). `cashflow.ts`: "Sale de tus cajas" (`cashOut`/`cashOutTxs`: gastos desde cajas que no son tarjeta + pagos de resumen; comprar con crédito no saca plata hasta pagar), `cardBills` (último resumen cerrado con lo que falta pagar —si venció cae en el mes actual— y los que vienen: cargado + cuotas + fijos en la tarjeta, vía `upcomingStatements`), `history` (mediana de hasta 3 meses completos desde el primer movimiento: día a día con cajas, día a día con crédito, ingresos que no son fijos, por categoría), `projectCashflow` (≤12 meses: entra fijos + mediana; sale fijos fuera de tarjetas + resúmenes que vencen ese mes + día a día; lo que se gasta con crédito se paga el mes siguiente; sin inflación) y `monthlySurplus`. `goal-plan.ts`: `goalPlan` reparte el sobrante entre las metas que ya existen (`ledger_settings.goals`, lib/goals.ts): primero las que tienen fecha (lo que necesitan o su parte), el resto a las sin fecha; fecha realista y aviso de dólares si son más de 6 meses en pesos. `alerts.ts`: avisos por reglas (cierre ≤3 días, vence ≤5 días con lo que falta en la caja de pago, vencido con interés estimado, pagaste el mínimo, USD con dólares propios sin percepción, límite ≥80 %, cuotas que arrancan/terminan, categoría ≥80 % antes del 20 o pasada, ritmo del mes sobre el tope, meta atrasada). UI: `PlanAlerts` arriba del Diario (2, ocultables por período en localStorage `cifra-avisos-ocultos:v1`) y todos en `/metas#avisos`; `PlanMonths` en `/metas#plan`; línea de plan en cada meta; "Sale de tus cajas" en Analítica. Sin migración.
- Planificador, segunda parte: las metas tienen `priority` (1 alta, 2 media, 3 baja; dentro del mismo jsonb `ledger_settings.goals`, `parsePriority` da 2 por defecto, sin migración). `goalPlan` reparte por prioridad: primero las metas con fecha de prioridad alta, después media, después baja; lo que queda va a las sin fecha con peso 3/2/1. `plan/budgets.ts`: `committedByCategory` (fijos del libro —el monto cargado si ya está— y cuotas del mes) y `suggestBudgets` (tope = comprometido + mediana del día a día, con recorte proporcional a `MAX_CUT` por categoría —ocio 35 %, compras 30 %, otros/suscripciones 25 %, transporte/alimentos/educación 10 %, fijos 0, categorías propias 15 %— cuando hace falta; redondeo a $1.000/$100 hacia abajo si hay recorte). `plan/month-plan.ts`: `monthPlan` (un mes normal = promedio de los próximos 3: entra − comprometido − metas = queda para el día a día, contra lo que gastás normalmente) y `planLevers` (recortar; mover la fecha de la meta a cuando llega; bajar el monto a lo que junta; mover otra meta que sí llega para que esta entre; subir la prioridad si eso solo la hace llegar). UI: `MonthPlanCard` en `/metas#mes` con "Aplicar topes" (usa `setBudget`, que fija los topes) y los botones de cada palanca (usan `saveGoal`); prioridad al crear la meta y en cada tarjeta de meta. Simulador y plan de deuda en la parte 3.
- Planificador, tercera parte (simulador + plan de deuda, sin IA, sin migración): `plan/simulate.ts` corre `projectCashflow` con y sin el escenario sobre una copia de los datos (no guarda nada): `cuotas` (compra hoy con `deriveInstallments` de una compra virtual `sim`), `gasto` (desde una caja: movimiento virtual marcado como comprometido para que no se confunda con el día a día; con tarjeta: un pago con el próximo resumen) y `sueldo` (`shiftFlow` suma el cambio desde este mes o el que viene). Devuelve saldo de cajas mes a mes con y sin, mes más justo, primer mes en rojo, sobrante por mes, metas (`goalPlan` antes/después: llega antes/después/ya no llega) y uso del límite (`limitUse` con la compra entera). `plan/debt.ts`: `cardDebts` (saldo que queda del último resumen cerrado, ARS + USD a la cotización de hoy, y cuotas que vienen por mes de vencimiento), `payoff` (por mes: primero cuotas, después mínimos —el del banco el primer mes si se importó, si no intereses + 5 %—, el resto a un saldo por vez; intereses = TNA/12 + IVA 21 %; lo impago de cuotas se financia; corta a los 120 meses), `compareDebtPlans` (avalancha = TNA más alta primero, bola de nieve = saldo más chico primero, y solo el mínimo) y `suggestedDebtBudget` (cuotas y mínimos del mes + sobrante, tope la deuda). UI: `WhatIfCard` en `/metas#simular` (cargar la compra con `savePurchase`, el gasto abre Nuevo precargado, el sueldo actualiza el fijo de ingreso más grande en pesos) y `DebtPlanCard` en `/tarjetas#deudas`. Tests en `plan3.test.ts`.
- Escrituras: primero local, después Neon. Si Neon falla, el movimiento queda en la outbox (`src/lib/outbox.ts`, `outbox-flusher.tsx`) y se reintenta. No mostrar un gasto que después desaparece al recargar.
- Borrar cuenta: `deleteAccount` en `src/lib/ledger-api.ts`. Borra todo (incluidas tarjetas) en una transacción y después manda el mail.
- Privacidad: `src/routes/privacidad.tsx`.
- iOS no debe hacer zoom al enfocar un campo: inputs y selects en 16px (`src/styles.css`, `src/components/ui/input.tsx`).
- Ícono de inicio: `public/icon-192.png`, `public/icon-512.png`, `public/__grok/icon-180.png`. El nombre en `cifra.lol` sale de `appNameFromHost` en `scripts/grok-pwa-shared.mjs`. No lo vuelvas a “Grok App”.
- Mails: fondo `#09090B`, tarjeta `#121214`, wordmark Instrument Serif + barras, etiqueta con acento por mail, botón pastilla, versión texto. `MAIL` + `renderMailHtml` / `renderMailText` en `src/lib/mail.ts`. Todo en tablas con estilos inline y `bgcolor` en cada celda (si no, Apple Mail lo invierte); `color-scheme: dark`. Íconos: PNG en `public/mail/` servidos siempre desde `https://cifra.lol` (Gmail no muestra SVG).
- Avisos por mail (fase 8): opt-in en Ajustes → "Avisos por mail" (la sección solo aparece si el deploy tiene `ALERT_MAILS_ENABLED=1`, `CRON_SECRET` y Resend). Vercel Cron diario a las 12:00 UTC (9:00 AR, declarado en `vite.config.ts` → `vercel.config.crons`) llama `GET /api/cron/alertas` con `Authorization: Bearer $CRON_SECRET`; sin la flag o el secreto la ruta da 404. `src/lib/alert-mail.server.ts` → `runAlertMails`: para cada usuario con `alert_mail_prefs.enabled` y mail confirmado, arma los avisos de cada libro con `ledgerAlerts` (los mismos de la app, desde `readLedger`), se queda con los importantes (`vence`, `vencido`, `meta`) que no estén en `alert_mail_sent`, manda un solo mail por día y anota lo enviado (cada id de aviso incluye la tarjeta/meta y el período, así que no se repite). Mail con la plantilla negra de siempre (`items` con punto de color, ícono PNG, sin SVG) y `List-Unsubscribe` + `List-Unsubscribe-Post` (one-click). Baja sin login en `/api/alertas/baja?t=<token>`: GET muestra un botón (los scanners abren links), POST da de baja. Migración `0016_alert_mail` (`alert_mail_prefs`, `alert_mail_sent`), borradas en `deleteAccount`. Lógica pura y tests en `src/lib/alert-mail.ts` / `alert-mail.test.ts`.
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
