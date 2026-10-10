import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deniesFeature,
  featureFor,
  FEATURES,
  featuresAbout,
  guideAnswer,
  isAppQuestion,
  isHowTo,
  UNSURE_TEXT,
} from "./app-guide.ts";

describe("how to upload the card statement PDF (the case that went wrong)", () => {
  const exact = "Hay alguna manera de cargar el resumen de mi tarjeta y que la app.lo lea ?";

  it("the exact question gets the importer, with the real route and a link", () => {
    const g = guideAnswer(exact);
    assert.ok(g, "answered from the guide");
    assert.equal(g.featureId, "importar_pdf");
    assert.match(g.text, /^Sí, Cifra lee el resumen de la tarjeta en PDF/);
    assert.match(g.text, /Más → Tarjetas/);
    assert.match(g.text, /«Subir resumen PDF»/);
    assert.match(g.text, /no hace falta cargar nada antes/);
    assert.doesNotMatch(g.text, /no hay|por ahora no|todavía no/i);
    assert.deepEqual(g.links[0], { label: "Subir resumen PDF", to: "/tarjetas#subir" });
  });

  for (const q of [
    "subir PDF",
    "Subir el PDF del resumen",
    "importar resumen",
    "leer el resumen de la tarjeta",
    "¿Puedo subir un PDF?",
    "¿Cómo importo el resumen de la Visa?",
    "¿Dónde subo el resumen?",
    "¿La app lee el resumen del banco?",
    "¿Se puede cargar el resumen de la tarjeta?",
    "quiero que cifra lea mi resumen",
    "¿Tiene importador de resúmenes?",
    "hay forma de escanear el resumen?",
  ]) {
    it(`variant: ${q}`, () => assert.equal(featureFor(q)?.id, "importar_pdf"));
  }
});

describe("each feature answers its how-to question", () => {
  const cases: [string, string][] = [
    ["¿Cómo agrego una tarjeta?", "tarjetas"],
    ["¿Cómo cargo una compra en cuotas?", "cuotas"],
    ["¿Dónde cargo los gastos fijos?", "fijos"],
    ["¿Cómo creo una meta?", "metas"],
    ["¿Cómo pongo un tope de gasto?", "presupuestos"],
    ["¿Cómo armo un presupuesto?", "presupuestos"],
    ["¿Cómo simulo una compra?", "simulador"],
    ["¿Dónde está el plan de deudas?", "deudas"],
    ["¿Cómo activo las alertas por mail?", "avisos_mail"],
    ["¿Cómo reporto un error?", "contanos"],
    ["¿Dónde dejo una sugerencia?", "contanos"],
    ["¿Cómo hago una copia de seguridad?", "respaldo"],
    ["¿Puedo exportar a Excel?", "respaldo"],
    ["¿Cómo cargo un gasto?", "movimiento"],
    ["¿Cómo registro el pago del resumen?", "pagar_resumen"],
    ["¿Cómo borro mi cuenta?", "borrar_cuenta"],
    ["¿Dónde veo el dólar?", "cotizaciones"],
    ["¿Cómo agrego una categoría?", "categorias"],
    ["¿Se puede usar con Siri?", "atajos"],
    ["¿Cómo separo la plata del negocio?", "negocio"],
  ];
  for (const [q, id] of cases) it(`${q} → ${id}`, () => assert.equal(featureFor(q)?.id, id));

  it("adding a card points to the PDF first", () => {
    const g = guideAnswer("¿Cómo agrego una tarjeta?");
    assert.match(g?.text ?? "", /^Lo más rápido es subir el PDF del resumen/);
    assert.deepEqual(g?.links.map((l) => ("to" in l ? l.to : l.action)), ["/tarjetas#subir", "/ajustes#tarjetas"]);
  });

  it("every feature has a route, a link or a clear place, and no digits", () => {
    for (const f of FEATURES) {
      assert.ok(f.where.length > 3, f.id);
      assert.doesNotMatch(f.how, /\d/, `${f.id}: the model may quote it; numbers need a source`);
      assert.equal(deniesFeature(f.how), false, `${f.id}: a guide text must not read as a denial`);
      for (const l of f.links) if ("to" in l) assert.match(l.to, /^\/[a-z]*(#[a-z-]+)?$/, f.id);
    }
    assert.equal(new Set(FEATURES.map((f) => f.id)).size, FEATURES.length);
  });
});

describe("questions about the user's money are not how-to questions", () => {
  for (const q of [
    "¿Cuánto pago de tarjeta este mes?",
    "¿Y si compro una tele de 600 mil en 12 cuotas?",
    "¿Puedo pagar el mínimo de la tarjeta?",
    "¿Puedo pagar el alquiler este mes?",
    "¿Cómo bajo mis gastos?",
    "¿Cómo salgo de la deuda de la tarjeta?",
    "¿Llego con mis metas?",
    "¿Qué vence en los próximos días?",
    "¿Dónde más estoy gastando este mes?",
    "¿Cómo vengo este mes?",
    "¿Me alcanza para pagar la tarjeta?",
    "Armame el plan del mes",
    "¿Hay vencimientos esta semana?",
    "¿Cuánto debo de la Visa?",
    "¿Puedo comprar una heladera en 6 cuotas?",
    "Informe del mes",
  ]) {
    it(q, () => {
      assert.equal(featureFor(q), null);
      assert.equal(isAppQuestion(q), false);
    });
  }
});

describe("unknown features: never denied", () => {
  it("a how-to about something not in the list is still an app question", () => {
    for (const q of [
      "¿Puedo compartir el libro con mi pareja?",
      "¿Cómo conecto mi cuenta de Mercado Pago para que se importe sola?",
    ]) {
      assert.equal(isHowTo(q), true, q);
      assert.equal(featureFor(q), null, q);
      assert.equal(isAppQuestion(q), true, q);
    }
  });

  it("spots answers that deny a feature", () => {
    for (const a of [
      "Por ahora no hay carga automática de resúmenes de tarjetas.",
      "La app no permite compartir el libro.",
      "Todavía no se puede importar desde Mercado Pago.",
      "Cifra no tiene esa función.",
    ])
      assert.equal(deniesFeature(a), true, a);
    assert.equal(deniesFeature("Andá a Más → Tarjetas y tocá «Importar resumen PDF»."), false);
  });

  it("the unsure answer sends to Contanos", () => {
    assert.match(UNSURE_TEXT, /Más → Contanos/);
    assert.doesNotMatch(UNSURE_TEXT, /no existe|no se puede|no hay/);
  });

  it("featuresAbout: a topic narrows the list; nothing found gives the whole list", () => {
    assert.deepEqual(
      featuresAbout("subir el resumen en pdf").map((f) => f.id),
      ["importar_pdf"],
    );
    assert.equal(featuresAbout("teletransportar plata").length, FEATURES.length);
  });
});
