import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Create client with user's token to verify they're an admin
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify the requesting user is an admin
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized: Invalid user');
    }

    const { data: adminRole, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !adminRole) {
      throw new Error('Unauthorized: User is not an admin');
    }

    // Parse request body
    const { email, action } = await req.json();

    if (!email || typeof email !== 'string') {
      throw new Error('Email is required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }

    if (email.length > 255) {
      throw new Error('Email must be less than 255 characters');
    }

    // Create admin client with service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Handle resend action
    if (action === 'resend') {
      // Find the existing invite
      const { data: existingInvite } = await supabaseAdmin
        .from('admin_invites')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (!existingInvite) {
        throw new Error('No invite found for this email');
      }

      if (existingInvite.status === 'accepted') {
        throw new Error('This invite has already been accepted');
      }

      // Find the user and generate a new invite link
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(u => u.email === email);

      if (existingUser) {
        // Generate a password reset email so they can set their password
        const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: email,
        });

        if (resetError) {
          console.error('Failed to resend invite:', resetError);
          throw new Error(`Failed to resend invite: ${resetError.message}`);
        }
      }

      // Update resend tracking
      await supabaseAdmin
        .from('admin_invites')
        .update({
          last_resent_at: new Date().toISOString(),
          resend_count: (existingInvite.resend_count || 0) + 1,
        })
        .eq('id', existingInvite.id);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Invite resent successfully',
          email: email,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // ===== Standard invite flow =====
    
    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);

    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      console.log('User already exists:', email);
      userId = existingUser.id;
    } else {
      // Generate a temporary password (user should reset it)
      const tempPassword = crypto.randomUUID();

      // Create the admin user
      const { data: newUser, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: tempPassword,
        email_confirm: true,
      });

      if (signUpError) {
        throw new Error(`Failed to create user: ${signUpError.message}`);
      }

      if (!newUser.user) {
        throw new Error('Failed to create user: No user returned');
      }

      userId = newUser.user.id;
      isNewUser = true;
      console.log('Created new user:', email);
    }

    // Check if admin role already exists
    const { data: existingRole } = await supabaseAdmin
      .from('user_roles')
      .select('*')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (existingRole) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'User already has admin role',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Grant admin role
    const { error: roleInsertError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: userId,
        role: 'admin',
      });

    if (roleInsertError) {
      throw new Error(`Failed to grant admin role: ${roleInsertError.message}`);
    }

    // Track the invite
    await supabaseAdmin
      .from('admin_invites')
      .upsert({
        email: email,
        invited_by: user.id,
        status: existingUser ? 'accepted' : 'pending',
        user_id: userId,
        accepted_at: existingUser ? new Date().toISOString() : null,
      }, { onConflict: 'email' });

    // If new user, generate a password reset so they can set their password
    if (isNewUser) {
      try {
        await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: email,
        });
      } catch (e) {
        console.error('Failed to generate invite link:', e);
      }
    }

    console.log('Granted admin role to user:', email);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Admin user added successfully',
        email: email,
        user_id: userId,
        is_new_user: isNewUser,
        note: isNewUser ? 'User will receive an email to set their password' : 'Existing user granted admin role',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in add-admin:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: error instanceof Error && error.message.includes('Unauthorized') ? 403 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
