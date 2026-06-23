/**
 * send-otp — Generates a 6-digit OTP and delivers it via Resend REST API.
 * Does NOT use Supabase SMTP at all. Works without a custom domain (uses onboarding@resend.dev).
 *
 * POST body: { email: string, purpose?: "password_reset" | "verify_email" }
 * Returns:   { ok: true, cooldownSeconds: 60 } | { ok: false, error: string, code: string }
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** SHA-256 hex of a string */
const sha256 = async (input: string) => {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hashBuffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/** Generate a 6-digit numeric OTP */
const generateOtp = (): string => {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1_000_000).padStart(6, "0");
};

const RATE_LIMIT_WINDOW_SECONDS = 60;
const MAX_OTP_PER_WINDOW = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const pepper = serviceRole.slice(0, 32);

    if (!resendApiKey) {
      console.error("RESEND_API_KEY is not set in edge function secrets");
      return json({ ok: false, code: "config_error", error: "Email service not configured." }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const purpose = String(body.purpose ?? "password_reset");

    if (!isEmail(email)) {
      return json({ ok: false, code: "invalid_email", error: "Please enter a valid email address." });
    }

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const emailHash = await sha256(`${email}::${pepper}::${purpose}`);

    // Rate limit: max 3 OTPs per 60 seconds per email+purpose
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
    const { count } = await admin
      .from("custom_otp_codes")
      .select("id", { count: "exact", head: true })
      .eq("email_hash", emailHash)
      .eq("purpose", purpose)
      .gte("created_at", since);

    if ((count ?? 0) >= MAX_OTP_PER_WINDOW) {
      return json({
        ok: false,
        code: "rate_limited",
        error: "Too many codes requested. Please wait 60 seconds before trying again.",
      });
    }

    // Generate OTP and store its hash
    const otp = generateOtp();
    const codeHash = await sha256(`${otp}::${emailHash}`);

    const { error: insertErr } = await admin.from("custom_otp_codes").insert({
      email_hash: emailHash,
      code_hash: codeHash,
      purpose,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
    });

    if (insertErr) {
      console.error("Failed to store OTP:", insertErr);
      return json({ ok: false, code: "storage_error", error: "Unable to generate code. Please try again." }, 500);
    }

    // Send via Resend REST API
    const subject =
      purpose === "verify_email"
        ? "Verify your AltRix account"
        : "Your AltRix password reset code";

    const htmlBody =
      purpose === "verify_email"
        ? `
          <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f1117;color:#e2e8f0;border-radius:16px">
            <h1 style="font-size:24px;font-weight:700;color:#ffffff;margin-bottom:8px">Verify your email</h1>
            <p style="color:#94a3b8;font-size:14px;margin-bottom:24px">Enter the code below to activate your AltRix account.</p>
            <div style="background:#1e2433;border:1px solid #334155;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
              <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#6366f1;font-family:monospace">${otp}</span>
            </div>
            <p style="color:#64748b;font-size:12px">This code expires in <strong>10 minutes</strong>. If you did not request this, you can safely ignore this email.</p>
          </div>
        `
        : `
          <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f1117;color:#e2e8f0;border-radius:16px">
            <h1 style="font-size:24px;font-weight:700;color:#ffffff;margin-bottom:8px">Reset your password</h1>
            <p style="color:#94a3b8;font-size:14px;margin-bottom:24px">Enter the code below on the AltRix sign-in page to reset your password.</p>
            <div style="background:#1e2433;border:1px solid #334155;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
              <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#6366f1;font-family:monospace">${otp}</span>
            </div>
            <p style="color:#64748b;font-size:12px">This code expires in <strong>10 minutes</strong>. If you did not request a password reset, you can safely ignore this email.</p>
          </div>
        `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AltRix <onboarding@resend.dev>",
        to: [email],
        subject,
        html: htmlBody,
      }),
    });

    if (!resendRes.ok) {
      const resendError = await resendRes.text().catch(() => "unknown");
      console.error("Resend API error:", resendRes.status, resendError);
      return json({
        ok: false,
        code: "email_send_failed",
        error: "Failed to send the verification code. Please try again shortly.",
      }, 500);
    }

    return json({ ok: true, cooldownSeconds: RATE_LIMIT_WINDOW_SECONDS });
  } catch (err) {
    console.error("send-otp unexpected error:", err);
    return json({ ok: false, code: "unexpected", error: "Unexpected error. Please try again." }, 500);
  }
});
