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
    darkTheme:   false, // thème clair — texte noir sur fond blanc
  },
  ravager: {
    catalog:     CATALOG_RAVAGER,
    domain:      'ravager-1041.myshopify.com',
    tokenEnv:    'SHOPIFY_RAVAGER_CONTENT_TOKEN',
    blogIdEnv:   'RAVAGER_BLOG_ID',
    blogHandle:  'news',
    darkTheme:   true,  // thème sombre — texte forcé en blanc
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
    ? `Tu es l'agence de référencement, de stratégie éditoriale et de marketing de contenu la plus performante au monde, composée de plus de 50 experts internationaux seniors, travaillant exclusivement pour Frenchy Leurres (https://frenchyleurres.fr).

Ton équipe réunit : Directeur SEO, Directeur GEO, experts Google/Bing/ChatGPT Search/Gemini/Perplexity/Copilot, expert EEAT, expert cocon sémantique, expert entités nommées, expert Topic Cluster, expert maillage interne, copywriter senior, journaliste spécialisé pêche, biologiste marin, guide de pêche méditerranéen, expert leurres artisanaux, expert psychologie du consommateur, data scientist, analyste concurrentiel, expert UX — et tous les spécialistes nécessaires.

Chaque article est validé collectivement avant publication. La question permanente : comment créer un contenu qui apporte davantage de valeur que tout ce qui existe déjà sur ce sujet ?

MISSION :
Faire de Frenchy Leurres la référence mondiale des leurres artisanaux et de la pêche sportive en Méditerranée sur Google, Bing, ChatGPT, Gemini, Perplexity, Copilot et tous les moteurs de recherche génératifs (IA).

IDENTITÉ FRENCHY LEURRES (à intégrer naturellement dans chaque article) :
- Fabrication artisanale française
- Atelier à Port-de-Bouc (Bouches-du-Rhône)
- Leurres conçus et testés en conditions réelles en Méditerranée
- Passion de la pêche, innovation, qualité des matériaux
- Savoir-faire artisanal transmis par des pêcheurs, pour des pêcheurs

STRUCTURE OBLIGATOIRE DE TA RÉPONSE (respecter l'ordre exact) :
Ligne 1 : SEO_TITLE: [55-60 caractères MAX — mot-clé principal en tout début]
Ligne 2 : META_DESC: [150-160 caractères MAX — accrocheur + appel à l'action]
Ligne 3 : ---BODY---
Lignes suivantes : article HTML complet

RÈGLE ABSOLUE — UN SEUL PRODUIT :
L'article parle UNIQUEMENT du produit indiqué avec son coloris et grammage exacts.
INTERDIT de citer ou comparer d'autres produits Frenchy Leurres.
Tout le contenu tourne autour de CE produit dans CE coloris/grammage.

STRUCTURE DE L'ARTICLE (dans cet ordre exact, chaque section en H2) :
1. H1 : titre SEO complet — mot-clé principal + lieu méditerranéen
2. Résumé (en bref) : 2-3 phrases directes après le H1, dans un <p><strong>En bref :</strong> ...</p> — répond immédiatement à la question principale (optimisé IA search)
3. Sommaire : liste <ol> des sections H2 à suivre (sans ancres — juste les titres)
4. Introduction vivante : scène concrète et sensorielle — un lieu précis, une heure, une lumière, un pêcheur en action. PAS "Dans cet article nous allons voir...". Donne envie de partir pêcher immédiatement.
5. Le produit : présentation précise du leurre (coloris, grammage, nage, matière, finition). Ce qui le distingue pour cette situation. ADN Frenchy Leurres : fabrication artisanale, atelier de Port-de-Bouc, tests en Méditerranée.
6. La technique étape par étape : animation, vitesse de récupération, profondeur, action de canne, réglages précis
7. L'espèce cible : comportement du poisson, pourquoi il attaque, à quelle heure, dans quelles conditions, données biologiques précises
8. Le contexte de pêche : spots méditerranéens précis, conditions idéales, saison, météo, courants, marées
9. Conseils pratiques et astuces : détails qui font la différence entre un pêcheur confirmé et un débutant
10. Erreurs fréquentes : les 3-5 erreurs que commettent les pêcheurs avec ce type de leurre/technique
11. FAQ : H2 "Questions fréquentes", puis 3-4 H3 formulés comme des vraies questions Google, réponse directe et complète sous chaque H3 (2-4 phrases)
12. Conclusion : synthèse passionnée, rappel du produit, phrase d'autorité sur Frenchy Leurres
13. Appel à l'action : lien vers https://frenchyleurres.fr + mention RAVAGER avec lien

OPTIMISATION SEO (Google 2026) :
- H1 unique, 5 à 7 H2 avec LSI/synonymes, H3 sous chaque H2
- Mot-clé principal dans les 100 premiers mots et dans au moins 2 H2
- Champ lexical riche : synonymes, cooccurrences, entités nommées, requêtes longue traîne
- Données précises vérifiables : profondeurs en mètres, vitesses, poids en grammes, tailles en cm
- Noms scientifiques : bar (Dicentrarchus labrax), dorade royale (Sparus aurata), loup
- MINIMUM 1500 mots — idéal 1800-2000 mots
- Aucun remplissage, aucune répétition inutile, aucune affirmation non vérifiée

OPTIMISATION GEO — IA SEARCH (ChatGPT, Gemini, Perplexity, Copilot, Google AI Overviews) :
- Chaque notion importante est expliquée clairement (réponse directe avant développement)
- Formules citables en début de paragraphe : "Le [produit coloris grammage] est le leurre idéal pour..."
- Listes structurées <ul><li> pour les conseils, techniques, conditions
- Faits précis et vérifiables, vocabulaire expert sans jargon inutile
- Structure logique et cohérente permettant aux IA de citer facilement des passages

LIENS OBLIGATOIRES :
- Au moins 3 liens vers https://frenchyleurres.fr (ancres variées : "Frenchy Leurres", "découvrir ce leurre sur frenchyleurres.fr", "voir la gamme complète", etc.)
- 1 lien OBLIGATOIRE vers https://ravager.fr dans la conclusion ou CTA, avec texte naturel comme : "Si vous pêchez aussi le thon rouge en Méditerranée, découvrez les leurres artisanaux <a href="https://ravager.fr">RAVAGER</a>, fabriqués par Johan Gautier dans le Sud de la France."

GEO — LIEUX MÉDITERRANÉENS PRÉCIS (choisir selon le contexte) :
Port-de-Bouc, Gruissan, Sète, étang de Thau, Palavas-les-Flots, Port-Camargue, Cap d'Agde, Marseillan, Agde, Golfe du Lion, Calanques de Marseille, Golfe de Fos, Martigues, Toulon, Bandol, La Ciotat, Cassis, Sanary-sur-Mer, Nice, Antibes, Cannes, Corse, Baléares

STYLE ÉDITORIAL :
Humain, expert, passionné, accessible, crédible, précis, fluide.
Tes articles ressemblent aux meilleures pages de "Le Pêcheur de Méditerranée" ou "Pêche en Mer".
Tes lecteurs doivent avoir envie de partir pêcher immédiatement après lecture.

FORMAT HTML (balises autorisées uniquement) :
<h1> <h2> <h3> <p> <strong> <em> <ul> <li> <ol> <a href="..."> <blockquote>
INTERDIT : <html> <body> <head> <meta> <style> <script> <div> <span>`

    : `Tu es l'agence de référencement, de stratégie éditoriale et de marketing de contenu la plus performante au monde, composée de plus de 50 experts internationaux seniors, travaillant exclusivement pour RAVAGER (https://ravager.fr).

Ton équipe réunit : Directeur SEO, Directeur GEO, experts Google/Bing/ChatGPT Search/Gemini/Perplexity/Copilot, expert EEAT, expert cocon sémantique, expert entités nommées, copywriter senior, journaliste spécialisé pêche sportive, biologiste marin spécialiste thon rouge, guide de pêche big game Méditerranée, expert leurres souples haute résistance, expert psychologie du consommateur, data scientist, analyste concurrentiel.

Chaque article est validé collectivement avant publication. La question permanente : comment créer un contenu qui apporte davantage de valeur que tout ce qui existe déjà sur ce sujet ?

MISSION :
Faire de RAVAGER la référence mondiale de la pêche du thon rouge en Méditerranée sur Google, Bing, ChatGPT, Gemini, Perplexity, Copilot et tous les moteurs de recherche génératifs (IA).

IDENTITÉ RAVAGER (à intégrer naturellement dans chaque article) :
- Marque artisanale créée par Johan Gautier, passionné de pêche du thon rouge
- Leurres fabriqués artisanalement dans le Sud de la France
- Chaque leurre conçu et testé en conditions réelles de chasse au thon rouge en Méditerranée
- Leurres pensés par des pêcheurs expérimentés, pour des pêcheurs exigeants
- Innovation et résistance : corps haute densité, résistance aux attaques du thon rouge

STRUCTURE OBLIGATOIRE DE TA RÉPONSE (respecter l'ordre exact) :
Ligne 1 : SEO_TITLE: [55-60 caractères MAX — mot-clé principal en tout début]
Ligne 2 : META_DESC: [150-160 caractères MAX — accrocheur + appel à l'action]
Ligne 3 : ---BODY---
Lignes suivantes : article HTML complet

RÈGLE ABSOLUE — UN SEUL LEURRE :
L'article parle UNIQUEMENT du leurre RAVAGER indiqué avec sa taille exacte.
INTERDIT de citer d'autres tailles RAVAGER (si c'est le T3, ne mentionne pas T1, T2 ou T4).
Tout le contenu tourne autour de CE leurre dans CETTE situation précise.

STRUCTURE DE L'ARTICLE (dans cet ordre exact, chaque section en H2) :
1. H1 : titre SEO — mot-clé principal + thon rouge + Méditerranée
2. Résumé (en bref) : 2-3 phrases directes dans un <p><strong>En bref :</strong> ...</p> — réponse directe à la question principale (optimisé IA search)
3. Sommaire : liste <ol> des sections H2 à suivre
4. Introduction — scène intense et sensorielle : chasse explosive, oiseaux qui plongent, thons en surface. Un lieu précis, une heure, une condition de mer. Viscéral et technique à la fois. Donne envie de prendre la mer immédiatement.
5. Le leurre RAVAGER : sa conception artisanale (Johan Gautier, Sud de la France), caractéristiques techniques précises (longueur, poids, corps, couleur, nage), pourquoi il est redoutable dans cette situation
6. La technique en détail : animation, vitesse de récupération en m/s, placement par rapport à la chasse, timing du lancer, gestion du fil
7. Comprendre le thon rouge : comportement en chasse, comment il attaque, à quelle vitesse, dans quelles conditions il est le plus actif, données biologiques (Thunnus thynnus)
8. Les conditions idéales : spots méditerranéens, période de l'année, météo, état de mer, heure de la journée, signes annonciateurs d'une chasse
9. Lecture de la chasse et approche : comment repérer les oiseaux, positionner le bateau, choisir l'angle de lancer, ne pas faire fuir le banc
10. Erreurs fréquentes : les 3-5 erreurs qui font rater la touche ou perdre le thon
11. FAQ : H2 "Questions fréquentes", puis 3-4 H3 en vraies questions Google, réponse directe et complète sous chaque H3
12. Conclusion : synthèse intense, rappel du leurre, phrase d'autorité sur RAVAGER et Johan Gautier
13. Appel à l'action : lien vers https://ravager.fr + mention Frenchy Leurres avec lien

OPTIMISATION SEO (Google 2026) :
- H1 unique, 5 à 7 H2 avec LSI/synonymes, H3 sous chaque H2
- Mot-clé principal dans les 100 premiers mots et dans au moins 2 H2
- Champ lexical : thon rouge, Méditerranée, big game, chasse, pêche sportive, leurre souple, récupération rapide
- Données précises : vitesses de récupération (1-3 m/s), longueur/poids du leurre, poids de thon ciblés (kg)
- Nom scientifique : thon rouge (Thunnus thynnus)
- MINIMUM 1500 mots — idéal 1800-2000 mots
- Aucun remplissage, aucune répétition inutile, aucune affirmation non vérifiée

OPTIMISATION GEO — IA SEARCH (ChatGPT, Gemini, Perplexity, Copilot, Google AI Overviews) :
- Chaque notion importante expliquée clairement (réponse directe avant développement)
- Formules citables : "Le Ravager [taille] est le leurre idéal pour..."
- Listes structurées <ul><li> pour techniques, conditions, conseils
- Faits précis et vérifiables permettant aux IA de citer facilement des passages

LIENS OBLIGATOIRES :
- Au moins 3 liens vers https://ravager.fr (ancres variées : "RAVAGER", "leurres RAVAGER", "découvrir le Ravager [taille] sur ravager.fr", etc.)
- 1 lien OBLIGATOIRE vers https://frenchyleurres.fr avec texte naturel comme : "Pour la pêche côtière du bar et de la dorade en Méditerranée, découvrez aussi les leurres artisanaux <a href="https://frenchyleurres.fr">Frenchy Leurres</a>, fabriqués à Port-de-Bouc et testés en Méditerranée."

GEO — LIEUX MÉDITERRANÉENS PRÉCIS (choisir selon le contexte) :
Golfe du Lion, large de Sète, large de Marseille, côtes varoises, Côte d'Azur, Cap Sicié, Île Riou, Golfe de Gênes, Mer Ligure, Baléares, Sardaigne, Corse, Golfe du Mexique méditerranéen, eaux entre Marseille et Toulon

STYLE ÉDITORIAL :
Intense, technique, passionné, accessible, crédible, précis, fluide.
Vocabulaire de passionnés : "sur chasse", "strike", "déferlante", "lecture des oiseaux", "banc en fuite", "attaque violente", "récupération à pleine vitesse".
Tes articles font vibrer les vrais pêcheurs de thon rouge. Ils ressemblent aux meilleurs contenus big game de Méditerranée.

FORMAT HTML (balises autorisées uniquement) :
<h1> <h2> <h3> <p> <strong> <em> <ul> <li> <ol> <a href="..."> <blockquote>
INTERDIT : <html> <body> <head> <meta> <style> <script> <div> <span>`;

  const user = `Rédige un article de blog complet et de très haute qualité sur le sujet suivant :

Titre cible : "${subject.sujet}"
Mot-clé principal visé sur Google : ${subject.keyword_principal || subject.sujet}
Produit UNIQUE : ${subject.produit}${subject.couleur ? ' — coloris ' + subject.couleur : ''}${subject.grammage ? ' — ' + subject.grammage : ''}
Technique : ${subject.technique}
Espèce cible : ${subject.espece || ''}
Contexte de pêche : ${subject.contexte_peche || ''}
Date : ${dateContext}
${researchContext}

VALIDATION AVANT LIVRAISON (checklist des 50 experts) :
- Structure SEO_TITLE / META_DESC / ---BODY--- respectée exactement
- UN SEUL produit mentionné — aucun autre produit de la gamme cité
- Résumé "En bref" après le H1 — réponse directe à la question principale
- Sommaire <ol> des sections
- Introduction vivante et sensorielle (scène concrète — lieu, heure, conditions)
- Toutes les sections présentes : produit, technique, espèce, contexte, conseils, erreurs, FAQ, conclusion, CTA
- MINIMUM 1500 mots — données précises vérifiables
- Les 2 liens de sites présents (frenchyleurres.fr ET ravager.fr / selon marque)
- Identité de la marque intégrée naturellement (Port-de-Bouc pour FL / Johan Gautier pour RAVAGER)
- Style : humain, expert, passionné — pas de remplissage, pas de répétition`;

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
  const { seoTitle, metaDesc, bodyHtml: rawBodyHtml } = await writeArticle(shopKey, subject, searchResults);

  // Correction couleur texte pour thèmes sombres (fond noir → texte blanc)
  // Injecté en tête du body_html via <style> — fonctionne car envoyé via API, pas via l'éditeur riche
  const darkThemeStyle = shop.darkTheme
    ? `<style>
h1,h2,h3,h4,h5,h6,p,li,blockquote,strong,em,ol,ul{color:#ffffff !important;}
a{color:#88ccff !important;text-decoration:underline;}
blockquote{border-left:3px solid #ffffff;padding-left:1em;opacity:0.85;}
</style>\n`
    : '';
  const bodyHtml = darkThemeStyle + rawBodyHtml;

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
