/**
 * send-otp — Generates a 6-digit OTP and delivers it via Brevo (primary)
 * or Resend (fallback). Does NOT use Supabase SMTP at all.
 *
 * Brevo free plan: 300 emails/day, sends to ANY email, only needs a verified
 * sender email address (not a full domain).
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

// ─── Email HTML builder ────────────────────────────────────────────────────────
const buildHtml = (otp: string, purpose: string) =>
  purpose === "verify_email"
    ? `<div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f1117;color:#e2e8f0;border-radius:16px">
        <h1 style="font-size:24px;font-weight:700;color:#fff;margin-bottom:8px">Verify your email</h1>
        <p style="color:#94a3b8;font-size:14px;margin-bottom:24px">Enter the code below to activate your AltRix account.</p>
        <div style="background:#1e2433;border:1px solid #334155;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
          <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#6366f1;font-family:monospace">${otp}</span>
        </div>
        <p style="color:#64748b;font-size:12px">Expires in <strong>10 minutes</strong>. Ignore if you didn't request this.</p>
      </div>`
    : `<div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f1117;color:#e2e8f0;border-radius:16px">
        <h1 style="font-size:24px;font-weight:700;color:#fff;margin-bottom:8px">Reset your password</h1>
        <p style="color:#94a3b8;font-size:14px;margin-bottom:24px">Enter the code below on the AltRix sign-in page to reset your password.</p>
        <div style="background:#1e2433;border:1px solid #334155;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
          <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#6366f1;font-family:monospace">${otp}</span>
        </div>
        <p style="color:#64748b;font-size:12px">Expires in <strong>10 minutes</strong>. Ignore if you didn't request a reset.</p>
      </div>`;

// ─── Brevo sender (primary — no domain required, sends to anyone) ──────────────
const sendViaBrevo = async (
  apiKey: string,
  senderEmail: string,
  toEmail: string,
  subject: string,
  html: string,
): Promise<boolean> => {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "AltRix", email: senderEmail },
      to: [{ email: toEmail }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    console.error(`[send-otp] Brevo error ${res.status}:`, err);
  }
  return res.ok;
};

// ─── Resend sender (fallback — requires verified domain for non-owner emails) ──
const sendViaResend = async (
  apiKey: string,
  toEmail: string,
  subject: string,
  html: string,
): Promise<boolean> => {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "AltRix <onboarding@resend.dev>",
      to: [toEmail],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    console.error(`[send-otp] Resend error ${res.status}:`, err);
  }
  return res.ok;
};

// ─── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const pepper = serviceRole.slice(0, 32);

    // Email provider credentials (at least one required)
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const brevoSenderEmail = Deno.env.get("BREVO_SENDER_EMAIL") ?? "";
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!brevoApiKey && !resendApiKey) {
      console.error("[send-otp] No email provider configured (BREVO_API_KEY or RESEND_API_KEY missing)");
      return json({ ok: false, code: "config_error", error: "Email service is not configured." }, 500);
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

    // Rate limit check
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

    // Generate OTP + store hash
    const otp = generateOtp();
    const codeHash = await sha256(`${otp}::${emailHash}`);

    const { error: insertErr } = await admin.from("custom_otp_codes").insert({
      email_hash: emailHash,
      code_hash: codeHash,
      purpose,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    if (insertErr) {
      console.error("[send-otp] DB insert failed:", insertErr);
      return json({ ok: false, code: "storage_error", error: "Unable to generate code. Please try again." }, 500);
    }

    const subject = purpose === "verify_email"
      ? "Verify your AltRix account"
      : "Your AltRix password reset code";
    const html = buildHtml(otp, purpose);

    // Try Brevo first, then Resend
    let sent = false;

    if (brevoApiKey && brevoSenderEmail) {
      sent = await sendViaBrevo(brevoApiKey, brevoSenderEmail, email, subject, html);
    }

    if (!sent && resendApiKey) {
      sent = await sendViaResend(resendApiKey, email, subject, html);
    }

    if (!sent) {
      // Roll back the OTP insert since email failed
      await admin.from("custom_otp_codes").delete().eq("code_hash", codeHash);
      return json({
        ok: false,
        code: "email_send_failed",
        error: "Failed to send the verification code. Please try again shortly.",
      }, 500);
    }

    return json({ ok: true, cooldownSeconds: RATE_LIMIT_WINDOW_SECONDS });
  } catch (err) {
    console.error("[send-otp] Unexpected error:", err);
    return json({ ok: false, code: "unexpected", error: "Unexpected error. Please try again." }, 500);
  }
});
