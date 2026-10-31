-- Délai de paiement des magasins (immédiat / 1 à 4 semaines).
-- Ajoute seulement 2 colonnes à la table des factures : ne supprime et ne modifie AUCUNE donnée existante.
alter table public.factures add column if not exists delai_jours integer;
alter table public.factures add column if not exists date_echeance date;
