-- Lets a signed-in user delete their own account and, by cascade, every
-- collection and saved tab they own. SECURITY DEFINER is required because
-- auth.users is not writable by the `authenticated` role.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_own_account() from anon, public;
grant execute on function public.delete_own_account() to authenticated;
