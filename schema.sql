-- =====================================================================
-- PARKING SLOT FINDER  -  Supabase schema
-- Run this whole file once in: Supabase Dashboard -> SQL Editor -> New query
-- =====================================================================
create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text default '',
  phone text default '',
  email text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''),
          coalesce(new.raw_user_meta_data->>'phone',''), new.email)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- users can never promote themselves
create or replace function public.protect_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'Not allowed to change role';
  end if;
  return new;
end $$;
drop trigger if exists protect_role_trg on public.profiles;
create trigger protect_role_trg before update on public.profiles
  for each row execute function public.protect_role();

-- ---------- LOCATIONS & SLOTS ----------
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  city text default '',
  lat double precision not null,
  lng double precision not null,
  price_per_hour numeric(8,2) not null check (price_per_hour >= 0),
  image_url text,
  description text default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.slots (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  label text not null,
  status text not null default 'active' check (status in ('active','occupied','maintenance')),
  unique (location_id, label)
);

-- ---------- BOOKINGS ----------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_code text not null unique,
  user_id uuid not null references public.profiles(id),
  location_id uuid not null references public.locations(id),
  slot_id uuid not null references public.slots(id),
  start_time timestamptz not null,
  end_time timestamptz not null,
  amount numeric(10,2) not null,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled','expired')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (end_time > start_time),
  -- DATABASE-LEVEL double-booking prevention
  constraint no_double_booking exclude using gist
    (slot_id with =, tstzrange(start_time, end_time) with &&)
    where (status in ('pending','confirmed'))
);
create index if not exists bookings_user_idx on public.bookings(user_id, start_time desc);

-- Public, user-free mirror of active holds (so everyone sees live availability)
create table if not exists public.slot_holds (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  slot_id uuid not null,
  location_id uuid not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null
);
create index if not exists slot_holds_loc_idx on public.slot_holds(location_id, end_time);

create or replace function public.sync_slot_hold() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.slot_holds where booking_id = old.id; return old;
  end if;
  if new.status in ('pending','confirmed') then
    insert into public.slot_holds (booking_id, slot_id, location_id, start_time, end_time, status)
    values (new.id, new.slot_id, new.location_id, new.start_time, new.end_time, new.status)
    on conflict (booking_id) do update
      set start_time = excluded.start_time, end_time = excluded.end_time, status = excluded.status;
  else
    delete from public.slot_holds where booking_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists sync_slot_hold_trg on public.bookings;
create trigger sync_slot_hold_trg after insert or update or delete on public.bookings
  for each row execute function public.sync_slot_hold();

-- ---------- PAYMENTS, FAVOURITES, FEEDBACK, NOTIFICATIONS ----------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  user_id uuid not null references public.profiles(id),
  amount numeric(10,2) not null,
  method text,
  status text not null check (status in ('paid','failed','refund_pending','refunded')),
  gateway text not null default 'razorpay',
  gateway_payment_id text,
  failure_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.favourites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, location_id)
);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  email text not null,
  rating int check (rating between 1 and 5),
  message text not null check (char_length(message) between 3 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text default '',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- BOOKING FUNCTIONS (all writes go through these) ----------
create or replace function public.expire_pending() returns void
language sql security definer set search_path = public as $$
  update public.bookings set status = 'expired'
  where status = 'pending' and created_at < now() - interval '10 minutes';
$$;

create or replace function public.create_booking(p_slot uuid, p_start timestamptz, p_end timestamptz)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare v_slot public.slots; v_loc public.locations; v_hours numeric; b public.bookings;
begin
  if auth.uid() is null then raise exception 'Please log in first'; end if;
  perform public.expire_pending();
  if p_end <= p_start then raise exception 'Exit time must be after entry time'; end if;
  if p_start < now() - interval '5 minutes' then raise exception 'Entry time is in the past'; end if;
  if p_end - p_start > interval '24 hours' then raise exception 'Maximum booking length is 24 hours'; end if;
  select * into v_slot from public.slots where id = p_slot;
  if not found then raise exception 'Slot not found'; end if;
  if v_slot.status <> 'active' then raise exception 'This slot is not available'; end if;
  select * into v_loc from public.locations where id = v_slot.location_id and is_active;
  if not found then raise exception 'Location not available'; end if;
  v_hours := ceil(extract(epoch from (p_end - p_start)) / 3600.0);
  begin
    insert into public.bookings (booking_code, user_id, location_id, slot_id, start_time, end_time, amount)
    values ('PSF-' || upper(encode(gen_random_bytes(4), 'hex')), auth.uid(), v_loc.id, p_slot,
            p_start, p_end, v_hours * v_loc.price_per_hour)
    returning * into b;
  exception when exclusion_violation then
    raise exception 'Sorry, this slot was just booked for that time. Please pick another slot.';
  end;
  return b;
end $$;

create or replace function public.confirm_payment(p_booking uuid, p_gateway_payment_id text, p_method text)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking and user_id = auth.uid() for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status = 'confirmed' then return b; end if;
  if b.status not in ('pending','expired') then raise exception 'Booking cannot be confirmed (%).', b.status; end if;
  begin
    update public.bookings set status = 'confirmed' where id = b.id returning * into b;
  exception when exclusion_violation then
    -- hold expired and someone else took the slot: record payment for refund, keep booking expired
    insert into public.payments (booking_id, user_id, amount, method, status, gateway_payment_id)
    values (b.id, b.user_id, b.amount, p_method, 'refund_pending', p_gateway_payment_id);
    return b;
  end;
  insert into public.payments (booking_id, user_id, amount, method, status, gateway_payment_id)
  values (b.id, b.user_id, b.amount, p_method, 'paid', p_gateway_payment_id);
  insert into public.notifications (user_id, title, body)
  values (b.user_id, 'Booking confirmed', 'Booking ' || b.booking_code || ' is confirmed.');
  return b;
end $$;

create or replace function public.record_payment_failure(p_booking uuid, p_method text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking and user_id = auth.uid();
  if not found then return; end if;
  insert into public.payments (booking_id, user_id, amount, method, status, failure_reason)
  values (b.id, b.user_id, b.amount, p_method, 'failed', left(coalesce(p_reason,''), 300));
end $$;

create or replace function public.cancel_booking(p_booking uuid)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking and user_id = auth.uid() for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status = 'confirmed' then
    if b.start_time < now() + interval '1 hour' then
      raise exception 'Confirmed bookings can be cancelled only up to 1 hour before entry time';
    end if;
  elsif b.status <> 'pending' then
    raise exception 'This booking cannot be cancelled';
  end if;
  update public.bookings set status = 'cancelled', cancelled_at = now() where id = b.id returning * into b;
  update public.payments set status = 'refund_pending' where booking_id = b.id and status = 'paid';
  insert into public.notifications (user_id, title, body)
  values (b.user_id, 'Booking cancelled', 'Booking ' || b.booking_code || ' was cancelled.');
  return b;
end $$;

-- ---------- ROW LEVEL SECURITY ----------
alter table public.profiles      enable row level security;
alter table public.locations     enable row level security;
alter table public.slots         enable row level security;
alter table public.bookings      enable row level security;
alter table public.slot_holds    enable row level security;
alter table public.payments      enable row level security;
alter table public.favourites    enable row level security;
alter table public.feedback      enable row level security;
alter table public.notifications enable row level security;

-- profiles
create policy "profiles read own/admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles update own"     on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles admin update"   on public.profiles for update using (public.is_admin()) with check (public.is_admin());
-- locations / slots: public read, admin write
create policy "locations public read" on public.locations for select using (is_active or public.is_admin());
create policy "locations admin write" on public.locations for all using (public.is_admin()) with check (public.is_admin());
create policy "slots public read"     on public.slots for select using (true);
create policy "slots admin write"     on public.slots for all using (public.is_admin()) with check (public.is_admin());
-- bookings: read own / admin; writes only via functions (admin may update)
create policy "bookings read own/admin" on public.bookings for select using (user_id = auth.uid() or public.is_admin());
create policy "bookings admin update"   on public.bookings for update using (public.is_admin()) with check (public.is_admin());
-- holds: anyone can read (contains no personal data)
create policy "holds public read" on public.slot_holds for select using (true);
-- payments
create policy "payments read own/admin" on public.payments for select using (user_id = auth.uid() or public.is_admin());
create policy "payments admin update"   on public.payments for update using (public.is_admin()) with check (public.is_admin());
-- favourites
create policy "fav own all" on public.favourites for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- feedback: anyone may submit, only admin reads
create policy "feedback insert" on public.feedback for insert with check (user_id is null or user_id = auth.uid());
create policy "feedback admin read" on public.feedback for select using (public.is_admin());
-- notifications
create policy "notif read own"   on public.notifications for select using (user_id = auth.uid());
create policy "notif update own" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- REALTIME ----------
alter publication supabase_realtime add table public.slot_holds;
alter publication supabase_realtime add table public.slots;
alter publication supabase_realtime add table public.locations;
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.notifications;

-- ---------- MAKE YOURSELF ADMIN ----------
-- 1) Register normally on the website.  2) Then run (replace the email):
-- update public.profiles set role = 'admin' where email = 'you@example.com';
