// Frenchy Leurres — API analyse facture/ticket/photo
// Sans dépendance externe — fetch natif Node.js 18+
// Vercel : OPENAI_API_KEY dans Settings > Environment Variables

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Méthode non autorisée" });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: "OPENAI_API_KEY manquante dans Vercel." });
    }

    const body = req.body || {};
    if (body._ping) return res.status(200).json({ ok: true, ping: true });

    const { filename = "", mime = "", dataUrl = "", texte = "" } = body;

    const prompt = `Tu es un expert comptable français pour Frenchy Leurres, micro-entreprise de leurres de pêche.
Analyse cette facture/ticket et retourne UNIQUEMENT un objet JSON valide, sans texte avant ni après.
Règles :
- date_doc : format YYYY-MM-DD ou "" si invisible
- montant_ttc : total TTC payé (nombre décimal)
- fournisseur : nom du magasin ou fournisseur
- type_doc : depense | recette | liquide_b | ca_historique | avoir
- categorie : materiel_fabrication | frais_materiel | la_poste | frais_de_port | timbres_poste | emballage | shopify_stripe_paypal | carburant | vente_boutique | vente_pro | liquide_b | depot_banque | ca_historique | general
- paiement : a_classer | cb | paypal | stripe | virement | especes | depot_banque
- confidence : 0 à 1
JSON : {"date_doc":"","fournisseur":"","montant_ttc":0,"type_doc":"depense","categorie":"general","paiement":"a_classer","notes":"","confidence":0}`;

    let messages;

    if (dataUrl && dataUrl.startsWith("data:")) {
      const isPdf = /application\/pdf/i.test(mime) || /\.pdf$/i.test(filename);
      if (isPdf) {
        messages = [{ role: "user", content: prompt + "\n\nPDF non analysable en vision. Retourne JSON vide avec confidence:0." }];
      } else {
        messages = [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
          ]
        }];
      }
    } else if (texte && texte.trim()) {
      messages = [{ role: "user", content: prompt + "\n\nTexte :\n" + texte }];
    } else {
      return res.status(400).json({ ok: false, error: "Aucun fichier ni texte reçu." });
    }

    const isPdf = /application\/pdf/i.test(mime) || /\.pdf$/i.test(filename);
    const model = (!isPdf && dataUrl) ? "gpt-4o" : "gpt-4o-mini";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0,
        max_tokens: 500,
        response_format: { type: "json_object" }
      })
    });

    const raw = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(200).json({ ok: false, error: raw.error?.message || "Erreur OpenAI " + response.status });
    }

    let content = raw.choices?.[0]?.message?.content || "{}";
    content = content.replace(/```json/g, "").replace(/```/g, "").trim();

    let parsed;
    try { parsed = JSON.parse(content); }
    catch (e) { return res.status(200).json({ ok: false, error: "JSON invalide", raw: content }); }

    const allowedTypes = ["depense","recette","liquide_b","ca_historique","avoir"];
    const allowedCats = ["materiel_fabrication","frais_materiel","la_poste","frais_de_port","timbres_poste","emballage","shopify_stripe_paypal","carburant","vente_boutique","vente_pro","liquide_b","depot_banque","ca_historique","general"];
    const allowedPay = ["a_classer","cb","paypal","stripe","virement","especes","depot_banque"];

    const clean = {
      date_doc: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date_doc || "") ? parsed.date_doc : "",
      fournisseur: String(parsed.fournisseur || "").slice(0, 120),
      montant_ttc: Number(String(parsed.montant_ttc || 0).replace(",", ".")) || 0,
      type_doc: allowedTypes.includes(parsed.type_doc) ? parsed.type_doc : "depense",
      categorie: allowedCats.includes(parsed.categorie) ? parsed.categorie : "general",
      paiement: allowedPay.includes(parsed.paiement) ? parsed.paiement : "a_classer",
      notes: String(parsed.notes || "").slice(0, 500),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0)))
    };

    return res.status(200).json({ ok: true, data: clean });

  } catch (e) {
    console.error("Erreur:", e.message);
    return res.status(500).json({ ok: false, error: e.message || "Erreur serveur" });
  }
};
