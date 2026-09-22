-- Fix an older conclude_session(integer) function that still reads staff
-- assignments from fields such as s.host. In the normalized schema,
-- session_ongoing has no host/co-host/assistant columns: assignments are
-- session_staff rows identified by role codes.
--
-- This preserves the rest of the installed function (staff/trainee/driver
-- archives, quota updates, and cleanup) and replaces only stale staff-field reads.
-- It is safe to run again: an already-fixed function is left unchanged.

do $migration$
declare
  function_oid oid;
  old_definition text;
  new_definition text;
  legacy_fields constant text[] := array[
    'host',
    'co_host1', 'cohost1', 'cohost_1',
    'co_host2', 'cohost2', 'cohost_2',
    'co_host3', 'cohost3', 'cohost_3',
    'co_host4', 'cohost4', 'cohost_4',
    'co_host4_supervisor', 'cohost4_supervisor', 'cohost_4_supervisor',
    'cohost4/supervisor', 'co_host4/supervisor', 'cohost_4/supervisor', 'co_host_4/supervisor',
    'assistant_1', 'assistant1',
    'assistant_2', 'assistant2',
    'assistant_3', 'assistant3',
    'assistant_4', 'assistant4'
  ];
  role_codes constant text[] := array[
    'HOST',
    'CH_1', 'CH_1', 'CH_1',
    'CH_2', 'CH_2', 'CH_2',
    'CH_3', 'CH_3', 'CH_3',
    'CH_4', 'CH_4', 'CH_4',
    'CH_4', 'CH_4', 'CH_4',
    'CH_4', 'CH_4', 'CH_4', 'CH_4',
    'AST_1', 'AST_1',
    'AST_2', 'AST_2',
    'AST_3', 'AST_3',
    'AST_4', 'AST_4'
  ];
  field_index integer;
  legacy_match text[];
  legacy_field text;
  normalized_field text;
  inferred_role_code text;
  replacement_expression text;
  installed_definition text;
begin
  select p.oid
    into function_oid
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'conclude_session'
     and pg_get_function_identity_arguments(p.oid) = 'p_session_id integer';

  if function_oid is null then
    raise exception 'public.conclude_session(p_session_id integer) was not found';
  end if;

  old_definition := pg_get_functiondef(function_oid);
  new_definition := old_definition;
  for field_index in array_lower(legacy_fields, 1)..array_upper(legacy_fields, 1) loop
    replacement_expression := format(
      $expression$
        (select staff_assignment.staff_name
           from public.session_staff as staff_assignment
          where staff_assignment.session_id = p_session_id
            and (staff_assignment.role = %L or staff_assignment.role like %L)
          order by case when staff_assignment.role = %L then 0 else 1 end,
                   staff_assignment.staff_row_id
          limit 1)
      $expression$,
      role_codes[field_index],
      role_codes[field_index] || ',%',
      role_codes[field_index]
    );

    -- pg_get_functiondef preserves unusual record fields such as
    -- s."cohost4/supervisor" as quoted identifiers. A literal replacement
    -- avoids regex word-boundary behavior around the slash.
    new_definition := replace(
      new_definition,
      format('s."%s"', legacy_fields[field_index]),
      replacement_expression
    );

    -- Also cover definitions with whitespace around the record-field dot.
    new_definition := regexp_replace(
      new_definition,
      format(
        '"?s"?[[:space:]]*\.[[:space:]]*"%s"',
        legacy_fields[field_index]
      ),
      replacement_expression,
      'gi'
    );

    new_definition := regexp_replace(
      new_definition,
      format(
        '"?\ms\M"?[[:space:]]*\.[[:space:]]*%s\M',
        legacy_fields[field_index]
      ),
      replacement_expression,
      'gi'
    );
  end loop;

  -- Compatibility fallback for older deployments that used another spelling.
  -- Infer only recognized staff-assignment fields; unrelated fields such as
  -- s.host_notes are deliberately left alone.
  for legacy_match in
    select found.parts
      from regexp_matches(
        new_definition,
        '("?s"?[[:space:]]*\.[[:space:]]*(("([^"]+)")|([a-zA-Z_][a-zA-Z0-9_]*)))',
        'gi'
      ) as found(parts)
  loop
    legacy_field := coalesce(legacy_match[4], legacy_match[5]);
    normalized_field := regexp_replace(lower(legacy_field), '[^a-z0-9]', '', 'g');
    inferred_role_code := case
      when normalized_field = 'host' then 'HOST'
      when normalized_field ~ '^cohost[1-4]'
        then 'CH_' || substring(normalized_field from '^cohost([1-4])')
      when normalized_field ~ '^assistant[1-4]'
        then 'AST_' || substring(normalized_field from '^assistant([1-4])')
      when normalized_field ~ '^asst[1-4]'
        then 'AST_' || substring(normalized_field from '^asst([1-4])')
      else null
    end;

    if inferred_role_code is not null then
      replacement_expression := format(
        $expression$
          (select staff_assignment.staff_name
             from public.session_staff as staff_assignment
            where staff_assignment.session_id = p_session_id
              and (staff_assignment.role = %L or staff_assignment.role like %L)
            order by case when staff_assignment.role = %L then 0 else 1 end,
                     staff_assignment.staff_row_id
            limit 1)
        $expression$,
        inferred_role_code,
        inferred_role_code || ',%',
        inferred_role_code
      );

      new_definition := replace(
        new_definition,
        legacy_match[1],
        replacement_expression
      );
    end if;
  end loop;

  if new_definition = old_definition then
    raise notice 'conclude_session already has no legacy staff-field references; no change was needed';
    return;
  end if;

  -- The definition comes from PostgreSQL's own catalog, not from request/user
  -- input. CREATE OR REPLACE keeps the existing signature, owner, and grants.
  execute new_definition;

  select pg_get_functiondef(function_oid)
    into installed_definition;

  if installed_definition ~* '"?s"?[[:space:]]*\.[[:space:]]*"co_?host_?4/supervisor"' then
    raise warning 'conclude_session still contains a legacy co-host 4/supervisor record-field reference';
  end if;

  raise notice 'conclude_session updated to read staff assignments from session_staff';
end;
$migration$;

-- Verification: both booleans must be false. The final array exposes any
-- recognized legacy spelling instead of reducing the diagnosis to true/false.
with target_function as (
  select pg_get_functiondef(p.oid) as definition
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'conclude_session'
     and pg_get_function_identity_arguments(p.oid) = 'p_session_id integer'
), function_references as (
  select distinct
    found.parts[1] as reference,
    regexp_replace(
      lower(coalesce(found.parts[4], found.parts[5])),
      '[^a-z0-9]',
      '',
      'g'
    ) as normalized_field
  from target_function
  cross join lateral regexp_matches(
    target_function.definition,
    '("?s"?[[:space:]]*\.[[:space:]]*(("([^"]+)")|([a-zA-Z_][a-zA-Z0-9_]*)))',
    'gi'
  ) as found(parts)
), remaining_legacy_references as (
  select reference
    from function_references
   where normalized_field = 'host'
      or normalized_field ~ '^cohost[1-4]'
      or normalized_field ~ '^assistant[1-4]'
      or normalized_field ~ '^asst[1-4]'
)
select
  exists (
    select 1
      from function_references
     where normalized_field = 'cohost4supervisor'
       and reference like '%/%'
  ) as still_uses_exact_cohost4_supervisor,
  exists (
    select 1
      from remaining_legacy_references
  ) as still_uses_removed_staff_column,
  array(
    select reference
      from remaining_legacy_references
     order by reference
  ) as remaining_legacy_references;
