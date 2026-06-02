// Frenchy Leurres — API commandes Shopify
// Vercel env vars requis:
//   SHOPIFY_RAVAGER_TOKEN   shpat_...
//   SHOPIFY_FL_TOKEN        shpat_...

module.exports = async function handler(req, res) {
  const allowedOrigins = ['https://frenchy-app-pro-git-master-johangautier98-creates-projects.vercel.app','https://frenchy-app-pro.vercel.app'];
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigins.includes(origin) ? origin : allowedOrigins[0]);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'x-admin-key,Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Methode non autorisee' });
  // Auth — fail-closed : si ADMIN_API_KEY est défini, il DOIT correspondre
  const crypto = require('crypto');
  const adminKey = process.env.ADMIN_API_KEY;
  if (adminKey) {
    const presented = req.headers['x-admin-key'] || '';
    const a = Buffer.from(presented.padEnd(adminKey.length, '\0'));
    const b = Buffer.from(adminKey);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ ok: false, error: 'Non autorise' });
    }
  }

  const store = (req.query.store || '').toLowerCase();
  const limit = Math.min(parseInt(req.query.limit) || 50, 250);
  // Validation stricte du status
  const ALLOWED_STATUS = new Set(['any','open','closed','cancelled']);
  const status = ALLOWED_STATUS.has(req.query.status) ? req.query.status : 'any';
  // Validation stricte du page_info
  const raw_page_info = req.query.page_info || '';
  if (raw_page_info && !/^[A-Za-z0-9_=-]+$/.test(raw_page_info)) {
    return res.status(400).json({ ok: false, error: 'page_info invalide' });
  }
  const page_info = raw_page_info;

  let shopDomain, token;

  if (store === 'ravager') {
    shopDomain = 'mu7nv0-me.myshopify.com';
    token = process.env.SHOPIFY_RAVAGER_TOKEN;
  } else if (store === 'frenchy') {
    shopDomain = 'b761b5-b6.myshopify.com';
    token = process.env.SHOPIFY_FL_TOKEN;
  } else {
    return res.status(400).json({ ok: false, error: 'Parametre store manquant (ravager ou frenchy)' });
  }

  if (!token) return res.status(500).json({ ok: false, error: 'Token Shopify manquant dans les variables Vercel.' });

  try {
    // Construction sécurisée de l'URL avec URL API
    const u = new URL(`https://${shopDomain}/admin/api/2024-01/orders.json`);
    u.searchParams.set('limit', String(limit));
    u.searchParams.set('status', status);
    u.searchParams.set('fields', 'id,order_number,created_at,financial_status,fulfillment_status,total_price,currency,email,billing_address,line_items,tags,note');
    if (page_info) u.searchParams.set('page_info', page_info);
    const url = u.toString();

    const r = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ ok: false, error: `Shopify API error ${r.status}: ${err}` });
    }

    const data = await r.json();

    // Extract pagination link
    const linkHeader = r.headers.get('link') || '';
    let nextPageInfo = null;
    const nextMatch = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    if (nextMatch) nextPageInfo = nextMatch[1];

    return res.status(200).json({
      ok: true,
      store,
      orders: data.orders || [],
      count: (data.orders || []).length,
      next_page_info: nextPageInfo
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
