// Frenchy Leurres — crée ou met à jour un client pro dans la boutique Shopify (jamais de suppression).
// POST { nom, responsable, email, tel, adresse, siret, type, verifier }
// verifier:true = test à blanc : contrôle le jeton et cherche le client, sans rien écrire.

const { requireUser } = require('./_lib/auth');

const SHOP = 'b761b5-b6.myshopify.com';
const API = `https://${SHOP}/admin/api/2025-10`;

function tagsFor(type) {
  if (type === 'cabesto') return ['pro', 'valide', 'cabesto', 'grand-compte', 'frenchy-leurres'];
  if (type === 'vip') return ['pro', 'valide', 'vip', 'frenchy-leurres'];
  return ['pro', 'valide', 'frenchy-leurres'];
}

function phoneE164(tel) {
  const d = String(tel || '').replace(/[^\d+]/g, '');
  if (/^0[1-9]\d{8}$/.test(d)) return '+33' + d.slice(1);
  if (/^\+\d{8,15}$/.test(d)) return d;
  return '';
}

function shopifyError(status, body) {
  if (status === 401) return 'Le jeton Shopify est refusé (périmé ou révoqué).';
  if (status === 403) return "Le jeton Shopify n'a pas le droit de créer des clients (autorisation « write_customers » manquante).";
  const e = body && body.errors;
  if (!e) return `Erreur Shopify ${status}.`;
  if (typeof e === 'string') return e;
  return Object.keys(e).map(k => k + ' : ' + [].concat(e[k]).join(', ')).join(' ; ');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Méthode non autorisée' });
  if (!(await requireUser(req, res))) return;

  const token = (process.env.SHOPIFY_FL_TOKEN || '').replace(/^﻿/, '').trim();
  if (!token) return res.status(500).json({ ok: false, error: 'Jeton Shopify manquant dans Vercel.' });

  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Email du client invalide.' });

  const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' };
  const call = async (path, opt) => {
    const r = await fetch(API + path, Object.assign({ headers: H }, opt || {}));
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, j };
  };

  try {
    const scR = await fetch(`https://${SHOP}/admin/oauth/access_scopes.json`, { headers: H });
    const scJ = await scR.json().catch(() => ({}));
    if (!scR.ok) return res.status(502).json({ ok: false, error: shopifyError(scR.status, scJ) });
    const scopes = (scJ.access_scopes || []).map(s => s.handle);
    const canWrite = scopes.includes('write_customers');

    const found = await call('/customers/search.json?query=' + encodeURIComponent('email:' + email) + '&fields=id,email,tags,tax_exempt,first_name,last_name');
    if (!found.ok) return res.status(502).json({ ok: false, error: shopifyError(found.status, found.j) });
    const existing = (found.j.customers || []).find(c => String(c.email || '').toLowerCase() === email) || null;

    if (b.verifier) {
      return res.status(200).json({ ok: true, verifier: true, canWrite, scopes, existe: !!existing,
        client: existing && { id: existing.id, tags: existing.tags, tax_exempt: existing.tax_exempt } });
    }
    if (!canWrite) return res.status(403).json({ ok: false, error: shopifyError(403) });

    const want = tagsFor(String(b.type || 'pro'));
    const resp = String(b.responsable || '').trim();
    const parts = resp ? resp.split(/\s+/) : [];
    const note = [b.nom && 'Enseigne : ' + b.nom, b.siret && 'SIRET : ' + b.siret].filter(Boolean).join('\n');

    if (existing) {
      const tags = Array.from(new Set(String(existing.tags || '').split(',').map(t => t.trim()).filter(Boolean).concat(want))).join(', ');
      const up = await call('/customers/' + existing.id + '.json', { method: 'PUT',
        body: JSON.stringify({ customer: { id: existing.id, tags, tax_exempt: true } }) });
      if (!up.ok) return res.status(502).json({ ok: false, error: shopifyError(up.status, up.j) });
      return res.status(200).json({ ok: true, action: 'mis_a_jour', id: existing.id, tags });
    }

    const customer = {
      email, first_name: parts[0] || String(b.nom || ''), last_name: parts.slice(1).join(' '),
      tags: want.join(', '), tax_exempt: true, note, verified_email: true
    };
    const ph = phoneE164(b.tel);
    if (ph) customer.phone = ph;
    if (b.adresse || b.nom) customer.addresses = [{ company: String(b.nom || ''), address1: String(b.adresse || ''), country: 'France' }];

    let cr = await call('/customers.json', { method: 'POST', body: JSON.stringify({ customer }) });
    if (!cr.ok && customer.phone && cr.j && cr.j.errors && cr.j.errors.phone) {
      delete customer.phone;
      cr = await call('/customers.json', { method: 'POST', body: JSON.stringify({ customer }) });
    }
    if (!cr.ok) return res.status(502).json({ ok: false, error: shopifyError(cr.status, cr.j) });
    return res.status(200).json({ ok: true, action: 'cree', id: cr.j.customer && cr.j.customer.id, tags: customer.tags });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Shopify injoignable : ' + e.message });
  }
};
