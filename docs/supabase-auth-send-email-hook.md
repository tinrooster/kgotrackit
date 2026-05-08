# Supabase Auth Send Email Hook (Resend API)

This project includes a Supabase Auth Send Email hook function at:

- `supabase/functions/send-email/index.ts`

It verifies the Auth webhook signature and sends auth emails through Resend API.

## Required secrets

Set these in your Supabase project:

- `RESEND_API_KEY`
- `AUTH_HOOK_FROM_EMAIL`
- `SEND_EMAIL_HOOK_SECRET`
- `PROJECT_REF`

Example:

```bash
npx supabase@latest secrets set RESEND_API_KEY=your_resend_api_key
npx supabase@latest secrets set AUTH_HOOK_FROM_EMAIL=noreply@yourdomain.com
npx supabase@latest secrets set SEND_EMAIL_HOOK_SECRET='v1,whsec_your_hook_secret'
npx supabase@latest secrets set PROJECT_REF=your_project_ref
```

## Deploy function

```bash
npx supabase@latest functions deploy send-email --no-verify-jwt
```

## Wire the hook in Supabase Dashboard

1. Open `Authentication -> Hooks`
2. Select `Send Email`
3. Choose `HTTP` hook type
4. Set URL to:
   - `https://<project-ref>.supabase.co/functions/v1/send-email`
5. Generate/copy the hook secret in the dashboard
6. Save that same secret into `SEND_EMAIL_HOOK_SECRET`

## Keep testing unblocked

Even with a Send Email hook, Auth endpoint throttling still applies.  
If needed during testing, temporarily raise limits in:

- `Authentication -> Rate Limits`

Then reduce to production-safe values after validation.
