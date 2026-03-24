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
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    const requestingUserId = claimsData?.claims?.sub;

    if (claimsError || !requestingUserId) {
      throw new Error('Unauthorized: Invalid user');
    }

    const { data: adminRole, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUserId)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !adminRole) {
      throw new Error('Unauthorized: User is not an admin');
    }

    // Parse request body
    const { email, action, inviteId, userId: reqUserId } = await req.json();
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedInviteId = typeof inviteId === 'string' ? inviteId.trim() : '';
    const normalizedUserId = typeof reqUserId === 'string' ? reqUserId.trim() : '';
    const isResendAction = action === 'resend';

    if (!isResendAction) {
      if (!normalizedEmail) {
        throw new Error('Email is required');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        throw new Error('Invalid email format');
      }

      if (normalizedEmail.length > 255) {
        throw new Error('Email must be less than 255 characters');
      }
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
      let inviteLookup = supabaseAdmin
        .from('admin_invites')
        .select('*');

      if (normalizedInviteId) {
        inviteLookup = inviteLookup.eq('id', normalizedInviteId);
      } else if (normalizedUserId) {
        inviteLookup = inviteLookup.eq('user_id', normalizedUserId);
      } else if (normalizedEmail) {
        inviteLookup = inviteLookup.eq('email', normalizedEmail);
      } else {
        throw new Error('Invite identifier is required');
      }

      const { data: existingInvite } = await inviteLookup.maybeSingle();

      if (!existingInvite) {
        throw new Error('No invite found for this user');
      }

      if (existingInvite.status === 'accepted') {
        throw new Error('This invite has already been accepted');
      }

      const targetEmail = existingInvite.email;

      // Find the user and generate a new invite link
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(u => u.email === targetEmail);

      if (existingUser) {
        const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: targetEmail,
        });

        if (resetError) {
          console.error('Failed to resend invite:', resetError);
          throw new Error(`Failed to resend invite: ${resetError.message}`);
        }
      }

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
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // ===== Standard invite flow =====
    
    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === normalizedEmail);

    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      console.log('User already exists:', normalizedEmail);
      userId = existingUser.id;
    } else {
      const tempPassword = crypto.randomUUID();

      const { data: newUser, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
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
      console.log('Created new user:', normalizedEmail);
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
        email: normalizedEmail,
        invited_by: requestingUserId,
        status: existingUser ? 'accepted' : 'pending',
        user_id: userId,
        accepted_at: existingUser ? new Date().toISOString() : null,
      }, { onConflict: 'email' });

    if (isNewUser) {
      try {
        await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: normalizedEmail,
        });
      } catch (e) {
        console.error('Failed to generate invite link:', e);
      }
    }

    console.log('Granted admin role to user:', normalizedEmail);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Admin user added successfully',
        email: normalizedEmail,
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
