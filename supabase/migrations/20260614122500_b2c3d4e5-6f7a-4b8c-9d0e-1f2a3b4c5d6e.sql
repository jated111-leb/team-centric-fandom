-- Remove the WC holdout control group entirely. Pre-game reminders and
-- post-match congrats now send to every user whose selected WC team matches,
-- with no 10% holdout exclusion. Drop the now-unused feature flags.
DELETE FROM public.wc_feature_flags
WHERE key IN ('holdout_enabled', 'holdout_percentage');
