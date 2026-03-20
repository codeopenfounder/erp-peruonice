"use client"

import { create } from "zustand"
import type { Profile, Tenant } from "@/types/database"
import type { AuthUser, ModulePermission } from "@/types/auth"

interface AuthState {
  user: AuthUser | null
  profile: Profile | null
  tenant: Tenant | null
  permissions: ModulePermission[]
  isLoading: boolean

  setUser: (user: AuthUser | null) => void
  setProfile: (profile: Profile | null) => void
  setTenant: (tenant: Tenant | null) => void
  setPermissions: (permissions: ModulePermission[]) => void
  setLoading: (loading: boolean) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  tenant: null,
  permissions: [],
  isLoading: true,

  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setTenant: (tenant) => set({ tenant }),
  setPermissions: (permissions) => set({ permissions }),
  setLoading: (isLoading) => set({ isLoading }),
  clearAuth: () =>
    set({
      user: null,
      profile: null,
      tenant: null,
      permissions: [],
      isLoading: false,
    }),
}))
