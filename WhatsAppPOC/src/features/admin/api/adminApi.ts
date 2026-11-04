import { apiPath } from '../../../environments/environment_urls';
import { fetchApi } from '../../../services/api/httpService';

export type ExternalPolicy = 'INTERNAL_ONLY' | 'SELECTED_ORGANIZATIONS' | 'ALL_ORGANIZATIONS' | 'DISABLED';
export type PermissionScope = 'EVERYONE' | 'ADMINS' | 'NOBODY';

export interface OrganizationSettings {
  internalChatEnabled: boolean;
  externalPolicy: ExternalPolicy;
  groupCreation: PermissionScope;
  externalParticipants: PermissionScope;
  broadcastPermission: PermissionScope;
  fileSharingEnabled: boolean;
  callsEnabled: boolean;
  maxUploadMb: number;
  joinMode: 'OPEN' | 'APPROVAL';
}

export interface Member {
  userOrganizationId: string;
  name: string;
  phone: string;
  role: 'ADMIN' | 'USER';
  department: { departmentId: string; name: string } | null;
  isYou: boolean;
}

export interface Department { departmentId: string; name: string; memberCount: number }
export interface Invite { inviteId: string; phone: string; expiresAt: string }
export interface JoinRequest { joinRequestId: string; name: string; phone: string; requestedAt: string }
export interface DirectoryEntry { organizationId: string; organizationName: string }
export interface Relationship {
  relationshipId: string;
  organizationId: string;
  organizationName: string;
  direction: 'OUTGOING' | 'INCOMING';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
}
export interface AuditEntry {
  auditLogId: string;
  action: string;
  actorName: string | null;
  targetType: string | null;
  details: unknown;
  createdAt: string;
}

const data = async (promise: Promise<any>) => (await promise).data;

export const getOrgSettings = (t: string): Promise<OrganizationSettings> => data(fetchApi('GET', apiPath.orgSettings, t));
export const updateOrgSettings = (t: string, changes: Partial<OrganizationSettings>): Promise<OrganizationSettings> =>
  data(fetchApi('PUT', apiPath.orgSettings, t, false, changes));

export const getMembers = (t: string, q = ''): Promise<{ members: Member[]; nextCursor: string | null }> =>
  data(fetchApi('GET', `${apiPath.orgMembers}${q ? `?q=${encodeURIComponent(q)}` : ''}`, t));
export const updateMember = (t: string, id: string, changes: { role?: 'ADMIN' | 'USER'; departmentId?: string | null }) =>
  fetchApi('PATCH', `${apiPath.orgMembers}/${id}`, t, false, changes);
export const removeMember = (t: string, id: string) => fetchApi('DELETE', `${apiPath.orgMembers}/${id}`, t);

export const getDepartments = (t: string): Promise<Department[]> => data(fetchApi('GET', apiPath.orgDepartments, t));
export const createDepartment = (t: string, name: string): Promise<Department> => data(fetchApi('POST', apiPath.orgDepartments, t, false, { name }));
export const deleteDepartment = (t: string, id: string) => fetchApi('DELETE', `${apiPath.orgDepartments}/${id}`, t);

export const getInvites = (t: string): Promise<Invite[]> => data(fetchApi('GET', apiPath.orgInvites, t));
export const createInvite = (t: string, countryId: string, mobileNo: string): Promise<Invite> =>
  data(fetchApi('POST', apiPath.orgInvites, t, false, { countryId, mobileNo }));
export const revokeInvite = (t: string, id: string) => fetchApi('DELETE', `${apiPath.orgInvites}/${id}`, t);

export const getJoinRequests = (t: string): Promise<JoinRequest[]> => data(fetchApi('GET', apiPath.orgJoinRequests, t));
export const decideJoinRequest = (t: string, id: string, decision: 'approve' | 'reject') =>
  fetchApi('POST', `${apiPath.orgJoinRequests}/${id}/${decision}`, t);

export const getDirectory = (t: string): Promise<DirectoryEntry[]> => data(fetchApi('GET', apiPath.orgDirectory, t));
export const getRelationships = (t: string): Promise<Relationship[]> => data(fetchApi('GET', apiPath.orgRelationships, t));
export const requestRelationship = (t: string, organizationId: string) =>
  fetchApi('POST', apiPath.orgRelationships, t, false, { organizationId });
export const actOnRelationship = (t: string, id: string, action: 'approve' | 'reject' | 'revoke') =>
  fetchApi('POST', `${apiPath.orgRelationships}/${id}/${action}`, t);

export const getAuditLog = (t: string, cursor?: string | null): Promise<{ entries: AuditEntry[]; nextCursor: string | null }> =>
  data(fetchApi('GET', `${apiPath.orgAuditLog}${cursor ? `?cursor=${cursor}` : ''}`, t));
