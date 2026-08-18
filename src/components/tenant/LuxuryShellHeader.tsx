import React, { ReactNode } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Menu,
  Sparkles,
  Search,
  LogOut,
  Building2,
  Shield,
  GraduationCap,
  Users,
  Coins,
  Megaphone,
  HeartHandshake,
  Crown,
  Heart,
  BookOpen,
  Layers,
  School,
  Mic,
} from "lucide-react";
import { OfflineStatusIndicator } from "@/components/offline/OfflineStatusIndicator";
import { NotificationsBell } from "@/components/global/NotificationsBell";
import { StaffAttendanceWidget } from "@/components/tenant/StaffAttendanceWidget";
import { OwnerContextSwitcher } from "@/components/tenant/OwnerContextSwitcher";
import { cn } from "@/lib/utils";

export interface LuxuryShellHeaderProps {
  title: string;
  subtitle?: string;
  role?: string;
  schoolSlug: string;
  schoolId?: string | null;
  schoolName?: string;
  userEmail?: string | null;
  mobileNavOpen: boolean;
  onMobileNavOpenChange: (open: boolean) => void;
  navContent: ReactNode;
  offline?: {
    isOnline: boolean;
    isSyncing: boolean;
    stats?: any;
    lastSyncAt?: any;
    syncProgress?: any;
    storageInfo?: any;
    syncPendingItems?: () => Promise<void>;
  };
  showOwnerContextSwitcher?: boolean;
  showStaffAttendance?: boolean;
  showVoiceCommand?: boolean;
  voiceListening?: boolean;
  onVoiceToggle?: () => void;
  onLogout?: () => void;
  customActions?: ReactNode;
}

const ROLE_CONFIG: Record<
  string,
  { label: string; shortLabel: string; icon: any; colorClass: string }
> = {
  school_owner: {
    label: "Owner • CEO",
    shortLabel: "Owner",
    icon: Crown,
    colorClass: "from-amber-500/20 via-primary/10 to-primary/5 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  principal: {
    label: "Principal",
    shortLabel: "Principal",
    icon: GraduationCap,
    colorClass: "from-blue-500/20 via-primary/10 to-primary/5 text-blue-600 dark:text-blue-400 border-blue-500/30",
  },
  vice_principal: {
    label: "Vice Principal",
    shortLabel: "VP",
    icon: School,
    colorClass: "from-indigo-500/20 via-primary/10 to-primary/5 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
  },
  academic_coordinator: {
    label: "Academic Coord.",
    shortLabel: "Coord",
    icon: Layers,
    colorClass: "from-sky-500/20 via-primary/10 to-primary/5 text-sky-600 dark:text-sky-400 border-sky-500/30",
  },
  counselor: {
    label: "Counselor",
    shortLabel: "Counselor",
    icon: Heart,
    colorClass: "from-rose-500/20 via-primary/10 to-primary/5 text-rose-600 dark:text-rose-400 border-rose-500/30",
  },
  teacher: {
    label: "Faculty",
    shortLabel: "Faculty",
    icon: BookOpen,
    colorClass: "from-emerald-500/20 via-primary/10 to-primary/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  },
  accountant: {
    label: "Finance & Accounts",
    shortLabel: "Finance",
    icon: Coins,
    colorClass: "from-emerald-500/20 via-primary/10 to-primary/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  },
  hr_manager: {
    label: "Human Resources",
    shortLabel: "HR",
    icon: Users,
    colorClass: "from-purple-500/20 via-primary/10 to-primary/5 text-purple-600 dark:text-purple-400 border-purple-500/30",
  },
  marketing_staff: {
    label: "Marketing & Growth",
    shortLabel: "Growth",
    icon: Megaphone,
    colorClass: "from-pink-500/20 via-primary/10 to-primary/5 text-pink-600 dark:text-pink-400 border-pink-500/30",
  },
  student: {
    label: "Student Portal",
    shortLabel: "Student",
    icon: GraduationCap,
    colorClass: "from-cyan-500/20 via-primary/10 to-primary/5 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
  },
  parent: {
    label: "Parent Portal",
    shortLabel: "Parent",
    icon: HeartHandshake,
    colorClass: "from-violet-500/20 via-primary/10 to-primary/5 text-violet-600 dark:text-violet-400 border-violet-500/30",
  },
  super_admin: {
    label: "Super Admin HQ",
    shortLabel: "SuperAdmin",
    icon: Shield,
    colorClass: "from-rose-500/20 via-primary/10 to-primary/5 text-rose-600 dark:text-rose-400 border-rose-500/30",
  },
};

export function LuxuryShellHeader({
  title,
  subtitle,
  role,
  schoolSlug,
  schoolId,
  schoolName,
  userEmail,
  mobileNavOpen,
  onMobileNavOpenChange,
  navContent,
  offline,
  showOwnerContextSwitcher = false,
  showStaffAttendance = false,
  showVoiceCommand = false,
  voiceListening = false,
  onVoiceToggle,
  onLogout,
  customActions,
}: LuxuryShellHeaderProps) {
  // Parse clean display school name and role if combined in title string (e.g. "Beacon International School • Owner")
  const parsedTitleParts = title.split("•").map((s) => s.trim());
  const effectiveSchoolName = schoolName || (parsedTitleParts.length > 1 ? parsedTitleParts[0] : title);
  const inferredRole = role || (parsedTitleParts.length > 1 ? parsedTitleParts[1].toLowerCase().replace(/\s+/g, "_") : "tenant");
  const roleCfg = ROLE_CONFIG[inferredRole] || {
    label: inferredRole.replace(/_/g, " "),
    shortLabel: inferredRole.replace(/_/g, " "),
    icon: Building2,
    colorClass: "from-primary/20 via-primary/10 to-primary/5 text-primary border-primary/20",
  };
  const RoleIcon = roleCfg.icon;

  const handleOpenSearch = () => {
    window.dispatchEvent(new Event("eduverse:open-search"));
  };

  return (
    <header
      data-html2canvas-ignore="true"
      className="sticky top-0 z-40 w-full border-b border-primary/10 bg-background/80 backdrop-blur-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.25)] transition-all duration-200 print:hidden no-print"
    >
      {/* Radiant bottom hairline accent */}
      <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent pointer-events-none" />

      <div className="flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4 md:px-6 gap-2">
        {/* Left Side: Mobile Menu Trigger + Brand Jewel + Dynamic Hierarchy */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {/* Mobile Sheet Trigger (Hidden on Desktop) */}
          <div className="lg:hidden shrink-0">
            <Sheet open={mobileNavOpen} onOpenChange={onMobileNavOpenChange}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary shadow-xs transition-all duration-200 active:scale-95 flex items-center justify-center"
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[300px] p-4 overflow-y-auto bg-surface/95 backdrop-blur-2xl border-r border-primary/15"
              >
                {navContent}
              </SheetContent>
            </Sheet>
          </div>

          {/* Luxury Brand Crest / Jewel (Mobile & Desktop) */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/25 flex items-center justify-center text-primary shadow-xs shrink-0 ring-2 ring-primary/5">
              <RoleIcon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-display text-xs sm:text-sm font-bold tracking-tight text-foreground truncate max-w-[130px] sm:max-w-[200px] md:max-w-[320px]">
                  {effectiveSchoolName}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-1.5 py-0 h-4 sm:h-4.5 rounded-md border shrink-0 bg-gradient-to-r shadow-2xs",
                    roleCfg.colorClass
                  )}
                >
                  <span className="hidden sm:inline">{roleCfg.label}</span>
                  <span className="sm:hidden">{roleCfg.shortLabel}</span>
                </Badge>
              </div>

              {subtitle && (
                <span className="text-[10px] sm:text-xs text-muted-foreground/80 font-medium truncate max-w-[150px] sm:max-w-[240px] md:max-w-[360px] flex items-center gap-1">
                  <span className="inline-block h-1 w-1 rounded-full bg-primary/40" />
                  {subtitle}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center: Desktop Global AI Search Bar (Desktop only) */}
        <div className="hidden xl:flex items-center justify-center flex-1 max-w-md mx-4">
          <button
            onClick={handleOpenSearch}
            className="w-full flex items-center justify-between px-3.5 py-1.5 rounded-xl border border-primary/15 bg-primary/[0.03] hover:bg-primary/[0.07] hover:border-primary/30 text-xs text-muted-foreground transition-all duration-200 shadow-2xs group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-primary/70 group-hover:text-primary transition-colors" />
              <span>Search modules, students, shortcuts…</span>
            </div>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border/80 bg-surface px-1.5 font-mono text-[10px] font-medium text-muted-foreground shadow-2xs">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>
        </div>

        {/* Right Side: Campus Switcher + Action Hub */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Owner Context Switcher (School & Campus Selector) */}
          {showOwnerContextSwitcher && schoolId && (
            <OwnerContextSwitcher
              schoolId={schoolId}
              schoolSlug={schoolSlug}
              compact
            />
          )}

          {/* Unified Luxury Floating Action Cluster */}
          <div className="flex items-center gap-0.5 sm:gap-1 p-0.5 sm:p-1 rounded-2xl bg-surface/80 border border-primary/15 shadow-2xs backdrop-blur-md">
            {/* Offline Status */}
            {offline && (
              <OfflineStatusIndicator
                isOnline={offline.isOnline}
                isSyncing={offline.isSyncing}
                stats={offline.stats}
                lastSyncAt={offline.lastSyncAt}
                syncProgress={offline.syncProgress}
                storageInfo={offline.storageInfo}
                onSync={offline.syncPendingItems}
                variant="compact"
              />
            )}

            {/* Staff Attendance Quick Check-In */}
            {showStaffAttendance && schoolId && (
              <StaffAttendanceWidget schoolId={schoolId} />
            )}

            {/* Voice Command (if supported) */}
            {showVoiceCommand && onVoiceToggle && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Voice command"
                onClick={onVoiceToggle}
                className={cn(
                  "h-8 w-8 sm:h-8.5 sm:w-8.5 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all",
                  voiceListening && "bg-primary/15 text-primary animate-pulse ring-2 ring-primary/30"
                )}
              >
                <Mic className="h-4 w-4" />
              </Button>
            )}

            {/* Notifications Bell */}
            {schoolId && (
              <NotificationsBell
                schoolId={schoolId}
                schoolSlug={schoolSlug}
                role={inferredRole}
              />
            )}

            {/* AI Command / Quick Search trigger */}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Search & AI Copilot"
              onClick={handleOpenSearch}
              className="h-8 w-8 sm:h-8.5 sm:w-8.5 rounded-xl text-primary hover:bg-primary/10 transition-all active:scale-95"
            >
              <Sparkles className="h-4 w-4" />
            </Button>

            {/* Custom Extra Actions */}
            {customActions}

            {/* Quick Logout (Mobile/Desktop) */}
            {onLogout && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                onClick={onLogout}
                className="h-8 w-8 sm:h-8.5 sm:w-8.5 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all active:scale-95"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
