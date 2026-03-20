"use client"

import { useAuthStore } from "@/stores/auth-store"
import { hasModulePermission } from "@/lib/auth/permissions"
import type { PermissionAction } from "@/types/auth"

export function usePermissions() {
  const profile = useAuthStore((s) => s.profile)
  const permissions = useAuthStore((s) => s.permissions)
  const isOwner = profile?.is_owner ?? false

  const can = (moduleCode: string, action: PermissionAction): boolean => {
    if (isOwner) return true
    return hasModulePermission(permissions, moduleCode, action)
  }

  const canView = (moduleCode: string) => can(moduleCode, "view")
  const canCreate = (moduleCode: string) => can(moduleCode, "create")
  const canEdit = (moduleCode: string) => can(moduleCode, "edit")
  const canDelete = (moduleCode: string) => can(moduleCode, "delete")
  const canAccessModule = (moduleCode: string) => canView(moduleCode)

  return { can, canView, canCreate, canEdit, canDelete, canAccessModule, isOwner }
}
