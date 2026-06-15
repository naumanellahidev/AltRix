import { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { usePlatformSuperAdmin } from "@/hooks/usePlatformSuperAdmin";
import { ServerCrash, RefreshCw, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PlatformAdminGuard() {
  const { user, loading: sessionLoading } = useSession();
  const authz = usePlatformSuperAdmin(user?.id);

  if (sessionLoading || authz.loading) {
    return (
      <div 
        className="min-h-screen flex flex-col items-center justify-center text-zinc-100"
        style={{
          background: "linear-gradient(180deg, hsl(20 10% 4%), hsl(0 0% 1%))",
        }}
      >
        <div className="relative flex flex-col items-center gap-4">
          <div
            className="h-16 w-16 rounded-2xl flex items-center justify-center animate-pulse"
            style={{
              background: "linear-gradient(135deg, hsl(45 95% 55% / 0.15), hsl(35 90% 50% / 0.1))",
              border: "1px solid hsl(45 80% 50% / 0.3)",
              boxShadow: "0 0 24px hsl(45 90% 50% / 0.15)",
            }}
          >
            <Crown className="h-8 w-8 text-amber-400 animate-bounce" style={{ animationDuration: "2s" }} />
          </div>
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent mt-2" />
          <p className="text-xs uppercase tracking-[0.25em] text-amber-300/60 font-semibold mt-1">
            Authenticating Control Center...
          </p>
        </div>
      </div>
    );
  }

  // Network offline or FastAPI 502/down
  if (authz.isNetworkError) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center p-4 text-zinc-100"
        style={{
          background:
            "radial-gradient(1200px 600px at 50% -20%, hsl(45 80% 50% / 0.08), transparent 70%)," +
            "linear-gradient(180deg, hsl(20 10% 4%), hsl(0 0% 1%))",
        }}
      >
        <div 
          className="max-w-md w-full rounded-2xl p-8 border backdrop-blur-xl relative overflow-hidden"
          style={{
            background: "hsl(20 10% 3% / 0.8)",
            borderColor: "hsl(45 15% 12%)",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 0 rgba(255, 255, 255, 0.03)",
          }}
        >
          {/* Accent glow */}
          <div 
            className="absolute -top-20 -left-20 w-40 h-40 rounded-full blur-[80px]"
            style={{ backgroundColor: "hsl(45 95% 50% / 0.15)" }}
          />

          <div className="flex flex-col items-center text-center relative z-10">
            <div
              className="h-16 w-16 rounded-2xl flex items-center justify-center mb-6"
              style={{
                background: "linear-gradient(135deg, hsl(35 85% 55% / 0.15), hsl(25 80% 50% / 0.1))",
                border: "1px solid hsl(35 75% 50% / 0.3)",
                boxShadow: "0 8px 32px hsl(35 90% 50% / 0.1)",
              }}
            >
              <ServerCrash className="h-8 w-8 text-amber-400" />
            </div>

            <p className="text-[10px] uppercase tracking-[0.25em] text-amber-400 font-semibold mb-2">
              System Diagnostics
            </p>
            <h2 className="text-xl font-bold text-slate-100 mb-3">Backend Connection Failure</h2>
            
            <p className="text-sm text-zinc-400 leading-relaxed mb-6">
              The control center is currently unable to communicate with the FastAPI server. 
              Please verify that your backend service is running locally on port 8000 and try again.
            </p>

            <div className="w-full space-y-3">
              <Button
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-zinc-950 font-semibold shadow-lg shadow-amber-500/20 py-5 transition-all"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry Connection
              </Button>

              <div 
                className="p-3.5 rounded-lg border text-left text-xs bg-zinc-950/40 border-zinc-800/80 font-mono text-zinc-400 max-h-24 overflow-y-auto"
              >
                <span className="text-amber-500/90 font-bold">Error:</span> {authz.message || "GET /api/auth/me 502 (Bad Gateway)"}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Not logged in or unauthorized
  if (!user || !authz.allowed) {
    // If user is logged in, but not allowed (wrong email),
    // they should be signed out on /auth to prevent redirect loop.
    return <Navigate to="/auth" replace state={{ denied: true, message: authz.message }} />;
  }

  return <Outlet />;
}
