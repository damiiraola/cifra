import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    id: "cajas",
    title: "Cajas",
    text: "Efectivo, banco, Mercado Pago, dólares y USDT, cada una con su saldo. Pasar plata de una caja a otra no cuenta como gasto.",
  },
  {
    id: "tarjetas",
    title: "Tarjetas con cuotas",
    text: "Cargás la compra en cuotas una vez y Cifra la reparte en cada resumen. Podés importar el PDF del resumen y pagarlo en pesos o con tus dólares.",
  },
  {
    id: "metas",
    title: "Metas y presupuestos",
    text: "Ponés una meta con fecha y Cifra te dice si llegás con lo que te sobra por mes, y cuánto apartar. Topes por categoría para que el mes cierre.",
  },
  {
    id: "asistente",
    title: "Un asistente para planificar",
    text: "Le preguntás “¿llego con mis metas?” o “¿y si compro una tele en 12 cuotas?”. Los números los calcula Cifra con tus datos; el asistente te los explica y propone cambios que aplicás vos.",
  },
] as const;

/** Small, illustrative month. Not real data: labeled as an example. */
function ExampleMonth() {
  return (
    <figure
      aria-label="Ejemplo de cómo se ve un mes en Cifra"
      className="w-full max-w-sm rounded-3xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]"
    >
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-muted">Octubre</p>
        <p className="font-display text-4xl tracking-tight">$ 418.500</p>
      </div>
      <p className="mt-1 text-right text-xs text-muted">gastado en el mes</p>
      <ul className="mt-4 flex flex-wrap gap-2 text-xs">
        {[
          ["Banco", "$ 1.240.000"],
          ["Efectivo", "$ 35.000"],
          ["Dólares", "US$ 300"],
        ].map(([k, v]) => (
          <li key={k} className="rounded-full bg-elevated px-3 py-1.5">
            <span className="text-muted">{k}</span> <span className="tabular-nums">{v}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-2 text-sm">
        <div className="flex justify-between rounded-xl bg-elevated px-3 py-2">
          <span>Visa · cuota 3 de 6</span>
          <span className="tabular-nums text-muted">$ 50.000</span>
        </div>
        <div className="flex justify-between rounded-xl bg-elevated px-3 py-2">
          <span>Meta: vacaciones</span>
          <span className="text-muted">llegás en enero</span>
        </div>
      </div>
      <figcaption className="mt-3 text-[11px] text-subtle">
        Ejemplo, con números inventados.
      </figcaption>
    </figure>
  );
}

/**
 * Public front page for visitors without a session (`/`, and `/ia` scrolls to
 * the assistant). Static and light: no images, no data, no external calls.
 */
export function Landing({ focus }: { focus?: "asistente" }) {
  useEffect(() => {
    if (focus) document.getElementById(focus)?.scrollIntoView({ block: "start" });
  }, [focus]);
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 pt-6">
        <p className="font-display text-3xl tracking-tight">Cifra</p>
        <Button asChild variant="ghost" className="-mr-3">
          <Link to="/login">Entrar</Link>
        </Button>
      </header>

      <main>
        <section className="mx-auto grid max-w-5xl items-center gap-10 px-6 pt-12 pb-16 md:grid-cols-[1.2fr_1fr] md:pt-20">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted uppercase">
              Finanzas personales · beta
            </p>
            <h1 className="mt-3 font-display text-5xl leading-[1.05] tracking-tight md:text-6xl">
              Tu plata, en claro.
            </h1>
            <p className="mt-5 max-w-lg text-base text-muted">
              Cifra es una app para anotar en qué se va la plata, en pesos y en dólares, y
              planificar el mes sin planillas: tus cajas, las tarjetas con sus cuotas, tus metas y
              un asistente que te ayuda a hacer las cuentas.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="px-6">
                <a href="/login?modo=crear">Crear cuenta</a>
              </Button>
              <Button asChild variant="outline" size="lg" className="px-6">
                <Link to="/login">Entrar</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-subtle">
              Está en beta. Se usa desde el navegador y se puede instalar como app en el celular.
            </p>
          </div>
          <div className="flex justify-center md:justify-end">
            <ExampleMonth />
          </div>
        </section>

        <section aria-labelledby="que-hace" className="mx-auto max-w-5xl px-6 pb-16">
          <h2 id="que-hace" className="text-[11px] font-medium tracking-wide text-muted uppercase">
            Qué hace
          </h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {FEATURES.map((f) => (
              <li
                key={f.id}
                id={f.id}
                className="scroll-mt-6 rounded-2xl bg-surface p-5 shadow-[0_0_0_1px_rgba(244,244,240,0.06)]"
              >
                <h3 className="font-display text-2xl tracking-tight">{f.title}</h3>
                <p className="mt-2 text-sm text-muted">{f.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-16">
          <div className="rounded-3xl bg-surface p-6 shadow-[0_0_0_1px_rgba(244,244,240,0.06)] md:p-8">
            <h2 className="font-display text-3xl tracking-tight">Tus datos son tuyos</h2>
            <p className="mt-3 max-w-2xl text-sm text-muted">
              Cifra no se conecta a tu banco ni mueve plata: lo que ves es lo que anotaste vos.
              Podés bajar un respaldo cuando quieras y borrar la cuenta desde Ajustes. El detalle de
              qué se guarda, quién lo procesa y cuánto tiempo está en Privacidad.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg" className="px-6">
                <a href="/login?modo=crear">Crear cuenta</a>
              </Button>
              <Button asChild variant="outline" size="lg" className="px-6">
                <Link to="/privacidad">Leer Privacidad</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-5xl flex-wrap gap-x-6 gap-y-2 px-6 pb-10 text-xs text-muted">
        <span>Cifra · beta</span>
        <Link to="/privacidad" className="-my-3 py-3 underline-offset-4 hover:underline">
          Privacidad
        </Link>
        <Link to="/ia" className="-my-3 py-3 underline-offset-4 hover:underline">
          El asistente
        </Link>
      </footer>
    </div>
  );
}
