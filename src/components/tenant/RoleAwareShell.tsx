import { PropsWithChildren, useMemo, useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { LogOut, Menu, Sparkles, ChevronDown, KeyRound, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  startOtpCooldown,
  getOtpCooldownRemaining,
} from "@/lib/otp-auth";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { GlobalCommandPalette } from "@/components/global/GlobalCommandPalette";
import { NotificationsBell } from "@/components/global/NotificationsBell";
import { DashboardNotificationsBanner } from "@/components/global/DashboardNotificationsBanner";
import { useUnreadMessagesOptimized } from "@/hooks/useUnreadMessagesOptimized";
import { useTenantOptimized } from "@/hooks/useTenantOptimized";
import { useSession } from "@/hooks/useSession";
import { useUserRole } from "@/hooks/useUserRole";
import { roleLabel, type EduverseRole } from "@/lib/eduverse-roles";
import {
  buildMergedNav, GROUP_LABELS, GROUP_ORDER, pickPrimaryRole, DROPDOWN_MAPPING,
} from "@/lib/role-navigation";
import { cn } from "@/lib/utils";


type Props = PropsWithChildren<{
  schoolSlug: string;
  title?: string;
  subtitle?: string;
}>;

/**
 * Additive shell that sits ABOVE existing dashboards.
 * - Reads all of the user's roles
 * - Builds a single merged sidebar (deduped by module key)
 * - Routes each item to the existing `/{slug}/{primaryRole}/{path}` URL
 *   so current TenantDashboard / per-role dashboards keep handling it.
 *
 * No existing routes, modules, permissions, or DB are modified.
 */
export function RoleAwareShell({ schoolSlug, title, subtitle, children }: Props) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const isGroupExpanded = (groupKey: string, childUrls: string[]) => {
    if (expandedGroups[groupKey] !== undefined) {
      return expandedGroups[groupKey];
    }
    return childUrls.some(
      (url) => location.pathname === url || location.pathname.startsWith(url + "/")
    );
  };

  const { user } = useSession();

  const tenant = useTenantOptimized(schoolSlug);
  const schoolId = tenant.schoolId;
  const { roles, loading } = useUserRole(schoolId, user?.id ?? null);
  const { unreadCount } = useUnreadMessagesOptimized(schoolId, user?.id ?? null);

  const primaryRole = useMemo<EduverseRole | null>(
    () => pickPrimaryRole(roles),
    [roles],
  );

  const { grouped } = useMemo(() => buildMergedNav(roles), [roles]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate(`/${schoolSlug}/auth`);
  };

  // Change Password Dialog States & Logic
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [otpStep, setOtpStep] = useState<'request' | 'verify' | 'new_password' | 'success'>('request');
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (!user?.email || !changePasswordOpen) return;
    const tick = () => setOtpCooldown(getOtpCooldownRemaining(user.email!));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [user?.email, changePasswordOpen]);

  const handleSendOtp = async () => {
    if (!user?.email) return;
    setOtpError(null);
    setIsBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: user.email,
        options: {
          shouldCreateUser: false,
        }
      });
      if (error) {
        toast.error("Failed to send verification code: " + error.message);
        return;
      }
      startOtpCooldown(user.email);
      setOtpCooldown(60);
      setOtpCode("");
      setOtpStep('verify');
      toast.success("Verification code sent to " + user.email);
    } finally {
      setIsBusy(false);
    }
  };

  const handleResendOtp = async () => {
    if (!user?.email) return;
    setIsResending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: user.email,
        options: {
          shouldCreateUser: false,
        }
      });
      if (error) {
        toast.error("Failed to send verification code: " + error.message);
        return;
      }
      startOtpCooldown(user.email);
      setOtpCooldown(60);
      toast.success("Verification code resent successfully.");
    } finally {
      setIsResending(false);
    }
  };

  const handleVerifyOtp = async (code: string) => {
    if (!user?.email) return;
    setOtpError(null);
    setIsBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: user.email,
        token: code,
        type: 'magiclink',
      });
      if (error) {
        setOtpError(error.message);
        toast.error("Invalid verification code. Please try again.");
        setOtpCode("");
        return;
      }
      setOtpStep('new_password');
      toast.success("Identity verified! Please set your new password.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setIsBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error("Failed to update password: " + error.message);
        return;
      }
      setOtpStep('success');
      toast.success("Password updated successfully!");
      setTimeout(() => {
        setChangePasswordOpen(false);
        // reset fields
        setOtpStep('request');
        setNewPassword("");
        setConfirmPassword("");
        setOtpCode("");
      }, 1500);
    } finally {
      setIsBusy(false);
    }
  };

  const base = `/${schoolSlug}/${primaryRole ?? "student"}`;

  const NavBody = () => (
    <>
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            AltRix
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            /{schoolSlug}
            {roles.length > 0 && ` • ${roles.map((r) => roleLabel[r]).join(" + ")}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <NotificationsBell schoolId={schoolId} schoolSlug={schoolSlug} role={primaryRole ?? "student"} />
          <Button
            variant="soft" size="icon" aria-label="Search" className="rounded-xl"
            onClick={() => window.dispatchEvent(new Event("eduverse:open-search"))}
          >
            <Sparkles className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <nav className="mt-5 space-y-3">
        {GROUP_ORDER.map((g) => {
          const items = grouped[g];
          if (!items?.length) return null;

          const directItems: typeof items = [];
          const dropdownGroups: Record<string, { label: string; icon: any; items: typeof items }> = {};

          items.forEach((item) => {
            const mapping = DROPDOWN_MAPPING[item.key];
            if (mapping) {
              if (!dropdownGroups[mapping.groupKey]) {
                dropdownGroups[mapping.groupKey] = {
                  label: mapping.label,
                  icon: mapping.icon,
                  items: []
                };
              }
              dropdownGroups[mapping.groupKey].items.push(item);
            } else {
              directItems.push(item);
            }
          });

          return (
            <div key={g}>
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {GROUP_LABELS[g]}
              </p>
              <div className="space-y-0.5">
                {/* Direct Items */}
                {directItems.map((item) => {
                  const to = item.path ? `${base}/${item.path}` : base;
                  const badge = item.key === "messages" ? unreadCount : 0;
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.key}
                      to={to}
                      end={!item.path}
                      className="group flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-150"
                      activeClassName="bg-primary text-primary-foreground shadow-soft hover:bg-primary hover:text-primary-foreground"
                      onClick={() => setMobileOpen(false)}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 shrink-0" /> {item.label}
                      </span>
                      {badge > 0 && (
                        <Badge variant="destructive" className="h-5 px-1.5 text-[10px] rounded-full">
                          {badge > 99 ? "99+" : badge}
                        </Badge>
                      )}
                    </NavLink>
                  );
                })}

                {/* Collapsible Dropdown Groups */}
                {Object.entries(dropdownGroups).map(([groupKey, groupInfo]) => {
                  const childUrls = groupInfo.items.map(item =>
                    item.path ? `${base}/${item.path}` : base
                  );
                  const isOpen = isGroupExpanded(groupKey, childUrls);
                  const isDropdownActive = childUrls.some(url => location.pathname === url || location.pathname.startsWith(url + "/"));
                  const GroupIcon = groupInfo.icon;

                  return (
                    <div key={groupKey} className="space-y-0.5">
                      <button
                        onClick={() => toggleGroup(groupKey)}
                        className={cn(
                          "w-full flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-150",
                          isDropdownActive && "text-foreground font-semibold"
                        )}
                      >
                        <span className="flex items-center gap-2.5">
                          <GroupIcon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{groupInfo.label}</span>
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 transition-transform duration-200 text-muted-foreground/60",
                            isOpen ? "rotate-180" : "rotate-0"
                          )}
                        />
                      </button>

                      <div
                        className={cn(
                          "overflow-hidden transition-all duration-200 ease-in-out",
                          isOpen ? "max-h-[500px] opacity-100 mt-0.5" : "max-h-0 opacity-0 pointer-events-none"
                        )}
                      >
                        <div className="pl-4 ml-3 border-l border-border/40 space-y-0.5">
                          {groupInfo.items.map((item) => {
                            const to = item.path ? `${base}/${item.path}` : base;
                            const badge = item.key === "messages" ? unreadCount : 0;
                            const Icon = item.icon;
                            return (
                              <NavLink
                                key={item.key}
                                to={to}
                                className="group flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-150"
                                activeClassName="bg-primary text-primary-foreground shadow-soft hover:bg-primary hover:text-primary-foreground"
                                onClick={() => setMobileOpen(false)}
                              >
                                <span className="flex items-center gap-2.5">
                                  <Icon className="h-4 w-4 shrink-0" /> {item.label}
                                </span>
                                {badge > 0 && (
                                  <Badge variant="destructive" className="h-5 px-1.5 text-[10px] rounded-full">
                                    {badge > 99 ? "99+" : badge}
                                  </Badge>
                                )}
                              </NavLink>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="mt-5 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-accent/40 to-transparent p-4">
        <p className="text-sm font-semibold text-foreground">Unified workspace</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Modules merged from all your roles. Existing dashboards remain available.
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 rounded-xl text-muted-foreground hover:text-primary"
          onClick={() => {
            setOtpStep('request');
            setOtpCode("");
            setNewPassword("");
            setConfirmPassword("");
            setOtpError(null);
            setChangePasswordOpen(true);
            setMobileOpen(false);
          }}
        >
          <KeyRound className="h-4 w-4" /> Change Password
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 rounded-xl text-muted-foreground hover:text-destructive"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" /> Sign Out
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-0">
      <GlobalCommandPalette basePath={base} />

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-xl">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-4 overflow-y-auto">
              <NavBody />
            </SheetContent>
          </Sheet>
          <div className="min-w-0">
            <p className="font-display text-base font-semibold tracking-tight truncate">
              {title ?? "Workspace"}
            </p>
            {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>
        <NotificationsBell schoolId={schoolId} schoolSlug={schoolSlug} role={primaryRole ?? "student"} />
      </header>

      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 px-3 py-4 sm:px-4 lg:grid-cols-[280px_1fr] lg:gap-6 lg:px-6 lg:py-6">
        <aside className="sticky top-6 hidden self-start max-h-[calc(100vh-3rem)] overflow-y-auto rounded-3xl border border-border/60 bg-surface/80 p-4 shadow-soft backdrop-blur-sm lg:block no-scrollbar">
          <NavBody />
        </aside>

        <section className="rounded-2xl border border-border/40 bg-surface p-4 shadow-soft sm:p-5 lg:rounded-3xl lg:p-6">
          <header className="mb-5 hidden lg:mb-6 lg:block">
            <p className="font-display text-2xl font-semibold tracking-tight">
              {title ?? "Unified Workspace"}
            </p>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </header>
          <div className="mb-4 lg:mb-5">
            <DashboardNotificationsBanner schoolId={schoolId} schoolSlug={schoolSlug} role={primaryRole ?? "student"} />
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading workspace…</p>
          ) : (
            children
          )}
        </section>
      </div>

      <Dialog open={changePasswordOpen} onOpenChange={(open) => {
        if (!isBusy) {
          setChangePasswordOpen(open);
          if (!open) {
            setOtpStep('request');
            setOtpCode("");
            setNewPassword("");
            setConfirmPassword("");
            setOtpError(null);
          }
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" /> Change Password
            </DialogTitle>
            <DialogDescription>
              {otpStep === 'request' && "Request a secure OTP code to verify your identity."}
              {otpStep === 'verify' && `Enter the 6-digit code sent to ${user?.email}.`}
              {otpStep === 'new_password' && "Enter your new strong password."}
              {otpStep === 'success' && "Password updated successfully!"}
            </DialogDescription>
          </DialogHeader>

          {otpStep === 'request' && (
            <div className="space-y-4 py-3">
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                <span>
                  For security, changing your password requires verifying ownership of your email inbox <strong>({user?.email})</strong>.
                </span>
              </div>
              <Button
                type="button"
                variant="hero"
                className="w-full"
                onClick={handleSendOtp}
                disabled={isBusy}
              >
                {isBusy ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending Code…</>
                ) : (
                  "Send Verification Code"
                )}
              </Button>
            </div>
          )}

          {otpStep === 'verify' && (
            <div className="space-y-4 py-3">
              <motion.div
                animate={otpError ? { x: [-10, 10, -10, 10, 0], transition: { duration: 0.4 } } : {}}
                className="flex justify-center py-2"
              >
                <InputOTP
                  maxLength={6}
                  value={otpCode}
                  onChange={(val) => {
                    setOtpCode(val);
                    if (val.length === 6) {
                      void handleVerifyOtp(val);
                    }
                  }}
                  disabled={isBusy}
                >
                  <InputOTPGroup className="gap-2 justify-center w-full">
                    <InputOTPSlot index={0} className="w-12 h-12 text-lg rounded-xl border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface" />
                    <InputOTPSlot index={1} className="w-12 h-12 text-lg rounded-xl border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface" />
                    <InputOTPSlot index={2} className="w-12 h-12 text-lg rounded-xl border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface" />
                    <InputOTPSlot index={3} className="w-12 h-12 text-lg rounded-xl border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface" />
                    <InputOTPSlot index={4} className="w-12 h-12 text-lg rounded-xl border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface" />
                    <InputOTPSlot index={5} className="w-12 h-12 text-lg rounded-xl border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 bg-surface" />
                  </InputOTPGroup>
                </InputOTP>
              </motion.div>

              {otpError && (
                <p className="text-xs text-destructive text-center font-medium">
                  {otpError}
                </p>
              )}

              <div className="flex flex-col gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full text-xs"
                  onClick={handleResendOtp}
                  disabled={otpCooldown > 0 || isResending}
                >
                  {isResending ? (
                    <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Sending…</>
                  ) : otpCooldown > 0 ? (
                    `Resend code in ${otpCooldown}s`
                  ) : (
                    "Resend code"
                  )}
                </Button>
              </div>
            </div>
          )}

          {otpStep === 'new_password' && (
            <form onSubmit={handleUpdatePassword} className="space-y-4 py-3">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <Button
                type="submit"
                variant="hero"
                className="w-full"
                disabled={isBusy}
              >
                {isBusy ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating…</>
                ) : (
                  "Update Password"
                )}
              </Button>
            </form>
          )}

          {otpStep === 'success' && (
            <div className="flex flex-col items-center justify-center py-6 space-y-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 animate-bounce" />
              <p className="font-semibold text-foreground">Password Updated!</p>
              <p className="text-xs text-muted-foreground">Your changes have been saved securely.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
