export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, message: "Webhook läuft" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false });
  }

  const raw = req.body || {};

  const data =
    raw?.payload?.data ||
    raw?.data ||
    raw;

  const name = data.Name || data.name || "";
  const email = data.Email || data.email || "";
  const telefon = data.Telefon || data.telefon || "";
  const adresse = data.Adresse || data.adresse || "";
  const plz = data.PLZ || data.plz || "";
  const ort = data.Ort || data.ort || "";
  const mitteilung = data.Mitteilung || data.mitteilung || "";
  const anfrage = data.Anfrage || data.anfrage || "";

  const created = new Date();
  const end = new Date(created.getTime() + 60 * 60000);

  function formatICSDate(date) {
    return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  }

  function escapeICS(text = "") {
    return String(text)
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function escapeCSV(value = "") {
    return `"${String(value).replace(/"/g, '""')}"`;
  }

  function parseEuro(value = "") {
    return Number(String(value).replace(/\./g, "").replace(",", "."));
  }

  function formatEuro(value = 0) {
    return value.toFixed(2).replace(".", ",");
  }

  const start = formatICSDate(created);
  const endTime = formatICSDate(end);

  const fullAddress = `${adresse}, ${plz} ${ort}`.trim().replace(/^,\s*/, "");
  const maps = `https://maps.google.com/?q=${encodeURIComponent(
    `${adresse} ${plz} ${ort}`.trim()
  )}`;

  const orderNumber = (anfrage.split("|")[0] || "")
    .replace("#", "")
    .trim() || `KF-${created.getFullYear()}-${Date.now()}`;

  const gesamtpreis = anfrage.match(/Gesamt:\s*([\d.,]+)/)?.[1] || "";

  const mwstSatz = 7;
  const brutto = parseEuro(gesamtpreis);
  const netto = brutto ? brutto / (1 + mwstSatz / 100) : 0;
  const mwstBetrag = brutto ? brutto - netto : 0;

  const description = [
    "Bestellung:",
    anfrage,
    "",
    `Telefon: tel:${telefon}`,
    `E-Mail: ${email}`,
    `Mitteilung: ${mitteilung}`,
    "",
    "Navigation:",
    maps
  ].join("\n");

  const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Wirtz Design//Kaminholzfabrik//DE
BEGIN:VEVENT
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
      "Email",
      "Telefon",
      "Adresse",
      "PLZ",
      "Ort",
      "Mitteilung",
      "Bestellung",
      "MwSt-Satz",
      "Netto",
      "MwSt-Betrag",
      "Brutto"
    ],
    [
      orderNumber,
      created.toLocaleString("de-DE", { timeZone: "Europe/Berlin" }),
      name,
      email,
      telefon,
      adresse,
      plz,
      ort,
      mitteilung,
      anfrage,
      `${mwstSatz}%`,
      formatEuro(netto),
      formatEuro(mwstBetrag),
      formatEuro(brutto)
    ]
  ];

  const csv = csvRows
    .map(row => row.map(escapeCSV).join(";"))
    .join("\n");

  const html = `
<h2>Neue Bestellung f&uuml;r Kaminholz</h2>

<b>Name:</b> ${name}<br>
<b>Email:</b> ${email}<br>
<b>Telefon:</b> <a href="tel:${telefon}">${telefon}</a><br>
<b>Adresse:</b> ${adresse}<br>
<b>PLZ:</b> ${plz}<br>
<b>Ort:</b> ${ort}<br>
<b>Mitteilung:</b> ${mitteilung}<br><br>

<b>Bestellung:</b><br>
${anfrage}<br><br>

<b>Netto:</b> ${formatEuro(netto)} &euro;<br>
<b>MwSt. ${mwstSatz}%:</b> ${formatEuro(mwstBetrag)} &euro;<br>
<b>Brutto:</b> ${formatEuro(brutto)} &euro;<br><br>

<b>Navigation:</b><br>
<a href="${maps}" target="_blank">${maps}</a>
`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [process.env.MAIL_TO],
      subject: `Neue Kaminholz Bestellung - ${name || "ohne Namen"}`,
      html,
      attachments: [
        {
          filename: `${orderNumber}.ics`,
          content: Buffer.from(ics, "utf-8").toString("base64"),
          contentType: "text/calendar"
        },
        {
          filename: `${orderNumber}.csv`,
          content: Buffer.from(csv, "utf-8").toString("base64"),
          contentType: "text/csv"
        }
      ]
    })
  });

  const result = await response.json();

  res.status(200).json({
    ok: true,
    result,
    debug: {
      receivedKeys: Object.keys(raw || {}),
      dataKeys: Object.keys(data || {}),
      orderNumber,
      gesamtpreis,
      netto: formatEuro(netto),
      mwstBetrag: formatEuro(mwstBetrag),
      brutto: formatEuro(brutto)
    }
  });
}