// Shared cron/admin auth gate for internal-only edge functions.
// Returns null if authorized, or a Response (401) if not.
import { createClient } from 'npm:@supabase/supabase-js@2';

export async function requireCronOrAdmin(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const cronSecret = Deno.env.get('CRON_SECRET');
  const headerSecret = req.headers.get('x-cron-secret');
  if (cronSecret && headerSecret && headerSecret === cronSecret) return null;

  const authHeader = req.headers.get('Authorization');
  if (authHeader) {
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: role } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();
        if (role) return null;
      }
    } catch (_e) { /* fall through */ }
  }

  return new Response(
    JSON.stringify({ error: 'Unauthorized' }),
    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
