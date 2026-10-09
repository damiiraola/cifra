/**
 * What the app can do and where it is (pure, no model): "¿cómo subo el
 * resumen?", "importar resumen", "¿dónde activo los avisos?". A how-to
 * question about a known feature is answered from this list, word for word,
 * with a link that takes you there: the model never gets the chance to say
 * "por ahora no existe". Unknown how-to questions go to the model with the
 * `funciones_app` tool, and an answer that denies a feature is replaced by an
 * honest "no estoy seguro, contanos". Keep the texts without digits (the
 * model's answers may quote them and Cifra rejects numbers without a source).
 */

/** An internal link ("/ajustes#datos") or the "Contanos" sheet. */
export type GuideLink = { label: string; to: string } | { label: string; action: "contanos" };

export type Feature = {
  id: string;
  /** Short name, as the app calls it. */
  name: string;
  /** Screen → button, as the user sees it. */
  where: string;
  /** The answer: where it is and the steps, a few short sentences. */
  how: string;
  links: GuideLink[];
  followUps: string[];
  /** On the folded question (lowercase, no accents, no ¿?¡!). */
  match: (t: string) => boolean;
};

const CONTANOS: GuideLink = { label: "Abrir Contanos", action: "contanos" };

const has = (t: string, re: RegExp) => re.test(t);

/** Setting something up (not a question about the user's money: "¿puedo pagar el alquiler?"). */
const SETUP =
  /\b(carg\w*|agreg\w*|sum[oa]r?|anot\w*|registr\w*|pon(go|er|e)|cre(o|a|ar)|edit\w*|cambi\w*|borr\w*|elimin\w*|configur\w*|nuev[oa]s?|donde|ver|veo)\b/;

/** Ordered: the first feature that matches answers (the PDF before "tarjeta"). */
export const FEATURES: Feature[] = [
  {
    id: "importar_pdf",
    name: "Importar el resumen de la tarjeta en PDF",
    where: "Más → Tarjetas → en la tarjeta, «Importar resumen PDF»",
    how: "Sí, Cifra lee el resumen de la tarjeta en PDF. Andá a Más → Tarjetas y, en el bloque de la tarjeta, tocá «Importar resumen PDF». Subí el PDF que bajás del home banking (si tiene clave, ponela), revisá lo que leyó línea por línea e importá lo que apruebes. Funciona con PDFs digitales, no con fotos, y usa usos diarios del asistente. Si la tarjeta no está cargada, agregala primero en Ajustes → Tarjetas.",
    links: [
      { label: "Ir a Tarjetas", to: "/tarjetas" },
      { label: "Agregar una tarjeta", to: "/ajustes#tarjetas" },
    ],
    followUps: ["¿Cómo agrego una tarjeta?", "¿Cómo registro el pago del resumen?"],
    match: (t) =>
      has(t, /\bpdf\b|\bimportador\b/) ||
      (has(t, /\bresumen(es)?\b/) &&
        has(
          t,
          /\b(carg\w*|sub\w*|import\w*|le[eoa]|leer\w*|leyendo|archivo|escane\w*|foto|home ?banking|banco)\b/,
        )),
  },
  {
    id: "pagar_resumen",
    name: "Registrar el pago del resumen",
    where: "Más → Tarjetas → en el resumen cerrado, «Pagar resumen»",
    how: "Andá a Más → Tarjetas. En el resumen cerrado de la tarjeta tocá «Pagar resumen», elegí cuánto pagás (total, mínimo u otro monto) y de qué caja sale, y tocá «Registrar pago». Cifra lo descuenta de esa caja y marca el resumen como pagado.",
    links: [{ label: "Ir a Tarjetas", to: "/tarjetas" }],
    followUps: ["¿Cuánto pago de tarjeta este mes?", "¿Cómo salgo de la deuda de la tarjeta?"],
    match: (t) =>
      has(t, /\b(pag\w*)\b/) &&
      ((has(t, /\b(resumen|tarjetas?)\b/) &&
        has(t, /\b(registr\w*|marc\w*|anot\w*|carg\w*|pagado)\b/)) ||
        has(t, /\bcomo pago (el|mi) resumen\b/)),
  },
  {
    id: "cuotas",
    name: "Cargar una compra en cuotas",
    where: "Más → Tarjetas → «Cargar compra en cuotas»",
    how: "Andá a Más → Tarjetas y, en la tarjeta, tocá «Cargar compra en cuotas»: qué compraste, el monto, cuántas cuotas y si tienen interés. Cifra reparte las cuotas en los próximos resúmenes. También podés escribirla en el Asistente con «Interpretar como movimiento» marcado.",
    links: [{ label: "Ir a Tarjetas", to: "/tarjetas" }],
    followUps: ["¿Y si compro algo en cuotas?", "¿Cómo importo el resumen en PDF?"],
    match: (t) => has(t, /\bcuotas?\b/) && has(t, SETUP),
  },
  {
    id: "tarjetas",
    name: "Agregar o editar una tarjeta",
    where: "Ajustes → Tarjetas",
    how: "Las tarjetas se agregan en Ajustes → Tarjetas: nombre, día de cierre, día de vencimiento y límite. Después las ves en Más → Tarjetas, con lo que pagás en cada resumen.",
    links: [
      { label: "Agregar una tarjeta", to: "/ajustes#tarjetas" },
      { label: "Ver Tarjetas", to: "/tarjetas" },
    ],
    followUps: ["¿Cómo importo el resumen en PDF?", "¿Cómo cargo una compra en cuotas?"],
    match: (t) =>
      has(t, /\btarjetas?\b|\bvisa\b|\bmaster\w*\b|\bamex\b/) &&
      has(t, SETUP) &&
      !has(t, /\b(pag\w*|deb\w*|gast\w*)\b/),
  },
  {
    id: "deudas",
    name: "Plan para bajar deudas",
    where: "Más → Tarjetas → «Plan para bajar deudas»",
    how: "Está en Más → Tarjetas, en el bloque «Plan para bajar deudas» (aparece cuando tenés tarjetas cargadas): compara avalancha (primero la tasa más alta), bola de nieve (primero el saldo más chico) y pagar el mínimo, con fecha de salida e intereses. También podés preguntarme «¿Cómo salgo de la deuda de la tarjeta?».",
    links: [{ label: "Ver el plan de deudas", to: "/tarjetas#deudas" }],
    followUps: ["¿Cómo salgo de la deuda de la tarjeta?"],
    match: (t) => has(t, /\bdeudas?\b|\bavalancha\b|bola de nieve/),
  },
  {
    id: "simulador",
    name: "Simulador «¿Y si…?»",
    where: "Más → Metas → «¿Y si…? Probalo antes de hacerlo»",
    how: "Está en Más → Metas, en el bloque «¿Y si…? Probalo antes de hacerlo»: probás una compra en cuotas, un gasto grande o un cambio de sueldo y ves cómo quedan tus cajas, tus metas y la tarjeta. No se guarda nada hasta que lo cargues. También podés preguntarme, por ejemplo, «¿Y si compro una tele en cuotas?».",
    links: [{ label: "Abrir el simulador", to: "/metas#simular" }],
    followUps: ["¿Y si compro algo en cuotas?", "¿Llego con mis metas?"],
    match: (t) => has(t, /\bsimul\w*|\by si\b|que pasa si|probar (una|un) (compra|gasto)/),
  },
  {
    id: "avisos_mail",
    name: "Avisos por mail",
    where: "Ajustes → Avisos por mail",
    how: "Se activan en Ajustes → Avisos por mail: un mail a la mañana, solo si hay algo importante (un resumen de tarjeta por vencer o vencido, o una meta atrasada). Cada aviso llega una sola vez, y los apagás desde el mismo lugar o con el enlace del mail.",
    links: [{ label: "Ir a Avisos por mail", to: "/ajustes#avisos-mail" }],
    followUps: ["¿Qué vence en los próximos días?"],
    match: (t) => has(t, /\b(avisos?|alertas?|recordatorios?|notificaci\w*|avis(a|e)\w*)\b/),
  },
  {
    id: "respaldo",
    name: "Copia de seguridad y exportar",
    where: "Ajustes → Datos",
    how: "Cifra hace una copia de seguridad sola, todos los días, en tu cuenta. En Ajustes → Datos además podés «Exportar CSV» (para Excel), «Guardar en iCloud» o «Descargar respaldo JSON».",
    links: [{ label: "Ir a Datos", to: "/ajustes#datos" }],
    followUps: ["¿Cómo borro mi cuenta?"],
    match: (t) =>
      has(
        t,
        /\b(respald\w*|backup|copia de seguridad|copia|export\w*|csv|excel|json|icloud|planilla)\b|descargar mis (datos|movimientos)/,
      ),
  },
  {
    id: "contanos",
    name: "Contanos (comentarios y problemas)",
    where: "Más → Contanos",
    how: "Desde Más → Contanos (en la compu, en la barra de la izquierda) nos escribís un problema, una idea o lo que quieras. Lo leemos todo, y si marcás «Pueden escribirme a mi mail por esto» te respondemos.",
    links: [CONTANOS],
    followUps: [],
    match: (t) =>
      has(
        t,
        /\b(contanos|sugerencias?|suger\w*|report\w*|reclam\w*|feedback|comentarios?|bug|error|falla|problema|pedir una funcion|pedido)\b/,
      ),
  },
  {
    id: "fijos",
    name: "Gastos e ingresos fijos",
    where: "Ajustes → Fijos",
    how: "Los fijos (alquiler, servicios, suscripciones, sueldo) se cargan en Ajustes → Fijos: nombre, monto, día del mes, categoría y caja. Cifra los cuenta en el plan del mes y, el día que toca, te avisa para anotarlos.",
    links: [{ label: "Ir a Fijos", to: "/ajustes#fijos" }],
    followUps: ["Armame el plan del mes", "¿Qué vence en los próximos días?"],
    match: (t) =>
      has(t, /\bfijos?\b|\bsuscripci\w*|\balquiler\b|\bsueldo\b|\bservicios\b/) && has(t, SETUP),
  },
  {
    id: "metas",
    name: "Metas de ahorro",
    where: "Más → Metas → «Crear meta»",
    how: "Andá a Más → Metas: poné el nombre, cuánto hace falta y para cuándo, y tocá «Crear meta». Cifra te dice cuánto separar por mes y si llegás a tiempo.",
    links: [{ label: "Ir a Metas", to: "/metas" }],
    followUps: ["¿Llego con mis metas?"],
    match: (t) => has(t, /\bmetas?\b|\bobjetivos?\b/) && has(t, SETUP),
  },
  {
    id: "presupuestos",
    name: "Presupuestos y topes",
    where: "Más → Presupuestos",
    how: "En Más → Presupuestos ponés un tope global y topes por categoría, y ves cómo vas contra cada uno este mes. Los topes de cada categoría también se editan en Ajustes → Categorías.",
    links: [{ label: "Ir a Presupuestos", to: "/presupuestos" }],
    followUps: ["Armame el plan del mes", "¿Dónde más estoy gastando este mes?"],
    match: (t) => has(t, /\bpresupuestos?\b|\btopes?\b|limite de gasto/),
  },
  {
    id: "categorias",
    name: "Categorías",
    where: "Ajustes → Categorías",
    how: "En Ajustes → Categorías agregás categorías nuevas de gastos o ingresos, les cambiás el nombre, ocultás las que no usás y les ponés tope.",
    links: [{ label: "Ir a Categorías", to: "/ajustes#categorias" }],
    followUps: ["¿Cómo pongo un tope de gasto?"],
    match: (t) => has(t, /\bcategor\w*/),
  },
  {
    id: "cajas",
    name: "Cajas (banco, efectivo, billeteras)",
    where: "Ajustes → Cajas",
    how: "Las cajas (banco, efectivo, Mercado Pago y las que agregues) y su saldo inicial están en Ajustes → Cajas.",
    links: [{ label: "Ir a Cajas", to: "/ajustes#cajas" }],
    followUps: [],
    match: (t) =>
      has(t, /\bcajas?\b|saldo inicial|mercado ?pago|billetera|efectivo|cuenta del banco/) &&
      has(t, SETUP),
  },
  {
    id: "cotizaciones",
    name: "Cotizaciones del dólar",
    where: "Ajustes → Cotizaciones",
    how: "El dólar blue y el USDT del día se ven arriba en el Diario y en Ajustes → Cotizaciones. Cifra los usa para pasar a pesos lo que cargás en dólares.",
    links: [{ label: "Ir a Cotizaciones", to: "/ajustes#cotizaciones" }],
    followUps: [],
    match: (t) => has(t, /\bcotizaci\w*|\bdolar\w*|\busdt\b|\bblue\b/),
  },
  {
    id: "atajos",
    name: "Atajos de iPhone",
    where: "Ajustes → Atajos de iPhone",
    how: "En Ajustes → Atajos de iPhone está cómo cargar movimientos desde Siri o un atajo, y cómo guardar el respaldo en iCloud.",
    links: [{ label: "Ir a Atajos", to: "/ajustes#atajos" }],
    followUps: [],
    match: (t) => has(t, /\batajos?\b|\bsiri\b|\bshortcuts?\b/),
  },
  {
    id: "negocio",
    name: "Libro de Negocio",
    where: "Más → «Entrar a Negocio»",
    how: "Para separar la plata de un negocio, abrí Más y tocá «Entrar a Negocio»: es un libro aparte, con sus cajas y movimientos. Para volver, «Volver a Personal».",
    links: [],
    followUps: [],
    match: (t) => has(t, /\bnegocio\b|\bemprendimiento\b|libro separado|\bmonotribut\w*/),
  },
  {
    id: "borrar_cuenta",
    name: "Borrar la cuenta",
    where: "Ajustes → Cuenta → Borrar cuenta",
    how: "En Ajustes → Cuenta, abajo de todo, está «Borrar cuenta»: escribís tu mail para confirmar y se borra todo (movimientos, fijos, respaldos y tu acceso), para siempre.",
    links: [{ label: "Ir a Ajustes", to: "/ajustes" }],
    followUps: ["¿Cómo descargo una copia de mis datos?"],
    match: (t) =>
      has(t, /\b(borr\w*|elimin\w*|dar de baja|darme de baja)\b/) && has(t, /\bcuenta\b/),
  },
  {
    id: "cerrar_sesion",
    name: "Cerrar sesión",
    where: "Ajustes → Cuenta → Cerrar sesión",
    how: "Está en Ajustes → Cuenta → «Cerrar sesión».",
    links: [{ label: "Ir a Ajustes", to: "/ajustes" }],
    followUps: [],
    match: (t) => has(t, /cerrar (la )?sesion|\bsalir de la app\b|\blog ?out\b/),
  },
  {
    id: "analitica",
    name: "Analítica",
    where: "Barra de abajo → Analítica",
    how: "En Analítica (barra de abajo) ves tus gastos por categoría y por comercio, ingresos, fijo contra variable y el ritmo contra el tope del mes.",
    links: [{ label: "Ir a Analítica", to: "/analitica" }],
    followUps: ["¿Dónde más estoy gastando este mes?"],
    match: (t) =>
      has(t, /\banalitica\b|\bgraficos?\b|\bestadisticas?\b|\bcomercios?\b|gastos por categoria/),
  },
  {
    id: "movimiento",
    name: "Cargar un gasto o un ingreso",
    where: "Botón «+» (Cargar movimiento), abajo al centro",
    how: "Tocá el botón «+» de abajo al centro (Cargar movimiento): elegís gasto o ingreso, el monto, la categoría y la caja. También podés escribirlo en el Asistente con «Interpretar como movimiento» marcado, o cargarlo con un atajo de iPhone.",
    links: [{ label: "Ir al Diario", to: "/" }],
    followUps: ["¿Cómo cargo una compra en cuotas?"],
    match: (t) =>
      has(t, /\b(gastos?|ingresos?|movimientos?|compras?)\b/) &&
      has(t, /\b(carg\w*|agreg\w*|anot\w*|registr\w*|sum[oa]r?|ingres(ar|o)|edit\w*|borr\w*)\b/),
  },
  {
    id: "aprender",
    name: "Aprender",
    where: "Más → Aprender",
    how: "En Más → Aprender hay recorridos cortos para arrancar: cómo anotar, tarjetas, metas y más.",
    links: [{ label: "Ir a Aprender", to: "/aprender" }],
    followUps: [],
    match: (t) => has(t, /\baprender\b|\btutorial\w*|\brecorridos?\b|\bempezar\b|\barrancar\b/),
  },
  {
    id: "privacidad",
    name: "Privacidad",
    where: "Ajustes → Cuenta → Privacidad",
    how: "En Ajustes → Cuenta → «Privacidad» está qué guarda Cifra, para qué y cómo borrarlo.",
    links: [{ label: "Ver Privacidad", to: "/privacidad" }],
    followUps: [],
    match: (t) => has(t, /\bprivacidad\b|mis datos personales|que guardan/),
  },
];

/** Lowercase, no accents, no ¿?¡!, single spaces. */
export function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:()"«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const VERB =
  "(?:cargar\\w*|cargo|carga|cargas|subir\\w*|subo|sube|agregar\\w*|agrego|agrega|sumar|sumo|importar\\w*|importo|importa|exportar\\w*|exporto|exporta|configurar\\w*|configuro|configura|activar\\w*|activo|activa|desactivar\\w*|desactivo|usar\\w*|uso|usa|poner\\w*|pongo|pone|borrar\\w*|borro|borra|eliminar\\w*|elimino|elimina|editar\\w*|edito|edita|cambiar\\w*|cambio|cambia|registrar\\w*|registro|registra|anotar\\w*|anoto|anota|descargar\\w*|descargo|descarga|bajar\\w*|bajo|guardar\\w*|guardo|guarda|simular\\w*|simulo|simula|reportar\\w*|reporto|mandar\\w*|mando|enviar\\w*|envio|respaldar\\w*|respaldo|marcar\\w*|marco|crear\\w*|creo|crea|ver|veo|leer\\w*|leo|lee|lea|entrar|entro|hacer|hago|hace|armar|armo|pagar|pago|separar|separo|sacar|saco|apagar|apago|prender|prendo|escanear|ocultar|oculto|conectar\\w*|conecto|vincular\\w*|vinculo|sincronizar\\w*|sincronizo|compartir\\w*|comparto|invitar\\w*|invito|instalar\\w*|instalo|abrir|abro|encontrar|encuentro|tener|elegir|elijo|recuperar|recupero|dejar|dejo|escribir\\w*|escribo)";

const HOW_TO: RegExp[] = [
  new RegExp(
    `\\bcomo (?:se |puedo |hago para |hago |hacer para |le hago para |podria )?${VERB}\\b`,
  ),
  new RegExp(
    `\\bdonde (?:se |puedo |hay que )?(?:${VERB}|esta|estan|queda|quedan|encuentro|aparece)\\b`,
  ),
  new RegExp(
    `\\b(?:se puede|puedo|podes|pueden|podria|quiero|necesito|ensename|explicame|me ayudas a|hay que)\\b.*\\b${VERB}\\b`,
  ),
  /\bhay (?:alguna |una |algun |un )?(?:manera|forma|opcion|funcion|herramienta|lugar|modo|importador|simulador)\b/,
  /\b(?:tiene|tenes|tienen) (?:la app |cifra )?(?:para|alguna|algun|opcion|funcion|importador|simulador|avisos|alertas)\b/,
  /\b(?:la app|cifra|la aplicacion) (?:lee|puede|tiene|permite|hace|importa|sube|lo lea|la lea|los lea|lea)\b/,
  /\bexiste\b/,
];

/** A how-to / does-it-exist question about the app (not a question about the user's money). */
export function isHowTo(message: string): boolean {
  const t = fold(message);
  if (!t) return false;
  if (HOW_TO.some((re) => re.test(t))) return true;
  // "subir PDF", "importar resumen", "leer el resumen de la tarjeta": short, starts with a verb, no amounts.
  const words = t.split(" ");
  return words.length <= 7 && !/\d/.test(t) && new RegExp(`^${VERB}$`).test(words[0]!);
}

/** The feature a how-to question is about, or null (not a how-to, or unknown feature). */
export function featureFor(message: string): Feature | null {
  if (!isHowTo(message)) return null;
  const t = fold(message);
  return FEATURES.find((f) => f.match(t)) ?? null;
}

export type GuideAnswer = {
  text: string;
  links: GuideLink[];
  followUps: string[];
  featureId: string;
};

/** Cifra's own answer for a how-to question about a known feature (no model). */
export function guideAnswer(message: string): GuideAnswer | null {
  const f = featureFor(message);
  if (!f) return null;
  return { text: f.how, links: f.links, followUps: f.followUps, featureId: f.id };
}

/** When Cifra doesn't know: never "no existe", always "contanos". */
export const UNSURE_TEXT =
  "No tengo una respuesta segura sobre eso y no quiero decirte algo que no es. Mirá Más → Aprender, o contanos qué querés hacer en Más → Contanos y te respondemos.";

export const UNSURE_LINKS: GuideLink[] = [CONTANOS, { label: "Ir a Aprender", to: "/aprender" }];

const DENIAL =
  /\b(?:no (?:hay|existe|existen|tiene|tenemos|se puede|podes|puede|permite|esta disponible|estan disponibles|ofrece|cuenta con|soporta|lee|importa|es posible)|por ahora no|todavia no|aun no|no contamos con|no esta (?:implementad\w*|habilitad\w*))\b/;

const MONEY =
  /\b(pag\w*|gast(ar|o|e)|alcanz\w*|conviene|compr\w*|ahorr\w*|deb\w*|baj(o|ar) (mis|los) gastos)\b/;
const APP =
  /\b(app|cifra|aplicacion|funcion\w*|opcion\w*|herramienta|pantalla|boton|pdf|import\w*|archivo)\b/;

/**
 * A question about the app itself (how / where / does it exist), not about the
 * user's money ("¿puedo pagar el mínimo?" is about money: a "no" there is fine).
 */
export function isAppQuestion(message: string): boolean {
  if (!isHowTo(message)) return false;
  const t = fold(message);
  return APP.test(t) || !MONEY.test(t.replace(/mercado ?pago/g, ""));
}

/** The model said something isn't there or can't be done. */
export function deniesFeature(answer: string): boolean {
  return DENIAL.test(fold(answer));
}

/** For the `funciones_app` tool: the features about a topic (all of them, short, when nothing matches). */
export function featuresAbout(topic: string): Feature[] {
  const t = fold(topic);
  const hits = t ? FEATURES.filter((f) => f.match(t)) : [];
  return hits.length ? hits.slice(0, 3) : FEATURES;
}
