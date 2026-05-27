
-- 1. Restrict copilot tables to admin users only (admin-only internal tool)
DROP POLICY IF EXISTS "Users can delete their own copilot campaigns" ON public.copilot_campaigns;
DROP POLICY IF EXISTS "Users can insert their own copilot campaigns" ON public.copilot_campaigns;
DROP POLICY IF EXISTS "Users can update their own copilot campaigns" ON public.copilot_campaigns;
DROP POLICY IF EXISTS "Users can view their own copilot campaigns" ON public.copilot_campaigns;

CREATE POLICY "Admins view copilot_campaigns" ON public.copilot_campaigns
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND auth.uid() = created_by);
CREATE POLICY "Admins insert copilot_campaigns" ON public.copilot_campaigns
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.uid() = created_by);
CREATE POLICY "Admins update copilot_campaigns" ON public.copilot_campaigns
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND auth.uid() = created_by)
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.uid() = created_by);
CREATE POLICY "Admins delete copilot_campaigns" ON public.copilot_campaigns
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can delete their own copilot messages" ON public.copilot_messages;
DROP POLICY IF EXISTS "Users can insert their own copilot messages" ON public.copilot_messages;
DROP POLICY IF EXISTS "Users can update their own copilot messages" ON public.copilot_messages;
DROP POLICY IF EXISTS "Users can view their own copilot messages" ON public.copilot_messages;

CREATE POLICY "Admins view copilot_messages" ON public.copilot_messages
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND auth.uid() = user_id);
CREATE POLICY "Admins insert copilot_messages" ON public.copilot_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.uid() = user_id);
CREATE POLICY "Admins update copilot_messages" ON public.copilot_messages
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND auth.uid() = user_id)
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.uid() = user_id);
CREATE POLICY "Admins delete copilot_messages" ON public.copilot_messages
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND auth.uid() = user_id);

-- 2. Restrict copilot-assets storage bucket to admin uploads/deletes/listing.
-- Public CDN read access continues to work because the bucket is marked public
-- (Supabase serves public-bucket objects directly without consulting RLS).
DROP POLICY IF EXISTS "Authenticated users can upload copilot assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete copilot assets" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for copilot assets" ON storage.objects;

CREATE POLICY "Admins upload copilot assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'copilot-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete copilot assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'copilot-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins list copilot assets"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'copilot-assets' AND public.has_role(auth.uid(), 'admin'));

-- 3. Restrict Realtime channel subscriptions to admins (schedule_ledger / notification_sends contain sensitive ops data)
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins only realtime subscriptions" ON realtime.messages;
CREATE POLICY "Admins only realtime subscriptions"
  ON realtime.messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Revoke EXECUTE on SECURITY DEFINER functions from anon (and authenticated where appropriate).
-- has_role is invoked inside RLS expressions for authenticated users, so it must stay executable by authenticated.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.compute_analytics_summary(timestamptz, timestamptz) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_notification_details(timestamptz, timestamptz, integer, integer, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_match_performance(timestamptz, timestamptz) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_admin_invites_masked() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pg_try_advisory_lock(integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pg_advisory_unlock(integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_matches_updated_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_feature_flags_updated_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_schedule_ledger_updated_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
