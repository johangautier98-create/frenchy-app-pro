// ═══════════════════════════════════════════════════════════════
// OAUTH CAPTURE — Échange le code OAuth Shopify contre un access token
// Usage : installer l'app sur le store FL, puis récupérer le token ici
// ═══════════════════════════════════════════════════════════════

module.exports = async function handler(req, res) {
  const { code, shop, hmac, state } = req.query;

  if (!code || !shop) {
    return res.status(400).send(`
      <h2>Paramètres manquants</h2>
      <p>code: ${code || 'MANQUANT'}</p>
      <p>shop: ${shop || 'MANQUANT'}</p>
      <p>Tous les paramètres: ${JSON.stringify(req.query)}</p>
    `);
  }

  const clientId     = process.env.BLOG_API_CLIENT_ID     || '';
  const clientSecret = process.env.BLOG_API_CLIENT_SECRET || '';

  if (!clientId || !clientSecret) {
    return res.status(500).send(`
      <h2>Config manquante</h2>
      <p>BLOG_API_CLIENT_ID et BLOG_API_CLIENT_SECRET doivent être configurés dans Vercel.</p>
      <p>Client ID dans le Dev Dashboard : 55d657e065e903791b54638f255f5456</p>
    `);
  }

  try {
    const tokenResp = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     clientId,
        client_secret: clientSecret,
        code
      })
    });

    const data = await tokenResp.json();

    if (!tokenResp.ok || !data.access_token) {
      return res.status(400).send(`
        <h2>Erreur échange token</h2>
        <pre>${JSON.stringify(data, null, 2)}</pre>
      `);
    }

    const token  = data.access_token;
    const scopes = data.scope;

    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Token Shopify obtenu</title></head>
      <body style="font-family:monospace;padding:20px;background:#1a1a1a;color:#00ff00">
        <h2 style="color:#fff">✅ Token Shopify obtenu pour ${shop}</h2>
        <p><strong>Scopes :</strong> ${scopes}</p>
        <p><strong>Token :</strong></p>
        <textarea rows="3" style="width:100%;background:#000;color:#0f0;padding:10px;font-size:14px">${token}</textarea>
        <p style="color:#ff0">👉 Copie ce token et ajoute-le dans Vercel :</p>
        <code>vercel env add SHOPIFY_FL_TOKEN production</code>
        <p style="color:#888;margin-top:20px">Shop: ${shop} | Scopes: ${scopes}</p>
      </body>
      </html>
    `);

  } catch (err) {
    return res.status(500).send(`
      <h2>Erreur</h2>
      <pre>${err.message}</pre>
    `);
  }
};
