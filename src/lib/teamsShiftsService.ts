import type { TeamsIntegrationConfig, ShiftAssignment, ShiftDefinition } from '@/types/crewScheduler';
import type { CrewContact } from '@/types/crewContacts';

type TeamsTheme =
  | 'blue' | 'green' | 'purple' | 'pink' | 'yellow' | 'gray'
  | 'darkBlue' | 'darkGreen' | 'darkPurple' | 'darkPink' | 'darkYellow' | 'darkGray';

const COLOR_TO_THEME: Record<string, TeamsTheme> = {
  '#fbbf24': 'yellow',
  '#34d399': 'green',
  '#6366f1': 'darkPurple',
  '#3b82f6': 'blue',
  '#8b5cf6': 'purple',
  '#f97316': 'pink',
};

function shiftColorToTheme(color?: string): TeamsTheme {
  return (color && COLOR_TO_THEME[color]) || 'blue';
}

function buildDateTime(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0).toISOString();
}

let _tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(config: TeamsIntegrationConfig): Promise<string> {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt - 60_000) {
    return _tokenCache.token;
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    scope: 'https://graph.microsoft.com/.default',
    client_secret: config.clientSecret,
    grant_type: 'client_credentials',
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Teams authentication failed: ${err}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  _tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function resolveUserId(email: string, token: string): Promise<string | null> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users?$filter=mail eq '${encodeURIComponent(email)}'&$select=id`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const data = await res.json() as { value: Array<{ id: string }> };
  return data.value?.[0]?.id ?? null;
}

async function getExistingShiftsForRange(
  teamId: string,
  token: string,
  startIso: string,
  endIso: string,
): Promise<Array<{ id: string }>> {
  const filter = `sharedShift/startDateTime ge '${startIso}' and sharedShift/startDateTime le '${endIso}'`;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/teams/${teamId}/schedule/shifts?$filter=${encodeURIComponent(filter)}&$select=id`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const data = await res.json() as { value: Array<{ id: string }> };
  return data.value ?? [];
}

export interface TeamsPublishResult {
  success: boolean;
  created: number;
  deleted: number;
  errors: string[];
}

export async function publishWeekToTeamsShifts(
  config: TeamsIntegrationConfig,
  assignments: ShiftAssignment[],
  shiftDefs: ShiftDefinition[],
  contacts: CrewContact[],
  weekStartDate: string,
  weekEndDate: string,
): Promise<TeamsPublishResult> {
  const errors: string[] = [];
  let created = 0;
  let deleted = 0;

  const token = await getAccessToken(config);

  // Resolve M365 user IDs for all crew in this week's assignments
  const userIdMap = new Map<string, string>();
  const contactsNeeded = contacts.filter((c) =>
    assignments.some((a) => a.crewContactId === c.id)
  );
  for (const contact of contactsNeeded) {
    if (!contact.email) {
      errors.push(`${contact.fullName} has no email address — skipped`);
      continue;
    }
    const uid = await resolveUserId(contact.email, token);
    if (!uid) {
      errors.push(`Could not find Microsoft 365 account for ${contact.email}`);
    } else {
      userIdMap.set(contact.id, uid);
    }
  }

  // Delete existing shifts for this week so we can replace them cleanly
  const weekStartIso = buildDateTime(weekStartDate, '00:00');
  const weekEndIso = buildDateTime(weekEndDate, '23:59');
  const existing = await getExistingShiftsForRange(config.teamId, token, weekStartIso, weekEndIso);
  for (const shift of existing) {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/teams/${config.teamId}/schedule/shifts/${shift.id}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok || res.status === 404) deleted++;
    else errors.push(`Failed to delete shift ${shift.id}: ${res.statusText}`);
  }

  // Create new shifts from current assignments
  for (const assignment of assignments) {
    const shiftDef = shiftDefs.find((s) => s.id === assignment.shiftDefinitionId);
    if (!shiftDef) continue;
    const contact = contacts.find((c) => c.id === assignment.crewContactId);
    if (!contact) continue;
    const userId = userIdMap.get(assignment.crewContactId);
    if (!userId) continue;

    const startTime = assignment.startTimeOverride ?? shiftDef.startTime;
    const endTime = assignment.endTimeOverride ?? shiftDef.endTime;

    // Overnight shifts: if end < start, end is the next day
    let endDate = assignment.date;
    if (endTime <= startTime) {
      const d = new Date(assignment.date + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      endDate = d.toISOString().split('T')[0];
    }

    const body: Record<string, unknown> = {
      userId,
      sharedShift: {
        displayName: shiftDef.name,
        startDateTime: buildDateTime(assignment.date, startTime),
        endDateTime: buildDateTime(endDate, endTime),
        theme: shiftColorToTheme(shiftDef.color),
        notes: assignment.notes ?? '',
        activities: [],
      },
    };
    if (config.schedulingGroupId) body.schedulingGroupId = config.schedulingGroupId;

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/teams/${config.teamId}/schedule/shifts`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (res.ok) {
      created++;
    } else {
      const errText = await res.text();
      errors.push(`Failed shift for ${contact.fullName} on ${assignment.date}: ${errText}`);
    }
  }

  // Share/publish the schedule to make shifts visible to team members
  if (created > 0) {
    await fetch(
      `https://graph.microsoft.com/v1.0/teams/${config.teamId}/schedule/share`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDateTime: weekStartIso, endDateTime: weekEndIso, notifyTeam: true }),
      },
    ).catch(() => { /* best-effort */ });
  }

  return { success: errors.length === 0, created, deleted, errors };
}
