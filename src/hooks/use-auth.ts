"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthUser } from "@/types/auth";

export function useAuth() {
  const router = useRouter();
  const supabase = createClient();
  const { setUser, setProfile, setTenant, setLoading, clearAuth } =
    useAuthStore();

  const getCurrentUser = useCallback(async () => {
    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        clearAuth();
        return null;
      }

      // Fetch profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (!profile) {
        clearAuth();
        return null;
      }

      // Fetch tenant
      const { data: tenant } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", profile.tenant_id)
        .single();

      const authUser: AuthUser = {
        id: user.id,
        email: user.email ?? "",
      };

      setUser(authUser);
      setProfile(profile);
      setTenant(tenant);

      return authUser;
    } catch {
      clearAuth();
      return null;
    } finally {
      setLoading(false);
    }
  }, [supabase, setUser, setProfile, setTenant, setLoading, clearAuth]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      await getCurrentUser();
      router.push("/dashboard");
    },
    [supabase, getCurrentUser, router]
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    clearAuth();
    router.push("/login");
  }, [supabase, clearAuth, router]);

  return {
    login,
    logout,
    getCurrentUser,
  };
}
