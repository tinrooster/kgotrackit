import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

type WorkspaceMemberRole = 'admin' | 'editor' | 'viewer';

type RequestPayload = {
  action?: 'list_members' | 'invite_member' | 'update_member_role' | 'remove_member';
  workspaceId?: string;
  email?: string;
  userId?: string;
  role?: WorkspaceMemberRole;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function isRole(value: unknown): value is WorkspaceMemberRole {
  return value === 'admin' || value === 'editor' || value === 'viewer';
}

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(500, { error: 'Server environment is missing Supabase credentials.' });
    }

    const token = getBearerToken(request);
    if (!token) {
      return jsonResponse(401, { error: 'Missing bearer token.' });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const {
      data: { user: actor },
      error: actorError,
    } = await adminClient.auth.getUser(token);
    if (actorError || !actor?.id) {
      return jsonResponse(401, { error: 'Invalid or expired session token.' });
    }

    const payload = (await request.json()) as RequestPayload;
    const workspaceId = String(payload.workspaceId || '').trim();
    if (!workspaceId) {
      return jsonResponse(400, { error: 'workspaceId is required.' });
    }

    const { data: actorMembership, error: actorMembershipError } = await adminClient
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', actor.id)
      .maybeSingle();
    if (actorMembershipError) {
      return jsonResponse(500, { error: actorMembershipError.message });
    }
    if (!actorMembership || actorMembership.role !== 'admin') {
      return jsonResponse(403, { error: 'Admin role required for workspace member management.' });
    }

    if (payload.action === 'list_members') {
      const { data: members, error: membersError } = await adminClient
        .from('workspace_members')
        .select('user_id, role')
        .eq('workspace_id', workspaceId)
        .order('user_id', { ascending: true });
      if (membersError) {
        return jsonResponse(500, { error: membersError.message });
      }

      const rows: Array<{ userId: string; role: WorkspaceMemberRole; email: string; displayName?: string }> = [];
      for (const member of members || []) {
        const role = isRole(member.role) ? member.role : 'viewer';
        const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(member.user_id);
        if (userError) {
          rows.push({ userId: member.user_id, role, email: '(unknown user)' });
          continue;
        }
        const appMetaName = userData.user?.app_metadata?.display_name;
        const userMetaName = userData.user?.user_metadata?.display_name;
        rows.push({
          userId: member.user_id,
          role,
          email: userData.user?.email || '(no email)',
          displayName:
            typeof appMetaName === 'string'
              ? appMetaName
              : typeof userMetaName === 'string'
                ? userMetaName
                : undefined,
        });
      }
      return jsonResponse(200, { members: rows });
    }

    if (payload.action === 'invite_member') {
      const email = String(payload.email || '').trim().toLowerCase();
      if (!email) {
        return jsonResponse(400, { error: 'email is required.' });
      }
      if (!isRole(payload.role)) {
        return jsonResponse(400, { error: 'role must be admin, editor, or viewer.' });
      }

      const { data: existingAuthUsers, error: existingUsersError } = await adminClient
        .schema('auth')
        .from('users')
        .select('id, email')
        .eq('email', email)
        .limit(1);
      if (existingUsersError) {
        return jsonResponse(500, { error: existingUsersError.message });
      }

      let targetUserId: string | null = existingAuthUsers?.[0]?.id ?? null;
      if (!targetUserId) {
        const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email);
        if (inviteError) {
          return jsonResponse(500, { error: inviteError.message });
        }
        targetUserId = inviteData.user?.id ?? null;
      }

      if (!targetUserId) {
        return jsonResponse(500, { error: 'Could not determine invited user id.' });
      }

      const { error: upsertError } = await adminClient.from('workspace_members').upsert(
        {
          workspace_id: workspaceId,
          user_id: targetUserId,
          role: payload.role,
        },
        { onConflict: 'workspace_id,user_id' }
      );
      if (upsertError) {
        return jsonResponse(500, { error: upsertError.message });
      }

      return jsonResponse(200, { ok: true });
    }

    if (payload.action === 'update_member_role') {
      const targetUserId = String(payload.userId || '').trim();
      if (!targetUserId) {
        return jsonResponse(400, { error: 'userId is required.' });
      }
      if (!isRole(payload.role)) {
        return jsonResponse(400, { error: 'role must be admin, editor, or viewer.' });
      }

      const { data: memberRow, error: memberFetchError } = await adminClient
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', targetUserId)
        .maybeSingle();
      if (memberFetchError) {
        return jsonResponse(500, { error: memberFetchError.message });
      }
      if (!memberRow) {
        return jsonResponse(404, { error: 'Workspace member not found.' });
      }
      if (targetUserId === actor.id && payload.role !== 'admin') {
        return jsonResponse(400, { error: 'You cannot demote yourself from admin.' });
      }
      if (memberRow.role === 'admin' && payload.role !== 'admin') {
        const { count: adminCount, error: countError } = await adminClient
          .from('workspace_members')
          .select('*', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .eq('role', 'admin');
        if (countError) {
          return jsonResponse(500, { error: countError.message });
        }
        if ((adminCount || 0) <= 1) {
          return jsonResponse(400, { error: 'Workspace must keep at least one admin.' });
        }
      }

      const { error: updateError } = await adminClient
        .from('workspace_members')
        .update({ role: payload.role })
        .eq('workspace_id', workspaceId)
        .eq('user_id', targetUserId);
      if (updateError) {
        return jsonResponse(500, { error: updateError.message });
      }
      return jsonResponse(200, { ok: true });
    }

    if (payload.action === 'remove_member') {
      const targetUserId = String(payload.userId || '').trim();
      if (!targetUserId) {
        return jsonResponse(400, { error: 'userId is required.' });
      }
      if (targetUserId === actor.id) {
        return jsonResponse(400, { error: 'Use workspace switch flow to leave; cannot remove self here.' });
      }

      const { data: targetMembership, error: targetFetchError } = await adminClient
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', targetUserId)
        .maybeSingle();
      if (targetFetchError) {
        return jsonResponse(500, { error: targetFetchError.message });
      }
      if (!targetMembership) {
        return jsonResponse(404, { error: 'Workspace member not found.' });
      }
      if (targetMembership.role === 'admin') {
        const { count: adminCount, error: adminCountError } = await adminClient
          .from('workspace_members')
          .select('*', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .eq('role', 'admin');
        if (adminCountError) {
          return jsonResponse(500, { error: adminCountError.message });
        }
        if ((adminCount || 0) <= 1) {
          return jsonResponse(400, { error: 'Workspace must keep at least one admin.' });
        }
      }

      const { error: deleteError } = await adminClient
        .from('workspace_members')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('user_id', targetUserId);
      if (deleteError) {
        return jsonResponse(500, { error: deleteError.message });
      }
      return jsonResponse(200, { ok: true });
    }

    return jsonResponse(400, { error: 'Unsupported action.' });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
