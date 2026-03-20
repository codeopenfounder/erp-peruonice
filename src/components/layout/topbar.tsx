"use client";

import { useRouter } from "next/navigation";
import { Menu, LogOut, Settings, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Breadcrumbs } from "./breadcrumbs";
import { NotificationPopover } from "./notification-popover";

function getInitials(firstName?: string, lastName?: string): string {
  const first = firstName?.[0] ?? "";
  const last = lastName?.[0] ?? "";
  if (!first && !last) return "?";
  return (first + last).toUpperCase();
}

interface TopbarProps {
  onMenuClick: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    useAuthStore.getState().clearAuth();
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-sm">
      {/* Left side */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
      >
        <Menu className="size-5" />
        <span className="sr-only">Abrir menu</span>
      </Button>

      <Breadcrumbs />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side */}
      <NotificationPopover />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative size-8 rounded-full p-0">
            <Avatar>
              {profile?.avatar_url && (
                <AvatarImage
                  src={profile.avatar_url}
                  alt={`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`}
                />
              )}
              <AvatarFallback className="bg-secondary text-xs">
                {getInitials(profile?.first_name, profile?.last_name)}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" sideOffset={8}>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium leading-none">
                {profile ? `${profile.first_name} ${profile.last_name}` : "Usuario"}
              </p>
              <p className="text-xs leading-none text-muted-foreground">
                {profile?.email ?? user?.email ?? ""}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => router.push("/config/perfil")}>
              <User className="mr-2 size-4" />
              Mi Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push("/config/general")}>
              <Settings className="mr-2 size-4" />
              Configuracion
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleSignOut}>
            <LogOut className="mr-2 size-4" />
            Cerrar sesion
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
