-- Phase 2: Create advisory lock wrapper functions
CREATE OR REPLACE FUNCTION pg_try_advisory_lock(key integer)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT pg_try_advisory_lock(key::bigint);
$$;

CREATE OR REPLACE FUNCTION pg_advisory_unlock(key integer)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT pg_advisory_unlock(key::bigint);
$$;