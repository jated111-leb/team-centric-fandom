-- ─────────────────────────────────────────────────────────────────────────────
-- User profiles, points, and live chat tables
-- Wires every gamification element to real Supabase Auth user IDs.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. profiles ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username         text UNIQUE,
  display_name     text,
  avatar_url       text,
  is_subscribed    boolean NOT NULL DEFAULT false,
  subscription_tier text,           -- 'free' | 'premium'
  subscribed_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read and update their own profile; admins can read all
CREATE POLICY "profiles: users read own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles: users update own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "profiles: admins read all"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto-create a profile row whenever a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── 2. user_points ────────────────────────────────────────────────────────────
-- One row per user; running total updated on every point award.
CREATE TABLE IF NOT EXISTS public.user_points (
  user_id      uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_points integer NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_points: users read own"
  ON public.user_points FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_points: users upsert own"
  ON public.user_points FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_points: users update own"
  ON public.user_points FOR UPDATE
  USING (auth.uid() = user_id);

-- Leaderboard: any authenticated user can see the full ranking
CREATE POLICY "user_points: authenticated read all"
  ON public.user_points FOR SELECT
  USING (auth.role() = 'authenticated');


-- ── 3. points_history ────────────────────────────────────────────────────────
-- Immutable audit log of every point transaction.
CREATE TABLE IF NOT EXISTS public.points_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount     integer NOT NULL,
  source     text NOT NULL,   -- e.g. 'prediction', 'pre-trivia', 'live-quiz'
  match_id   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.points_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "points_history: users read own"
  ON public.points_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "points_history: users insert own"
  ON public.points_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ── 4. chat_messages ─────────────────────────────────────────────────────────
-- Live match chat; user_id nullable to allow guest display names.
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  match_id   text NOT NULL,
  message    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read and insert chat messages
CREATE POLICY "chat_messages: authenticated read"
  ON public.chat_messages FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "chat_messages: authenticated insert"
  ON public.chat_messages FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Enable Realtime for live chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
