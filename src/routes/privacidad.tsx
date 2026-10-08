import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { getAiProcessors } from "@/lib/ai-processors";

export const Route = createFileRoute("/privacidad")({
  head: () => ({
    meta: [
      { title: "Privacidad · Cifra" },
      { name: "description", content: "Qué datos guarda Cifra, quién los procesa, cuánto tiempo y cómo pedir que se borren." },
    ],
  }),
  // Which AI processors are on (names only). If it fails, show the default.
  loader: async () => getAiProcessors().catch(() => ({ gateway: null, groq: false })),
  component: Privacidad,
});

// Responsable de los datos (dato dado por Damián, octubre 2026).
// TODO(Damián): falta el domicilio legal de FIXXA SRL. La Ley 25.326 (art. 6)
// pide informar identidad y domicilio del responsable: cuando lo tengas, sumalo
// en "Quién es responsable" y en el pie (por ejemplo, una const DOMICILIO).
// TODO(Damián): edad mínima sin decidir (¿solo mayores de 18?). Si se decide,
// agregar una sección "Quién puede usar Cifra".
const RESPONSABLE = "FIXXA SRL";
const CUIT = "30-71666643-0";
const CONTACTO = "hola@cifra.lol";
const ACTUALIZADA = "octubre 2026";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-medium text-fg">{title}</h2>
      <div className="mt-1 grid gap-2 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function Privacidad() {
  const user = useCurrentUser();
  const ai = Route.useLoaderData();
  const aiModel = ai.gateway ?? "xAI (Grok)";
  const mail = (
    <a href={`mailto:${CONTACTO}`} className="text-fg underline underline-offset-4">
      {CONTACTO}
    </a>
  );
  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-16 text-fg">
      <Link
        to={user ? "/ajustes" : "/login"}
        className="inline-flex min-h-11 items-center text-xs tracking-wide text-muted uppercase"
      >
        {user ? "← Ajustes" : "← Cifra"}
      </Link>
      <h1 className="mt-1 font-display text-4xl tracking-tight">Privacidad</h1>
      <p className="mt-2 text-sm text-muted">
        Cifra está en beta. Acá está qué guardamos, quién lo procesa, cuánto tiempo y cómo pedir que lo borremos. Sin
        letra chica.
      </p>

      <div className="mt-8 grid gap-7">
        <Section title="Quién es responsable">
          <p>
            {RESPONSABLE} (CUIT {CUIT}) es responsable de los datos que cargás en Cifra. Para cualquier consulta o pedido escribí a{" "}
            {mail}.
          </p>
        </Section>

        <Section title="Qué guardamos y para qué">
          <p>
            Tu mail, tu nombre y tu contraseña (guardada cifrada, nunca en texto plano), para que entres a tu cuenta.
            Tus movimientos, fijos, cajas, tarjetas, presupuestos, categorías y cotizaciones, para mostrarte tu libro. De
            una tarjeta guardamos el nombre que le pongas, la red, el banco, los días de cierre y vencimiento, el límite, el
            porcentaje de percepción, la TNA si la cargás y, si querés, los últimos 4 números; nunca el número completo, el vencimiento del plástico ni el código. De una compra en
            cuotas, qué compraste, el monto, la cantidad de cuotas y si tiene interés. De un resumen de tarjeta que
            importes, las fechas de cierre y vencimiento, los totales, el pago mínimo y los cargos del banco; nunca el PDF.
            Un pago de resumen es un movimiento más (un Cambio de tu caja a la tarjeta); no nos conectamos a tu banco.
            La sesión,
            para no pedirte la clave cada vez. Datos técnicos mínimos (fecha de inicio de sesión, dirección IP y
            navegador) por seguridad y para frenar abusos.
          </p>
          <p>Los usamos solo para que Cifra funcione. No los usamos para publicidad ni para armar perfiles.</p>
          <p>
            Al crear la cuenta aceptás este tratamiento. Podés retirar ese consentimiento cuando quieras borrando la
            cuenta.
          </p>
        </Section>

        <Section title="Quién más los procesa">
          <p>Usamos estos proveedores, que procesan datos solo para darnos su servicio:</p>
          <ul className="list-disc pl-5">
            <li>
              <span className="text-fg">Vercel</span>: aloja la app y la hace llegar a tu navegador.
            </li>
            <li>
              <span className="text-fg">Neon</span>: la base de datos (Postgres) donde vive tu libro.
            </li>
            <li>
              <span className="text-fg">Resend</span>: manda los mails de confirmar cuenta, cambiar la clave y avisos de
              la cuenta. Si activás los avisos por mail en Ajustes, también un mail con los vencimientos de tus
              tarjetas y las metas atrasadas; te podés dar de baja desde cualquiera de esos mails.
            </li>
            <li>
              <span className="text-fg">Vercel AI Gateway</span>, y a través de él {aiModel}: solo si usás el
              asistente o importás un resumen de tarjeta. Con el asistente recibe lo que le escribís, los últimos mensajes
              de la charla y los números que Cifra calcula para contestarte (totales del mes por categoría, tus tarjetas,
              metas, plan del mes, simulaciones y plan de deudas), con los nombres de tus tarjetas, cajas, categorías y
              metas. No recibe la lista de tus movimientos, ni comercios, ni notas. Con un resumen de
              tarjeta recibe solo las líneas de consumos y los totales de ese resumen, sin tu nombre, domicilio, CUIT,
              mail ni número de tarjeta. Nunca le mandamos tu mail. Le pedimos que solo use proveedores que no
              entrenan sus modelos con lo que mandás, y el Gateway no guarda las preguntas. De cada
              llamada guardamos solo cuánto costó (modelo, proveedor, cantidad de tokens, costo estimado,
              tiempo de respuesta y si salió bien), para no pasarnos del tope gratis del día. Nunca guardamos
              lo que escribiste ni lo que respondió. Esos registros se borran a los 90 días, y al borrar la
              cuenta dejan de estar asociados a tu usuario.
            </li>
            {ai.groq ? (
              <li>
                <span className="text-fg">Groq</span>: de respaldo, solo si el asistente principal no responde. Recibe
                lo mismo que el anterior. No guarda las preguntas salvo para investigar abusos (hasta 30 días).
              </li>
            ) : null}
            <li>
              <span className="text-fg">Sentry</span>: solo si está activado, recibe datos técnicos cuando algo falla
              (qué pantalla, qué error). No le mandamos tus montos ni tus movimientos.
            </li>
          </ul>
          <p>
            Estos servidores pueden estar fuera de Argentina (por ejemplo, en Estados Unidos). Las cotizaciones vienen
            de DolarApi, que no recibe ningún dato tuyo.
          </p>
        </Section>

        <Section title="Resúmenes de tarjeta en PDF">
          <p>
            Si importás el resumen de tu tarjeta, el PDF viaja cifrado a nuestro servidor, se lee en memoria durante ese
            pedido y se descarta apenas termina (en menos de un minuto). No lo guardamos en la base, en archivos ni en
            registros, y tampoco la clave del PDF si tiene. Antes de mandar el texto a la IA le sacamos tu nombre,
            domicilio, CUIT o DNI, mail y número de tarjeta, y dejamos solo los consumos y los totales.
          </p>
          <p>
            Lo que lee la IA vuelve a tu pantalla para que lo revises. Solo se guarda lo que aprobás: los movimientos
            que elegís cargar y los datos del resumen (cierre, vencimiento, totales, pago mínimo y cargos).
          </p>
        </Section>

        <Section title="En tu dispositivo">
          <p>
            Cifra guarda una copia de tu libro en este navegador para andar rápido y aguantar cortes de señal. Se borra
            al cerrar sesión o al borrar la cuenta. Si exportás a iCloud, CSV o JSON, ese archivo queda en tus manos.
          </p>
          <p>Solo usamos la cookie de sesión. No hay cookies de publicidad ni rastreadores de terceros.</p>
        </Section>

        <Section title="Cuánto tiempo">
          <p>
            Mientras tengas la cuenta. Hay un respaldo diario de tu libro que dura 30 días. Si borrás la cuenta, se
            borran tu libro, tus respaldos y tu login en el momento. Los proveedores pueden guardar registros técnicos
            por un tiempo corto antes de descartarlos.
          </p>
        </Section>

        <Section title="Tus derechos (Ley 25.326)">
          <p>
            Podés pedir acceso a tus datos, corregirlos, actualizarlos o suprimirlos. Escribí a {mail} desde el mail de
            tu cuenta. Respondemos el pedido de acceso dentro de los 10 días corridos y los de corrección o supresión
            dentro de los 5 días hábiles. El acceso es gratis cada seis meses, salvo que acredites un interés legítimo
            para pedirlo antes.
          </p>
          <p>
            También podés exportar todo desde Ajustes (CSV o JSON) y borrar la cuenta vos mismo, sin pedirle nada a
            nadie.
          </p>
          <p>
            La Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la Ley N° 25.326, tiene
            la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos
            por incumplimiento de las normas vigentes en materia de protección de datos personales.
          </p>
        </Section>

        <Section title="Qué no hacemos">
          <p>No vendemos datos. No hay publicidad. Otro mail es otro libro: no se mezclan.</p>
        </Section>

        <Section title="Seguridad">
          <p>
            Todo viaja cifrado (HTTPS). Cada usuario ve solo su libro. Si pasa algo que afecte tus datos, te avisamos
            por mail.
          </p>
        </Section>

        <Section title="Cambios">
          <p>Si cambiamos algo importante de esta política, te avisamos por mail antes de que rija.</p>
        </Section>
      </div>

      <p className="mt-10 text-xs text-muted">
        Cifra · {RESPONSABLE} · CUIT {CUIT} · {CONTACTO} · Actualizada en {ACTUALIZADA}
      </p>
    </main>
  );
}
