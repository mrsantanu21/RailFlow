import { z } from 'zod';

// ─── Shared Domain Enums, Constants, and Zod Schemas ─────────────────────────

export const USER_ROLES = ['USER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const UserRoleSchema = z.enum(USER_ROLES);

export const TRAIN_TYPES = [
  'VANDE_BHARAT',
  'RAJDHANI',
  'SHATABDI',
  'DURONTO',
  'SUPERFAST',
  'MAIL_EXPRESS',
  'PASSENGER',
] as const;
export type TrainType = (typeof TRAIN_TYPES)[number];
export const TrainTypeSchema = z.enum(TRAIN_TYPES);

export const RUN_STATUSES = ['SCHEDULED', 'RUNNING', 'COMPLETED', 'CANCELLED'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const RunStatusSchema = z.enum(RUN_STATUSES);

export const CLASS_TYPES = [
  'ONE_AC',
  'TWO_AC',
  'THREE_AC',
  'SLEEPER',
  'CHAIR_CAR',
  'EXEC_CHAIR',
  'SECOND',
] as const;
export type ClassType = (typeof CLASS_TYPES)[number];
export const ClassTypeSchema = z.enum(CLASS_TYPES);

export const BERTH_TYPES = [
  'LOWER',
  'MIDDLE',
  'UPPER',
  'SIDE_LOWER',
  'SIDE_UPPER',
  'WINDOW',
  'AISLE',
] as const;
export type BerthType = (typeof BERTH_TYPES)[number];
export const BerthTypeSchema = z.enum(BERTH_TYPES);

export const BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'FAILED'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const BookingStatusSchema = z.enum(BOOKING_STATUSES);

export const PAYMENT_STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PaymentStatusSchema = z.enum(PAYMENT_STATUSES);

export const QUOTA_TYPES = [
  'GENERAL',
  'TATKAL',
  'PREMIUM_TATKAL',
  'LADIES',
  'SENIOR_CITIZEN',
] as const;
export type QuotaType = (typeof QUOTA_TYPES)[number];
export const QuotaTypeSchema = z.enum(QUOTA_TYPES);

export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export type Gender = (typeof GENDERS)[number];
export const GenderSchema = z.enum(GENDERS);

export const ALLOCATION_STATUSES = ['LOCKED', 'CONFIRMED', 'RELEASED'] as const;
export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];
export const AllocationStatusSchema = z.enum(ALLOCATION_STATUSES);

export const PAYMENT_METHODS = [
  'UPI',
  'NET_BANKING',
  'DEBIT_CARD',
  'CREDIT_CARD',
  'WALLET',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PaymentMethodSchema = z.enum(PAYMENT_METHODS);

export const REFUND_STATUSES = ['PENDING', 'PROCESSED', 'FAILED'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];
export const RefundStatusSchema = z.enum(REFUND_STATUSES);
