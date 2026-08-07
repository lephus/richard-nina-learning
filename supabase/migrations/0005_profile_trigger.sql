-- 0003_user_state.sql:1-5 dat profiles.display_name la NOT NULL nhung khong co
-- gi tu tao dong khi co nguoi dang ky. Neu de Server Action chen sau khi
-- signUp thanh cong, chi can request dut giua chung la sinh ra mot auth.users
-- khong co profiles — nguoi dung dang nhap duoc nhung app vo o moi cho join.
--
-- Dat bat bien nay o database, khong o ma ung dung, de khong duong nao pha duoc.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
-- Chan tan cong doi search_path: ham SECURITY DEFINER chay bang quyen chu so
-- huu, neu khong ghim search_path thi ke tan cong co the tro "profiles" sang
-- bang cua ho.
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
