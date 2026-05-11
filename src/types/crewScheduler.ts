export interface SchedulerDepartment {
  id: string;
  name: string;
  color?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftDefinition {
  id: string;
  departmentId: string;
  name: string;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  requiredStaff: number;
  color?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftAssignment {
  id: string;
  shiftDefinitionId: string;
  crewContactId: string;
  date: string; // "YYYY-MM-DD"
  notes?: string;
  startTimeOverride?: string;
  endTimeOverride?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrewAvailability {
  id: string;
  crewContactId: string;
  date: string; // "YYYY-MM-DD"
  isAvailable: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentMember {
  id: string;
  departmentId: string;
  crewContactId: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeamsIntegrationConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  teamId: string;
  schedulingGroupId?: string;
}

export interface CrewSchedulerState {
  departments: SchedulerDepartment[];
  shiftDefinitions: ShiftDefinition[];
  assignments: ShiftAssignment[];
  availability: CrewAvailability[];
  departmentMembers: DepartmentMember[];
  teamsConfig?: Record<string, TeamsIntegrationConfig>;
}
