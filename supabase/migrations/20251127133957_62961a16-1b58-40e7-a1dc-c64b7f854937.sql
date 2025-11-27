-- Add RLS policies to allow admins to manage team translations

-- Allow admins to insert team translations
CREATE POLICY "Admins can insert team translations"
ON public.team_translations
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update team translations
CREATE POLICY "Admins can update team translations"
ON public.team_translations
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete team translations
CREATE POLICY "Admins can delete team translations"
ON public.team_translations
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));