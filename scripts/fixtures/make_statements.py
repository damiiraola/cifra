"""
Synthetic credit card statements for the PDF importer tests. No real data:
names, CUITs, card numbers, addresses and merchants are made up.

  python3 -m venv /tmp/v && /tmp/v/bin/pip install reportlab pycryptodome
  /tmp/v/bin/python scripts/fixtures/make_statements.py

Writes test-fixtures/statements/*.pdf and expected.json (what a correct
reading should return; also used as the fake model answer in local e2e).
"""
import json
import os
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib import pdfencrypt

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "test-fixtures", "statements")
W, H = A4


def ar(n):
    s = f"{abs(n):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return ("-" if n < 0 else "") + s


def r2(x):
    return round(x + 1e-9, 2)


def totals(st):
    ars = st["prevArs"] - st["payArs"]
    usd = st["prevUsd"] - st["payUsd"]
    for l in st["lines"]:
        sign = -1 if l["kind"] in ("refund",) else 1
        if l["cur"] == "USD":
            usd += sign * l["amount"]
        else:
            ars += sign * l["amount"]
    return r2(ars), r2(usd)


HOLDER = {"name": "MARTINA FICTICIA SOSA", "cuit": "27-30111222-4", "addr": "AV SIEMPRE VIVA 742 PISO 3 DTO B", "city": "(1405) CABA"}

STATEMENTS = [
    {
        "file": "visa-galicia",
        "brand": "VISA", "bank": "Banco Galicia", "card": "4509 XXXX XXXX 6789",
        "closing": "2026-09-24", "due": "2026-10-06", "nextClosing": "2026-10-22", "nextDue": "2026-11-04",
        "prevArs": 210000.00, "prevUsd": 15.00, "payArs": 210000.00, "payUsd": 15.00, "minimum": 41000.00, "limit": 2500000.00,
        "dateFmt": "visa",
        "lines": [
            {"date": "2026-08-28", "desc": "COTO SUC 123", "cuota": None, "cur": "ARS", "amount": 45300.50, "kind": "purchase", "cat": "alimentos"},
            {"date": "2026-09-02", "desc": "FRAVEGA ONLINE", "cuota": [3, 12], "cur": "ARS", "amount": 50000.00, "kind": "purchase", "cat": "compras"},
            {"date": "2026-09-05", "desc": "YPF SERVICLUB 0042", "cuota": None, "cur": "ARS", "amount": 38250.00, "kind": "purchase", "cat": "transporte"},
            {"date": "2026-09-11", "desc": "NETFLIX.COM", "cuota": None, "cur": "USD", "amount": 9.99, "kind": "purchase", "cat": "suscripciones"},
            {"date": "2026-09-15", "desc": "SPOTIFY P1A2B3", "cuota": None, "cur": "USD", "amount": 4.50, "kind": "purchase", "cat": "suscripciones"},
            {"date": "2026-09-18", "desc": "FARMACITY 221", "cuota": None, "cur": "ARS", "amount": 12890.00, "kind": "purchase", "cat": "salud"},
            {"date": "2026-09-20", "desc": "DEVOLUCION FARMACITY 221", "cuota": None, "cur": "ARS", "amount": 2000.00, "kind": "refund", "cat": "salud"},
            {"date": "2026-09-24", "desc": "IMPUESTO DE SELLOS", "cuota": None, "cur": "ARS", "amount": 1450.30, "kind": "charge", "cat": "impuestos"},
            {"date": "2026-09-24", "desc": "IVA RG 4240 21% SERV DIGITALES", "cuota": None, "cur": "ARS", "amount": 4123.80, "kind": "charge", "cat": "impuestos"},
        ],
    },
    {
        "file": "mastercard-santander",
        "brand": "MASTERCARD", "bank": "Banco Santander", "card": "5412 **** **** 4321",
        "closing": "2026-09-26", "due": "2026-10-08", "nextClosing": "2026-10-29", "nextDue": "2026-11-10",
        "prevArs": 98500.00, "prevUsd": 0.0, "payArs": 98500.00, "payUsd": 0.0, "minimum": 18800.00, "limit": 1800000.00,
        "dateFmt": "slash",
        "lines": [
            {"date": "2026-04-14", "desc": "GARBARINO SA", "cuota": [6, 6], "cur": "ARS", "amount": 22000.00, "kind": "purchase", "cat": "compras"},
            {"date": "2026-09-01", "desc": "MERPAGO*RAPPI", "cuota": None, "cur": "ARS", "amount": 18760.40, "kind": "purchase", "cat": "alimentos"},
            {"date": "2026-09-03", "desc": "SUBE RECARGA", "cuota": None, "cur": "ARS", "amount": 10000.00, "kind": "purchase", "cat": "transporte"},
            {"date": "2026-09-09", "desc": "CARREFOUR HIPER 77", "cuota": None, "cur": "ARS", "amount": 67432.15, "kind": "purchase", "cat": "alimentos"},
            {"date": "2026-09-12", "desc": "AMAZON MKTPLACE", "cuota": None, "cur": "USD", "amount": 35.20, "kind": "purchase", "cat": "compras"},
            {"date": "2026-09-21", "desc": "OSDE BINARIO", "cuota": None, "cur": "ARS", "amount": 85000.00, "kind": "purchase", "cat": "salud"},
            {"date": "2026-09-26", "desc": "COMISION MANTENIMIENTO CUENTA", "cuota": None, "cur": "ARS", "amount": 3900.00, "kind": "charge", "cat": "impuestos"},
            {"date": "2026-09-26", "desc": "IVA 21%", "cuota": None, "cur": "ARS", "amount": 819.00, "kind": "charge", "cat": "impuestos"},
        ],
    },
    {
        "file": "amex-galicia",
        "brand": "AMERICAN EXPRESS", "bank": "Galicia", "card": "3777 XXXXXX X1005",
        "closing": "2026-09-25", "due": "2026-10-07", "nextClosing": "2026-10-23", "nextDue": "2026-11-05",
        "prevArs": 45000.00, "prevUsd": 120.00, "payArs": 45000.00, "payUsd": 120.00, "minimum": 9500.00,
        "dateFmt": "amex",
        "lines": [
            {"date": "2026-07-30", "desc": "MUSIMUNDO PALERMO", "cuota": [3, 6], "cur": "ARS", "amount": 31666.67, "kind": "purchase", "cat": "compras"},
            {"date": "2026-09-04", "desc": "AEROLINEAS ARG", "cuota": None, "cur": "ARS", "amount": 154300.00, "kind": "purchase", "cat": "ocio"},
            {"date": "2026-09-10", "desc": "HOTEL MIRADOR BRC", "cuota": None, "cur": "USD", "amount": 210.00, "kind": "purchase", "cat": "ocio"},
            {"date": "2026-09-17", "desc": "LA PARRILLA DE TOTO", "cuota": None, "cur": "ARS", "amount": 48900.00, "kind": "purchase", "cat": "alimentos"},
            {"date": "2026-09-25", "desc": "INTERESES FINANCIACION", "cuota": None, "cur": "ARS", "amount": 2312.45, "kind": "charge", "cat": "impuestos"},
            {"date": "2026-09-25", "desc": "PERCEPCION RG 5617 30%", "cuota": None, "cur": "ARS", "amount": 63000.00, "kind": "charge", "cat": "impuestos"},
        ],
    },
    {
        "file": "visa-nacion",
        "brand": "VISA", "bank": "Banco de la Nacion Argentina", "card": "4546 40XX XXXX 2468",
        "closing": "2026-09-23", "due": "2026-10-05", "nextClosing": "2026-10-21", "nextDue": "2026-11-02",
        "prevArs": 60000.00, "prevUsd": 0.0, "payArs": 30000.00, "payUsd": 0.0, "minimum": 15000.00, "limit": 900000.00,
        "dateFmt": "visa",
        "lines": [
            {"date": "2026-06-10", "desc": "MERCADOLIBRE*ELECTRO", "cuota": [4, 9], "cur": "ARS", "amount": 15555.56, "kind": "purchase", "cat": "compras"},
            {"date": "2026-09-06", "desc": "DIA TIENDA 1820", "cuota": None, "cur": "ARS", "amount": 23410.00, "kind": "purchase", "cat": "alimentos"},
            {"date": "2026-09-14", "desc": "EDENOR DEBITO AUTOM", "cuota": None, "cur": "ARS", "amount": 28700.00, "kind": "purchase", "cat": "servicios"},
            {"date": "2026-09-23", "desc": "INTERESES DE FINANCIACION", "cuota": None, "cur": "ARS", "amount": 4380.25, "kind": "charge", "cat": "impuestos"},
            {"date": "2026-09-23", "desc": "IVA S/INTERESES 21%", "cuota": None, "cur": "ARS", "amount": 919.85, "kind": "charge", "cat": "impuestos"},
        ],
    },
]

MES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
MESL = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiem", "Octubr", "Noviem", "Diciem"]


def fmt_date(iso, f):
    y, m, d = iso.split("-")
    if f == "visa":  # "26 Setiem 02" (yy, month, day) like Prisma
        return f"{y[2:]} {MESL[int(m)-1]} {d}"
    if f == "slash":
        return f"{d}/{m}/{y[2:]}"
    return f"{d} {MES[int(m)-1].upper()}"  # amex "04 SEP"


def long_date(iso):
    y, m, d = iso.split("-")
    return f"{d} {MES[int(m)-1]} {y[2:]}"


def cuota_text(c, f):
    if not c:
        return ""
    k, n = c
    if f == "visa":
        return f" C.{k:02d}/{n:02d}"
    if f == "slash":
        return f" CUOTA {k:02d} DE {n:02d}"
    return f" CUOTA {k}/{n}"


def draw(st, path, password=None, scanned=False):
    enc = pdfencrypt.StandardEncryption(password, canPrint=1) if password else None
    c = canvas.Canvas(path, pagesize=A4, encrypt=enc)
    c.setTitle(f"Resumen {st['brand']} sintetico")
    ars, usd = totals(st)
    if scanned:
        c.setFillGray(0.85)
        for i in range(30):
            c.rect(40, H - 60 - i * 22, 500 - (i * 7) % 180, 10, fill=1, stroke=0)
        c.showPage()
        c.save()
        return
    y = H - 50
    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, y, f"{st['bank']} - {st['brand']}")
    c.setFont("Helvetica", 9)
    y -= 18
    c.drawString(40, y, HOLDER["name"])
    c.drawString(360, y, f"CUIT {HOLDER['cuit']}")
    y -= 12
    c.drawString(40, y, HOLDER["addr"])
    y -= 12
    c.drawString(40, y, HOLDER["city"])
    c.drawString(360, y, f"Tarjeta {st['card']}")
    y -= 12
    c.drawString(40, y, "Cuenta N 0123456789")
    c.drawString(360, y, "mail: martina.ficticia@example.com")
    y -= 24
    c.setFont("Helvetica-Bold", 9)
    c.drawString(40, y, "CIERRE ACTUAL")
    c.drawString(140, y, long_date(st["closing"]))
    c.drawString(300, y, "VENCIMIENTO ACTUAL")
    c.drawString(420, y, long_date(st["due"]))
    y -= 12
    c.setFont("Helvetica", 9)
    c.drawString(40, y, "PROXIMO CIERRE")
    c.drawString(140, y, long_date(st["nextClosing"]))
    c.drawString(300, y, "PROXIMO VENCIMIENTO")
    c.drawString(420, y, long_date(st["nextDue"]))
    y -= 12
    c.drawString(40, y, "SALDO ACTUAL $")
    c.drawRightString(260, y, ar(ars))
    c.drawString(300, y, "SALDO ACTUAL U$S")
    c.drawRightString(520, y, ar(usd))
    y -= 12
    c.drawString(40, y, "PAGO MINIMO $")
    c.drawRightString(260, y, ar(st["minimum"]))
    c.drawString(300, y, "TNA 98,50%  TEA 157,22%")
    if st.get("limit"):
        y -= 12
        c.drawString(40, y, "LIMITE DE COMPRA $")
        c.drawRightString(260, y, ar(st["limit"]))
    y -= 24
    c.setFont("Helvetica-Bold", 9)
    c.drawString(40, y, "FECHA")
    c.drawString(110, y, "COMPROBANTE")
    c.drawString(190, y, "DETALLE DE TRANSACCION")
    c.drawRightString(460, y, "PESOS")
    c.drawRightString(540, y, "DOLARES")
    c.setFont("Helvetica", 9)
    y -= 14

    def row(date, comp, desc, a=None, u=None):
        nonlocal y
        if y < 60:
            c.showPage()
            c.setFont("Helvetica", 9)
            y = H - 50
        if date:
            c.drawString(40, y, date)
        if comp:
            c.drawString(110, y, comp)
        c.drawString(190, y, desc)
        if a is not None:
            c.drawRightString(460, y, ar(a))
        if u is not None:
            c.drawRightString(540, y, ar(u))
        y -= 13

    f = st["dateFmt"]
    prev_closing = "2026-08-27"
    row(fmt_date(prev_closing, f), "", "SALDO ANTERIOR", st["prevArs"], st["prevUsd"] or None)
    row(fmt_date("2026-09-05", f), "", "SU PAGO EN PESOS", -st["payArs"])
    if st["payUsd"]:
        row(fmt_date("2026-09-05", f), "", "SU PAGO EN USD", None, -st["payUsd"])
    for i, l in enumerate(st["lines"]):
        comp = f"{(i * 37 + 104521) % 1000000:06d}*" if l["kind"] in ("purchase", "refund") else ""
        amt = -l["amount"] if l["kind"] == "refund" else l["amount"]
        desc = l["desc"] + cuota_text(l["cuota"], f)
        if l["cur"] == "USD":
            row(fmt_date(l["date"], f), comp, desc + f" USD {ar(l['amount'])}", None, amt)
        else:
            row(fmt_date(l["date"], f), comp, desc, amt)
    sum_ars = sum((-1 if l["kind"] == "refund" else 1) * l["amount"] for l in st["lines"] if l["cur"] == "ARS" and l["kind"] != "charge")
    sum_usd = sum(l["amount"] for l in st["lines"] if l["cur"] == "USD")
    c.setFont("Helvetica-Bold", 9)
    row("", "", f"TOTAL CONSUMOS DE {HOLDER['name']}", r2(sum_ars), r2(sum_usd) or None)
    row("", "", "SALDO ACTUAL", ars, usd or None)
    c.setFont("Helvetica", 7)
    y -= 10
    c.drawString(40, y, f"Titular: {HOLDER['name']} - Domicilio legal: {HOLDER['addr']} {HOLDER['city']}")
    y -= 10
    c.drawString(40, y, "Ante cualquier consulta comunicate al 0810-555-0000. Este resumen es sintetico (prueba).")
    c.showPage()
    c.save()


def expected(st):
    ars, usd = totals(st)
    return {
        "closingDate": st["closing"], "dueDate": st["due"],
        "nextClosingDate": st["nextClosing"], "nextDueDate": st["nextDue"],
        "totalArs": ars, "totalUsd": usd, "minimumArs": st["minimum"],
        "previousArs": st["prevArs"], "previousUsd": st["prevUsd"],
        "paymentsArs": st["payArs"], "paymentsUsd": st["payUsd"],
        "lines": [
            {"date": l["date"], "description": l["desc"],
             "installmentNo": l["cuota"][0] if l["cuota"] else None,
             "installmentCount": l["cuota"][1] if l["cuota"] else None,
             "currency": l["cur"], "amount": l["amount"], "kind": l["kind"], "categoryId": l["cat"]}
            for l in st["lines"]
        ],
    }


os.makedirs(OUT, exist_ok=True)
exp = {}
for st in STATEMENTS:
    draw(st, os.path.join(OUT, st["file"] + ".pdf"))
    exp[st["file"]] = expected(st)
draw(STATEMENTS[0], os.path.join(OUT, "visa-galicia-clave.pdf"), password="30111222")
draw(STATEMENTS[0], os.path.join(OUT, "escaneado.pdf"), scanned=True)
with open(os.path.join(OUT, "expected.json"), "w") as fh:
    json.dump(exp, fh, indent=1, ensure_ascii=False)
print("ok", sorted(os.listdir(OUT)))
