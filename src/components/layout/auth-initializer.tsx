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

      const { data: profile } = await supabase
        .from("profiles")
        .select(
          `
          *,
          tenant:tenant_id(*),
          permissions:user_permissions(module_code, can_view, can_create, can_edit, can_delete)
        `
        )
        .eq("id", user.id)
        .single();

      if (!profile) {
        if (cancelled) return;
        useAuthStore.getState().setLoading(false);
        return;
      }

      if (!profile.is_active) {
        await supabase.auth.signOut();
        useAuthStore.getState().clearAuth();
        window.location.href =
          "/login?error=Tu cuenta ha sido deshabilitada. Contacta al administrador.";
        return;
      }

      if (cancelled) return;

      const { tenant, permissions, ...profileFields } = profile as typeof profile & {
        tenant: unknown;
        permissions: unknown;
      };

      useAuthStore.getState().setProfile(profileFields as never);

      if (tenant) {
        useAuthStore.getState().setTenant(tenant as never);
      }

      if (Array.isArray(permissions)) {
        useAuthStore.getState().setPermissions(permissions as never);
      }

      useAuthStore.getState().setLoading(false);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
