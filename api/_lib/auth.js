// Vérifie la session Supabase envoyée par l'application (en-tête Authorization: Bearer <jeton>).
// Seuls les comptes listés dans ALLOWED_EMAILS, avec une adresse email confirmée, sont acceptés.

const SB_URL = (process.env.SUPABASE_URL || 'https://qdpkeftzdgguwfywtprz.supabase.co').trim();
const SB_ANON = (process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkcGtlZnR6ZGdndXdmeXd0cHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2Nzc2NTMsImV4cCI6MjA5MTI1MzY1M30.rBrXwYkkyicEujuQuUNZarODh_wST1ihCCdA4L2B6Dg').trim();
const ALLOWED = (process.env.ALLOWED_EMAILS || 'johangautier98@gmail.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

async function requireUser(req, res) {
  const m = /^Bearer\s+([A-Za-z0-9._-]+)$/.exec(String(req.headers.authorization || ''));
  if (!m) {
    res.status(401).json({ ok: false, error: 'Connexion requise.' });
    return null;
  }
  let r;
  try {
    r = await fetch(SB_URL + '/auth/v1/user', {
      headers: { apikey: SB_ANON, Authorization: 'Bearer ' + m[1] }
    });
  } catch (e) {
    res.status(503).json({ ok: false, error: 'Vérification de la connexion impossible.' });
    return null;
  }
  if (!r.ok) {
    res.status(401).json({ ok: false, error: 'Session expirée, reconnecte-toi.' });
    return null;
  }
  const user = await r.json().catch(() => ({}));
  const email = String(user.email || '').toLowerCase();
  if (!user.email_confirmed_at || !ALLOWED.includes(email)) {
    res.status(403).json({ ok: false, error: 'Compte non autorisé.' });
    return null;
  }
  return user;
}

module.exports = { requireUser };
