/**
 * send-otp — Generates a 6-digit OTP and sends a premium HTML email via Resend REST API.
 * No SMTP. No Resend template dashboard needed. Template is embedded here.
 *
 * Required secret:
 *   RESEND_API_KEY  — Resend API key (re_xxxxx)
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

/** Guaranteed exactly 6 numeric digits, zero-padded. e.g. "047291" */
const generateOtp = (): string => {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const num = new DataView(bytes.buffer).getUint32(0) % 1_000_000;
  return num.toString().padStart(6, "0");
};

// ─── Premium email template ────────────────────────────────────────────────────
// Each OTP digit gets its own bordered box — no letter-spacing tricks,
// no HTML entities, always exactly 6 visible digits.
const buildEmailHtml = (otp: string, purpose: "password_reset" | "verify_email"): string => {
  const isReset = purpose === "password_reset";
  const title   = isReset ? "Reset Your Password"   : "Verify Your Email";
  const subtitle = isReset
    ? "Enter the 6-digit code below on the AltRix sign-in page to reset your password."
    : "Enter the 6-digit code below to activate your AltRix account.";
  const footerNote = isReset
    ? "If you didn't request a password reset, no action is needed — your account is safe."
    : "If you didn't create an AltRix account, you can safely ignore this email.";

  // Build 6 individual digit boxes
  const digitBoxes = otp.split("").map((digit) =>
    `<td style="padding:0 5px;">` +
    `<table cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td align="center" valign="middle" ` +
      `style="width:52px;height:66px;` +
      `background:#080c16;` +
      `border:1.5px solid #2d3a54;` +
      `border-radius:10px;` +
      `font-size:32px;font-weight:800;` +
      `color:#ffffff;` +
      `font-family:'Courier New',Courier,monospace;` +
      `letter-spacing:0;">` +
    `${digit}` +
    `</td></tr></table></td>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>${title} — AltRix</title>
</head>
<body style="margin:0;padding:0;background:#07090f;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#07090f;">
    <tr><td align="center" style="padding:48px 16px;">

      <!-- ─── Card ─────────────────────────────────────────────────────────── -->
      <table width="520" cellpadding="0" cellspacing="0" border="0"
             style="max-width:520px;width:100%;background:#0d1117;
                    border:1px solid #1a2235;border-radius:18px;overflow:hidden;">

        <!-- Violet accent bar -->
        <tr>
          <td style="height:3px;background:linear-gradient(90deg,#4f46e5 0%,#7c3aed 50%,#4f46e5 100%);"></td>
        </tr>

        <!-- Logo -->
        <tr>
          <td align="center" style="padding:36px 48px 0;">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-size:24px;font-weight:800;letter-spacing:-0.5px;
                            color:#ffffff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                  Alt<span style="color:#6366f1;">Rix</span>
                </td>
                <td width="7" style="vertical-align:middle;padding-bottom:3px;">
                  &nbsp;<span style="display:inline-block;width:6px;height:6px;
                    background:#6366f1;border-radius:50%;"></span>
                </td>
              </tr>
            </table>
            <p style="margin:5px 0 0;font-size:10px;letter-spacing:2.5px;
                       text-transform:uppercase;color:#2e3a52;font-weight:600;">
              School Operating System
            </p>
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:24px 48px 0;">
          <div style="height:1px;background:#161f30;"></div>
        </td></tr>

        <!-- Title & subtitle -->
        <tr>
          <td align="center" style="padding:30px 48px 0;">
            <h1 style="margin:0;font-size:24px;font-weight:700;
                        color:#f1f5f9;letter-spacing:-0.4px;line-height:1.25;">
              ${title}
            </h1>
            <p style="margin:10px 0 0;font-size:14px;color:#5a6a83;
                       line-height:1.65;max-width:340px;">
              ${subtitle}
            </p>
          </td>
        </tr>

        <!-- ─── OTP box ─────────────────────────────────────────────────── -->
        <tr>
          <td align="center" style="padding:28px 40px 24px;">
            <table cellpadding="0" cellspacing="0" border="0"
                   style="width:100%;background:#090d16;
                          border:1px solid #182030;border-radius:14px;">
              <tr><td align="center" style="padding:26px 16px 22px;">

                <p style="margin:0 0 18px;font-size:10px;letter-spacing:3px;
                           text-transform:uppercase;color:#2e3a52;font-weight:700;">
                  Verification Code
                </p>

                <!-- 6 digit boxes — each digit isolated, zero ambiguity -->
                <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                  <tr>${digitBoxes}</tr>
                </table>

                <!-- Expiry pill -->
                <table cellpadding="0" cellspacing="0" border="0" style="margin:18px auto 0;">
                  <tr>
                    <td style="background:#0f1829;border:1px solid #1e2d44;
                                border-radius:20px;padding:5px 18px;">
                      <p style="margin:0;font-size:12px;color:#5b63f5;font-weight:500;">
                        Expires in 10 minutes
                      </p>
                    </td>
                  </tr>
                </table>

              </td></tr>
            </table>
          </td>
        </tr>

        <!-- How-to note -->
        <tr>
          <td style="padding:0 40px 28px;">
            <table cellpadding="0" cellspacing="0" border="0"
                   style="width:100%;background:#0b1020;
                          border:1px solid #161f30;border-radius:10px;">
              <tr><td style="padding:14px 18px;">
                <p style="margin:0;font-size:13px;color:#8492a6;line-height:1.7;">
                  <strong style="color:#c8d5e8;">How to use:</strong>&nbsp;
                  Go back to the AltRix sign-in page and enter this 6-digit code
                  in the verification field to continue.
                </p>
              </td></tr>
            </table>
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:0 40px;">
          <div style="height:1px;background:#161f30;"></div>
        </td></tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding:22px 48px 34px;">
            <p style="margin:0 0 5px;font-size:12px;color:#2e3a52;line-height:1.6;">
              ${footerNote}
            </p>
            <p style="margin:0;font-size:11px;color:#1e2940;">
              &copy; ${new Date().getFullYear()} AltRix
              &nbsp;&middot;&nbsp;
              <span style="color:#2e3a52;">School Operating System</span>
            </p>
          </td>
        </tr>

      </table>
      <!-- ─── /Card ─────────────────────────────────────────────────────── -->

    </td></tr>
  </table>

</body>
</html>`;
};

// ─── Config ───────────────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW_SECONDS = 60;
const MAX_OTP_PER_WINDOW = 3;

// ─── Handler ──────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, code: "method_not_allowed", error: "Method not allowed" });

  try {
    const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
    const serviceRole  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const pepper       = serviceRole.slice(0, 32);

    if (!resendApiKey) {
      console.error("[send-otp] RESEND_API_KEY not set");
      return json({ ok: false, code: "config_error", error: "Email service not configured." });
    }

    const body    = await req.json().catch(() => ({}));
    const email   = String(body.email ?? "").trim().toLowerCase();
    const purpose = (body.purpose === "verify_email" ? "verify_email" : "password_reset") as
      "password_reset" | "verify_email";

    if (!isEmail(email)) {
      return json({ ok: false, code: "invalid_email", error: "Please enter a valid email address." });
    }

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const emailHash = await sha256(`${email}::${pepper}::${purpose}`);

    // Rate limit
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

    // Generate OTP — always exactly 6 digits
    const otp      = generateOtp();
    const codeHash = await sha256(`${otp}::${emailHash}`);

    console.log(`[send-otp] OTP generated — length: ${otp.length}`);

    const { error: insertErr } = await admin.from("custom_otp_codes").insert({
      email_hash: emailHash,
      code_hash:  codeHash,
      purpose,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    if (insertErr) {
      console.error("[send-otp] DB insert error:", insertErr);
      return json({ ok: false, code: "storage_error", error: "Unable to generate code. Please try again." });
    }

    // Send via Resend REST API — inline HTML, no dashboard template needed
    const subject = purpose === "verify_email"
      ? "Verify your AltRix account"
      : "Your AltRix password reset code";

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    "AltRix <onboarding@resend.dev>",
        to:      [email],
        subject,
        html:    buildEmailHtml(otp, purpose),
      }),
    });

    if (!resendRes.ok) {
      const errBody = await resendRes.text().catch(() => "");
      console.error(`[send-otp] Resend ${resendRes.status}:`, errBody);
      await admin.from("custom_otp_codes").delete().eq("code_hash", codeHash);

      if (resendRes.status === 403 || errBody.toLowerCase().includes("domain")) {
        return json({
          ok: false,
          code: "resend_sandbox",
          error: "Resend sandbox: email can only be sent to your Resend-registered address. Verify a domain to send to anyone.",
        });
      }

      return json({ ok: false, code: "email_send_failed", error: "Failed to send code. Please try again shortly." });
    }

    return json({ ok: true, cooldownSeconds: RATE_LIMIT_WINDOW_SECONDS });

  } catch (err) {
    console.error("[send-otp] Unexpected error:", err);
    return json({ ok: false, code: "unexpected", error: "Unexpected error. Please try again." });
  }
});
