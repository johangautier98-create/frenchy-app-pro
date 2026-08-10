// OAuth handler pour l'app "API FL" — Frenchy Leurres commandes
// Env vars requis: FL_API_CLIENT_ID, FL_API_CLIENT_SECRET
// Redirect URI à configurer dans Dev Dashboard: https://frenchy-app-pro.vercel.app/api/shopify-oauth-fl

const crypto = require('crypto');
const SHOP = 'b761b5-b6.myshopify.com';
const REDIRECT_URI = 'https://frenchy-app-pro.vercel.app/api/shopify-oauth-fl';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function verifyShopifyHmac(query, secret) {
  const { hmac, ...params } = query;
  if (!hmac) return false;
  const message = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  const expected = crypto.createHmac('sha256', secret).update(message).digest('hex');
  if (hmac.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const clientId     = (process.env.FL_API_CLIENT_ID || '').replace(/^﻿/, '').trim();
  const clientSecret = (process.env.FL_API_CLIENT_SECRET || '').replace(/^﻿/, '').trim();

  const { code, debug } = req.query;

  if (debug === '1') {
    return res.status(200).json({
      FL_API_CLIENT_ID:     clientId ? `✅ défini (${clientId.substring(0,6)}...)` : '❌ MANQUANT',
      FL_API_CLIENT_SECRET: clientSecret ? '✅ défini' : '❌ MANQUANT'
    });
  }

  if (!code) {
    return res.status(200).send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>FL OAuth — En attente</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #111; color: #fff;
           display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
    .card { background:#1a1a1a; border:1px solid #333; border-radius:12px; padding:40px; max-width:480px; text-align:center; }
    h1 { color:#4caf50; }
    p { color:#aaa; }
  </style>
</head>
<body>
  <div class="card">
    <h1>FL API OAuth</h1>
    <p>Ce endpoint attend le callback Shopify OAuth avec un <code>?code=</code>.</p>
    <p>Installe l'app "API FL" via le Dev Dashboard pour déclencher le flux.</p>
  </div>
</body>
</html>`);
  }

  if (!clientId || !clientSecret) {
    return res.status(500).json({ ok: false, error: 'FL_API_CLIENT_ID ou FL_API_CLIENT_SECRET manquant dans Vercel' });
  }

  if (!verifyShopifyHmac(req.query, clientSecret)) {
    return res.status(403).json({ ok: false, error: 'HMAC Shopify invalide — requête rejetée' });
  }

  try {
    const tokenRes = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
    });

    const rawText = await tokenRes.text();
    let tokenData;
    try {
      tokenData = JSON.parse(rawText);
    } catch(e) {
      return res.status(400).send(`<html><body style="background:#111;color:#fff;font-family:monospace;padding:30px">
        <h2 style="color:#f44">Réponse inattendue de Shopify</h2>
        <pre>${esc(rawText.substring(0, 500))}</pre>
      </body></html>`);
    }

    const token = tokenData.access_token;

    if (!token) {
      return res.status(400).send(`<html><body style="background:#111;color:#fff;font-family:monospace;padding:30px">
        <h2 style="color:#f44">Token non obtenu</h2>
        <pre>${JSON.stringify(tokenData, null, 2)}</pre>
      </body></html>`);
    }

    return res.status(200).send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Token FL obtenu !</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #111; color: #fff;
           display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
    .card { background:#1a1a1a; border:1px solid #2a5c2a; border-radius:12px;
            padding:40px; max-width:600px; width:90%; text-align:center; }
    h1 { color:#4caf50; margin:0 0 12px; }
    p { color:#aaa; margin:0 0 16px; }
    .token-box { background:#0d1f0d; border:2px solid #4caf50; border-radius:8px;
                 padding:16px; word-break:break-all; font-family:monospace;
                 font-size:14px; color:#7fff7f; margin:0 0 20px; cursor:pointer; }
    .note { background:#1c1a00; border:1px solid #cc9900; border-radius:8px;
            padding:14px; font-size:13px; color:#ffcc44; line-height:1.5; }
    .copied { color:#4caf50; font-size:13px; margin-top:8px; display:none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>✅ Token FL obtenu !</h1>
    <p>Copie ce token et ajoute-le dans Vercel :</p>
    <div class="token-box" onclick="copyToken()">${token}</div>
    <div class="copied" id="copied">✅ Copié !</div>
    <div class="note">
      Dans Vercel → Settings → Environment Variables :<br><br>
      <strong>Key :</strong> SHOPIFY_FL_TOKEN<br>
      <strong>Value :</strong> le token ci-dessus
    </div>
  </div>
  <script>
    function copyToken() {
      navigator.clipboard.writeText('${token}').then(() => {
        document.getElementById('copied').style.display = 'block';
      });
    }
  </script>
</body>
</html>`);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
