// Vercel serverless function: receives the contact form and relays it via Resend.
// Requires RESEND_API_KEY in the Vercel project environment.
// Optional: RESEND_FROM (sender on a Resend-verified domain), INQUIRY_TO (recipient).

const FROM = process.env.RESEND_FROM || 'GRUB FORGE <onboarding@resend.dev>';
const TO = process.env.INQUIRY_TO || 'jeremy@grubforge.com';

const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.json({ error: 'method not allowed' });
  }

  const b = req.body || {};

  // honeypot: bots fill it, humans never see it — pretend success
  if (b._honey) {
    res.statusCode = 200;
    return res.json({ ok: true });
  }

  const name = String(b.name || '').trim().slice(0, 200);
  const email = String(b.email || '').trim().slice(0, 200);
  const interest = String(b.interest || '').trim().slice(0, 120);
  const message = String(b.message || '').trim().slice(0, 5000);

  if (!name || !message || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    res.statusCode = 400;
    return res.json({ error: 'missing or invalid fields' });
  }

  const rows = [['Name', name], ['Email', email], ['Interest', interest || '—'], ['Message', message]]
    .map(([k, v]) =>
      `<tr><td style="padding:8px 14px;border:1px solid #ddd;font-weight:bold;vertical-align:top">${k}</td>` +
      `<td style="padding:8px 14px;border:1px solid #ddd;white-space:pre-wrap">${esc(v)}</td></tr>`)
    .join('');

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM,
      to: [TO],
      reply_to: email,
      subject: `New inquiry — ${interest || 'general'} — ${name}`,
      html: `<h2 style="font-family:sans-serif">New inquiry from grubforge.com</h2>` +
            `<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${rows}</table>`
    })
  });

  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    console.error('Resend error', r.status, detail);
    res.statusCode = 502;
    return res.json({ error: 'send failed', resend: r.status, detail: detail.slice(0, 300) });
  }

  // no-JS fallback: the form posts urlencoded and expects a page back
  if ((req.headers['content-type'] || '').includes('application/x-www-form-urlencoded')) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(
      '<!doctype html><meta charset="utf-8"><title>Received — GRÜB FORGE</title>' +
      '<body style="background:#0A0A0B;color:#EDEAE4;font-family:monospace;display:grid;place-items:center;height:100vh;margin:0">' +
      '<div style="text-align:center"><h1 style="color:#FF4D00">RECEIVED.</h1>' +
      '<p>Real reply within one business day.</p>' +
      '<a href="/" style="color:#FF4D00">&larr; Back to grubforge.com</a></div>'
    );
  }

  res.statusCode = 200;
  return res.json({ ok: true });
};
