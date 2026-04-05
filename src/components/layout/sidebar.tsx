"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { usePermissions } from "@/hooks/use-permissions";
import { useSidebarStore } from "@/stores/sidebar-store";
import { useUnreadNotificationCount } from "@/hooks/queries/use-notifications";
import {
  SIDEBAR_NAVIGATION,
  type NavItem,
  type NavSection,
} from "@/lib/constants/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

// ---------------------------------------------------------------------------
// Initials helper
// ---------------------------------------------------------------------------

function getInitials(firstName?: string, lastName?: string): string {
  const first = firstName?.[0] ?? "";
  const last = lastName?.[0] ?? "";
  if (!first && !last) return "?";
  return (first + last).toUpperCase();
}

// ---------------------------------------------------------------------------
// NavItem component
// ---------------------------------------------------------------------------

function SidebarNavItem({
  item,
  isCollapsed,
  pathname,
  badgeCount,
}: {
  item: NavItem;
  isCollapsed: boolean;
  pathname: string;
  badgeCount?: number;
}) {
  const Icon = item.icon;
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

  const content = (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "border-l-2 border-primary bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      {!isCollapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge && badgeCount != null && badgeCount > 0 && (
            <Badge
              variant="default"
              className="ml-auto size-5 justify-center rounded-full p-0 text-[10px]"
            >
              {badgeCount > 99 ? "99+" : badgeCount}
            </Badge>
          )}
        </>
      )}
    </Link>
  );

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

// ---------------------------------------------------------------------------
// NavSection component
// ---------------------------------------------------------------------------

function SidebarSection({
  section,
  isCollapsed,
  pathname,
  badgeCounts,
  canViewItem,
}: {
  section: NavSection;
  isCollapsed: boolean;
  pathname: string;
  badgeCounts?: Record<string, number>;
  canViewItem: (item: NavItem) => boolean;
}) {
  const { expandedSections, toggleSection } = useSidebarStore();
  const isExpanded = expandedSections[section.key] ?? false;

  // Filter items by permission
  const visibleItems = section.items.filter(canViewItem);

  if (visibleItems.length === 0) return null;

  const showItems = !section.collapsible || isExpanded || isCollapsed;

  return (
    <div className="space-y-1">
      {/* Section header */}
      {!isCollapsed && (
        <button
          type="button"
          onClick={() => section.collapsible && toggleSection(section.key)}
          className={cn(
            "flex w-full items-center px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
            section.collapsible && "cursor-pointer hover:text-foreground"
          )}
        >
          <span className="flex-1 text-left">{section.label}</span>
          {section.collapsible && (
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform duration-200",
                isExpanded && "rotate-180"
              )}
            />
          )}
        </button>
      )}

      {/* Section items */}
      <AnimatePresence initial={false}>
        {showItems && (
          <motion.div
            initial={section.collapsible ? { height: 0, opacity: 0 } : false}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-0.5">
              {visibleItems.map((item) => (
                <SidebarNavItem
                  key={item.href}
                  item={item}
                  isCollapsed={isCollapsed}
                  pathname={pathname}
                  badgeCount={item.badge ? badgeCounts?.[item.badge] : undefined}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar content (shared between desktop and mobile)
// ---------------------------------------------------------------------------

function SidebarContent({ isCollapsed }: { isCollapsed: boolean }) {
  const pathname = usePathname();
  const profile = useAuthStore((s) => s.profile);
  const { toggleCollapse } = useSidebarStore();
  const isLoading = useAuthStore((s) => s.isLoading);
  const { canView, isOwner } = usePermissions();
  const { data: unreadNotifs } = useUnreadNotificationCount();

  const badgeCounts: Record<string, number> = {
    unread_notifications: unreadNotifs ?? 0,
  };

  // Permission-based item visibility
  // While loading, show all items so the sidebar doesn't flash empty
  const canViewItem = (item: NavItem): boolean => {
    if (!item.module) return true;
    if (isLoading) return true;
    return isOwner || canView(item.module);
  };

  // Show section if at least one item is visible
  const visibleSections = SIDEBAR_NAVIGATION.filter((section) =>
    section.items.some(canViewItem)
  );

  return (
    <div className="flex h-full flex-col">
      {/* Logo area */}
      <div className="relative flex shrink-0 items-center border-b border-border px-4 py-3">
        {isCollapsed ? (
          <img src="/poi-logo.png" alt="Perú On Ice" className="mx-auto h-6 w-auto" />
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <img src="/poi-logo.png" alt="Perú On Ice" className="h-7 w-auto shrink-0" />
            <span className="text-sm font-bold text-primary truncate">Perú On Ice</span>
          </div>
        )}

        {/* Collapse toggle (desktop only) */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCollapse}
          className="absolute -right-3 top-1/2 z-50 hidden size-6 -translate-y-1/2 rounded-full border border-border bg-background lg:flex"
        >
          {isCollapsed ? (
            <ChevronRight className="size-3.5" />
          ) : (
            <ChevronLeft className="size-3.5" />
          )}
          <span className="sr-only">
            {isCollapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          </span>
        </Button>
      </div>

      {/* Navigation (scrollable) */}
      <TooltipProvider>
        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-4">
          {visibleSections.map((section) => (
            <SidebarSection
              key={section.key}
              section={section}
              isCollapsed={isCollapsed}
              pathname={pathname}
              badgeCounts={badgeCounts}
              canViewItem={canViewItem}
            />
          ))}
        </nav>
      </TooltipProvider>

      {/* User section */}
      <div className="shrink-0 border-t border-border p-3">
        <div
          className={cn(
            "flex items-center gap-3",
            isCollapsed && "justify-center"
          )}
        >
          <Avatar size="sm">
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

          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {profile ? `${profile.first_name} ${profile.last_name}` : "Usuario"}
              </p>
              {isOwner && (
                <Badge variant="secondary" className="mt-0.5 text-[10px]">
                  Propietario
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Sidebar component
// ---------------------------------------------------------------------------

interface SidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function Sidebar({ open, onOpenChange }: SidebarProps) {
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 border-r border-border bg-card transition-all duration-200 lg:block",
          isCollapsed ? "w-16" : "w-60"
        )}
      >
        <SidebarContent isCollapsed={isCollapsed} />
      </aside>

      {/* Mobile sidebar (Sheet) */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="left"
          showCloseButton={true}
          className="w-72 border-border bg-card p-0"
        >
          <SheetTitle className="sr-only">Menu de navegacion</SheetTitle>
          <SidebarContent isCollapsed={false} />
        </SheetContent>
      </Sheet>
    </>
  );
}
