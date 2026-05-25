// Shopify OAuth — capture du token d'accès pour Partners apps
// Env vars requis: BLOG_API_CLIENT_ID, BLOG_API_CLIENT_SECRET
// Redirect URI à configurer dans Partners Dashboard: https://frenchy-app-pro.vercel.app/api/shopify-oauth

const SHOP = 'ravager-1041.myshopify.com';
const SCOPES = 'read_content,write_content';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const clientId     = process.env.BLOG_API_CLIENT_ID;
  const clientSecret = process.env.BLOG_API_CLIENT_SECRET;
  const redirectUri  = 'https://frenchy-app-pro.vercel.app/api/shopify-oauth';

  const { code, shop, debug } = req.query;

  // Debug : vérifier les env vars
  if (debug === '1') {
    return res.status(200).json({
      BLOG_API_CLIENT_ID:     clientId ? `✅ défini (${clientId.substring(0,6)}...)` : '❌ MANQUANT',
      BLOG_API_CLIENT_SECRET: clientSecret ? `✅ défini` : '❌ MANQUANT'
    });
  }

  // Étape 1 : pas encore de code → afficher le bouton d'installation
  if (!code) {
    const installUrl = `https://${SHOP}/admin/oauth/authorize`
      + `?client_id=${clientId}`
      + `&scope=${SCOPES}`
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`;

    return res.status(200).send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>RAVAGER — Connexion Shopify Blog</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #111; color: #fff;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #1a1a1a; border: 1px solid #333; border-radius: 12px;
            padding: 40px; max-width: 480px; text-align: center; }
    h1 { color: #cc2200; margin: 0 0 12px; }
    p { color: #aaa; margin: 0 0 28px; line-height: 1.5; }
    a.btn { display: inline-block; background: linear-gradient(135deg,#8b0000,#cc2200);
            color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px;
            font-weight: bold; font-size: 16px; }
    a.btn:hover { opacity: .85; }
  </style>
</head>
<body>
  <div class="card">
    <h1>RAVAGER Blog</h1>
    <p>Connecter l'application Blog API à la boutique Shopify RAVAGER pour autoriser la publication d'articles.</p>
    <a class="btn" href="${installUrl}">Autoriser l'accès</a>
  </div>
</body>
</html>`);
  }

  // Étape 2 : Shopify renvoie le code → l'échanger contre le token
  if (!clientId || !clientSecret) {
    return res.status(500).send('<h1>BLOG_API_CLIENT_ID ou BLOG_API_CLIENT_SECRET manquant dans Vercel</h1>');
  }

  try {
    const tokenRes = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
    });

    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;

    if (!token) {
      return res.status(400).send(`<h1>Erreur</h1><pre>${JSON.stringify(tokenData)}</pre>`);
    }

    return res.status(200).send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Token obtenu !</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #111; color: #fff;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #1a1a1a; border: 1px solid #2a5c2a; border-radius: 12px;
            padding: 40px; max-width: 600px; width: 90%; text-align: center; }
    h1 { color: #4caf50; margin: 0 0 12px; }
    p { color: #aaa; margin: 0 0 16px; }
    .token-box { background: #0d1f0d; border: 2px solid #4caf50; border-radius: 8px;
                 padding: 16px; word-break: break-all; font-family: monospace;
                 font-size: 14px; color: #7fff7f; margin: 0 0 20px; cursor: pointer; }
    .note { background: #1c1a00; border: 1px solid #cc9900; border-radius: 8px;
            padding: 14px; font-size: 13px; color: #ffcc44; line-height: 1.5; }
    .copied { color: #4caf50; font-size: 13px; margin-top: 8px; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>✅ Token obtenu !</h1>
    <p>Copie ce token et ajoute-le dans Vercel :</p>
    <div class="token-box" onclick="copyToken()">${token}</div>
    <div class="copied" id="copied">✅ Copié !</div>
    <div class="note">
      Dans Vercel → Settings → Environment Variables :<br><br>
      <strong>Key :</strong> SHOPIFY_RAVAGER_CONTENT_TOKEN<br>
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
    return res.status(500).send(`<h1>Erreur</h1><pre>${e.message}</pre>`);
  }
};
