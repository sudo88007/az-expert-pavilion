# Team mode setup (free Supabase) – real logins + shared data

Without this, the app runs in **Local mode** (accounts stored only in one browser).
With it, every team member logs in from their own device and sees the same data.
Total time: about 10 minutes. Cost: free.

## 1. Create the project
1. Go to https://supabase.com → **Start your project** → sign in with GitHub.
2. **New project** → name `az-expert`, choose a database password, pick the closest region → **Create**.
3. Wait ~2 minutes until it is ready.

## 2. Create the tables and security rules
Open **SQL Editor** → **New query**, paste everything below, click **Run**:

```sql
-- user profiles (role per user)
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  name text,
  role text not null default 'pending',   -- pending | viewer | editor | manager | admin | disabled
  created_at timestamptz default now()
);

-- the shared project data (one row)
create table public.app_state (
  id int primary key,
  data jsonb,
  updated_at timestamptz default now()
);

-- helper: role of the current user
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

-- create a profile automatically; the FIRST user becomes admin
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.email),
          case when (select count(*) from public.profiles) = 0 then 'admin' else 'pending' end);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- security rules
alter table public.profiles enable row level security;
alter table public.app_state enable row level security;

create policy "read own or admin" on public.profiles for select
  using (id = auth.uid() or public.my_role() = 'admin');
create policy "admin updates roles" on public.profiles for update
  using (public.my_role() = 'admin');

create policy "approved users read data" on public.app_state for select
  using (public.my_role() in ('viewer','editor','manager','admin'));
create policy "editors insert data" on public.app_state for insert
  with check (public.my_role() in ('editor','manager','admin'));
create policy "editors update data" on public.app_state for update
  using (public.my_role() in ('editor','manager','admin'));
```

## 3. Make sign-up simple
**Authentication → Providers → Email** → turn **OFF** "Confirm email" (so people can sign in right after requesting access) → Save.

## 4. Connect the app
1. **Project Settings → API**. Copy **Project URL** and the **anon public** key.
2. Open `config.js` and paste them:
   ```js
   window.AZ_CONFIG = {
     SUPABASE_URL: 'https://xxxx.supabase.co',
     SUPABASE_ANON_KEY: 'eyJhbGciOi...'
   };
   ```
   (The anon key is meant to be public. The database rules above protect your data. **Never** paste the `service_role` key.)
3. Upload the updated `config.js` to GitHub (or re-drag the folder to Netlify).

## 5. First use
1. Open your site and click **Request access**, create **your own account first** → you automatically become **admin**.
2. Share the link with your team. They click **Request access**.
3. In **👥 Users** you will see them as *pending* – pick a role:
   - **viewer** – read only
   - **editor** – edit villas, upload Excel/PDF (changes go through approval)
   - **manager** – edits + approves other users' requests
   - **admin** – everything + manage users + final approval + change approval sequence
   - **disabled** – blocks the account

Data is saved to the shared database when changes are approved; use **⟳ Sync** to reload the latest data.
