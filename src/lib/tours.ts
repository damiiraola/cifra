export type TourStep = { title: string; body: string; anchor?: string };

export type Tour = {
  path: "/" | "/analitica" | "/presupuestos" | "/tarjetas" | "/ia" | "/ajustes" | "/aprender" | "/metas";
  page: string;
  steps: TourStep[];
};

export const TOURS: Tour[] = [
  {
    path: "/",
    page: "Diario",
    steps: [
      {
        anchor: "mes",
        title: "Este es el mes",
        body: "El número grande es lo que ya gastaste. No es lo que te queda en el banco.",
      },
      {
        anchor: "nuevo",
        title: "Acá se anota",
        body: "Nuevo carga un gasto, un ingreso, o un pase de una caja a otra. Pasar USDT al banco no es un gasto: la plata sigue siendo tuya.",
      },
      {
        anchor: "cajas",
        title: "Tus cajas",
        body: "Cada pastilla es un lugar donde está la plata. El saldo sale de lo que anotaste, no del banco.",
      },
    ],
  },
  {
    path: "/analitica",
    page: "Analítica",
    steps: [
      {
        anchor: "numeros",
        title: "Gastado, ingresos y neto",
        body: "Gastado es lo que se fue. Ingresos es lo que entró. Neto es la diferencia. No es el saldo de una caja.",
      },
      {
        anchor: "fijo",
        title: "Fijo y variable",
        body: "Fijo es lo que se repite, como el alquiler. Variable es lo del día a día, como el súper.",
      },
      {
        anchor: "categorias",
        title: "Por categoría",
        body: "Tocá una barra para ver los movimientos. El detalle de cada día está en el diario.",
      },
    ],
  },
  {
    path: "/presupuestos",
    page: "Presupuestos",
    steps: [
      {
        anchor: "tope",
        title: "El tope no es el saldo",
        body: "Es hasta dónde te dejás gastar en el mes. El número se cambia acá.",
      },
      {
        anchor: "plan",
        title: "El plan del mes",
        body: "Suma lo que entra, como el sueldo y un alquiler que cobrás, y le resta lo que se paga sí o sí.",
      },
      {
        anchor: "categorias",
        title: "El techo de cada rubro",
        body: "Si no escribís un número, Cifra usa los fijos de esa categoría. Si no hay fijos, usa lo que ya gastaste.",
      },
    ],
  },
  {
    path: "/tarjetas",
    page: "Tarjetas",
    steps: [
      {
        anchor: "tarjeta",
        title: "La tarjeta",
        body: "Pesos y dólares van separados. El límite es lo que el banco te presta, no plata tuya.",
      },
      {
        anchor: "resumen",
        title: "Lo que se viene",
        body: "Cada mes muestra lo que ya está cargado. Pagar el resumen no es un gasto nuevo.",
      },
      {
        anchor: "compras",
        title: "Una compra, varias cuotas",
        body: "La carga una vez. Cifra reparte las cuotas en los meses que vienen.",
      },
    ],
  },
  {
    path: "/ia",
    page: "Asistente",
    steps: [
      {
        anchor: "ideas",
        title: "Preguntale a este libro",
        body: "Tocá una pregunta o escribí la tuya. Lee tus números. No busca en internet.",
      },
      {
        anchor: "pregunta",
        title: "Si no entendés una palabra",
        body: "Decilo acá. Explica caja, fijo o tope en la misma frase.",
      },
      {
        anchor: "charla",
        title: "La respuesta queda",
        body: "La conversación se guarda. Nueva abre otra sin borrar esta.",
      },
    ],
  },
  {
    path: "/ajustes",
    page: "Ajustes",
    steps: [
      {
        anchor: "cotizacion",
        title: "El dólar de hoy",
        body: "Con esto Cifra pasa dólares y USDT a pesos. No es la lista de gastos.",
      },
      {
        anchor: "fijos",
        title: "Los fijos viven acá",
        body: "Alquiler, sueldo, lo que cobrás cada mes. Si no los cargaste al entrar, se cargan acá.",
      },
      {
        anchor: "libro",
        title: "Personal y negocio",
        body: "Cada libro tiene sus cajas y sus números. Cambiar no mezcla la plata.",
      },
    ],
  },
  {
    path: "/aprender",
    page: "Aprender",
    steps: [
      {
        anchor: "titulo",
        title: "Una idea por vez",
        body: "Estas seis notas son para quien nunca anotó la plata. Se leen en orden, sin apuro.",
      },
      {
        anchor: "recorridos",
        title: "Los recorridos se pueden repetir",
        body: "La primera vez que entrás a una página, Cifra te la muestra. Desde acá los volvés a ver.",
      },
    ],
  },
  {
    path: "/metas",
    page: "Metas",
    steps: [
      {
        anchor: "titulo",
        title: "A dónde querés llegar",
        body: "Un viaje, un bien, ahorrar lo que sobra o invertir sin operar. Cada meta elige pesos, dólares o USDT.",
      },
      {
        anchor: "nueva",
        title: "La armás acá",
        body: "Poné el monto y, si tiene, la fecha. El diario te dice cuánto por día falta.",
      },
    ],
  },
];

export function tourFor(path: string) {
  return TOURS.find((t) => t.path === path);
}

function seenKey(email: string) {
  return `cifra-seen-tours:v2:${email.trim().toLowerCase()}`;
}

export function placeBubble(
  rect: { top: number; left: number; right: number; bottom: number; width: number },
  card: { width: number; height: number },
  view: { width: number; height: number },
) {
  const gap = 14;
  const margin = 16;
  const below = view.height - rect.bottom;
  const right = view.width - rect.right;
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  let top: number;
  let left: number;
  let tip: "up" | "down" | "left";
  if (rect.left < 280 && right >= card.width + gap + margin) {
    tip = "left";
    left = rect.right + gap;
    top = clamp(rect.top, margin, view.height - card.height - margin);
  } else if (below >= card.height + gap + margin) {
    tip = "up";
    top = rect.bottom + gap;
    left = clamp(rect.left, margin, view.width - card.width - margin);
  } else {
    tip = "down";
    top = Math.max(margin, rect.top - gap - card.height);
    left = clamp(rect.left, margin, view.width - card.width - margin);
  }
  const arrow = clamp(rect.left + rect.width / 2 - left - 6, 20, card.width - 28);
  return { top, left, tip, arrow };
}

export function readSeen(email: string, storage: Pick<Storage, "getItem">) {
  if (!email.trim()) return [];
  try {
    const raw = storage.getItem(seenKey(email));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function markSeen(email: string, path: string, storage: Pick<Storage, "getItem" | "setItem">) {
  if (!email.trim() || !path) return;
  const next = [...new Set([...readSeen(email, storage), path])];
  storage.setItem(seenKey(email), JSON.stringify(next));
}

let replayPath: string | null = null;
const replayListeners = new Set<() => void>();

export function replayTour(path: string) {
  replayPath = path;
  replayListeners.forEach((fn) => fn());
}

export function clearReplay() {
  if (!replayPath) return;
  replayPath = null;
  replayListeners.forEach((fn) => fn());
}

export function currentReplay() {
  return replayPath;
}

export function subscribeReplay(fn: () => void) {
  replayListeners.add(fn);
  return () => {
    replayListeners.delete(fn);
  };
}
