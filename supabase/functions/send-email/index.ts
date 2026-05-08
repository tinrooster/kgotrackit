import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

type AuthHookUser = {
  email?: string;
  new_email?: string;
};

type AuthHookEmailData = {
  token?: string;
  token_hash?: string;
  token_new?: string;
  token_hash_new?: string;
  redirect_to?: string;
  site_url?: string;
  email_action_type?:
    | 'signup'
    | 'invite'
    | 'magiclink'
    | 'recovery'
    | 'email_change'
    | 'reauthentication'
    | 'password_changed_notification'
    | 'email_changed_notification'
    | 'phone_changed_notification'
    | 'identity_linked_notification'
    | 'identity_unlinked_notification'
    | 'mfa_factor_enrolled_notification'
    | 'mfa_factor_unenrolled_notification'
    | string;
};

type AuthHookPayload = {
  user?: AuthHookUser;
  email_data?: AuthHookEmailData;
};

type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
};

const resendApiEndpoint = 'https://api.resend.com/emails';

function jsonResponse(status: number, payload: Record<string, unknown>, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(extraHeaders || {}),
    },
  });
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function buildActionTitle(action: string): string {
  switch (action) {
    case 'signup':
      return 'Confirm your email';
    case 'invite':
      return 'You have been invited';
    case 'magiclink':
      return 'Your sign-in link';
    case 'recovery':
      return 'Reset your password';
    case 'email_change':
      return 'Confirm your email change';
    case 'reauthentication':
      return 'Confirm reauthentication';
    default:
      return 'Authentication notice';
  }
}

function buildVerifyUrl(projectRef: string, action: string, tokenHash: string, redirectTo?: string): string {
  const verifyUrl = new URL(`https://${projectRef}.supabase.co/auth/v1/verify`);
  verifyUrl.searchParams.set('type', action);
  verifyUrl.searchParams.set('token', tokenHash);
  if (redirectTo) {
    verifyUrl.searchParams.set('redirect_to', redirectTo);
  }
  return verifyUrl.toString();
}

function createPrimaryEmailMessage(projectRef: string, payload: AuthHookPayload): OutboundEmail | null {
  const userEmail = payload.user?.email?.trim();
  const emailData = payload.email_data;
  if (!userEmail || !emailData) {
    return null;
  }

  const action = String(emailData.email_action_type || 'email');
  const subject = `[trackIT] ${buildActionTitle(action)}`;
  const token = String(emailData.token || '').trim();
  const tokenHash = String(emailData.token_hash || '').trim();
  const redirectTo = String(emailData.redirect_to || '').trim();
  const siteUrl = String(emailData.site_url || '').trim();

  const verifyUrl = tokenHash ? buildVerifyUrl(projectRef, action, tokenHash, redirectTo || undefined) : '';
  const textLines = [
    buildActionTitle(action),
    '',
    verifyUrl ? `Open this link: ${verifyUrl}` : '',
    token ? `Code: ${token}` : '',
    redirectTo ? `Redirect target: ${redirectTo}` : '',
    siteUrl ? `Site URL: ${siteUrl}` : '',
  ].filter(Boolean);

  return {
    to: userEmail,
    subject,
    text: textLines.join('\n'),
  };
}

function createSecondaryEmailChangeMessage(projectRef: string, payload: AuthHookPayload): OutboundEmail | null {
  const action = String(payload.email_data?.email_action_type || '');
  if (action !== 'email_change') {
    return null;
  }

  const newEmail = payload.user?.new_email?.trim();
  const tokenNew = String(payload.email_data?.token_new || '').trim();
  const tokenHashNew = String(payload.email_data?.token_hash_new || '').trim();
  const redirectTo = String(payload.email_data?.redirect_to || '').trim();
  if (!newEmail || !tokenHashNew) {
    return null;
  }

  const verifyUrl = buildVerifyUrl(projectRef, 'email_change', tokenHashNew, redirectTo || undefined);
  const textLines = [
    'Confirm your new email address',
    '',
    `Open this link: ${verifyUrl}`,
    tokenNew ? `Code: ${tokenNew}` : '',
  ].filter(Boolean);

  return {
    to: newEmail,
    subject: '[trackIT] Confirm your new email address',
    text: textLines.join('\n'),
  };
}

async function sendWithResend(message: OutboundEmail, fromEmail: string, resendApiKey: string): Promise<void> {
  const response = await fetch(resendApiEndpoint, {
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
    const responseText = await response.text();
    throw new Error(`Resend failed (${response.status}): ${responseText}`);
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse(400, { error: { http_code: 400, message: 'Not allowed' } });
  }

  try {
    const resendApiKey = getRequiredEnv('RESEND_API_KEY');
    const fromEmail = getRequiredEnv('AUTH_HOOK_FROM_EMAIL');
    const hookSecret = getRequiredEnv('SEND_EMAIL_HOOK_SECRET').replace('v1,whsec_', '');
    const projectRef = getRequiredEnv('PROJECT_REF');

    const body = await request.text();
    const headers = Object.fromEntries(request.headers);
    const webhook = new Webhook(hookSecret);
    const payload = webhook.verify(body, headers) as AuthHookPayload;

    const primaryMessage = createPrimaryEmailMessage(projectRef, payload);
    if (!primaryMessage) {
      return jsonResponse(200, {});
    }

    await sendWithResend(primaryMessage, fromEmail, resendApiKey);

    const secondaryMessage = createSecondaryEmailChangeMessage(projectRef, payload);
    if (secondaryMessage) {
      await sendWithResend(secondaryMessage, fromEmail, resendApiKey);
    }

    return jsonResponse(200, {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(500, {
      error: {
        http_code: 500,
        message,
      },
    });
  }
});
