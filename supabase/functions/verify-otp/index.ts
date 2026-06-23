/**
 * verify-otp — Validates the 6-digit OTP from send-otp.
 *
 * password_reset → { ok: true, action: "token", token: string }
 *   Frontend calls supabase.auth.verifyOtp({ token_hash: token, type: "recovery" })
 *   to create a PASSWORD_RECOVERY session, then navigates to /reset-password.
 *
 * verify_email → { ok: true, action: "confirmed" }
 *   User's email is confirmed, they can sign in normally.
 *
 * POST body: { email: string, code: string, purpose?: "password_reset" | "verify_email" }
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Always HTTP 200 — error info lives in { ok: false, code, error }
const json = (data: Record<string, unknown>) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const sha256 = async (input: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, code: "method_not_allowed", error: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const pepper      = serviceRole.slice(0, 32);

    const body    = await req.json().catch(() => ({}));
    const email   = String(body.email ?? "").trim().toLowerCase();
    const code    = String(body.code  ?? "").trim();
    const purpose = String(body.purpose ?? "password_reset") as "password_reset" | "verify_email";

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
    const codeHash  = await sha256(`${code}::${emailHash}`);

    // ── Lookup OTP ────────────────────────────────────────────────────────────
    const { data: rows, error: fetchErr } = await admin
      .from("custom_otp_codes")
      .select("id")
      .eq("email_hash", emailHash)
      .eq("code_hash",  codeHash)
      .eq("purpose",    purpose)
      .eq("used",       false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (fetchErr) {
      console.error("[verify-otp] DB lookup error:", fetchErr);
      return json({ ok: false, code: "lookup_error", error: "Verification failed. Please try again." });
    }

    if (!rows || rows.length === 0) {
      return json({ ok: false, code: "invalid_or_expired", error: "Invalid or expired code. Please request a new one." });
    }

    // Mark used immediately (prevent replay attacks)
    await admin.from("custom_otp_codes").update({ used: true }).eq("id", rows[0].id);

    // ── Find user ─────────────────────────────────────────────────────────────
    // listUsers doesn't support filtering — paginate until found
    let userId: string | null = null;
    for (let page = 1; page <= 10 && !userId; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) {
        console.error("[verify-otp] listUsers error:", error);
        break;
      }
      const match = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (match) userId = match.id;
      if (data.users.length < 1000) break;
    }

    if (!userId) {
      return json({ ok: false, code: "user_not_found", error: "Account not found." });
    }

    // ── password_reset path ───────────────────────────────────────────────────
    // Generate a recovery link → extract hashed_token → return to frontend.
    // Frontend uses: supabase.auth.verifyOtp({ token_hash, type: "recovery" })
    // This creates a PASSWORD_RECOVERY session with NO redirect URL involved.
    if (purpose === "password_reset") {
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type:  "recovery",
        email,
      });

      if (linkErr || !linkData?.properties?.hashed_token) {
        console.error("[verify-otp] generateLink error:", linkErr);
        return json({ ok: false, code: "link_error", error: "Could not create reset token. Please try again." });
      }

      return json({
        ok:     true,
        action: "token",
        token:  linkData.properties.hashed_token,
      });
    }

    // ── verify_email path ─────────────────────────────────────────────────────
    const { error: confirmErr } = await admin.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });

    if (confirmErr) {
      console.error("[verify-otp] updateUserById error:", confirmErr);
      return json({ ok: false, code: "confirm_error", error: "Could not confirm email. Please try again." });
    }

    return json({ ok: true, action: "confirmed" });

  } catch (err) {
    console.error("[verify-otp] Unexpected error:", err);
    return json({ ok: false, code: "unexpected", error: "Unexpected error. Please try again." });
  }
});
