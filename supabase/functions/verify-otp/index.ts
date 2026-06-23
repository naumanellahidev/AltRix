/**
 * verify-otp — Validates the 6-digit OTP from send-otp.
 * On success returns a short-lived Supabase session token via admin.auth.admin.generateLink()
 * so the frontend can directly navigate to the reset-password page.
 *
 * POST body: { email: string, code: string, purpose?: "password_reset" | "verify_email" }
 * Returns:
 *   password_reset → { ok: true, action: "redirect", url: string }
 *   verify_email   → { ok: true, action: "session", accessToken: string, refreshToken: string }
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Always return 200 so supabase.functions.invoke() surfaces the JSON body.
const json = (data: Record<string, unknown>, _httpStatus = 200) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const sha256 = async (input: string) => {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hashBuffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, code: "method_not_allowed", error: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const pepper = serviceRole.slice(0, 32);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const code = String(body.code ?? "").trim();
    const purpose = String(body.purpose ?? "password_reset");

    if (!isEmail(email)) {
      return json({ ok: false, code: "invalid_email", error: "Invalid email address." });
    }
    if (!/^\d{6}$/.test(code)) {
      return json({ ok: false, code: "invalid_code", error: "Code must be exactly 6 digits." });
    }

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const emailHash = await sha256(`${email}::${pepper}::${purpose}`);
    const codeHash = await sha256(`${code}::${emailHash}`);

    // Find a valid, unused, unexpired OTP matching both hashes
    const { data: rows, error: fetchErr } = await admin
      .from("custom_otp_codes")
      .select("id, expires_at, used")
      .eq("email_hash", emailHash)
      .eq("code_hash", codeHash)
      .eq("purpose", purpose)
      .eq("used", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (fetchErr) {
      console.error("OTP lookup error:", fetchErr);
      return json({ ok: false, code: "lookup_error", error: "Verification failed. Please try again." }, 500);
    }

    if (!rows || rows.length === 0) {
      return json({ ok: false, code: "invalid_or_expired", error: "Invalid or expired code. Please request a new one." });
    }

    const otpRow = rows[0];

    // Mark as used immediately to prevent replay
    await admin
      .from("custom_otp_codes")
      .update({ used: true })
      .eq("id", otpRow.id);

    // Find the user
    let userId: string | null = null;
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) break;
      const user = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (user) { userId = user.id; break; }
      if (data.users.length < 1000) break;
    }

    if (!userId) {
      return json({ ok: false, code: "user_not_found", error: "Account not found." });
    }

    if (purpose === "password_reset") {
      // Create a real session for the user so the frontend can call setSession()
      // and navigate directly to /reset-password — no redirect URLs needed.
      const { data: sessionData, error: sessionErr } = await admin.auth.admin.createSession({
        user_id: userId,
      });

      if (sessionErr || !sessionData?.session) {
        console.error("[verify-otp] createSession error:", sessionErr);
        return json({ ok: false, code: "session_error", error: "Could not create reset session. Please try again." });
      }

      return json({
        ok: true,
        action: "session",
        accessToken: sessionData.session.access_token,
        refreshToken: sessionData.session.refresh_token,
        expiresAt: sessionData.session.expires_at,
      });
    }

    // For verify_email: confirm the user and return a session
    await admin.auth.admin.updateUserById(userId, { email_confirm: true });

    const { data: sessionData, error: sessionErr } = await admin.auth.admin.createSession({ user_id: userId });
    if (sessionErr || !sessionData?.session) {
      console.error("createSession error:", sessionErr);
      return json({ ok: false, code: "session_error", error: "Verification succeeded but login failed. Please sign in manually." }, 500);
    }

    return json({
      ok: true,
      action: "session",
      accessToken: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
    });
  } catch (err) {
    console.error("verify-otp unexpected error:", err);
    return json({ ok: false, code: "unexpected", error: "Unexpected error. Please try again." }, 500);
  }
});
