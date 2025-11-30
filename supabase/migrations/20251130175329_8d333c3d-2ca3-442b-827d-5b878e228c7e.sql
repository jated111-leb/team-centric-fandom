-- Drop the public view policy on scheduler_logs
DROP POLICY IF EXISTS "Anyone can view scheduler logs" ON scheduler_logs;

-- Create admin-only SELECT policy for scheduler_logs
CREATE POLICY "Admins can view scheduler logs"
ON scheduler_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));