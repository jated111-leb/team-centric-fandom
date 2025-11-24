-- Fix security warning: Add search_path to advisory lock functions
DROP FUNCTION IF EXISTS pg_try_advisory_lock(integer);
DROP FUNCTION IF EXISTS pg_advisory_unlock(integer);

CREATE OR REPLACE FUNCTION pg_try_advisory_lock(key integer)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT pg_try_advisory_lock(key::bigint);
$$;

CREATE OR REPLACE FUNCTION pg_advisory_unlock(key integer)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT pg_advisory_unlock(key::bigint);
$$;