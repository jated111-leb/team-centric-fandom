
-- Create admin_invites table to track invite status
CREATE TABLE public.admin_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  invited_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  user_id uuid NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  accepted_at timestamp with time zone NULL,
  last_resent_at timestamp with time zone NULL,
  resend_count integer NOT NULL DEFAULT 0,
  UNIQUE(email)
);

-- Enable RLS
ALTER TABLE public.admin_invites ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admins can view invites"
ON public.admin_invites FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert invites"
ON public.admin_invites FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update invites"
ON public.admin_invites FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete invites"
ON public.admin_invites FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
