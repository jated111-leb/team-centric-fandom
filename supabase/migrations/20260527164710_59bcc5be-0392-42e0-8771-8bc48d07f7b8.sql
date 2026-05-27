
REVOKE EXECUTE ON FUNCTION public.compute_analytics_summary(timestamptz, timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_notification_details(timestamptz, timestamptz, integer, integer, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_match_performance(timestamptz, timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_invites_masked() FROM authenticated;

-- Re-grant only to service_role for server-side use
GRANT EXECUTE ON FUNCTION public.compute_analytics_summary(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_notification_details(timestamptz, timestamptz, integer, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_match_performance(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_invites_masked() TO service_role;
