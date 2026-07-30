export const LIST_KINDS = ['simple', 'task'] as const;
export type ListKind = (typeof LIST_KINDS)[number];

export const MEMBER_ROLES = ['owner', 'editor'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const ITEM_STATUSES = ['open', 'done'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const INVITATION_STATUSES = ['pending', 'accepted', 'declined', 'cancelled'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const NOTIFICATION_TYPES = ['list_invitation', 'task_assignment'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
