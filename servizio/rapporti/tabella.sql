-- La tabella dei rapporti d'errore di Ambo, per il servizio in servizio/rapporti/index.ts.
-- Schema privato: non esposto dalle API di Supabase, lo legge e scrive solo la funzione. Niente IP.
create schema if not exists ambo;
revoke all on schema ambo from public, anon, authenticated;

create table ambo.errori (
  impronta text not null check (impronta ~ '^[0-9a-f]{12}$'),
  versione text not null check (versione ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  dove text not null check (dove in ('chat', 'riunione', 'produzione', 'server', 'dashboard')),
  tipo text not null check (length(tipo) <= 60),
  messaggio text not null check (length(messaggio) <= 400),
  stack jsonb not null default '[]'::jsonb,
  sistema text not null check (length(sistema) <= 60),
  node text not null check (length(node) <= 20),
  volte integer not null default 1,
  primo timestamptz not null default now(),
  ultimo timestamptz not null default now(),
  primary key (impronta, versione)
);
create index errori_primo on ambo.errori (primo);
create index errori_ultimo on ambo.errori (ultimo);

alter table ambo.errori enable row level security;
revoke all on ambo.errori from public, anon, authenticated;

-- Ogni notte, anche se non arriva più niente: via gli errori fermi da più di 180 giorni.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('ambo-rapporti-pulizia', '17 3 * * *', $$delete from ambo.errori where ultimo < now() - interval '180 days'$$);
