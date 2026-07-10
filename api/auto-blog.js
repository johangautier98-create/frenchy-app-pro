// ═══════════════════════════════════════════════════════════════════════
// AUTO-BLOG — Pipeline SEO world-class : recherche → génère → image → publie × 2
//
// Vercel env vars requis :
//   ANTHROPIC_API_KEY                clé API Claude (Anthropic)
//   SHOPIFY_FL_TOKEN                 token admin Frenchy Leurres (scopes: write_content, read_products)
//   SHOPIFY_RAVAGER_CONTENT_TOKEN    token admin Ravager (scopes: write_content, read_products)
//   BRAVE_SEARCH_API_KEY             clé API Brave Search (optionnel)
//   FL_BLOG_ID                       (optionnel) ID blog Frenchy Leurres — auto-détecté sinon
//   RAVAGER_BLOG_ID                  (optionnel) ID blog Ravager — auto-détecté sinon
//   CRON_SECRET                      secret pour sécuriser l'endpoint
// ═══════════════════════════════════════════════════════════════════════

const { CATALOG_FL, CATALOG_RAVAGER } = require('./catalogs');

// Supprime BOM, caractères non-ASCII et espaces parasites (problème fréquent avec PowerShell/Windows)
function cleanEnv(name) {
  return (process.env[name] || '').replace(/[^\x20-\x7E]/g, '').trim();
}

const SHOPS = {
  fl: {
    catalog:     CATALOG_FL,
    domain:      'b761b5-b6.myshopify.com',
    tokenEnv:    'SHOPIFY_FL_TOKEN',
    blogIdEnv:   'FL_BLOG_ID',
    blogHandle:  'infos',
  },
  ravager: {
    catalog:     CATALOG_RAVAGER,
    domain:      'ravager-1041.myshopify.com',
    tokenEnv:    'SHOPIFY_RAVAGER_CONTENT_TOKEN',
    blogIdEnv:   'RAVAGER_BLOG_ID',
    blogHandle:  'news',
  }
};

// ── Shopify : récupérer les titres des articles déjà publiés ─────
async function getPublishedSubjects(domain, token, blogId) {
  try {
    const r = await fetch(
      `https://${domain}/admin/api/2024-01/blogs/${blogId}/articles.json?limit=250&fields=id,title,tags&status=any`,
      { headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' } }
    );
    if (!r.ok) return [];
    const d = await r.json();
    return (d.articles || []).map(a => ({ sujet: a.title }));
  } catch (e) {
    console.error('[Shopify] Erreur lecture articles:', e.message);
    return [];
  }
}

// ── Brave Search : recherche web ──────────────────────────────────
async function braveSearch(query) {
  const key = cleanEnv('BRAVE_SEARCH_API_KEY');
  if (!key) {
    console.log('[Brave] Pas de clé — génération sans recherche web');
    return null;
  }

  try {
    const r = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&lang=fr&country=fr`,
      { headers: { 'Accept': 'application/json', 'X-Subscription-Token': key } }
    );
    if (!r.ok) return null;
    const d = await r.json();
    const results = (d.web?.results || []).slice(0, 5);
    return results.map(r => `Titre: ${r.title}\nUrl: ${r.url}\nExtrait: ${r.description || ''}`).join('\n\n');
  } catch (e) {
    console.error('[Brave] Erreur:', e.message);
    return null;
  }
}

// ── Claude : appel API ────────────────────────────────────────────
async function callClaude(system, user, maxTokens = 300) {
  const key = cleanEnv('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ANTHROPIC_API_KEY manquant');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }]
    })
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Claude API ${r.status}: ${err}`);
  }
  const d = await r.json();
  return d.content[0].text.trim();
}

// ── Étape 1 : choisir le sujet du jour (axe SEO) ─────────────────
async function chooseSubject(shopKey, published) {
  const cat = SHOPS[shopKey].catalog;
  const publishedList = published.map(p =>
    `- ${p.sujet}${p.produit ? ` [${p.produit}${p.couleur ? ' ' + p.couleur : ''}${p.grammage ? ' ' + p.grammage : ''}]` : ''}`
  ).join('\n') || 'Aucun article publié pour l\'instant.';

  const catalogSummary = cat.produits.map(p => {
    const vars = (p.variantes || []).map(v => {
      const parts = [];
      if (v.couleur)    parts.push(v.couleur);
      if (v.taille)     parts.push(v.taille);
      if (v.taille_nom) parts.push(v.taille_nom);
      if (v.longueur)   parts.push(v.longueur);
      if (v.grammage)   parts.push(v.grammage);
      if (v.poids)      parts.push(v.poids);
      return parts.join(' / ');
    }).join(' | ');
    return `${p.nom} (${p.type})${vars ? ': ' + vars : ''}`;
  }).join('\n');

  const system = shopKey === 'fl'
    ? `Tu es stratège SEO senior dans une agence de référencement mondiale de premier plan.
Tu travailles pour Frenchy Leurres (frenchyleurres.fr), marque française de leurres pour la pêche côtière en Méditerranée.

MISSION : Identifier le meilleur sujet d'article de blog pour capturer du trafic organique qualifié depuis Google France.

CRITÈRES DE SÉLECTION DU SUJET :
- Cibler une requête long-tail avec intention informationnelle + commerciale (ex: "comment pêcher le bar de nuit avec un leurre souple")
- UN seul produit avec couleur/grammage précis = ultra-spécifique = moins de concurrence
- Angle qui correspond à une vraie question de pêcheur méditerranéen
- Fort potentiel de trafic en Méditerranée française (Languedoc, PACA, Corse)
- Date et saison actuelles : ${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`
    : `Tu es stratège SEO senior dans une agence de référencement mondiale de premier plan.
Tu travailles pour RAVAGER (ravager.fr), marque artisanale de leurres pour thon rouge en Méditerranée, créée par Johan Gautier dans le Sud de la France.

MISSION : Identifier le meilleur sujet d'article de blog pour capturer du trafic organique depuis Google France.

CRITÈRES DE SÉLECTION DU SUJET :
- Cibler des pêcheurs de thon rouge en Méditerranée (niche très ciblée, fort engagement)
- UNE taille de Ravager Shad + UNE condition précise = ultra-spécifique
- Angle technique qui attire les pêcheurs expérimentés cherchant à progresser
- Saison actuelle : ${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })} — Méditerranée estivale`;

  const user = `Catalogue produits disponible :
${catalogSummary}

Articles déjà publiés (à NE PAS répéter) :
${publishedList}

Propose UN sujet d'article original non encore traité. Réponds UNIQUEMENT en JSON valide sur une seule ligne :
{"sujet":"...","produit":"...","couleur":"...","grammage":"...","technique":"...","espece":"...","contexte_peche":"...","mots_cles_recherche":"...","keyword_principal":"..."}

- sujet : titre accrocheur et SEO (60-80 caractères), mot-clé principal au début
- produit : nom exact du produit (UN SEUL produit)
- couleur : couleur spécifique (ou "" si pas applicable)
- grammage : grammage ou taille précise (ou "" si pas applicable)
- technique : UNE seule technique de pêche principale et précise
- espece : espèce cible principale (ex: "bar", "dorade royale", "thon rouge")
- contexte_peche : contexte précis (ex: "pêche en bateau", "pêche de nuit en port", "pêche depuis les rochers", "surf casting", "pêche en bordure de digue")
- mots_cles_recherche : 5-7 mots-clés pour la recherche web
- keyword_principal : requête Google visée (ex: "pêcher dorade royale nuit leurre souple méditerranée")`;

  const raw = await callClaude(system, user, 500);

  try {
    const match = raw.match(/\{[\s\S]*?\}/);
    if (!match) throw new Error('Pas de JSON trouvé');
    return JSON.parse(match[0]);
  } catch (e) {
    console.error('[chooseSubject] JSON parse error:', raw);
    throw new Error('Impossible de parser le sujet : ' + e.message);
  }
}

// ── Étape 2 : rédiger l'article (SEO world-class) ─────────────────
async function writeArticle(shopKey, subject, searchResults) {
  const cat = SHOPS[shopKey].catalog;

  const researchContext = searchResults
    ? `\n\nRésultats de recherche web (utilise-les pour enrichir le contenu — ne copie pas) :\n${searchResults}`
    : '';

  const dateContext = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const system = shopKey === 'fl'
    ? `Tu es à la fois un pêcheur passionné avec 20 ans d'expérience en Méditerranée française ET un rédacteur SEO de niveau mondial.
Tu écris pour Frenchy Leurres (https://frenchyleurres.fr), marque française de leurres côtiers pour la pêche en Méditerranée.

TON IDENTITÉ DE RÉDACTEUR :
Tu n'écris pas comme une IA. Tu écris comme quelqu'un qui a passé des milliers d'heures en mer, qui connaît chaque spot, chaque heure, chaque condition. Tes articles donnent envie de sortir pêcher immédiatement. Ils sont vivants, précis, passionnés. Ils ressemblent aux meilleurs articles de magazines de pêche comme "Le Pêcheur de Méditerranée" ou "Pêche en Mer".

STRUCTURE OBLIGATOIRE DE TA RÉPONSE :
Ligne 1 : SEO_TITLE: [55-60 caractères MAX, mot-clé principal en début de titre]
Ligne 2 : META_DESC: [150-160 caractères MAX, formule accrocheuse + appel à l'action]
Ligne 3 : ---BODY---
Suite : article HTML complet

RÈGLE ABSOLUE N°1 — UN SEUL PRODUIT :
L'article parle UNIQUEMENT du produit indiqué, avec son coloris et grammage précis.
INTERDIT de mentionner d'autres produits Frenchy Leurres dans l'article.
INTERDIT de faire des comparaisons avec d'autres références de la gamme.
Tout le contenu tourne autour de CE produit dans CE coloris/grammage.

STRUCTURE NARRATIVE OBLIGATOIRE (dans cet ordre) :
1. ACCROCHE — Commence par une scène vivante et concrète : un lieu précis, une heure, une condition de mer, un pêcheur. PAS d'introduction générique. PAS de "Dans cet article, nous allons voir..."
2. LE PRODUIT — Présentation du produit (caractéristiques qui font la différence pour cette situation)
3. LA TECHNIQUE — Explication étape par étape de la technique, avec des détails pratiques réels
4. L'ESPÈCE CIBLE — Comportement du poisson, pourquoi il mord, quand, comment
5. LE CONTEXTE — Spots précis, conditions idéales, horaires, météo, saison en Méditerranée
6. ERREURS ET ASTUCES — Ce que les débutants ratent, les détails qui font la différence
7. FAQ — 3-4 questions réelles que posent les pêcheurs sur Google
8. CTA — Appel à l'action avec lien vers https://frenchyleurres.fr

RÈGLES SEO (Google 2026 + IA Search) :
- H1 unique : mot-clé principal + lieu géographique méditerranéen
- 5 à 7 H2 avec variations sémantiques (LSI)
- H3 sous chaque H2
- MINIMUM 1200 mots — idéal 1500-2000 mots
- Mot-clé principal dans les 100 premiers mots
- Données précises : profondeurs en mètres, vitesses en m/s, poids en g, tailles en cm
- Noms scientifiques des espèces : bar (Dicentrarchus labrax), dorade royale (Sparus aurata)

LIENS OBLIGATOIRES :
- Au moins 3 liens vers https://frenchyleurres.fr (ancres variées : "Frenchy Leurres", "découvrir ce leurre", "voir la gamme", etc.)
- 1 lien OBLIGATOIRE vers https://ravager.fr avec texte naturel comme : "Si vous pêchez aussi le thon rouge en Méditerranée, les leurres artisanaux <a href="https://ravager.fr">RAVAGER</a>, fabriqués par Johan Gautier dans le Sud de la France, sont faits pour vous."

GEO — LIEUX MÉDITERRANÉENS PRÉCIS :
Citer des endroits réels selon le contexte : Gruissan, Sète, étang de Thau, Palavas-les-Flots, Port-Camargue, Aigues-Mortes, Cap d'Agde, Marseillan, Golfe du Lion, Calanques de Marseille, Golfe de Fos, Toulon, Bandol, La Ciotat, Nice, Antibes, Corse, etc.

FORMAT HTML (balises autorisées) :
<h1> <h2> <h3> <p> <strong> <em> <ul> <li> <ol> <a href="..."> <blockquote>
INTERDIT : <html> <body> <head> <meta> <style> <script> <div> <span>`
    : `Tu es à la fois un chasseur de thon rouge expérimenté en Méditerranée française ET un rédacteur SEO de niveau mondial.
Tu écris pour RAVAGER (https://ravager.fr), marque artisanale de leurres pour thon rouge, créée par Johan Gautier dans le Sud de la France.

TON IDENTITÉ DE RÉDACTEUR :
Tu n'écris pas comme une IA. Tu écris comme quelqu'un qui connaît la Méditerranée sur le bout des doigts — les thermoclines, les bancs de thon, la lecture des oiseaux, les chasses explosives à l'aube. Tes articles sont intenses, techniques, passionnés. Ils ressemblent aux meilleurs contenus de la pêche sportive du thon rouge — ceux qui font vibrer les vrais pêcheurs.

STRUCTURE OBLIGATOIRE DE TA RÉPONSE :
Ligne 1 : SEO_TITLE: [55-60 caractères MAX, mot-clé principal en début de titre]
Ligne 2 : META_DESC: [150-160 caractères MAX, formule accrocheuse + appel à l'action]
Ligne 3 : ---BODY---
Suite : article HTML complet

RÈGLE ABSOLUE N°1 — UN SEUL PRODUIT :
L'article parle UNIQUEMENT du leurre RAVAGER indiqué, avec sa taille précise.
INTERDIT de mentionner d'autres tailles RAVAGER dans l'article (ex: si c'est le T3, ne parle PAS du T1, T2 ou T4).
Tout le contenu tourne autour de CE leurre dans CETTE situation précise.

AUTHENTICITÉ RAVAGER — OBLIGATOIRE :
- Mentionner Johan Gautier, créateur et artisan RAVAGER, basé dans le Sud de la France
- "Chaque leurre RAVAGER est conçu et fabriqué artisanalement"
- Passion et ADN de la marque : leurres pensés par des pêcheurs, pour des pêcheurs

STRUCTURE NARRATIVE OBLIGATOIRE (dans cet ordre) :
1. ACCROCHE — Commence par une scène intense et vivante : une chasse explosive, les oiseaux qui plongent, les thons en surface. Un lieu précis, une heure, des conditions de mer. PAS d'introduction générique.
2. LE LEURRE — Présentation du leurre RAVAGER : sa conception, ses caractéristiques techniques, pourquoi il est efficace
3. LA TECHNIQUE — Technique de pêche précise et détaillée (récupération, animation, vitesse, placement)
4. LE THON — Comportement du thon rouge en Méditerranée, comment il chasse, comment le déclencher
5. LES CONDITIONS IDÉALES — Où, quand, quelle météo, quelle mer, quelle heure
6. LECTURE DE LA CHASSE — Comment repérer, approcher, positionner le bateau, lancer
7. FAQ — 3-4 questions réelles que posent les pêcheurs de thon sur Google
8. CTA — Appel à l'action percutant avec lien vers https://ravager.fr

RÈGLES SEO (Google 2026 + IA Search) :
- H1 unique : mot-clé principal + "thon rouge" + Méditerranée
- 5 à 7 H2 avec variations sémantiques (LSI)
- H3 sous chaque H2
- MINIMUM 1200 mots — idéal 1500-2000 mots
- Mot-clé principal dans les 100 premiers mots
- Données techniques précises : vitesses de récupération (1-3 m/s), longueur/poids du leurre, poids de thon ciblés
- Nom scientifique : thon rouge (Thunnus thynnus)

LIENS OBLIGATOIRES :
- Au moins 3 liens vers https://ravager.fr (ancres variées)
- 1 lien OBLIGATOIRE vers https://frenchyleurres.fr avec texte naturel comme : "Pour la pêche côtière du bar et de la dorade en Méditerranée, découvrez aussi les leurres <a href="https://frenchyleurres.fr">Frenchy Leurres</a>, conçus pour la pêche côtière en mer Méditerranée."

GEO — LIEUX MÉDITERRANÉENS PRÉCIS :
Citer des endroits réels : Golfe du Lion, large de Sète, large de Marseille, côtes Varoises, Côte d'Azur, Cap Sicié, Ile Riou, eaux entre Marseille et Toulon, Golfe de Gênes, Mer Ligure, Baléares, etc.

FORMAT HTML (balises autorisées) :
<h1> <h2> <h3> <p> <strong> <em> <ul> <li> <ol> <a href="..."> <blockquote>
INTERDIT : <html> <body> <head> <meta> <style> <script> <div> <span>
• 3 à 4 H3 sous forme de question exacte que poserait un pêcheur sur Google
• Réponse directe et complète (2-5 phrases) sous chaque H3
• Couvre : taille de leurre, technique, conditions, où pêcher le thon en Méditerranée

APPEL À L'ACTION FINAL :
• H2 ou <p> percutant avec lien vers https://ravager.fr
• Mentionner aussi https://frenchyleurres.fr dans le contexte pêche côtière

STYLE :
• Technique, intense, passionné — pêcheur de thon expérimenté
• Vocabulaire précis : "sur chasse", "strike", "déferlante", "banc de bonitou", "lecture des oiseaux"
• JAMAIS d'Introduction comme premier mot
• JAMAIS de produits inexistants — uniquement catalogue RAVAGER

FORMAT HTML AUTORISÉ :
<h1> <h2> <h3> <p> <strong> <em> <ul> <li> <ol> <a href="..."> <blockquote>
INTERDIT : <html> <body> <head> <meta> <style> <script> <div>`;

  const user = `Rédige un article de blog complet sur le sujet suivant :

Titre cible : "${subject.sujet}"
Mot-clé principal visé sur Google : ${subject.keyword_principal || subject.sujet}
Produit UNIQUE à traiter : ${subject.produit}${subject.couleur ? ' — coloris ' + subject.couleur : ''}${subject.grammage ? ' — ' + subject.grammage : ''}
Technique principale : ${subject.technique}
Espèce cible : ${subject.espece || ''}
Contexte de pêche : ${subject.contexte_peche || ''}
Date de publication : ${dateContext}
${researchContext}

RAPPELS ABSOLUS :
- Respecte EXACTEMENT la structure SEO_TITLE / META_DESC / ---BODY---
- Parle UNIQUEMENT de ce produit avec ce coloris/grammage — aucun autre produit mentionné
- Commence par une scène vivante et concrète, PAS par "Introduction" ou une formule générique
- MINIMUM 1200 mots
- Les 2 liens de sites sont OBLIGATOIRES dans le corps de l'article`;

  const raw = await callClaude(system, user, 4500);

  // Parser la réponse structurée
  const lines = raw.split('\n');
  const seoTitleLine = lines.find(l => l.startsWith('SEO_TITLE:'));
  const metaDescLine = lines.find(l => l.startsWith('META_DESC:'));
  const bodyStart    = raw.indexOf('---BODY---');

  const seoTitle = seoTitleLine ? seoTitleLine.replace('SEO_TITLE:', '').trim() : subject.sujet;
  const metaDesc = metaDescLine ? metaDescLine.replace('META_DESC:', '').trim() : '';
  const bodyHtml = bodyStart >= 0 ? raw.slice(bodyStart + 10).trim() : raw;

  return { seoTitle, metaDesc, bodyHtml };
}

// ── Shopify : récupérer l'ID du blog ─────────────────────────────
async function getBlogId(domain, token, envVar) {
  const stored = process.env[envVar];
  if (stored) return stored;
  const r = await fetch(`https://${domain}/admin/api/2024-01/blogs.json`, {
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
  });
  const d = await r.json();
  if (!d.blogs?.[0]) throw new Error(`Aucun blog sur ${domain}`);
  return String(d.blogs[0].id);
}

// ── Shopify : récupérer une image produit ─────────────────────────
async function getProductImage(domain, token, productName) {
  if (!productName) return null;
  try {
    const r = await fetch(
      `https://${domain}/admin/api/2024-01/products.json?title=${encodeURIComponent(productName)}&limit=5&fields=id,title,images`,
      { headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' } }
    );
    const d = await r.json();
    if (!d.products?.length) return null;
    const lc = productName.toLowerCase();
    const match = d.products.find(p => p.title.toLowerCase().includes(lc)) || d.products[0];
    if (match.images?.[0]) return { src: match.images[0].src, alt: match.title };
  } catch (e) {
    console.error('[Image]', e.message);
  }
  return null;
}

// ── Shopify : publier l'article avec métadonnées SEO ─────────────
async function publishToShopify(domain, token, blogId, title, seoTitle, metaDesc, bodyHtml, summary, tags, author, imageObj) {
  const metafields = [];
  if (seoTitle) metafields.push({ namespace: 'global', key: 'title_tag',       value: seoTitle, type: 'single_line_text_field' });
  if (metaDesc) metafields.push({ namespace: 'global', key: 'description_tag', value: metaDesc, type: 'single_line_text_field' });

  const payload = {
    article: {
      title,
      body_html:    bodyHtml,
      summary_html: summary || metaDesc || '',
      author,
      tags,
      published: true,
      ...(imageObj    ? { image:       { src: imageObj.src, alt: imageObj.alt } } : {}),
      ...(metafields.length ? { metafields } : {})
    }
  };

  const r = await fetch(
    `https://${domain}/admin/api/2024-01/blogs/${blogId}/articles.json`,
    { method: 'POST', headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  );
  const d = await r.json();
  if (!r.ok) throw new Error(`Shopify ${r.status}: ${JSON.stringify(d.errors)}`);
  return d.article;
}

// ── Pipeline complet pour une boutique ───────────────────────────
async function runForShop(shopKey) {
  const shop  = SHOPS[shopKey];
  const cat   = shop.catalog;
  const token = cleanEnv(shop.tokenEnv);
  if (!token) throw new Error(`Token manquant : ${shop.tokenEnv}`);

  // 1. Récupérer le blog ID puis les articles déjà publiés sur Shopify
  const blogId = await getBlogId(shop.domain, token, shop.blogIdEnv);
  console.log(`[${cat.marque}] Récupération des articles publiés...`);
  const published = await getPublishedSubjects(shop.domain, token, blogId);
  console.log(`[${cat.marque}] ${published.length} articles déjà publiés`);

  // 2. Choisir le sujet du jour (orienté SEO)
  console.log(`[${cat.marque}] Choix du sujet SEO...`);
  const subject = await chooseSubject(shopKey, published);
  console.log(`[${cat.marque}] Sujet : "${subject.sujet}"`);

  // 3. Recherche web Brave
  console.log(`[${cat.marque}] Recherche web : "${subject.mots_cles_recherche}"...`);
  const searchResults = await braveSearch(subject.mots_cles_recherche);
  console.log(`[${cat.marque}] Recherche : ${searchResults ? 'OK' : 'ignorée (pas de clé Brave)'}`);

  // 4. Rédiger l'article (SEO world-class)
  console.log(`[${cat.marque}] Rédaction SEO world-class...`);
  const { seoTitle, metaDesc, bodyHtml } = await writeArticle(shopKey, subject, searchResults);
  console.log(`[${cat.marque}] Article rédigé (${bodyHtml.length} chars) — SEO title: "${seoTitle}"`);

  // 5. Récupérer l'image produit
  const imageObj = await getProductImage(shop.domain, token, subject.produit);
  console.log(`[${cat.marque}] Image : ${imageObj ? imageObj.src : 'aucune'}`);

  // 6. Tags SEO enrichis
  const tags = shopKey === 'fl'
    ? [
        'Pêche en Méditerranée',
        'Leurres souples',
        subject.produit,
        subject.technique,
        subject.couleur || '',
        subject.grammage || '',
        'Bar',
        'Dorade',
        'Loup',
        'Frenchy Leurres',
        'Pêche côtière',
        'Leurres français'
      ].filter(Boolean).join(', ')
    : [
        'Pêche du thon rouge',
        'Thon rouge Méditerranée',
        subject.produit,
        subject.technique,
        subject.grammage || '',
        'RAVAGER',
        'Leurres artisanaux',
        'Johan Gautier',
        'Sud de la France',
        'Big game Méditerranée',
        'Pêche sur chasse'
      ].filter(Boolean).join(', ');

  // 7. Publier sur Shopify avec métadonnées SEO
  const article = await publishToShopify(
    shop.domain, token, blogId,
    subject.sujet,  // titre H1 Shopify
    seoTitle,       // SEO title (metafield)
    metaDesc,       // meta description (metafield)
    bodyHtml,
    metaDesc,       // summary_html = meta description
    tags,
    cat.fondateur || cat.marque,
    imageObj
  );
  console.log(`[${cat.marque}] Publié : ID ${article.id} / handle: ${article.handle}`);

  return {
    marque:     cat.marque,
    sujet:      article.title,
    seo_title:  seoTitle,
    meta_desc:  metaDesc,
    produit:    subject.produit,
    couleur:    subject.couleur,
    grammage:   subject.grammage,
    shopify_id: article.id,
    image:      imageObj?.src || null,
    url:        `https://${cat.site.replace('https://', '')}/blogs/${shop.blogHandle}/${article.handle}`
  };
}

// ── Handler principal ─────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Sécurité cron
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const bearer = (req.headers.authorization || '').replace('Bearer ', '');
    const query  = req.query.secret || '';
    if (bearer !== cronSecret && query !== cronSecret) {
      return res.status(401).json({ ok: false, error: 'Non autorisé' });
    }
  }

  const startTime = Date.now();
  console.log(`[AUTO-BLOG] Démarrage ${new Date().toISOString()}`);

  const results = [];
  const errors  = [];

  for (const shopKey of ['fl', 'ravager']) {
    try {
      const result = await runForShop(shopKey);
      results.push(result);
    } catch (e) {
      console.error(`[${shopKey}] ERREUR:`, e.message);
      errors.push({ boutique: shopKey, error: e.message });
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[AUTO-BLOG] Terminé en ${duration}s — ${results.length} publiés, ${errors.length} erreurs`);

  return res.status(200).json({
    ok:       errors.length === 0,
    date:     new Date().toISOString().split('T')[0],
    duration: `${duration}s`,
    results,
    errors
  });
};
