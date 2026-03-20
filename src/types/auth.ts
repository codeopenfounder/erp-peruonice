// --------------------------------------------------------------------------
// Auth types for POI ERP
// --------------------------------------------------------------------------

export type PermissionAction = "view" | "create" | "edit" | "delete"

export interface ModulePermission {
  module_code: string
  can_view: boolean
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

export interface AuthUser {
  id: string
  email: string
}

export interface Profile {
  id: string
  tenant_id: string
  email: string
  first_name: string
  last_name: string
  avatar_url: string | null
  phone: string | null
  is_owner: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Tenant {
  id: string
  name: string
  slug: string
  ruc: string | null
  razon_social: string | null
  is_active: boolean
}
