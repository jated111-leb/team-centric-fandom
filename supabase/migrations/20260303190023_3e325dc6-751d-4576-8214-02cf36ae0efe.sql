
-- Add RLS policies to system_config (currently has RLS enabled but NO policies)
CREATE POLICY "Admins can view system config"
ON public.system_config
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert system config"
ON public.system_config
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update system config"
ON public.system_config
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete system config"
ON public.system_config
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
