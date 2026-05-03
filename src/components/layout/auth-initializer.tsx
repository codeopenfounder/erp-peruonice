"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/auth-store";

export function AuthInitializer() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (cancelled) return;
        useAuthStore.getState().clearAuth();
        router.push("/login");
        return;
      }

      if (cancelled) return;
      useAuthStore.getState().setUser({
        id: user.id,
        email: user.email ?? "",
      });

      // Fetch profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profile) {
        // Block disabled users
        if (!profile.is_active) {
          await supabase.auth.signOut();
          useAuthStore.getState().clearAuth();
          window.location.href = "/login?error=Tu cuenta ha sido deshabilitada. Contacta al administrador.";
          return;
        }

        if (cancelled) return;
        useAuthStore.getState().setProfile(profile);

        // Fetch tenant
        if (profile.tenant_id) {
          const { data: tenant } = await supabase
            .from("tenants")
            .select("*")
            .eq("id", profile.tenant_id)
            .single();

          if (tenant) {
            if (cancelled) return;
            useAuthStore.getState().setTenant(tenant);
          }
        }

        // Fetch user permissions
        const { data: perms } = await supabase
          .from("user_permissions")
          .select("module_code, can_view, can_create, can_edit, can_delete")
          .eq("user_id", user.id);

        if (perms) {
          if (cancelled) return;
          useAuthStore.getState().setPermissions(perms);
        }
      }

      if (cancelled) return;
      useAuthStore.getState().setLoading(false);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
