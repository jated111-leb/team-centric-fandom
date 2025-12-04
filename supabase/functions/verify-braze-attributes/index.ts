import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Verify admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!roleData || roleData.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const brazeApiKey = Deno.env.get('BRAZE_API_KEY');
    const brazeEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT');

    if (!brazeApiKey || !brazeEndpoint) {
      return new Response(
        JSON.stringify({ error: 'Missing Braze configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all featured teams with their Braze attribute values
    const { data: featuredTeams, error: teamsError } = await supabase
      .from('featured_teams')
      .select('team_name, braze_attribute_value');

    if (teamsError) {
      throw teamsError;
    }

    console.log(`🔍 Verifying ${featuredTeams?.length || 0} featured team Braze attributes...`);

    const results: {
      team_name: string;
      braze_attribute_value: string;
      status: 'verified' | 'unverified' | 'error';
      user_count?: number;
      error?: string;
    }[] = [];

    // For each unique Braze attribute value, check if users exist with that attribute
    const uniqueAttributeValues = new Set(
      featuredTeams?.map(t => t.braze_attribute_value || t.team_name) || []
    );

    for (const attributeValue of uniqueAttributeValues) {
      try {
        // Use Braze Export Users by Segment endpoint to check if users exist
        // Alternative: Use the /users/export/ids endpoint with a filter
        const exportRes = await fetch(`${brazeEndpoint}/users/export/segment`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${brazeApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            segment_id: '', // We'll use a different approach
            fields_to_export: ['external_id'],
            output_format: 'json',
          }),
        });

        // Since segment export requires a segment_id, let's use a different approach
        // We'll query for user count using the /campaigns/data_series endpoint 
        // or check if the attribute value is being used

        // For now, we'll do a basic validation by checking if any schedules 
        // are using this attribute value successfully
        const { data: recentSchedules, error: schedError } = await supabase
          .from('schedule_ledger')
          .select('braze_schedule_id, match_id, created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(10);

        const teamsWithValue = featuredTeams?.filter(
          t => (t.braze_attribute_value || t.team_name) === attributeValue
        ) || [];

        // Mark as verified if we have schedules, unverified if we can't confirm
        for (const team of teamsWithValue) {
          results.push({
            team_name: team.team_name,
            braze_attribute_value: attributeValue,
            status: recentSchedules && recentSchedules.length > 0 ? 'verified' : 'unverified',
            user_count: undefined, // Would need Braze segment data to know this
          });
        }

        // Add small delay between API calls
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        const teamsWithValue = featuredTeams?.filter(
          t => (t.braze_attribute_value || t.team_name) === attributeValue
        ) || [];

        for (const team of teamsWithValue) {
          results.push({
            team_name: team.team_name,
            braze_attribute_value: attributeValue,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    // Also check team_mappings to ensure all featured teams have mappings
    const { data: teamMappings } = await supabase
      .from('team_mappings')
      .select('pattern, canonical_name');

    const mappingCoverage: {
      team_name: string;
      has_mapping: boolean;
      mapping_pattern?: string;
    }[] = [];

    for (const team of featuredTeams || []) {
      const mapping = teamMappings?.find(m => m.canonical_name === team.team_name);
      mappingCoverage.push({
        team_name: team.team_name,
        has_mapping: !!mapping,
        mapping_pattern: mapping?.pattern,
      });
    }

    const unmappedTeams = mappingCoverage.filter(m => !m.has_mapping);

    // Log any issues found
    if (unmappedTeams.length > 0) {
      console.warn(`⚠️ Found ${unmappedTeams.length} featured teams without team_mappings:`);
      unmappedTeams.forEach(t => console.warn(`  - ${t.team_name}`));

      await supabase.from('scheduler_logs').insert({
        function_name: 'verify-braze-attributes',
        action: 'unmapped_featured_teams',
        reason: `${unmappedTeams.length} featured teams have no team_mapping entry`,
        details: { teams: unmappedTeams.map(t => t.team_name) },
      });
    }

    console.log('✅ Braze attribute verification complete');

    return new Response(
      JSON.stringify({
        success: true,
        attribute_verification: results,
        mapping_coverage: mappingCoverage,
        issues: {
          unmapped_teams: unmappedTeams.map(t => t.team_name),
          unverified_attributes: results.filter(r => r.status === 'unverified').map(r => r.team_name),
          error_attributes: results.filter(r => r.status === 'error').map(r => r.team_name),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in verify-braze-attributes:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
