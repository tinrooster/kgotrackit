#!/usr/bin/env bash
set -euo pipefail

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required but not found. Install Node.js/npm first."
  exit 1
fi

read -r -p "Supabase project ref: " PROJECT_REF
if [ -z "${PROJECT_REF}" ]; then
  echo "Project ref is required."
  exit 1
fi

read -r -p "App URL (e.g. https://your-app-domain.com): " APP_URL
if [ -z "${APP_URL}" ]; then
  echo "App URL is required."
  exit 1
fi

echo ""
echo "Logging in to Supabase CLI..."
npx supabase@latest login

echo ""
echo "Linking repository to project ${PROJECT_REF}..."
npx supabase@latest link --project-ref "${PROJECT_REF}"

echo ""
echo "Deploying workspace-member-admin function..."
npx supabase@latest functions deploy workspace-member-admin

echo ""
echo "Setting invite redirect secrets..."
npx supabase@latest secrets set INVITE_REDIRECT_URL="${APP_URL}"
npx supabase@latest secrets set SITE_URL="${APP_URL}"

echo ""
echo "Optional email secrets (press Enter to skip any)"
read -r -s -p "RESEND_API_KEY (optional): " RESEND_API_KEY
echo ""
read -r -p "NOTIFY_FROM_EMAIL (optional): " NOTIFY_FROM_EMAIL
read -r -p "EMAIL_PROVIDER [resend]: " EMAIL_PROVIDER
EMAIL_PROVIDER="${EMAIL_PROVIDER:-resend}"

if [ -n "${RESEND_API_KEY}" ]; then
  npx supabase@latest secrets set RESEND_API_KEY="${RESEND_API_KEY}"
fi

if [ -n "${NOTIFY_FROM_EMAIL}" ]; then
  npx supabase@latest secrets set NOTIFY_FROM_EMAIL="${NOTIFY_FROM_EMAIL}"
fi

if [ -n "${EMAIL_PROVIDER}" ]; then
  npx supabase@latest secrets set EMAIL_PROVIDER="${EMAIL_PROVIDER}"
fi

echo ""
echo "Optional Auth Send Email hook setup"
read -r -p "Deploy send-email hook now? [y/N]: " DEPLOY_SEND_EMAIL_HOOK
if [[ "${DEPLOY_SEND_EMAIL_HOOK}" =~ ^[Yy]$ ]]; then
  read -r -p "AUTH_HOOK_FROM_EMAIL (required for hook): " AUTH_HOOK_FROM_EMAIL
  read -r -s -p "SEND_EMAIL_HOOK_SECRET (v1,whsec_...): " SEND_EMAIL_HOOK_SECRET
  echo ""
  if [ -z "${AUTH_HOOK_FROM_EMAIL}" ] || [ -z "${SEND_EMAIL_HOOK_SECRET}" ]; then
    echo "Skipping send-email hook setup (missing AUTH_HOOK_FROM_EMAIL or SEND_EMAIL_HOOK_SECRET)."
  else
    npx supabase@latest functions deploy send-email --no-verify-jwt
    npx supabase@latest secrets set AUTH_HOOK_FROM_EMAIL="${AUTH_HOOK_FROM_EMAIL}"
    npx supabase@latest secrets set SEND_EMAIL_HOOK_SECRET="${SEND_EMAIL_HOOK_SECRET}"
    npx supabase@latest secrets set PROJECT_REF="${PROJECT_REF}"
    echo "send-email hook deployed."
    echo "Next in dashboard: Authentication -> Hooks -> Send Email -> HTTP URL:"
    echo "https://${PROJECT_REF}.supabase.co/functions/v1/send-email"
  fi
fi

echo ""
echo "Done."
echo "Next: verify Authentication -> URL Configuration in Supabase dashboard."
