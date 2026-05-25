// Vercel endpoint — envoi email promo code RAVAGER via Gmail
// Env vars: GMAIL_USER, GMAIL_APP_PASSWORD

const nodemailer = require('nodemailer');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { to_email, prenom, code_promo, discount } = req.body || {};

  if (!to_email || !prenom || !code_promo) {
    return res.status(400).json({ error: 'Champs manquants: to_email, prenom, code_promo' });
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return res.status(500).json({ error: 'GMAIL_USER ou GMAIL_APP_PASSWORD manquant dans Vercel' });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#04060d;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#04060d;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

        <!-- Header -->
        <tr><td align="center" style="padding-bottom:32px">
          <h1 style="color:#ffd700;font-size:32px;letter-spacing:6px;margin:0;font-weight:900">RAVAGER</h1>
          <p style="color:#ff2a7f;font-size:10px;letter-spacing:4px;margin:6px 0 0;text-transform:uppercase">Leurres Haute Performance</p>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#0a0d18;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:40px;text-align:center">
          <p style="color:#8b90a0;font-size:15px;margin:0 0 6px">Bonjour <strong style="color:#ffffff">${prenom}</strong> 👋</p>
          <p style="color:#ffffff;font-size:17px;line-height:1.6;margin:0 0 32px">
            Félicitations ! Vous avez remporté<br>
            <strong style="color:#ffd700;font-size:22px">${discount}% de réduction</strong><br>
            sur votre prochaine commande RAVAGER.
          </p>

          <!-- Code promo -->
          <table align="center" cellpadding="0" cellspacing="0" style="margin:0 auto 32px">
            <tr><td style="background:#04060d;border:2px dashed #ffd700;border-radius:12px;padding:20px 40px;text-align:center">
              <p style="color:#8b90a0;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin:0 0 8px">Votre code promo</p>
              <p style="color:#ffd700;font-size:36px;font-weight:900;letter-spacing:8px;margin:0">${code_promo}</p>
            </td></tr>
          </table>

          <!-- CTA -->
          <a href="https://ravager-shad.com" style="display:inline-block;background:linear-gradient(135deg,#ffd700,#c9a227);color:#0a0d18;text-decoration:none;padding:16px 40px;border-radius:100px;font-weight:900;font-size:14px;letter-spacing:2px;text-transform:uppercase">
            Commander maintenant →
          </a>

          <p style="color:#8b90a0;font-size:11px;margin:24px 0 0;line-height:1.7">
            Code valable une fois · Non cumulable avec d'autres offres<br>
            Valable 30 jours à compter de votre participation
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding-top:24px">
          <p style="color:rgba(255,255,255,0.2);font-size:10px;margin:0;line-height:1.6">
            © 2025 RAVAGER · ravager-shad.com<br>
            Vous recevez cet email suite à votre participation au jeu concours RAVAGER.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"RAVAGER 🎣" <${process.env.GMAIL_USER}>`,
      to: to_email,
      subject: `🎣 Votre code promo RAVAGER — ${discount}% de réduction`,
      html
    });
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
