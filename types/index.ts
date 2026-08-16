/**
 * Core type definitions for the application
 * This file re-exports all type definitions from domain-specific type files
 */

/**
 * API Response wrapper type
 */
export interface ApiResponse<T> {
  data?: T;
  error?: {
    message: string;
    code: string;
  };
  success: boolean;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/**
 * User role enum
 */
export enum UserRole {
  SUPER_ADMIN = "super_admin",
  ORG_ADMIN = "org_admin",
  STAFF = "staff",
  CUSTOMER = "customer",
}

/**
 * Organization status
 */
export enum OrganizationStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  SUSPENDED = "suspended",
}

/**
 * Base entity type with audit fields (Phase 2+)
 */
export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

/**
 * Organization type (Phase 2+)
 */
export interface Organization extends BaseEntity {
  name: string;
  slug: string;
  status: OrganizationStatus;
  tenant_id: string;
  settings?: Record<string, unknown>;
}

/**
 * User type (Phase 2+)
 */
export interface User extends BaseEntity {
  email: string;
  name: string;
  avatar_url?: string;
  role: UserRole;
  status: "active" | "inactive";
}
