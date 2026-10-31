-- ═══════════════════════════════════════════════════════════════════════
-- FRENCHY LEURRES — VERROUILLAGE DE LA BASE (4 octobre 2026)
-- Ce script NE SUPPRIME AUCUNE DONNÉE : aucune facture, aucun client, aucune ligne.
-- Il remplace seulement les anciennes règles « ouvert à tout le monde »
-- par la règle « seulement le compte johangautier98@gmail.com, email confirmé ».
-- À coller dans Supabase → SQL Editor → New query → Run.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Qui est le propriétaire ?
create or replace function public.fl_is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and lower(u.email) = 'johangautier98@gmail.com'
      and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.fl_is_owner() from public, anon;
grant execute on function public.fl_is_owner() to authenticated;

-- 2. Toutes les tables : on ferme l'accès public et on ouvre uniquement au propriétaire.
do $$
declare t record; p record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    begin
      execute format('alter table public.%I enable row level security', t.tablename);
      for p in select policyname from pg_policies where schemaname = 'public' and tablename = t.tablename loop
        execute format('drop policy %I on public.%I', p.policyname, t.tablename);
      end loop;
      execute format('create policy fl_owner_only on public.%I for all to authenticated using ((select public.fl_is_owner())) with check ((select public.fl_is_owner()))', t.tablename);
    exception when others then
      raise notice 'Table % non verrouillée : %', t.tablename, sqlerrm;
    end;
  end loop;
end $$;

revoke all on all tables in schema public from anon;

do $$
begin
  execute 'alter default privileges for role postgres in schema public revoke all on tables from anon';
exception when others then
  raise notice 'Privilèges par défaut non modifiés : %', sqlerrm;
end $$;

-- 3. Dossier des justificatifs comptables : privé, réservé au propriétaire.
--    (Si Supabase refuse cette partie, le verrouillage des tables ci-dessus reste appliqué.)
do $$
declare p record;
begin
  insert into storage.buckets (id, name, public)
  values ('compta-factures', 'compta-factures', false)
  on conflict (id) do update set public = false;

  for p in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and (coalesce(qual, '') ilike '%compta-factures%'
               or coalesce(with_check, '') ilike '%compta-factures%'
               or roles && array['anon', 'public']::name[]) loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;

  execute $p$create policy fl_owner_compta_files on storage.objects
    for all to authenticated
    using (bucket_id = 'compta-factures' and (select public.fl_is_owner()))
    with check (bucket_id = 'compta-factures' and (select public.fl_is_owner()))$p$;
exception when others then
  raise notice 'Dossier des justificatifs non modifié : %', sqlerrm;
end $$;

-- 4. Contrôle : tes données sont toujours là (nombre de lignes par table).
select 'factures' as table_name, count(*) as lignes from public.factures
union all select 'pro_clients', count(*) from public.pro_clients
union all select 'products', count(*) from public.products
union all select 'compta_documents', count(*) from public.compta_documents
union all select 'scheduled_payments', count(*) from public.scheduled_payments
union all select 'orders', count(*) from public.orders
union all select 'order_items', count(*) from public.order_items
union all select 'magasins', count(*) from public.magasins;
