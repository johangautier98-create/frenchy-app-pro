// RAVAGER — API IA pour rédaction d'articles
// Vercel env vars: OPENAI_API_KEY
// POST { prompt, type: 'article' | 'titles' | 'improve' }

const OpenAI = require('openai');

const SYSTEM_PROMPTS = {
  article: `Tu es expert en pêche en mer et rédacteur pour RAVAGER (leurres fabriqués artisanalement dans le Sud de la France).
Tu rédiges des articles de blog captivants en français pour ravager-shad.com.
Style: passionné, technique, accessible, authentique. Tu parles de pêche au thon rouge en Méditerranée,
pêche côtière, techniques de lancer, leurres souples et corps souples.
Tu mentionnes naturellement les produits RAVAGER (Ravager Shad T1, T2, T3, T4, têtes plombées).
Formate en HTML propre: <h2>, <p>, <strong>, <em>, <ul>/<li>.
Commence directement avec le HTML du contenu (pas de balises <html>/<body>/<head>).
Minimum 400 mots. Termine par un appel à l'action vers les produits RAVAGER.`,

  titles: `Tu génères des titres d'articles de blog accrocheurs pour RAVAGER (leurres de pêche en mer, Sud de la France).
Le titre doit être accrocheur, SEO-friendly, mentionner la technique ou l'espèce cible.
Donne exactement 5 titres, un par ligne, numérotés 1. 2. 3. 4. 5.
Aucune explication, juste les 5 titres.`,

  improve: `Tu es éditeur expert pour RAVAGER. Améliore le texte fourni:
- Corrige les fautes et améliore le style
- Rends le plus dynamique et engageant
- Intègre naturellement des références aux leurres RAVAGER si approprié
- Garde la même structure et les mêmes informations clés
Retourne uniquement le texte amélioré en HTML, sans commentaire.`
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { prompt, type = 'article' } = req.body || {};
  if (!prompt) return res.status(400).json({ ok: false, error: 'prompt requis' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ ok: false, error: 'OPENAI_API_KEY manquant' });

  const systemPrompt = SYSTEM_PROMPTS[type] || SYSTEM_PROMPTS.article;
  const maxTokens = type === 'titles' ? 250 : 2000;

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: maxTokens,
      temperature: 0.82
    });

    return res.status(200).json({
      ok: true,
      content: completion.choices[0].message.content,
      tokens: completion.usage?.total_tokens
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
