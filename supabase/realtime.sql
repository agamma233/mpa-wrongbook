-- Only the per-user sequence hint is published; RLS still filters subscriptions.
-- Safe to rerun. Personal operations are pulled through the existing RPC.
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='wrongbook_sync_heads') then
  alter publication supabase_realtime add table public.wrongbook_sync_heads;
 end if;
end $$;
