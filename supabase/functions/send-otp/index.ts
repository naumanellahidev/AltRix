/**
 * send-otp — Generates a 6-digit OTP and delivers it via Resend REST API.
 * No SMTP, no domain required. Works on Resend free plan (sandbox mode).
 *
 * Required secrets:
 *   RESEND_API_KEY   — your Resend API key (re_xxxxx)
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

// Always return 200 so supabase.functions.invoke() surfaces the JSON body.
// Error details live in { ok: false, code, error } — not in HTTP status.
const json = (data: Record<string, unknown>, _httpStatus = 200) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const sha256 = async (input: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const generateOtp = (): string => {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1_000_000).padStart(6, "0");
};

// ─── Premium email template ────────────────────────────────────────────────────
const buildEmailHtml = (otp: string, purpose: "password_reset" | "verify_email") => {
  const title = purpose === "verify_email" ? "Verify Your Email" : "Reset Your Password";
  const subtitle =
    purpose === "verify_email"
      ? "Enter the code below to activate your AltRix account."
      : "Enter the code below on the AltRix sign-in page to set a new password.";
  const footerNote =
    purpose === "verify_email"
      ? "If you didn't create an AltRix account, you can safely ignore this email."
      : "If you didn't request a password reset, no action is needed — your password remains unchanged.";

  // Split OTP into two groups of 3 for readability: e.g. "847 291"
  const otpFormatted = `${otp.slice(0, 3)}&thinsp;${otp.slice(3)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${title} — AltRix</title>
</head>
<body style="margin:0;padding:0;background:#07090f;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#07090f;min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 16px;">

        <!-- Card -->
        <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;background:#0d1117;border:1px solid #1e2433;border-radius:16px;overflow:hidden;">

          <!-- Top accent line -->
          <tr>
            <td style="height:3px;background:linear-gradient(90deg,#4f46e5 0%,#7c3aed 50%,#4f46e5 100%);"></td>
          </tr>

          <!-- Logo & header -->
          <tr>
            <td align="center" style="padding:40px 48px 0;">
              <!-- AltRix wordmark -->
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                      Alt<span style="color:#6366f1;">Rix</span>
                    </span>
                  </td>
                  <td width="6"></td>
                  <td valign="middle">
                    <span style="display:inline-block;width:6px;height:6px;background:#6366f1;border-radius:50%;margin-bottom:2px;"></span>
                  </td>
                </tr>
              </table>
              <p style="margin:4px 0 0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#3d4a63;font-weight:500;">School Operating System</p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:28px 48px 0;">
              <div style="height:1px;background:#1e2433;"></div>
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td align="center" style="padding:32px 48px 0;">
              <h1 style="margin:0;font-size:26px;font-weight:700;color:#f1f5f9;letter-spacing:-0.5px;line-height:1.2;">${title}</h1>
              <p style="margin:10px 0 0;font-size:14px;color:#64748b;line-height:1.6;max-width:360px;">${subtitle}</p>
            </td>
          </tr>

          <!-- OTP Code Box -->
          <tr>
            <td align="center" style="padding:32px 48px;">
              <table cellpadding="0" cellspacing="0" border="0" style="background:#0a0e18;border:1px solid #252d40;border-radius:12px;width:100%;">
                <tr>
                  <td align="center" style="padding:28px 24px 24px;">
                    <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#3d4a63;font-weight:500;">Your Verification Code</p>
                    <p style="margin:0;font-size:48px;font-weight:800;letter-spacing:10px;color:#ffffff;font-family:'Courier New',Courier,monospace;text-shadow:0 0 32px rgba(99,102,241,0.5);">${otpFormatted}</p>
                    <table cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 0;">
                      <tr>
                        <td style="background:#1a1f2e;border:1px solid #252d40;border-radius:20px;padding:5px 14px;">
                          <p style="margin:0;font-size:12px;color:#6366f1;font-weight:500;">⏱ Expires in 10 minutes</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Instructions -->
          <tr>
            <td align="center" style="padding:0 48px 32px;">
              <table cellpadding="0" cellspacing="0" border="0" style="background:#0f1520;border:1px solid #1e2433;border-radius:10px;width:100%;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.7;">
                      <strong style="color:#e2e8f0;">How to use:</strong> Go back to the AltRix sign-in page, enter this 6-digit code in the verification field, and you'll be guided to set your new password.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 48px;">
              <div style="height:1px;background:#1e2433;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 48px 36px;">
              <p style="margin:0 0 6px;font-size:12px;color:#3d4a63;line-height:1.6;">${footerNote}</p>
              <p style="margin:0;font-size:11px;color:#29313f;">
                © ${new Date().getFullYear()} AltRix &nbsp;·&nbsp;
                <span style="color:#3d4a63;">School Operating System</span>
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
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
    const pepper = serviceRole.slice(0, 32);

    if (!resendApiKey) {
      console.error("[send-otp] RESEND_API_KEY secret is not set");
      return json({ ok: false, code: "config_error", error: "Email service not configured. Please contact your administrator." }, 500);
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

    // ── Rate limit ──────────────────────────────────────────────────────────
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
        error: "Too many codes requested. Please wait 60 seconds and try again.",
      });
    }

    // ── Generate + store OTP ────────────────────────────────────────────────
    const otp = generateOtp();
    const codeHash = await sha256(`${otp}::${emailHash}`);

    const { error: insertErr } = await admin.from("custom_otp_codes").insert({
      email_hash: emailHash,
      code_hash: codeHash,
      purpose,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    if (insertErr) {
      console.error("[send-otp] Failed to store OTP:", insertErr);
      return json({ ok: false, code: "storage_error", error: "Unable to generate code. Please try again." }, 500);
    }

    // ── Send via Resend ─────────────────────────────────────────────────────
    const subject =
      purpose === "verify_email"
        ? "Verify your AltRix account"
        : "Your AltRix password reset code";

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AltRix <onboarding@resend.dev>",
        to: [email],
        subject,
        html: buildEmailHtml(otp, purpose),
      }),
    });

    if (!resendRes.ok) {
      const errBody = await resendRes.text().catch(() => "");
      console.error(`[send-otp] Resend error ${resendRes.status}:`, errBody);

      // Roll back OTP record since email failed
      await admin.from("custom_otp_codes").delete().eq("code_hash", codeHash);

      // Surface helpful error for sandbox mode
      if (resendRes.status === 403 || errBody.toLowerCase().includes("domain")) {
        return json({
          ok: false,
          code: "resend_sandbox",
          error: "Email can only be sent to the address registered on your Resend account (sandbox mode). Add a verified domain to send to any address.",
        }, 403);
      }

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
