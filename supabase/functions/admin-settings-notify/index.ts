type AdminSettingsNotificationPayload = {
  notifyEmail: string;
  changeType: "lookup-list-update" | "global-setting-update";
  listKey?: string;
  addedCount?: number;
  removedCount?: number;
  renamedCount?: number;
  settingKey?: string;
  previousValue?: string;
  nextValue?: string;
  performedBy: string;
  workspaceId?: string | null;
};

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

function buildEmailMessage(payload: AdminSettingsNotificationPayload): EmailMessage {
  const timestamp = new Date().toISOString();
  if (payload.changeType === "lookup-list-update") {
    const subject = `[trackIT] Lookup list changes (${payload.listKey || "unknown"})`;
    const text = [
      "trackIT admin settings notification",
      "",
      `Type: ${payload.changeType}`,
      `List: ${payload.listKey || "unknown"}`,
      `Added: ${payload.addedCount ?? 0}`,
      `Removed: ${payload.removedCount ?? 0}`,
      `Renamed: ${payload.renamedCount ?? 0}`,
      `By: ${payload.performedBy}`,
      `Workspace: ${payload.workspaceId || "personal"}`,
      `At: ${timestamp}`,
    ].join("\n");
    return { to: payload.notifyEmail, subject, text };
  }

  const subject = `[trackIT] Global setting change (${payload.settingKey || "unknown"})`;
  const text = [
    "trackIT admin settings notification",
    "",
    `Type: ${payload.changeType}`,
    `Setting: ${payload.settingKey || "unknown"}`,
    `Previous: ${payload.previousValue || ""}`,
    `Next: ${payload.nextValue || ""}`,
    `By: ${payload.performedBy}`,
    `Workspace: ${payload.workspaceId || "personal"}`,
    `At: ${timestamp}`,
  ].join("\n");
  return { to: payload.notifyEmail, subject, text };
}

async function sendWithResend(message: EmailMessage): Promise<void> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("NOTIFY_FROM_EMAIL");
  if (!resendApiKey || !fromEmail) {
    throw new Error("Missing RESEND_API_KEY or NOTIFY_FROM_EMAIL.");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
  const provider = (Deno.env.get("EMAIL_PROVIDER") || "resend").toLowerCase();
  switch (provider) {
    case "resend":
      await sendWithResend(message);
      return;
    default:
      throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const payload = (await request.json()) as AdminSettingsNotificationPayload;
    if (!payload.notifyEmail || !payload.performedBy || !payload.changeType) {
      return new Response(JSON.stringify({ error: "Missing required fields." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const message = buildEmailMessage(payload);
    await sendEmail(message);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
