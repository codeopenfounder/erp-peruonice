import type { ModulePermission, PermissionAction } from "@/types/auth"

/**
 * Check if the user has a specific permission for a module.
 */
export function hasModulePermission(
  permissions: ModulePermission[],
  moduleCode: string,
  action: PermissionAction
): boolean {
  const perm = permissions.find((p) => p.module_code === moduleCode)
  if (!perm) return false
  switch (action) {
    case "view":
      return perm.can_view
    case "create":
      return perm.can_create
    case "edit":
      return perm.can_edit
    case "delete":
      return perm.can_delete
    default:
      return false
  }
}

/**
 * Check if the user has any access (at least view) to a module.
 */
export function hasAnyModuleAccess(
  permissions: ModulePermission[],
  moduleCode: string
): boolean {
  return hasModulePermission(permissions, moduleCode, "view")
}
