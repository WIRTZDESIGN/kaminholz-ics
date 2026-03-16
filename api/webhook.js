export default async function handler(req, res) {

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, message: "Webhook läuft" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false });
  }

  const data = req.body;

  const name = data.Name || "";
  const email = data.Email || "";
  const telefon = data.Telefon || "";
  const adresse = data.Adresse || "";
  const plz = data.PLZ || "";
  const ort = data.Ort || "";
  const mitteilung = data.Mitteilung || "";
  const anfrage = data.Anfrage || "";

  const created = new Date();
  const end = new Date(created.getTime() + 30 * 60000); // +30 Minuten

  function formatICSDate(date) {
    return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  }

  const start = formatICSDate(created);
  const endTime = formatICSDate(end);

  const maps = `https://maps.google.com/?q=${encodeURIComponent(`${adresse} ${plz} ${ort}`)}`;

  const ics = `
BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Kaminholz Anfrage – ${name}
DTSTART:${start}
DTEND:${endTime}
DESCRIPTION:Bestellung:\\n${anfrage}\\n\\nTelefon: ${telefon}\\nE-Mail: ${email}\\nMitteilung: ${mitteilung}\\n\\nNavigation:\\n${maps}
LOCATION:${adresse}, ${plz} ${ort}
END:VEVENT
END:VCALENDAR
`;

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
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [process.env.MAIL_TO],
      subject: "Neue Kaminholz Anfrage",
      html: html,
      attachments: [
        {
          filename: "termin.ics",
          content: Buffer.from(ics).toString("base64")
        }
      ]
    })
  });

  const result = await response.json();

  res.status(200).json({
    ok: true,
    result
  });

}