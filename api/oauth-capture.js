// ═══════════════════════════════════════════════════════════════
// OAUTH CAPTURE — Échange le code OAuth Shopify contre un access token
// Usage : installer l'app sur le store, puis récupérer le token ici
// ═══════════════════════════════════════════════════════════════

const crypto = require('crypto');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Vérifie la signature HMAC Shopify pour valider que la requête vient bien de Shopify
function verifyShopifyHmac(query, secret) {
  const { hmac, signature, ...rest } = query;
  if (!hmac) return false;
  const message = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join('&');
  const digest  = crypto.createHmac('sha256', secret).update(message).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(hmac, 'hex'));
}

module.exports = async function handler(req, res) {
  const { code, shop, hmac } = req.query;

  // Validation stricte du shop — uniquement *.myshopify.com pour éviter le SSRF
  if (!shop || !/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)) {
    return res.status(400).type('text/plain').send('Paramètre shop invalide ou manquant.');
  }

  if (!code) {
    return res.status(400).type('text/plain').send('Paramètre code manquant.');
  }

  const clientId     = process.env.BLOG_API_CLIENT_ID     || '';
  const clientSecret = process.env.BLOG_API_CLIENT_SECRET || '';

  if (!clientId || !clientSecret) {
    return res.status(500).type('text/plain').send('BLOG_API_CLIENT_ID et BLOG_API_CLIENT_SECRET manquants dans Vercel.');
  }

  // Vérification HMAC Shopify obligatoire — rejette toute requête non signée par Shopify
  if (!hmac || !verifyShopifyHmac(req.query, clientSecret)) {
    return res.status(403).type('text/plain').send('Signature HMAC invalide ou absente.');
  }

  try {
    const tokenResp = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
    });

    const data = await tokenResp.json();

    if (!tokenResp.ok || !data.access_token) {
      const errMsg = escapeHtml(JSON.stringify(data, null, 2));
      return res.status(400).send(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
        <h2>Erreur &eacute;change token</h2><pre>${errMsg}</pre>
      </body></html>`);
    }

    const token  = data.access_token;
    const scopes = escapeHtml(data.scope || '');
    const safeShop = escapeHtml(shop);

    return res.status(200).send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Token Shopify obtenu</title></head>
<body style="font-family:monospace;padding:20px;background:#1a1a1a;color:#00ff00">
  <h2 style="color:#fff">Token Shopify obtenu pour ${safeShop}</h2>
  <p><strong>Scopes :</strong> ${scopes}</p>
  <p><strong>Token (copie-le) :</strong></p>
  <textarea rows="3" style="width:100%;background:#000;color:#0f0;padding:10px;font-size:14px">${escapeHtml(token)}</textarea>
  <p style="color:#ff0">Ajoute ce token dans Vercel :</p>
  <code>vercel env add SHOPIFY_FL_TOKEN production</code>
  <p style="color:#888;margin-top:20px">Shop: ${safeShop} | Scopes: ${scopes}</p>
</body>
</html>`);

  } catch (err) {
    return res.status(500).type('text/plain').send(`Erreur: ${escapeHtml(err.message)}`);
  }
};
