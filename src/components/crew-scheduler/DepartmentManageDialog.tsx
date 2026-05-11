import { useEffect, useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import type {
  CrewSchedulerState,
  SchedulerDepartment,
  ShiftDefinition,
  TeamsIntegrationConfig,
} from '@/types/crewScheduler';
import type { CrewContact } from '@/types/crewContacts';
import {
  createDepartment, deleteDepartment,
  createShiftDefinition, deleteShiftDefinition,
  addDepartmentMember, removeDepartmentMember,
  saveTeamsConfig, clearTeamsConfig,
  getCrewSchedulerState,
} from '@/lib/crewSchedulerService';

const DEPT_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#84cc16', '#f59e0b', '#6366f1',
];

interface Props {
  open: boolean;
  onClose: () => void;
  allContacts: CrewContact[];
}

interface NewShiftForm {
  name: string;
  startTime: string;
  endTime: string;
  requiredStaff: string;
  color: string;
}

const EMPTY_SHIFT: NewShiftForm = { name: '', startTime: '09:00', endTime: '17:00', requiredStaff: '1', color: '#34d399' };

export function DepartmentManageDialog({ open, onClose, allContacts }: Props) {
  const [state, setState] = useState<CrewSchedulerState>(() => getCrewSchedulerState());
  const [activeDeptId, setActiveDeptId] = useState<string>('');
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptColor, setNewDeptColor] = useState(DEPT_COLORS[0]);
  const [newShift, setNewShift] = useState<NewShiftForm>(EMPTY_SHIFT);
  const [selectedRosterContactId, setSelectedRosterContactId] = useState('');
  const [teamsForm, setTeamsForm] = useState<TeamsIntegrationConfig>({
    tenantId: '', clientId: '', clientSecret: '', teamId: '', schedulingGroupId: '',
  });

  // Refresh state when dialog opens
  useEffect(() => {
    if (!open) return;
    const s = getCrewSchedulerState();
    setState(s);
    if (!activeDeptId && s.departments.length > 0) setActiveDeptId(s.departments[0].id);
  }, [open]);

  // Sync teams form when active dept changes
  useEffect(() => {
    const cfg = state.teamsConfig?.[activeDeptId];
    setTeamsForm(cfg ?? { tenantId: '', clientId: '', clientSecret: '', teamId: '', schedulingGroupId: '' });
  }, [activeDeptId, state.teamsConfig]);

  const refresh = () => setState(getCrewSchedulerState());

  const activeDept: SchedulerDepartment | undefined = state.departments.find((d) => d.id === activeDeptId);
  const deptShifts: ShiftDefinition[] = state.shiftDefinitions
    .filter((s) => s.departmentId === activeDeptId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const deptMemberIds = new Set(
    state.departmentMembers.filter((m) => m.departmentId === activeDeptId).map((m) => m.crewContactId)
  );
  const deptMembers = state.departmentMembers
    .filter((m) => m.departmentId === activeDeptId)
    .map((m) => allContacts.find((c) => c.id === m.crewContactId))
    .filter((c): c is CrewContact => Boolean(c));
  const availableContacts = allContacts.filter((c) => c.isActive && !deptMemberIds.has(c.id));

  const handleAddDept = () => {
    if (!newDeptName.trim()) return;
    createDepartment(newDeptName, newDeptColor);
    setNewDeptName('');
    refresh();
  };

  const handleDeleteDept = (id: string) => {
    if (!confirm('Delete this department and all its shifts and assignments?')) return;
    deleteDepartment(id);
    if (activeDeptId === id) setActiveDeptId('');
    refresh();
  };

  const handleAddShift = () => {
    if (!newShift.name.trim() || !activeDeptId) return;
    createShiftDefinition({
      departmentId: activeDeptId,
      name: newShift.name.trim(),
      startTime: newShift.startTime,
      endTime: newShift.endTime,
      requiredStaff: Math.max(1, parseInt(newShift.requiredStaff) || 1),
      color: newShift.color,
    });
    setNewShift(EMPTY_SHIFT);
    refresh();
  };

  const handleAddRosterMember = () => {
    if (!selectedRosterContactId || !activeDeptId) return;
    addDepartmentMember(activeDeptId, selectedRosterContactId);
    setSelectedRosterContactId('');
    refresh();
  };

  const handleSaveTeams = () => {
    if (!activeDeptId) return;
    const { tenantId, clientId, clientSecret, teamId } = teamsForm;
    if (!tenantId || !clientId || !clientSecret || !teamId) return;
    saveTeamsConfig(activeDeptId, teamsForm);
    refresh();
  };

  const handleClearTeams = () => {
    if (!activeDeptId) return;
    clearTeamsConfig(activeDeptId);
    refresh();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage Crew Scheduler</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="departments">
          <TabsList className="w-full">
            <TabsTrigger value="departments" className="flex-1">Departments</TabsTrigger>
            <TabsTrigger value="shifts" className="flex-1">Shifts</TabsTrigger>
            <TabsTrigger value="roster" className="flex-1">Roster</TabsTrigger>
            <TabsTrigger value="teams" className="flex-1">Teams</TabsTrigger>
          </TabsList>

          {/* ── Departments tab ── */}
          <TabsContent value="departments" className="space-y-4 pt-2">
            <div className="space-y-1">
              {state.departments.map((dept) => (
                <div key={dept.id} className="flex items-center justify-between rounded-md border bg-card px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: dept.color ?? '#6366f1' }}
                    />
                    <span className="font-medium">{dept.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteDept(dept.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <Separator />
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Add Department
              </Label>
              <div className="flex items-center gap-2">
                {DEPT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      borderColor: newDeptColor === c ? '#fff' : 'transparent',
                      outline: newDeptColor === c ? `2px solid ${c}` : 'none',
                    }}
                    onClick={() => setNewDeptColor(c)}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Department name"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddDept()}
                />
                <Button onClick={handleAddDept} disabled={!newDeptName.trim()}>
                  <Plus className="mr-1 h-4 w-4" /> Add
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ── Shifts tab ── */}
          <TabsContent value="shifts" className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Department</Label>
              <Select value={activeDeptId} onValueChange={setActiveDeptId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {state.departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeDept && (
              <>
                <div className="space-y-1">
                  {deptShifts.length === 0 && (
                    <p className="text-sm text-muted-foreground">No shifts defined yet.</p>
                  )}
                  {deptShifts.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-md border bg-card px-3 py-2">
                      <div className="flex items-center gap-2">
                        {s.color && (
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                        )}
                        <span className="font-medium">{s.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {s.startTime}–{s.endTime} · {s.requiredStaff} req.
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => { deleteShiftDefinition(s.id); refresh(); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Add Shift
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <Input
                        placeholder="Shift name (e.g. Morning)"
                        value={newShift.name}
                        onChange={(e) => setNewShift((f) => ({ ...f, name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Start time</Label>
                      <Input
                        type="time"
                        value={newShift.startTime}
                        onChange={(e) => setNewShift((f) => ({ ...f, startTime: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">End time</Label>
                      <Input
                        type="time"
                        value={newShift.endTime}
                        onChange={(e) => setNewShift((f) => ({ ...f, endTime: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Required staff</Label>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={newShift.requiredStaff}
                        onChange={(e) => setNewShift((f) => ({ ...f, requiredStaff: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Color</Label>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {DEPT_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                            style={{
                              backgroundColor: c,
                              borderColor: newShift.color === c ? '#fff' : 'transparent',
                              outline: newShift.color === c ? `2px solid ${c}` : 'none',
                            }}
                            onClick={() => setNewShift((f) => ({ ...f, color: c }))}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <Button
                    onClick={handleAddShift}
                    disabled={!newShift.name.trim()}
                    className="w-full"
                  >
                    <Plus className="mr-1 h-4 w-4" /> Add Shift
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* ── Roster tab ── */}
          <TabsContent value="roster" className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Department</Label>
              <Select value={activeDeptId} onValueChange={setActiveDeptId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {state.departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeDept && (
              <>
                <div className="space-y-1">
                  {deptMembers.length === 0 && (
                    <p className="text-sm text-muted-foreground">No crew members in this department yet.</p>
                  )}
                  {deptMembers.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-md border bg-card px-3 py-2">
                      <div>
                        <div className="text-sm font-medium">{c.fullName}</div>
                        {c.roleTags?.length > 0 && (
                          <div className="text-xs text-muted-foreground">{c.roleTags.join(', ')}</div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => { removeDepartmentMember(activeDeptId, c.id); refresh(); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="flex gap-2">
                  <Select value={selectedRosterContactId} onValueChange={setSelectedRosterContactId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Add crew member from contacts..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableContacts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.fullName}
                          {c.roleTags?.length > 0 && (
                            <span className="ml-1 text-xs text-muted-foreground">({c.roleTags[0]})</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleAddRosterMember} disabled={!selectedRosterContactId}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* ── Teams tab ── */}
          <TabsContent value="teams" className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Department</Label>
              <Select value={activeDeptId} onValueChange={setActiveDeptId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {state.departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeDept && (
              <div className="space-y-3">
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                  <strong>Azure app setup required.</strong> Create an app registration at portal.azure.com with
                  Microsoft Graph API application permissions: <code>Schedule.ReadWrite.All</code> and{' '}
                  <code>User.Read.All</code>. Grant admin consent, then generate a client secret. Credentials are
                  stored locally in this browser.
                </div>
                <div className="grid gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Tenant ID</Label>
                    <Input
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      value={teamsForm.tenantId}
                      onChange={(e) => setTeamsForm((f) => ({ ...f, tenantId: e.target.value.trim() }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Client ID</Label>
                    <Input
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      value={teamsForm.clientId}
                      onChange={(e) => setTeamsForm((f) => ({ ...f, clientId: e.target.value.trim() }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Client Secret</Label>
                    <Input
                      type="password"
                      placeholder="Your app's client secret value"
                      value={teamsForm.clientSecret}
                      onChange={(e) => setTeamsForm((f) => ({ ...f, clientSecret: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Team ID</Label>
                    <Input
                      placeholder="The Teams team ID (from Teams admin or Graph Explorer)"
                      value={teamsForm.teamId}
                      onChange={(e) => setTeamsForm((f) => ({ ...f, teamId: e.target.value.trim() }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Scheduling Group ID (optional)</Label>
                    <Input
                      placeholder="e.g. TAG_xxxxxxxx (leave blank to skip)"
                      value={teamsForm.schedulingGroupId ?? ''}
                      onChange={(e) => setTeamsForm((f) => ({ ...f, schedulingGroupId: e.target.value.trim() || undefined }))}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveTeams}
                    disabled={!teamsForm.tenantId || !teamsForm.clientId || !teamsForm.clientSecret || !teamsForm.teamId}
                    className="flex-1"
                  >
                    <Save className="mr-1 h-4 w-4" /> Save Teams Config
                  </Button>
                  {state.teamsConfig?.[activeDeptId] && (
                    <Button variant="outline" onClick={handleClearTeams} className="text-destructive">
                      Clear
                    </Button>
                  )}
                </div>
                {state.teamsConfig?.[activeDeptId] && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    ✓ Teams integration configured for {activeDept.name}.
                  </p>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
