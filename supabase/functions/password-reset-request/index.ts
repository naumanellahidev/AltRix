import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WINDOW_HOURS = 24;
const MAX_REQUESTS = 3;

const json = (data: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const toHex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const hashEmail = async (email: string) => {
  const pepper = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const data = new TextEncoder().encode(`${email.toLowerCase()}::${pepper.slice(0, 32)}`);
  return toHex(await crypto.subtle.digest("SHA-256", data));
};

const findUserByEmail = async (admin: ReturnType<typeof createClient>, email: string) => {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
  return null;
};

const safeRedirect = (raw: unknown, origin: string) => {
  const fallback = `${origin}/reset-password`;
  if (typeof raw !== "string" || !raw.startsWith(origin)) return fallback;
  return raw;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const origin = req.headers.get("origin") ?? new URL(req.url).origin;
    const redirectTo = safeRedirect(body.redirectTo, origin);

    if (!isEmail(email)) return json({ ok: false, code: "invalid_email", error: "Please enter a valid email address." });

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const authUser = await findUserByEmail(admin, email);
    if (!authUser) {
      return json({ ok: false, code: "account_not_found", error: "No active account was found for this email. Please check the spelling or contact your school administrator." });
    }

    const emailHash = await hashEmail(email);
    const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();

    const { count, error: countErr } = await admin
      .from("password_reset_rate_limits")
      .select("id", { count: "exact", head: true })
      .eq("email_hash", emailHash)
      .gte("requested_at", since);

    if (countErr) return json({ ok: false, code: "rate_check_failed", error: "We could not check reset limits. Please try again shortly." });

    if ((count ?? 0) >= MAX_REQUESTS) {
      return json(
        {
          ok: false,
          code: "limit_reached",
          error: "For security, only 3 reset links can be sent in 24 hours. Please try again later or contact your school administrator.",
        }
      );
    }

    const { error: resetErr } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
    if (resetErr) {
      const message = resetErr.message || "Unable to send reset email.";
      const status = /rate|too many/i.test(message) ? 429 : 400;
      return json({ ok: false, code: status === 429 ? "provider_rate_limited" : "send_failed", error: message });
    }

    await admin.from("password_reset_rate_limits").insert({ email_hash: emailHash });

    return json({ ok: true, cooldownSeconds: 60, remainingRequests: Math.max(0, MAX_REQUESTS - (count ?? 0) - 1) });
  } catch (error) {
    console.error("password-reset-request failed", error);
    return json({ ok: false, code: "unexpected", error: "Unable to send the reset link right now. Please try again shortly." }, 500);
  }
});
