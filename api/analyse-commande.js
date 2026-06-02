// Frenchy Leurres — API analyse commande universelle
// Gère : PDF, image photo, SMS copié, email texte, bon de commande
// Vercel : OPENAI_API_KEY dans Settings > Environment Variables

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Méthode non autorisée' });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: 'OPENAI_API_KEY manquante dans Vercel.' });
    }

    const body = req.body || {};
    const { filename = '', mime = '', dataUrl = '', texte = '', mode = 'cab' } = body;

    const prompt = `Tu es un assistant pour Frenchy Leurres, fabricant de leurres de pêche artisanaux (leurres souples, shads, têtes plombées).

Analyse ce document et extrais TOUTES les lignes produits. C'est TRÈS IMPORTANT : même s'il y a peu de lignes, extrais-les toutes.

Le document peut être :

1. UNE FACTURE ou BON DE LIVRAISON FRENCHY LEURRES (format tableau) :
   Colonnes possibles : Réf, Désignation/Nom, Coloris, Taille, Grammage, Qté, PU HT, Total HT
   Exemple : "FL-2026-001  Ravager Shad  Rose  T1  35g  10  17,90  179,00"
   → extraire : ref=FL-xxx, nom=Ravager Shad, couleur=Rose, taille=T1, grammage=35g, quantite=10, prix_unitaire=17.90

2. UN BON DE COMMANDE CABESTO (PDF avec références PE-XXXXXXX) :
   Quantité réelle : "10,00 pce" = quantite 10
   Références Frenchy entre crochets : [MOULEDEMARS], [PB80g]
   Référence commande format : COMF/2026/XXX/XXXXX

3. UN EMAIL OU SMS D'UN MAGASIN :
   Liste libre de produits avec quantités

4. UNE COMMANDE MANUSCRITE OU PHOTO

RÈGLE ABSOLUE : si tu vois des produits dans le document, il FAUT les mettre dans "lignes". Ne jamais retourner un tableau vide si des produits sont visibles.

Retourne UNIQUEMENT ce JSON valide, sans texte avant ni après :
{
  "ref_commande": "",
  "date_commande": "",
  "magasin": "",
  "type_client": "magasin",
  "numero_facture": "",
  "lignes": [
    {
      "ref_frenchy": "",
      "ref_client": "",
      "designation": "",
      "couleur": "",
      "taille": "",
      "grammage": "",
      "quantite": 1,
      "prix_unitaire": 0
    }
  ],
  "frais_port": 0,
  "total_ht": 0,
  "texte_brut": "",
  "confidence": 0.9
}

Si vraiment aucun produit n'est identifiable, mets le texte intégral visible dans "texte_brut".`;

    let messages;
    const isPdf = /application\/pdf/i.test(mime) || /\.pdf$/i.test(filename);
    const isImage = /image\//i.test(mime) || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(filename);

    if (dataUrl && dataUrl.startsWith('data:') && isImage) {
      messages = [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
        ]
      }];
    } else if (dataUrl && dataUrl.startsWith('data:') && isPdf) {
      const base64Data = dataUrl.split(',')[1] || '';
      messages = [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'text',
            text: 'Document PDF reçu. Voici le contenu encodé base64 (fichier: ' + filename + '). Analyse-le comme un bon de commande.'
          }
        ]
      }];
    } else if (texte && texte.trim()) {
      messages = [{
        role: 'user',
        content: prompt + '\n\nTexte du document :\n' + texte
      }];
    } else {
      return res.status(400).json({ ok: false, error: 'Aucun fichier ni texte reçu.' });
    }

    const model = isImage ? 'gpt-4o' : 'gpt-4o-mini';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0,
        max_tokens: 1500,
        response_format: { type: 'json_object' }
      })
    });

    const raw = await response.json().catch(() => ({}));
    console.log('OpenAI status:', response.status, 'model:', model);

    if (!response.ok) {
      const errMsg = raw.error?.message || 'Erreur OpenAI ' + response.status;
      console.error('OpenAI error:', errMsg);
      return res.status(200).json({ ok: false, error: errMsg });
    }

    let content = raw.choices?.[0]?.message?.content || '{}';
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return res.status(200).json({ ok: false, error: 'JSON introuvable', raw: content });
      try { parsed = JSON.parse(match[0]); }
      catch (e2) { return res.status(200).json({ ok: false, error: 'JSON invalide', raw: content }); }
    }

    const lignes = (parsed.lignes || []).map(function(l) {
      return {
        ref_frenchy: String(l.ref_frenchy || l.ref || '').trim(),
        ref_client: String(l.ref_client || l.ref_cabesto || '').trim(),
        designation: String(l.designation || l.nom || '').trim(),
        quantite: Math.max(1, parseInt(l.quantite) || 1),
        prix_unitaire: parseFloat(l.prix_unitaire || l.prix || 0) || 0
      };
    }).filter(function(l) {
      return l.designation || l.ref_frenchy;
    });

    return res.status(200).json({
      ok: true,
      data: {
        ref_commande: String(parsed.ref_commande || '').trim(),
        date_commande: String(parsed.date_commande || '').trim(),
        magasin: String(parsed.magasin || '').trim(),
        type_client: String(parsed.type_client || mode || 'cabesto').trim(),
        lignes: lignes,
        total_ht: parseFloat(parsed.total_ht || 0) || 0,
        texte_brut: String(parsed.texte_brut || '').trim(),
        confidence: Math.max(0, Math.min(1, parseFloat(parsed.confidence || 0.8)))
      }
    });

  } catch (e) {
    console.error('Erreur serveur:', e.message);
    return res.status(500).json({ ok: false, error: e.message || 'Erreur serveur' });
  }
};
