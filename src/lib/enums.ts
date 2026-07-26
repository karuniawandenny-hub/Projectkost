// String constants & types yang menggantikan enum (SQLite tidak mendukung enum).

export const Role = {
  OWNER: "OWNER",
  TENANT: "TENANT",
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const UserStatus = {
  ACTIVE: "ACTIVE",
  PENDING: "PENDING",
  SUSPENDED: "SUSPENDED",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const RoomStatus = {
  AVAILABLE: "AVAILABLE",
  OCCUPIED: "OCCUPIED",
} as const;
export type RoomStatus = (typeof RoomStatus)[keyof typeof RoomStatus];

export const TenancyStatus = {
  ACTIVE: "ACTIVE",
  ENDED: "ENDED",
} as const;
export type TenancyStatus = (typeof TenancyStatus)[keyof typeof TenancyStatus];

export const PaymentStatus = {
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const ComplaintStatus = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
} as const;
export type ComplaintStatus = (typeof ComplaintStatus)[keyof typeof ComplaintStatus];
