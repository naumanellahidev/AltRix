/**
 * send-otp — Generates a 6-digit OTP and sends it via Resend.
 *
 * Required secrets:
 *   RESEND_API_KEY          — Resend API key (re_xxxxx)
 *   RESEND_TEMPLATE_ID      — (optional) Template ID from Resend dashboard
 *                             When set, Resend uses your saved template with {{code}} variable.
 *                             When not set, falls back to built-in HTML template.
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

// Always HTTP 200 — error details live in { ok: false, code, error }
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

/** Always returns exactly 6 numeric digits, zero-padded. e.g. "047291" */
const generateOtp = (): string => {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const view = new DataView(bytes.buffer);
  const num = view.getUint32(0) % 1_000_000;   // 0 – 999 999
  const otp = num.toString().padStart(6, "0");  // always exactly 6 chars
  // Defensive assertion
  if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
    throw new Error(`OTP generation produced invalid value: "${otp}"`);
  }
  return otp;
};

// ─── Fallback inline HTML (used when RESEND_TEMPLATE_ID is not set) ───────────
const buildFallbackHtml = (otp: string, purpose: "password_reset" | "verify_email") => {
  const title = purpose === "verify_email" ? "Verify Your Email" : "Reset Your Password";
  const subtitle = purpose === "verify_email"
    ? "Enter the 6-digit code below to activate your AltRix account."
    : "Enter the 6-digit code below on the AltRix sign-in page.";

  // Each digit in its own box — no letter-spacing trick, no HTML entities
  const digitBoxes = otp.split("").map((d) =>
    `<td style="padding:0 4px;">` +
    `<table cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td align="center" valign="middle" style="width:48px;height:60px;` +
    `background:#0a0e18;border:1.5px solid #2d3a54;border-radius:10px;` +
    `font-size:30px;font-weight:800;color:#ffffff;` +
    `font-family:'Courier New',Courier,monospace;">` +
    `${d}</td></tr></table></td>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title} — AltRix</title>
</head>
<body style="margin:0;padding:0;background:#07090f;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#07090f;">
    <tr><td align="center" style="padding:48px 16px;">
      <table width="520" cellpadding="0" cellspacing="0" border="0"
             style="max-width:520px;width:100%;background:#0d1117;border:1px solid #1e2433;border-radius:16px;overflow:hidden;">
        <!-- Accent bar -->
        <tr><td style="height:3px;background:linear-gradient(90deg,#4f46e5,#7c3aed,#4f46e5);"></td></tr>
        <!-- Logo -->
        <tr><td align="center" style="padding:36px 48px 0;">
          <span style="font-size:22px;font-weight:800;color:#fff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            Alt<span style="color:#6366f1;">Rix</span>
          </span>
          <p style="margin:4px 0 0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#3d4a63;">School Operating System</p>
        </td></tr>
        <!-- Divider -->
        <tr><td style="padding:24px 48px 0;"><div style="height:1px;background:#1e2433;"></div></td></tr>
        <!-- Title -->
        <tr><td align="center" style="padding:28px 48px 0;">
          <h1 style="margin:0;font-size:24px;font-weight:700;color:#f1f5f9;">${title}</h1>
          <p style="margin:8px 0 0;font-size:14px;color:#64748b;">${subtitle}</p>
        </td></tr>
        <!-- OTP boxes -->
        <tr><td align="center" style="padding:28px 48px 20px;">
          <table cellpadding="0" cellspacing="0" border="0"
                 style="background:#0b0f1a;border:1px solid #1e2a3d;border-radius:14px;width:100%;">
            <tr><td align="center" style="padding:24px 16px 20px;">
              <p style="margin:0 0 16px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#3d4a63;font-weight:600;">
                Verification Code
              </p>
              <!-- 6 individual digit boxes — always exactly 6 digits -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>${digitBoxes}</tr>
              </table>
              <table cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 0;">
                <tr><td style="background:#141b2d;border:1px solid #252d40;border-radius:20px;padding:5px 16px;">
                  <p style="margin:0;font-size:12px;color:#6366f1;font-weight:500;">Expires in 10 minutes</p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td align="center" style="padding:20px 48px 32px;">
          <p style="margin:0;font-size:11px;color:#3d4a63;">
            &copy; ${new Date().getFullYear()} AltRix &nbsp;&middot;&nbsp; School Operating System
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

// ─── Config ───────────────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW_SECONDS = 60;
const MAX_OTP_PER_WINDOW = 3;

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, code: "method_not_allowed", error: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const resendTemplateId = Deno.env.get("RESEND_TEMPLATE_ID"); // optional
    const pepper = serviceRole.slice(0, 32);

    if (!resendApiKey) {
      console.error("[send-otp] RESEND_API_KEY is not set");
      return json({ ok: false, code: "config_error", error: "Email service not configured. Please contact your administrator." });
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const purpose = (body.purpose === "verify_email" ? "verify_email" : "password_reset") as
      | "password_reset"
      | "verify_email";

    if (!isEmail(email)) {
      return json({ ok: false, code: "invalid_email", error: "Please enter a valid email address." });
    }

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const emailHash = await sha256(`${email}::${pepper}::${purpose}`);

    // ── Rate limit ─────────────────────────────────────────────────────────
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
    const { count } = await admin
      .from("custom_otp_codes")
      .select("id", { count: "exact", head: true })
      .eq("email_hash", emailHash)
      .eq("purpose", purpose)
      .gte("created_at", since);

    if ((count ?? 0) >= MAX_OTP_PER_WINDOW) {
      return json({ ok: false, code: "rate_limited", error: "Too many codes requested. Please wait 60 seconds and try again." });
    }

    // ── Generate OTP (exactly 6 digits, always) ─────────────────────────────
    const otp = generateOtp();
    console.log(`[send-otp] Generated OTP length: ${otp.length}, value: ${otp}`); // verify in logs
    const codeHash = await sha256(`${otp}::${emailHash}`);

    const { error: insertErr } = await admin.from("custom_otp_codes").insert({
      email_hash: emailHash,
      code_hash: codeHash,
      purpose,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    if (insertErr) {
      console.error("[send-otp] DB insert error:", insertErr);
      return json({ ok: false, code: "storage_error", error: "Unable to generate code. Please try again." });
    }

    // ── Build Resend payload ─────────────────────────────────────────────────
    const subject = purpose === "verify_email"
      ? "Verify your AltRix account"
      : "Your AltRix password reset code";

    // If RESEND_TEMPLATE_ID is set, use the Resend template with {{code}} variable.
    // Otherwise fall back to our inline HTML.
    const resendPayload = resendTemplateId
      ? {
          from: "AltRix <onboarding@resend.dev>",
          to: [email],
          subject,
          template_id: resendTemplateId,
          variables: { code: otp },  // Use {{code}} in your Resend template
        }
      : {
          from: "AltRix <onboarding@resend.dev>",
          to: [email],
          subject,
          html: buildFallbackHtml(otp, purpose),
        };

    // ── Send ─────────────────────────────────────────────────────────────────
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendPayload),
    });

    if (!resendRes.ok) {
      const errBody = await resendRes.text().catch(() => "");
      console.error(`[send-otp] Resend error ${resendRes.status}:`, errBody);
      await admin.from("custom_otp_codes").delete().eq("code_hash", codeHash);

      if (resendRes.status === 403 || errBody.toLowerCase().includes("domain")) {
        return json({
          ok: false,
          code: "resend_sandbox",
          error: "Resend sandbox mode: email can only be sent to your Resend-registered address.",
        });
      }

      return json({ ok: false, code: "email_send_failed", error: "Failed to send code. Please try again." });
    }

    return json({ ok: true, cooldownSeconds: RATE_LIMIT_WINDOW_SECONDS });

  } catch (err) {
    console.error("[send-otp] Unexpected error:", err);
    return json({ ok: false, code: "unexpected", error: "Unexpected error. Please try again." });
  }
});
