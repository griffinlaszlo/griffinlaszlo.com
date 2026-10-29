-- griffinland's guestbook. Run this once in the Supabase SQL Editor.
--
-- Anyone can read the guestbook and sign it, using the project's publishable
-- key (which is public by design - it sits in griffinland.js). Row-level
-- security below is what keeps that key to reading and signing: there's no
-- policy for editing or deleting, so entries only come out through the
-- Supabase dashboard (Table Editor > guestbook). The checks mirror the form's
-- own limits, so nobody can post around them.

create table public.guestbook (
    id          bigint generated always as identity primary key,
    created_at  timestamptz not null default now(),
    name        text not null check (char_length(name) between 1 and 40),
    from_place  text check (char_length(from_place) <= 60),
    homepage    text check (homepage is null or (char_length(homepage) <= 200 and homepage ~* '^https?://')),
    message     text not null check (char_length(message) between 1 and 300),
    mood        text not null default 'dancing.gif' check (mood in (
                    'dancing.gif', 'cat.png', 'sun.gif', 'moon.gif',
                    'tomato.gif', 'lavalamp.gif', 'earth.gif', 'cd1.png'))
);

alter table public.guestbook enable row level security;

create policy "Anyone can read the guestbook"
    on public.guestbook for select
    to anon
    using (true);

create policy "Anyone can sign the guestbook"
    on public.guestbook for insert
    to anon
    with check (true);

-- The site only ever reads and signs; it never needs more than this
grant select, insert on public.guestbook to anon;
