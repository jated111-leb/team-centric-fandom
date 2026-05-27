GRANT EXECUTE ON FUNCTION public.get_admin_invites_masked() TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_analytics_summary(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_notification_details(timestamptz, timestamptz, integer, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_match_performance(timestamptz, timestamptz) TO authenticated;