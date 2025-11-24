-- Fix security issue: Restrict schedule_ledger access to admin users only

-- Step 1: Create app_role enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Step 2: Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Step 3: Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Step 4: Create security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Step 5: Add RLS policy for user_roles (admins can view all roles)
CREATE POLICY "Admins can view all user roles"
  ON public.user_roles
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Step 6: Users can view their own roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Step 7: Remove the public read policy from schedule_ledger
DROP POLICY IF EXISTS "Anyone can view schedule ledger" ON public.schedule_ledger;

-- Step 8: Update schedule_ledger policies to require admin role
DROP POLICY IF EXISTS "Authenticated users can manage schedule ledger" ON public.schedule_ledger;

-- Only admins can view schedule ledger
CREATE POLICY "Admins can view schedule ledger"
  ON public.schedule_ledger
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can insert to schedule ledger
CREATE POLICY "Admins can insert to schedule ledger"
  ON public.schedule_ledger
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can update schedule ledger
CREATE POLICY "Admins can update schedule ledger"
  ON public.schedule_ledger
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete from schedule ledger
CREATE POLICY "Admins can delete from schedule ledger"
  ON public.schedule_ledger
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Step 9: Update other sensitive tables to use admin-only access

-- Update team_mappings to require admin for management
DROP POLICY IF EXISTS "Authenticated users can manage team mappings" ON public.team_mappings;

CREATE POLICY "Admins can manage team mappings"
  ON public.team_mappings
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Update featured_teams to require admin for management
DROP POLICY IF EXISTS "Authenticated users can manage featured teams" ON public.featured_teams;

CREATE POLICY "Admins can manage featured teams"
  ON public.featured_teams
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Update feature_flags to require admin
DROP POLICY IF EXISTS "Authenticated users can update feature flags" ON public.feature_flags;

CREATE POLICY "Admins can update feature flags"
  ON public.feature_flags
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Update scheduler_logs to require admin for insert
DROP POLICY IF EXISTS "Authenticated users can insert scheduler logs" ON public.scheduler_logs;

CREATE POLICY "Admins can insert scheduler logs"
  ON public.scheduler_logs
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Update matches policies to require admin
DROP POLICY IF EXISTS "Authenticated users can insert matches" ON public.matches;
DROP POLICY IF EXISTS "Authenticated users can update matches" ON public.matches;

CREATE POLICY "Admins can insert matches"
  ON public.matches
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update matches"
  ON public.matches
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));