// Lien public envoyé au magasin : ouvre une page Stripe neuve pour signer le mandat SEPA.
// Le lien est signé (t) : il ne fonctionne que pour le client Stripe prévu.

const crypto = require('crypto');
const { signer, stripe } = require('./stripe-sepa');

function page(res, code, titre, texte) {
  res.status(code).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Frenchy Leurres</title></head><body style="font-family:Arial,sans-serif;background:#f4f4f0;margin:0;padding:40px 16px;text-align:center;color:#1a1a1a">'
    + '<div style="max-width:480px;margin:auto;background:#fff;border-radius:14px;padding:32px 24px">'
    + '<div style="font-size:22px;font-weight:900;color:#b8960a;margin-bottom:16px">FRENCHY LEURRES</div>'
    + '<h1 style="font-size:20px">' + titre + '</h1><p style="color:#555;line-height:1.6">' + texte + '</p></div></body></html>');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.query.merci) return page(res, 200, 'Merci, votre mandat est enregistré ✅', 'Vos prochaines factures Frenchy Leurres pourront être prélevées sur ce compte. Vous pouvez fermer cette page.');
  if (req.query.annule) return page(res, 200, 'Signature interrompue', 'Aucun mandat n’a été enregistré. Vous pouvez reprendre à tout moment avec le même lien reçu par email.');

  const c = String(req.query.c || '');
  const t = String(req.query.t || '');
  if (!/^cus_[A-Za-z0-9]+$/.test(c) || !/^[A-Za-z0-9_-]{32}$/.test(t) || !process.env.STRIPE_SECRET_KEY) {
    return page(res, 400, 'Lien invalide', 'Ce lien n’est pas valide. Contactez Frenchy Leurres au 07 83 21 07 58.');
  }
  const attendu = signer(c);
  if (!crypto.timingSafeEqual(Buffer.from(t), Buffer.from(attendu))) {
    return page(res, 403, 'Lien invalide', 'Ce lien n’est pas valide. Contactez Frenchy Leurres au 07 83 21 07 58.');
  }
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'frenchy-app-pro.vercel.app';
    const s = await stripe('/checkout/sessions', 'POST', {
      mode: 'setup', customer: c, currency: 'eur', locale: 'fr',
      'payment_method_types[0]': 'sepa_debit',
      success_url: `https://${host}/api/sepa?merci=1`,
      cancel_url: `https://${host}/api/sepa?annule=1`
    });
    res.statusCode = 303;
    res.setHeader('Location', s.url);
    return res.end();
  } catch (e) {
    return page(res, 502, 'Service momentanément indisponible', 'Réessayez dans quelques minutes, ou contactez Frenchy Leurres au 07 83 21 07 58.');
  }
};
