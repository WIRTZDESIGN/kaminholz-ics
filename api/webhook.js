export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, message: "Webhook läuft" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false });
  }

  const raw = req.body || {};

  // Unterstützt direktes JSON UND Webflow Webhook Payload
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
  const end = new Date(created.getTime() + 30 * 60000);

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

  const start = formatICSDate(created);
  const endTime = formatICSDate(end);

  const fullAddress = `${adresse}, ${plz} ${ort}`.trim().replace(/^,\s*/, "");
  const maps = `https://maps.google.com/?q=${encodeURIComponent(
    `${adresse} ${plz} ${ort}`.trim()
  )}`;

  const description = [
    "Bestellung:",
    anfrage,
    "",
    `Telefon: ${telefon}`,
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
SUMMARY:${escapeICS(`Kaminholz Anfrage – ${name}`)}
DTSTART:${start}
DTEND:${endTime}
DESCRIPTION:${escapeICS(description)}
LOCATION:${escapeICS(fullAddress)}
END:VEVENT
END:VCALENDAR`;

  const html = `
<h2>Neue Anfrage für Kaminholz</h2>

<b>Name:</b> ${name}<br>
<b>Email:</b> ${email}<br>
<b>Telefon:</b> ${telefon}<br>
<b>Adresse:</b> ${adresse}<br>
<b>PLZ:</b> ${plz}<br>
<b>Ort:</b> ${ort}<br>
<b>Mitteilung:</b> ${mitteilung}<br><br>

<b>Anfrage:</b><br>
${anfrage}<br><br>

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
      subject: `Neue Kaminholz Anfrage – ${name || "ohne Namen"}`,
      html,
      attachments: [
        {
          filename: "termin.ics",
          content: Buffer.from(ics, "utf-8").toString("base64")
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
      dataKeys: Object.keys(data || {})
    }
  });
}