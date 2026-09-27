-- Apply before deploying application changes. This preserves every policy's
-- predicate while allowing PostgreSQL to evaluate auth.uid() once per query.
-- It is safe to run repeatedly. To roll back, restore the prior policies from
-- the database migration snapshot rather than guessing their predicates.
do $migration$
declare
  policy record;
  old_qual text;
  old_check text;
  new_qual text;
  new_check text;
begin
  for policy in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (qual like '%auth.uid()%' or with_check like '%auth.uid()%')
  loop
    old_qual := policy.qual;
    old_check := policy.with_check;
    new_qual := replace(replace(replace(old_qual,
      '(select auth.uid())', '__rls_uid_placeholder__'),
      'auth.uid()', '(select auth.uid())'),
      '__rls_uid_placeholder__', '(select auth.uid())');
    new_check := replace(replace(replace(old_check,
      '(select auth.uid())', '__rls_uid_placeholder__'),
      'auth.uid()', '(select auth.uid())'),
      '__rls_uid_placeholder__', '(select auth.uid())');

    if new_qual is distinct from old_qual or new_check is distinct from old_check then
      execute format('alter policy %I on %I.%I%s%s',
        policy.policyname, policy.schemaname, policy.tablename,
        case when new_qual is null then '' else format(' using (%s)', new_qual) end,
        case when new_check is null then '' else format(' with check (%s)', new_check) end);
    end if;
  end loop;
end;
$migration$;

-- RLS on notifications filters recipients by profile_id and notif_id.
-- Confirm no equivalent index exists before applying on a large live table.
create index if not exists notification_recipients_profile_notif_idx
  on public.notification_recipients (profile_id, notif_id);
