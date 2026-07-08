-- ═══════════════════════════════════════════════════════════════
-- TABLE : articles_publies
-- À exécuter dans : Supabase Dashboard → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS articles_publies (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  boutique            text NOT NULL CHECK (boutique IN ('fl', 'ravager')),
  sujet               text NOT NULL,
  produit             text,
  couleur             text,
  grammage            text,
  technique           text,
  shopify_article_id  text,
  shopify_url         text,
  published_at        timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_articles_boutique    ON articles_publies(boutique);
CREATE INDEX IF NOT EXISTS idx_articles_published   ON articles_publies(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_produit     ON articles_publies(produit);

-- Autoriser lecture/écriture depuis les fonctions Vercel (anon key)
ALTER TABLE articles_publies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture libre" ON articles_publies
  FOR SELECT USING (true);

CREATE POLICY "Insertion depuis serveur" ON articles_publies
  FOR INSERT WITH CHECK (true);
