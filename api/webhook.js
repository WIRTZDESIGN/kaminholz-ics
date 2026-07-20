export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      message: "Webhook läuft"
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      message: "Methode nicht erlaubt"
    });
  }

  try {
    const raw = req.body || {};
    const data = raw?.payload?.data || raw?.data || raw;

    const name = data.Name || data.name || "";
    const email = data.Email || data.email || "";
    const telefon = data.Telefon || data.telefon || "";
    const adresse = data.Adresse || data.adresse || "";
    const plz = data.PLZ || data.plz || "";
    const ort = data.Ort || data.ort || "";
    const mitteilung = data.Mitteilung || data.mitteilung || "";
    const anfrage = data.Anfrage || data.anfrage || "";

    const discountAmountRaw =
      data.discount_amount ||
      data.Discount_amount ||
      data.Rabatt ||
      "";

    const totalBeforeDiscountRaw =
      data.total_before_discount ||
      data.Total_before_discount ||
      "";

    const created = new Date();
    const end = new Date(created.getTime() + 60 * 60 * 1000);

    const deliveryUrl =
      process.env.DELIVERY_URL ||
      "https://diekleinekaminholzfabrik.de/lieferung";

    function formatICSDate(date) {
      return date
        .toISOString()
        .replace(/[-:]/g, "")
        .split(".")[0] + "Z";
    }

    function escapeICS(text = "") {
      return String(text)
        .replace(/\\/g, "\\\\")
        .replace(/\r?\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
    }

    function escapeCSV(value = "") {
      return `"${String(value).replace(/"/g, '""')}"`;
    }

    function escapeHtml(value = "") {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function nl2br(value = "") {
      return escapeHtml(value).replace(/\r?\n/g, "<br>");
    }

    function parseEuro(value = "") {
      let cleaned = String(value || "")
        .trim()
        .replace(/[^\d,.-]/g, "");

      if (!cleaned) {
        return 0;
      }

      /*
       * Unterstützt beispielsweise:
       * 1.234,56
       * 1234,56
       * 1234.56
       */
      if (cleaned.includes(",") && cleaned.includes(".")) {
        cleaned = cleaned
          .replace(/\./g, "")
          .replace(",", ".");
      } else if (cleaned.includes(",")) {
        cleaned = cleaned.replace(",", ".");
      }

      const parsed = Number(cleaned);

      return Number.isFinite(parsed) ? parsed : 0;
    }

    function formatEuro(value = 0) {
      return Number(value || 0)
        .toFixed(2)
        .replace(".", ",");
    }

    const start = formatICSDate(created);
    const endTime = formatICSDate(end);
    const timestamp = formatICSDate(created);

    const fullAddress = `${adresse}, ${plz} ${ort}`
      .trim()
      .replace(/^,\s*/, "");

    const mapsQuery = `${adresse} ${plz} ${ort}`.trim();

    const maps =
      `https://maps.google.com/?q=${encodeURIComponent(mapsQuery)}`;

    const orderNumber =
      (anfrage.split("|")[0] || "")
        .replace("#", "")
        .trim() ||
      `KF-${created.getFullYear()}-${Date.now()}`;

    const gesamtpreis =
      anfrage.match(/Gesamt:\s*([\d.,]+)/i)?.[1] || "";

    const mwstSatz = 7;

    const brutto = parseEuro(gesamtpreis);
    const rabatt = parseEuro(discountAmountRaw);

    const gesamtVorRabatt =
      parseEuro(totalBeforeDiscountRaw) ||
      brutto + rabatt;

    const netto =
      brutto > 0
        ? brutto / (1 + mwstSatz / 100)
        : 0;

    const mwstBetrag =
      brutto > 0
        ? brutto - netto
        : 0;

    const rabattZeile =
      rabatt > 0
        ? `Rabatt: -${formatEuro(rabatt)} EUR`
        : "";

    const description = [
      "Bestellung:",
      anfrage,
      "",
      `Gesamt vor Rabatt: ${formatEuro(gesamtVorRabatt)} EUR`,
      rabattZeile || null,
      `Gesamt: ${formatEuro(brutto)} EUR`,
      "",
      `Telefon: ${telefon}`,
      `E-Mail: ${email}`,
      `Mitteilung: ${mitteilung}`,
      "",
      "Navigation:",
      maps
    ]
      .filter(Boolean)
      .join("\n");

    const ics = `BEGIN:VCALENDAR
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:PUBLISH
PRODID:-//Wirtz Design//Kaminholzfabrik//DE
BEGIN:VEVENT
UID:${escapeICS(`${orderNumber}-${created.getTime()}@kaminholzfabrik`)}
DTSTAMP:${timestamp}
SUMMARY:${escapeICS(`${orderNumber} - Kaminholz Lieferung`)}
DTSTART:${start}
DTEND:${endTime}
DESCRIPTION:${escapeICS(description)}
LOCATION:${escapeICS(fullAddress)}
END:VEVENT
END:VCALENDAR`;

    const csvRows = [
      [
        "Bestellnummer",
        "Datum",
        "Name",
        "E-Mail",
        "Telefon",
        "Adresse",
        "PLZ",
        "Ort",
        "Mitteilung",
        "Bestellung",
        "Gesamt vor Rabatt",
        "Rabatt",
        "MwSt.-Satz",
        "Netto",
        "MwSt.-Betrag",
        "Brutto"
      ],
      [
        orderNumber,
        created.toLocaleString("de-DE", {
          timeZone: "Europe/Berlin"
        }),
        name,
        email,
        telefon,
        adresse,
        plz,
        ort,
        mitteilung,
        anfrage,
        formatEuro(gesamtVorRabatt),
        rabatt > 0
          ? `-${formatEuro(rabatt)}`
          : formatEuro(0),
        `${mwstSatz}%`,
        formatEuro(netto),
        formatEuro(mwstBetrag),
        formatEuro(brutto)
      ]
    ];

    /*
     * Das BOM am Anfang sorgt dafür, dass Excel
     * Umlaute und Sonderzeichen korrekt erkennt.
     */
    const csv =
      "\uFEFF" +
      csvRows
        .map((row) => row.map(escapeCSV).join(";"))
        .join("\r\n");

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeTelefon = escapeHtml(telefon);
    const safeAdresse = escapeHtml(adresse);
    const safePlz = escapeHtml(plz);
    const safeOrt = escapeHtml(ort);
    const safeMitteilung = nl2br(mitteilung);
    const safeAnfrage = nl2br(anfrage);
    const safeOrderNumber = escapeHtml(orderNumber);

    const sellerHtml = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#333;">

  <h2>Neue Bestellung f&uuml;r Kaminholz</h2>

  <p>
    <strong>Bestellnummer:</strong><br>
    ${safeOrderNumber}
  </p>

  <p>
    <strong>Name:</strong> ${safeName}<br>
    <strong>E-Mail:</strong>
    <a href="mailto:${safeEmail}">${safeEmail}</a><br>
    <strong>Telefon:</strong>
    <a href="tel:${safeTelefon}">${safeTelefon}</a><br>
    <strong>Adresse:</strong> ${safeAdresse}<br>
    <strong>PLZ:</strong> ${safePlz}<br>
    <strong>Ort:</strong> ${safeOrt}
  </p>

  <p>
    <strong>Mitteilung:</strong><br>
    ${safeMitteilung || "Keine Mitteilung"}
  </p>

  <p>
    <strong>Bestellung:</strong><br>
    ${safeAnfrage}
  </p>

  <p>
    <strong>Gesamt vor Rabatt:</strong>
    ${formatEuro(gesamtVorRabatt)} &euro;<br>

    ${
      rabatt > 0
        ? `<strong>Rabatt:</strong> -${formatEuro(rabatt)} &euro;<br>`
        : ""
    }

    <strong>Netto:</strong>
    ${formatEuro(netto)} &euro;<br>

    <strong>MwSt. ${mwstSatz}%:</strong>
    ${formatEuro(mwstBetrag)} &euro;<br>

    <strong>Brutto:</strong>
    ${formatEuro(brutto)} &euro;
  </p>

  <p>
    <strong>Navigation:</strong><br>
    <a href="${maps}" target="_blank">
      Route in Google Maps &ouml;ffnen
    </a>
  </p>

</div>
`;

    const customerHtml = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#333;max-width:700px;margin:0 auto;">

  <div style="text-align:center;margin-bottom:30px;">
    <img
      src="https://cdn.prod.website-files.com/691d61de258d5f409c8e82c3/6a5e19b83eaa6c2a585cee07_kaminholzfabrik-logo-email.png"
      alt="Die kleine Kaminholzfabrik"
      width="260"
      style="display:inline-block;max-width:260px;width:100%;height:auto;border:0;"
    >
  </div>

  <h2 style="margin:0 0 20px;color:#2d3b28;">
    Vielen Dank f&uuml;r Ihre Bestellung!
  </h2>

  <p>Hallo ${safeName},</p>

  <p>
    vielen Dank f&uuml;r Ihre Bestellung bei der
    <strong>kleinen Kaminholzfabrik</strong>.
    Ihre Bestellung ist erfolgreich bei uns eingegangen.
  </p>

  <p>
    Wir pr&uuml;fen nun unsere Tourenplanung und melden uns
    anschlie&szlig;end mit einem konkreten Liefertermin bei Ihnen.
    Bitte beachten Sie, dass diese E-Mail zun&auml;chst eine
    <strong>Eingangsbest&auml;tigung</strong> Ihrer Bestellung ist.
  </p>

  <div style="background:#f6f3ec;border-left:5px solid #8b5a2b;padding:18px 20px;margin:30px 0;border-radius:6px;">

    <div style="font-size:13px;color:#666;text-transform:uppercase;letter-spacing:1px;">
      Bestellnummer
    </div>

    <div style="font-size:24px;font-weight:bold;color:#2d3b28;">
      ${safeOrderNumber}
    </div>

  </div>

  <p>
    <strong>Ihre Bestellung:</strong><br>
    ${safeAnfrage}
  </p>

  ${
    rabatt > 0
      ? `
        <p>
          <strong>Rabatt:</strong><br>
          - ${formatEuro(rabatt)} &euro;
        </p>
      `
      : ""
  }

  <p style="font-size:20px;">
    <strong>Gesamtbetrag:</strong><br>
    ${formatEuro(brutto)} &euro;
  </p>

  <hr style="margin:35px 0;border:0;border-top:1px solid #ddd;">

  <h3 style="margin-bottom:15px;color:#2d3b28;">
    So geht es jetzt weiter
  </h3>

  <p>
    &#10004;&nbsp; Wir pr&uuml;fen Ihre Bestellung.<br>
    &#10004;&nbsp; Wir planen die optimale Liefertour.<br>
    &#10004;&nbsp; Anschlie&szlig;end erhalten Sie Ihren Liefertermin per E-Mail oder telefonisch.
  </p>

  <p>
    Weitere Informationen zum Lieferablauf, zu den Liefergebieten
    und Antworten auf h&auml;ufig gestellte Fragen finden Sie hier:
  </p>

  <p style="margin:25px 0;">
    <a
      href="${deliveryUrl}"
      target="_blank"
      style="display:inline-block;background:#8b5a2b;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;"
    >
      Informationen zur Lieferung
    </a>
  </p>

  <p>
    Sollten Sie zwischenzeitlich Fragen zu Ihrer Bestellung haben,
    k&ouml;nnen Sie jederzeit auf diese E-Mail antworten.
    Wir helfen Ihnen gerne weiter.
  </p>

  <hr style="margin:35px 0;border:0;border-top:1px solid #ddd;">

  <p style="font-size:14px;color:#666;line-height:1.7;">

    <strong>Die kleine Kaminholzfabrik</strong><br>
    Ulrich Br&uuml;ggemann<br>
    Drievweg 7<br>
    46514 Schermbeck

    <br><br>

    <a
      href="https://diekleinekaminholzfabrik.de/impressum"
      target="_blank"
      style="color:#666;"
    >
      Impressum
    </a>

    &nbsp;|&nbsp;

    <a
      href="https://diekleinekaminholzfabrik.de/datenschutzerklarung"
      target="_blank"
      style="color:#666;"
    >
      Datenschutz
    </a>

  </p>

</div>
`;

    const sellerResponse = await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: process.env.MAIL_FROM,
          to: [process.env.MAIL_TO],
          subject:
            `Neue Kaminholz-Bestellung – ${name || "ohne Namen"}`,
          html: sellerHtml,
          attachments: [
            {
              filename: `${orderNumber}.ics`,
              content: Buffer
                .from(ics, "utf-8")
                .toString("base64"),
              contentType: "text/calendar; charset=utf-8"
            },
            {
              filename: `${orderNumber}.csv`,
              content: Buffer
                .from(csv, "utf-8")
                .toString("base64"),
              contentType: "text/csv; charset=utf-8"
            }
          ]
        })
      }
    );

    const sellerResult = await sellerResponse.json();

    if (!sellerResponse.ok) {
      console.error("Resend-Verkäuferfehler:", sellerResult);

      return res.status(502).json({
        ok: false,
        message:
          "Die interne Bestellmail konnte nicht versendet werden.",
        sellerResult
      });
    }

    let customerResult = null;

    if (email) {
      const customerPayload = {
        from: process.env.MAIL_FROM,
        to: [email],
        subject:
          `Ihre Kaminholz-Bestellung ${orderNumber}`,
        html: customerHtml
      };

      /*
       * Optional:
       * In Vercel MAIL_REPLY_TO hinterlegen,
       * damit Antworten beim Kunden ankommen.
       */
      if (process.env.MAIL_REPLY_TO) {
        customerPayload.reply_to =
          process.env.MAIL_REPLY_TO;
      }

      const customerResponse = await fetch(
        "https://api.resend.com/emails",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(customerPayload)
        }
      );

      customerResult = await customerResponse.json();

      if (!customerResponse.ok) {
        console.error(
          "Resend-Kundenfehler:",
          customerResult
        );

        return res.status(502).json({
          ok: false,
          message:
            "Die Bestellung wurde empfangen, aber die Kundenbestätigung konnte nicht versendet werden.",
          sellerResult,
          customerResult
        });
      }
    }

    return res.status(200).json({
      ok: true,
      sellerResult,
      customerResult,
      debug: {
        receivedKeys: Object.keys(raw || {}),
        dataKeys: Object.keys(data || {}),
        orderNumber,
        gesamtpreis,
        gesamtVorRabatt:
          formatEuro(gesamtVorRabatt),
        rabatt: formatEuro(rabatt),
        netto: formatEuro(netto),
        mwstBetrag:
          formatEuro(mwstBetrag),
        brutto: formatEuro(brutto)
      }
    });
  } catch (error) {
    console.error("Webhook-Fehler:", error);

    return res.status(500).json({
      ok: false,
      message:
        "Beim Verarbeiten der Bestellung ist ein Fehler aufgetreten.",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined
    });
  }
}