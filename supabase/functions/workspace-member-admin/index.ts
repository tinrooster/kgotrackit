import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

type WorkspaceMemberRole = 'admin' | 'editor' | 'viewer';

type RequestPayload = {
  action?:
    | 'list_members'
    | 'invite_member'
    | 'update_member_role'
    | 'remove_member'
    | 'delete_workspace'
    | 'set_member_status'
    | 'reset_member_password';
  workspaceId?: string;
  email?: string;
  userId?: string;
  role?: WorkspaceMemberRole;
  disabled?: boolean;
  newPassword?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
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

function getWorkspaceUserNotifyEmail(): string | null {
  const configuredAddress = Deno.env.get('WORKSPACE_USER_NOTIFY_EMAIL')?.trim();
  return configuredAddress ? configuredAddress : null;
}

function normalizeHttpUrl(value: string | null | undefined): string | null {
  const trimmedValue = String(value || '').trim();
  if (!trimmedValue) {
    return null;
  }
  try {
    const parsedUrl = new URL(trimmedValue);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }
    return parsedUrl.origin;
  } catch {
    return null;
  }
}

function resolveInviteRedirectUrl(request: Request): string | undefined {
  const configuredRedirectUrl = normalizeHttpUrl(Deno.env.get('INVITE_REDIRECT_URL'));
  if (configuredRedirectUrl) {
    return configuredRedirectUrl;
  }
  const configuredSiteUrl = normalizeHttpUrl(Deno.env.get('SITE_URL'));
  if (configuredSiteUrl) {
    return configuredSiteUrl;
  }
  const requestOrigin = normalizeHttpUrl(request.headers.get('origin'));
  if (requestOrigin) {
    return requestOrigin;
  }
  return undefined;
}

async function sendWithResend(message: EmailMessage): Promise<void> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('NOTIFY_FROM_EMAIL');
  if (!resendApiKey || !fromEmail) {
    throw new Error('Missing RESEND_API_KEY or NOTIFY_FROM_EMAIL.');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend failed (${response.status}): ${body}`);
  }
}

async function sendEmail(message: EmailMessage): Promise<void> {
  const provider = (Deno.env.get('EMAIL_PROVIDER') || 'resend').toLowerCase();
  switch (provider) {
    case 'resend':
      await sendWithResend(message);
      return;
    default:
      throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);
  }
}

async function sendWorkspaceUserStatusEmail(params: {
  action: string;
  actorEmail: string;
  workspaceId: string;
  workspaceName?: string;
  targetEmail?: string;
  targetUserId?: string;
  role?: string;
  status?: string;
  extra?: string;
}): Promise<void> {
  const notifyEmail = getWorkspaceUserNotifyEmail();
  if (!notifyEmail) {
    return;
  }
  const timestamp = new Date().toISOString();
  const subject = `[trackIT] Workspace user update (${params.action})`;
  const text = [
    'trackIT workspace user change notification',
    '',
    `Action: ${params.action}`,
    `Workspace: ${params.workspaceName || params.workspaceId}`,
    `Workspace ID: ${params.workspaceId}`,
    `Target Email: ${params.targetEmail || '(unknown)'}`,
    `Target User ID: ${params.targetUserId || '(unknown)'}`,
    `Role: ${params.role || '(n/a)'}`,
    `Status: ${params.status || '(n/a)'}`,
    `By: ${params.actorEmail}`,
    `At: ${timestamp}`,
    params.extra ? `Details: ${params.extra}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  try {
    await sendEmail({
      to: notifyEmail,
      subject,
      text,
    });
  } catch (error) {
    console.warn(
      '[workspace-member-admin] user status email failed:',
      error instanceof Error ? error.message : String(error),
    );
  }
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
    const { data: workspaceRow } = await adminClient
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .maybeSingle();
    const workspaceName = typeof workspaceRow?.name === 'string' ? workspaceRow.name : undefined;

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
          rows.push({ userId: member.user_id, role, email: '(unknown user)', disabled: false });
          continue;
        }
        const appMetaName = userData.user?.app_metadata?.display_name;
        const userMetaName = userData.user?.user_metadata?.display_name;
        const isDisabled = userData.user?.app_metadata?.disabled === true;
        rows.push({
          userId: member.user_id,
          role,
          email: userData.user?.email || '(no email)',
          disabled: isDisabled,
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

      let targetUserId: string | null = null;
      const { data: listUsersData, error: listUsersError } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (listUsersError) {
        return jsonResponse(500, { error: listUsersError.message });
      }
      const matchedUser = (listUsersData?.users || []).find(
        (authUser) => String(authUser.email || '').toLowerCase() === email
      );
      targetUserId = matchedUser?.id ?? null;
      const existingUserMatched = !!matchedUser;
      if (!targetUserId) {
        const redirectTo = resolveInviteRedirectUrl(request);
        const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
          email,
          redirectTo ? { redirectTo } : undefined
        );
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
      await sendWorkspaceUserStatusEmail({
        action: 'invite_member',
        actorEmail: actor.email || actor.id,
        workspaceId,
        workspaceName,
        targetEmail: email,
        targetUserId: targetUserId,
        role: payload.role,
        extra: existingUserMatched
          ? 'Existing auth user matched; membership updated without auth invite email.'
          : 'New auth invite attempted via inviteUserByEmail.',
      });

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
      await sendWorkspaceUserStatusEmail({
        action: 'update_member_role',
        actorEmail: actor.email || actor.id,
        workspaceId,
        workspaceName,
        targetUserId,
        role: payload.role,
      });
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
      await sendWorkspaceUserStatusEmail({
        action: 'remove_member',
        actorEmail: actor.email || actor.id,
        workspaceId,
        workspaceName,
        targetUserId,
      });
      return jsonResponse(200, { ok: true });
    }

    if (payload.action === 'set_member_status') {
      const targetUserId = String(payload.userId || '').trim();
      if (!targetUserId) {
        return jsonResponse(400, { error: 'userId is required.' });
      }
      if (targetUserId === actor.id && payload.disabled === true) {
        return jsonResponse(400, { error: 'You cannot disable your own account.' });
      }
      const disabled = payload.disabled === true;
      const { data: userData, error: userFetchError } = await adminClient.auth.admin.getUserById(targetUserId);
      if (userFetchError || !userData.user) {
        return jsonResponse(404, { error: userFetchError?.message || 'User not found.' });
      }
      const currentAppMeta =
        userData.user.app_metadata && typeof userData.user.app_metadata === 'object'
          ? userData.user.app_metadata
          : {};
      const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUserId, {
        app_metadata: {
          ...currentAppMeta,
          disabled,
        },
      });
      if (updateError) {
        return jsonResponse(500, { error: updateError.message });
      }
      await sendWorkspaceUserStatusEmail({
        action: 'set_member_status',
        actorEmail: actor.email || actor.id,
        workspaceId,
        workspaceName,
        targetUserId,
        status: disabled ? 'disabled' : 'active',
      });
      return jsonResponse(200, { ok: true });
    }

    if (payload.action === 'delete_workspace') {
      const { data: workspaceRow, error: workspaceError } = await adminClient
        .from('workspaces')
        .select('id, name, owner_user_id, organization_id')
        .eq('id', workspaceId)
        .maybeSingle();
      if (workspaceError) {
        return jsonResponse(500, { error: workspaceError.message });
      }
      if (!workspaceRow) {
        return jsonResponse(404, { error: 'Workspace not found.' });
      }
      const isOwner = workspaceRow.owner_user_id === actor.id;
      const isAdmin = actorMembership.role === 'admin';
      if (!isOwner && !isAdmin) {
        return jsonResponse(403, { error: 'Workspace admin role required to delete workspace.' });
      }

      const [{ count: memberCount }, workspaceDataCheck] = await Promise.all([
        adminClient
          .from('workspace_members')
          .select('*', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId),
        adminClient
          .from('workspace_app_data')
          .select('workspace_id')
          .eq('workspace_id', workspaceId)
          .maybeSingle(),
      ]);
      const memberCountValue = typeof memberCount === 'number' ? memberCount : 0;
      const hadWorkspaceAppData = !!workspaceDataCheck.data?.workspace_id;

      const { error: auditInsertError } = await adminClient
        .from('workspace_deletion_audit')
        .insert({
          workspace_id: workspaceId,
          workspace_name: workspaceRow.name || workspaceId,
          organization_id: workspaceRow.organization_id || null,
          deleted_by_user_id: actor.id,
          deleted_by_email: actor.email || null,
          deleted_by_role: actorMembership.role || null,
          member_count: memberCountValue,
          had_workspace_app_data: hadWorkspaceAppData,
          deletion_source: 'workspace-member-admin',
        });
      if (auditInsertError) {
        return jsonResponse(500, { error: auditInsertError.message });
      }

      const { error: deleteWorkspaceError } = await adminClient
        .from('workspaces')
        .delete()
        .eq('id', workspaceId);
      if (deleteWorkspaceError) {
        return jsonResponse(500, { error: deleteWorkspaceError.message });
      }
      return jsonResponse(200, { ok: true });
    }

    if (payload.action === 'reset_member_password') {
      const targetUserId = String(payload.userId || '').trim();
      const newPassword = String(payload.newPassword || '').trim();
      if (!targetUserId) {
        return jsonResponse(400, { error: 'userId is required.' });
      }
      if (!newPassword || newPassword.length < 8) {
        return jsonResponse(400, { error: 'newPassword must be at least 8 characters.' });
      }
      const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUserId, {
        password: newPassword,
      });
      if (updateError) {
        return jsonResponse(500, { error: updateError.message });
      }
      await sendWorkspaceUserStatusEmail({
        action: 'reset_member_password',
        actorEmail: actor.email || actor.id,
        workspaceId,
        workspaceName,
        targetUserId,
        extra: 'Password was reset by workspace admin action.',
      });
      return jsonResponse(200, { ok: true });
    }

    return jsonResponse(400, { error: 'Unsupported action.' });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
