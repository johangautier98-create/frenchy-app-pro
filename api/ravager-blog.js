// RAVAGER — API Blog Creator
// Vercel env vars requis:
//   SHOPIFY_RAVAGER_CONTENT_TOKEN   shpat_... (scopes: write_content, read_content)
//   RAVAGER_BLOG_ID                 ex: 123456789
//   RAVAGER_FB_PAGE_ID              ex: 123456789
//   RAVAGER_FB_PAGE_TOKEN           token page Facebook

const SHOP = 'ravager-1041.myshopify.com';
const API  = 'https://' + SHOP + '/admin/api/2024-01';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token   = process.env.SHOPIFY_RAVAGER_CONTENT_TOKEN;
  const blogId  = process.env.RAVAGER_BLOG_ID;
  const fbPageId    = process.env.RAVAGER_FB_PAGE_ID;
  const fbPageToken = process.env.RAVAGER_FB_PAGE_TOKEN;

  if (!token)  return res.status(500).json({ ok: false, error: 'SHOPIFY_RAVAGER_CONTENT_TOKEN manquant' });
  if (!blogId) return res.status(500).json({ ok: false, error: 'RAVAGER_BLOG_ID manquant' });

  const shopHeaders = {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json'
  };

  // ── GET /api/ravager-blog → liste des articles ──
  if (req.method === 'GET') {
    const limit  = req.query.limit  || 20;
    const action = req.query.action || 'list';

    if (action === 'blogs') {
      // Lister les blogs pour trouver l'ID
      const r = await fetch(`${API}/blogs.json`, { headers: shopHeaders });
      const d = await r.json();
      return res.status(r.status).json(d);
    }

    const r = await fetch(
      `${API}/blogs/${blogId}/articles.json?limit=${limit}&status=any`,
      { headers: shopHeaders }
    );
    const d = await r.json();
    return res.status(r.status).json(d);
  }

  // ── POST /api/ravager-blog → créer un article ──
  if (req.method === 'POST') {
    const { title, body_html, author, tags, image_src, image_alt, image_attachment, image_filename, post_to_fb, fb_message, published } = req.body || {};

    if (!title || !body_html) {
      return res.status(400).json({ ok: false, error: 'title et body_html requis' });
    }

    let imageField = {};
    if (image_attachment && image_filename) {
      imageField = { image: { attachment: image_attachment, filename: image_filename, alt: image_alt || title } };
    } else if (image_src) {
      imageField = { image: { src: image_src, alt: image_alt || title } };
    }

    // Construction de l'article Shopify
    const articlePayload = {
      article: {
        title,
        body_html,
        author:    author || 'RAVAGER',
        tags:      tags   || 'Pêche, Techniques, RAVAGER',
        published: published !== false,
        ...imageField
      }
    };

    const shopRes = await fetch(
      `${API}/blogs/${blogId}/articles.json`,
      { method: 'POST', headers: shopHeaders, body: JSON.stringify(articlePayload) }
    );
    const shopData = await shopRes.json();

    if (!shopRes.ok) {
      return res.status(shopRes.status).json({ ok: false, error: shopData.errors || 'Erreur Shopify', details: shopData });
    }

    const article = shopData.article;
    let fbResult  = null;

    // ── Facebook post (optionnel) ──
    if (post_to_fb && fbPageId && fbPageToken) {
      const articleUrl = `https://ravager-1041.myshopify.com/blogs/news/${article.handle}`;
      const message = fb_message
        || `📣 Nouvel article RAVAGER : ${title}\n\n${articleUrl}`;

      try {
        const fbRes = await fetch(
          `https://graph.facebook.com/v19.0/${fbPageId}/feed`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message,
              link: articleUrl,
              access_token: fbPageToken
            })
          }
        );
        fbResult = await fbRes.json();
      } catch (e) {
        fbResult = { error: e.message };
      }
    }

    return res.status(201).json({
      ok: true,
      article: {
        id:         article.id,
        title:      article.title,
        handle:     article.handle,
        url:        `https://ravager-1041.myshopify.com/blogs/news/${article.handle}`,
        published_at: article.published_at,
        author:     article.author,
        tags:       article.tags
      },
      facebook: fbResult
    });
  }

  // ── DELETE /api/ravager-blog?id=xxx → supprimer un article ──
  if (req.method === 'DELETE') {
    const articleId = req.query.id;
    if (!articleId) return res.status(400).json({ ok: false, error: 'id requis' });

    const r = await fetch(
      `${API}/blogs/${blogId}/articles/${articleId}.json`,
      { method: 'DELETE', headers: shopHeaders }
    );
    return res.status(r.status).json({ ok: r.status === 200 });
  }

  return res.status(405).json({ ok: false, error: 'Méthode non autorisée' });
};
