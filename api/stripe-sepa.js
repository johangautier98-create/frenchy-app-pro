// Frenchy Leurres — prépare le mandat SEPA d'un client pro dans Stripe (jamais de suppression).
// POST { nom, responsable, email, tel, siret } → { ok, customer, lien } : lien permanent à envoyer au magasin.

const crypto = require('crypto');
const { requireUser } = require('./_lib/auth');

function stripeKey() { return (process.env.STRIPE_SECRET_KEY || '').trim(); }

function signer(cus) {
  return crypto.createHmac('sha256', stripeKey()).update('sepa:' + cus).digest('base64url').slice(0, 32);
}

async function stripe(path, method, params) {
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const url = 'https://api.stripe.com/v1' + path + (method === 'GET' && body ? '?' + body : '');
  const r = await fetch(url, {
    method,
    headers: { Authorization: 'Bearer ' + stripeKey(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : body
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (j.error && j.error.message) || ('Erreur Stripe ' + r.status);
    throw new Error(r.status === 401 ? 'Clé Stripe refusée (vérifie STRIPE_SECRET_KEY dans Vercel).' : msg);
  }
  return j;
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Méthode non autorisée' });
  if (!(await requireUser(req, res))) return;
  if (!stripeKey()) return res.status(500).json({ ok: false, error: 'Clé Stripe manquante : ajoute STRIPE_SECRET_KEY dans Vercel.' });

  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Email du client invalide.' });

  try {
    const found = await stripe('/customers', 'GET', { email, limit: '1' });
    let cus = found.data && found.data[0];
    let action = 'existant';
    if (!cus) {
      const p = { email, name: String(b.nom || b.responsable || email).slice(0, 200), 'preferred_locales[0]': 'fr' };
      if (b.tel) p.phone = String(b.tel).slice(0, 20);
      if (b.responsable) p['metadata[responsable]'] = String(b.responsable).slice(0, 200);
      if (b.siret) p['metadata[siret]'] = String(b.siret).slice(0, 30);
      p['metadata[source]'] = 'frenchy-app-pro';
      cus = await stripe('/customers', 'POST', p);
      action = 'cree';
    }
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'frenchy-app-pro.vercel.app';
    const lien = `https://${host}/api/sepa?c=${encodeURIComponent(cus.id)}&t=${signer(cus.id)}`;
    return res.status(200).json({ ok: true, action, customer: cus.id, lien });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.message });
  }
}

module.exports = handler;
module.exports.signer = signer;
module.exports.stripe = stripe;
