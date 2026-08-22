-- =========================================================================
-- AltRix Migration: Professional Staff Invitation + Central Email Management System
-- Schema: user_invitations, password_resets, email_sender_identities,
--         email_templates, email_event_mappings, email_logs
-- =========================================================================

-- 1. Table: user_invitations
CREATE TABLE IF NOT EXISTS public.user_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(128) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    display_name VARCHAR(255),
    school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
    campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
    invited_by_user_id UUID NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending', -- pending, sent, opened, verified, activated, expired, revoked, failed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
    opened_at TIMESTAMPTZ,
    email_verified_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revoked_by_user_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_user_invitations_token ON public.user_invitations(token);
CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON public.user_invitations(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_user_invitations_school_id ON public.user_invitations(school_id);
CREATE INDEX IF NOT EXISTS idx_user_invitations_status ON public.user_invitations(status);

-- 2. Table: password_resets
CREATE TABLE IF NOT EXISTS public.password_resets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(128) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending', -- pending, consumed, expired, revoked
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
    consumed_at TIMESTAMPTZ,
    ip_address VARCHAR(64),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token ON public.password_resets(token);
CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON public.password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_email ON public.password_resets(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_password_resets_status ON public.password_resets(status);

-- 3. Table: email_sender_identities
CREATE TABLE IF NOT EXISTS public.email_sender_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    email VARCHAR(255) NOT NULL,
    reply_to VARCHAR(255),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_senders_key ON public.email_sender_identities(key);

-- 4. Table: email_templates
CREATE TABLE IF NOT EXISTS public.email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    category VARCHAR(64) NOT NULL, -- Onboarding, Security, Notifications, Support, Transactional
    subject VARCHAR(255) NOT NULL,
    sender_identity_key VARCHAR(64) REFERENCES public.email_sender_identities(key) ON UPDATE CASCADE ON DELETE SET NULL,
    html_content TEXT NOT NULL,
    text_content TEXT,
    cta_text VARCHAR(128),
    cta_url_variable VARCHAR(128),
    available_variables JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_key ON public.email_templates(key);

-- 5. Table: email_event_mappings
CREATE TABLE IF NOT EXISTS public.email_event_mappings (
    event_name VARCHAR(64) PRIMARY KEY,
    sender_identity_key VARCHAR(64) NOT NULL REFERENCES public.email_sender_identities(key) ON UPDATE CASCADE,
    template_key VARCHAR(64) NOT NULL REFERENCES public.email_templates(key) ON UPDATE CASCADE,
    description VARCHAR(255),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Table: email_logs
CREATE TABLE IF NOT EXISTS public.email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_email VARCHAR(255) NOT NULL,
    sender_email VARCHAR(255) NOT NULL,
    sender_name VARCHAR(128),
    event_name VARCHAR(64) NOT NULL,
    template_key VARCHAR(64),
    subject VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL, -- sent, failed, delivered, bounced
    error_details TEXT,
    message_id VARCHAR(255),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON public.email_logs(LOWER(recipient_email));
CREATE INDEX IF NOT EXISTS idx_email_logs_event_name ON public.email_logs(event_name);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON public.email_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_logs(status);

-- =========================================================================
-- Seed Default Sender Identities (Official AltRix Addresses on mail.altrixcore.com)
-- =========================================================================
INSERT INTO public.email_sender_identities (key, name, email, reply_to, is_default, is_active)
VALUES
    ('security', 'AltRix Security HQ', 'security@altrixcore.com', 'security@altrixcore.com', FALSE, TRUE),
    ('no_reply', 'AltRix Platform System', 'no-reply@altrixcore.com', NULL, TRUE, TRUE),
    ('support', 'AltRix Customer Support', 'support@altrixcore.com', 'support@altrixcore.com', FALSE, TRUE),
    ('info', 'AltRix Information Desk', 'info@altrixcore.com', 'info@altrixcore.com', FALSE, TRUE),
    ('ceo', 'AltRix Executive Office', 'ceo@altrixcore.com', 'ceo@altrixcore.com', FALSE, TRUE),
    ('notifications', 'AltRix Cloud Notifications', 'notifications@altrixcore.com', 'no-reply@altrixcore.com', FALSE, TRUE),
    ('contact', 'AltRix Direct Contact', 'contact@altrixcore.com', 'contact@altrixcore.com', FALSE, TRUE)
ON CONFLICT (key) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    updated_at = NOW();

-- =========================================================================
-- Seed Default Email Templates with Professional AltRix Branding
-- =========================================================================
INSERT INTO public.email_templates (key, name, category, subject, sender_identity_key, html_content, text_content, cta_text, cta_url_variable, available_variables, is_active)
VALUES
(
    'staff_invitation',
    'Staff Onboarding Invitation',
    'Onboarding',
    'Official Invitation to Join {{tenant_name}} on AltRix Cloud',
    'security',
    '<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AltRix Staff Invitation</title>
<style>
  body { margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #334155; }
  table { border-spacing: 0; }
  .wrapper { width: 100%; table-layout: fixed; background-color: #0f172a; padding: 40px 10px; }
  .main { background-color: #ffffff; max-width: 600px; margin: 0 auto; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35); }
  .header { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 36px 32px; text-align: center; border-bottom: 3px solid #3b82f6; }
  .logo-text { font-size: 28px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff; margin: 0; }
  .logo-accent { color: #3b82f6; }
  .content { padding: 36px 32px 28px 32px; font-size: 15px; line-height: 1.6; color: #334155; }
  .badge { display: inline-block; background: #eff6ff; color: #1d4ed8; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
  .title { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0 0 16px 0; line-height: 1.3; }
  .card-info { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 24px 0; }
  .card-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
  .card-row:last-child { margin-bottom: 0; }
  .card-label { color: #64748b; font-weight: 600; }
  .card-val { color: #0f172a; font-weight: 700; }
  .btn-wrap { text-align: center; margin: 32px 0 24px 0; }
  .btn { display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff !important; font-size: 16px; font-weight: 700; text-decoration: none; padding: 14px 36px; border-radius: 10px; box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.4); }
  .notice { font-size: 13px; color: #64748b; background: #f1f5f9; padding: 12px 16px; border-radius: 8px; border-left: 3px solid #64748b; margin-top: 24px; }
  .footer { background-color: #f8fafc; padding: 24px 32px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
</style>
</head>
<body>
<div class="wrapper">
  <table class="main" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td class="header">
        <h1 class="logo-text">ALT<span class="logo-accent">RIX</span></h1>
        <p style="color: #94a3b8; font-size: 12px; margin: 6px 0 0 0; text-transform: uppercase; letter-spacing: 1px;">Enterprise Identity & Cloud Core</p>
      </td>
    </tr>
    <tr>
      <td class="content">
        <span class="badge">Official Staff Invitation</span>
        <h2 class="title">Welcome, {{name}}!</h2>
        <p>You have been formally invited to join the staff and academic team at <strong>{{tenant_name}}</strong> on the AltRix Enterprise Cloud platform.</p>
        
        <div class="card-info">
          <div class="card-row"><span class="card-label">Institute / Tenant:</span> <span class="card-val">{{tenant_name}}</span></div>
          <div class="card-row"><span class="card-label">Assigned Role:</span> <span class="card-val">{{role}}</span></div>
          <div class="card-row"><span class="card-label">Registered Email:</span> <span class="card-val">{{email}}</span></div>
          <div class="card-row"><span class="card-label">Link Valid For:</span> <span class="card-val">{{expires_in}}</span></div>
        </div>

        <p>To finalize your identity setup, verify your email, and securely create your personal password, click the button below:</p>
        
        <div class="btn-wrap">
          <a href="{{activation_link}}" class="btn" target="_blank">Activate Your Account &rarr;</a>
        </div>

        <div class="notice">
          <strong>Security Notice:</strong> For your security, this invitation token is single-use and will automatically expire in {{expires_in}}. Please do not forward this email to anyone.
        </div>
      </td>
    </tr>
    <tr>
      <td class="footer">
        <p style="margin: 0 0 6px 0;">&copy; {{year}} AltRix Cloud OS. All rights reserved.</p>
        <p style="margin: 0;">Secured with AltRix VPS Mail Engine &bull; Support: <a href="mailto:{{support_email}}" style="color: #3b82f6; text-decoration: none;">{{support_email}}</a></p>
      </td>
    </tr>
  </table>
</div>
</body>
</html>',
    'Welcome {{name}},\n\nYou have been invited to join {{tenant_name}} as {{role}} on AltRix Cloud.\n\nPlease activate your account and create your password using the secure link below:\n{{activation_link}}\n\nThis link is valid for {{expires_in}}.\n\nSupport: {{support_email}}',
    'Activate Your Account',
    '{{activation_link}}',
    '["name", "email", "role", "tenant_name", "activation_link", "expires_in", "support_email", "year"]'::jsonb,
    TRUE
),
(
    'password_reset',
    'Account Password Reset',
    'Security',
    'AltRix Security: Password Reset Request',
    'security',
    '<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AltRix Password Reset</title>
<style>
  body { margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #334155; }
  table { border-spacing: 0; }
  .wrapper { width: 100%; table-layout: fixed; background-color: #0f172a; padding: 40px 10px; }
  .main { background-color: #ffffff; max-width: 600px; margin: 0 auto; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35); }
  .header { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 36px 32px; text-align: center; border-bottom: 3px solid #ef4444; }
  .logo-text { font-size: 28px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff; margin: 0; }
  .logo-accent { color: #ef4444; }
  .content { padding: 36px 32px 28px 32px; font-size: 15px; line-height: 1.6; color: #334155; }
  .badge { display: inline-block; background: #fef2f2; color: #dc2626; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
  .title { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0 0 16px 0; line-height: 1.3; }
  .btn-wrap { text-align: center; margin: 32px 0 24px 0; }
  .btn { display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: #ffffff !important; font-size: 16px; font-weight: 700; text-decoration: none; padding: 14px 36px; border-radius: 10px; box-shadow: 0 10px 15px -3px rgba(239, 68, 68, 0.4); }
  .notice { font-size: 13px; color: #64748b; background: #f8fafc; padding: 14px 18px; border-radius: 8px; border: 1px solid #e2e8f0; margin-top: 24px; }
  .footer { background-color: #f8fafc; padding: 24px 32px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
</style>
</head>
<body>
<div class="wrapper">
  <table class="main" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td class="header">
        <h1 class="logo-text">ALT<span class="logo-accent">RIX</span></h1>
        <p style="color: #94a3b8; font-size: 12px; margin: 6px 0 0 0; text-transform: uppercase; letter-spacing: 1px;">Security & Identity Verification</p>
      </td>
    </tr>
    <tr>
      <td class="content">
        <span class="badge">Security Alert</span>
        <h2 class="title">Password Reset Request</h2>
        <p>Hello,</p>
        <p>We received a request to reset the password associated with your AltRix account (<strong>{{email}}</strong>).</p>
        <p>Click the secure link below to set a new password:</p>
        
        <div class="btn-wrap">
          <a href="{{reset_link}}" class="btn" target="_blank">Reset Your Password &rarr;</a>
        </div>

        <div class="notice">
          <strong>Did not request this?</strong> If you did not make this request, you can safely ignore this email. Your password will remain unchanged and your account is secure.
        </div>
      </td>
    </tr>
    <tr>
      <td class="footer">
        <p style="margin: 0 0 6px 0;">&copy; {{year}} AltRix Cloud OS. All rights reserved.</p>
        <p style="margin: 0;">Secured with AltRix VPS Mail Engine &bull; Support: <a href="mailto:{{support_email}}" style="color: #ef4444; text-decoration: none;">{{support_email}}</a></p>
      </td>
    </tr>
  </table>
</div>
</body>
</html>',
    'Hello,\n\nWe received a request to reset your AltRix account password ({{email}}).\n\nReset your password here:\n{{reset_link}}\n\nThis link is valid for 1 hour.\n\nIf you did not make this request, please ignore this email.\n\nSupport: {{support_email}}',
    'Reset Password',
    '{{reset_link}}',
    '["email", "reset_link", "expires_in", "support_email", "year"]'::jsonb,
    TRUE
),
(
    'password_changed',
    'Password Changed Confirmation',
    'Security',
    'AltRix Security: Your Password Was Changed',
    'security',
    '<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Password Changed</title>
<style>
  body { margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #334155; }
  table { border-spacing: 0; }
  .wrapper { width: 100%; table-layout: fixed; background-color: #0f172a; padding: 40px 10px; }
  .main { background-color: #ffffff; max-width: 600px; margin: 0 auto; border-radius: 16px; overflow: hidden; }
  .header { background: #1e293b; padding: 32px; text-align: center; border-bottom: 3px solid #10b981; }
  .logo-text { font-size: 28px; font-weight: 900; color: #ffffff; margin: 0; }
  .logo-accent { color: #10b981; }
  .content { padding: 36px 32px; font-size: 15px; line-height: 1.6; color: #334155; }
  .footer { background-color: #f8fafc; padding: 24px 32px; text-align: center; font-size: 12px; color: #94a3b8; }
</style>
</head>
<body>
<div class="wrapper">
  <table class="main" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td class="header"><h1 class="logo-text">ALT<span class="logo-accent">RIX</span></h1></td>
    </tr>
    <tr>
      <td class="content">
        <h2 style="color: #0f172a; margin-top: 0;">Password Successfully Updated</h2>
        <p>Hello,</p>
        <p>This is a confirmation that the password for your AltRix account (<strong>{{email}}</strong>) was successfully changed.</p>
        <p>If you made this change, no further action is required.</p>
        <p style="color: #dc2626; font-weight: 600;">If you did not make this change, please contact security immediately at <a href="mailto:{{support_email}}">{{support_email}}</a>.</p>
      </td>
    </tr>
    <tr>
      <td class="footer">&copy; {{year}} AltRix Cloud OS. All rights reserved.</td>
    </tr>
  </table>
</div>
</body>
</html>',
    'Hello,\n\nThe password for your AltRix account ({{email}}) was successfully changed.\n\nIf you did not perform this change, contact {{support_email}} immediately.',
    NULL,
    NULL,
    '["email", "support_email", "year"]'::jsonb,
    TRUE
),
(
    'general_notification',
    'General System Notification',
    'Notifications',
    'AltRix Notification: {{subject_text}}',
    'notifications',
    '<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Notification</title>
<style>
  body { margin: 0; padding: 0; background-color: #0f172a; font-family: sans-serif; color: #334155; }
  .wrapper { width: 100%; background-color: #0f172a; padding: 40px 10px; }
  .main { background-color: #ffffff; max-width: 600px; margin: 0 auto; border-radius: 16px; overflow: hidden; }
  .header { background: #1e293b; padding: 32px; text-align: center; border-bottom: 3px solid #3b82f6; }
  .content { padding: 36px 32px; font-size: 15px; line-height: 1.6; }
  .footer { background-color: #f8fafc; padding: 24px 32px; text-align: center; font-size: 12px; color: #94a3b8; }
</style>
</head>
<body>
<div class="wrapper">
  <table class="main" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td class="header"><h1 style="color:#ffffff; margin:0;">ALT<span style="color:#3b82f6;">RIX</span></h1></td>
    </tr>
    <tr>
      <td class="content">
        <h2 style="color: #0f172a; margin-top: 0;">{{title}}</h2>
        <p>{{message}}</p>
      </td>
    </tr>
    <tr>
      <td class="footer">&copy; {{year}} AltRix Cloud OS.</td>
    </tr>
  </table>
</div>
</body>
</html>',
    '{{title}}\n\n{{message}}\n\nAltRix Cloud OS',
    NULL,
    NULL,
    '["title", "message", "subject_text", "year"]'::jsonb,
    TRUE
)
ON CONFLICT (key) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    subject = EXCLUDED.subject,
    sender_identity_key = EXCLUDED.sender_identity_key,
    html_content = EXCLUDED.html_content,
    text_content = EXCLUDED.text_content,
    cta_text = EXCLUDED.cta_text,
    cta_url_variable = EXCLUDED.cta_url_variable,
    available_variables = EXCLUDED.available_variables,
    updated_at = NOW();

-- =========================================================================
-- Seed Event Mappings
-- =========================================================================
INSERT INTO public.email_event_mappings (event_name, sender_identity_key, template_key, description)
VALUES
    ('staff_invitation', 'security', 'staff_invitation', 'Dispatched when an administrator invites a new staff member'),
    ('password_reset', 'security', 'password_reset', 'Dispatched when a user requests a password reset'),
    ('password_changed', 'security', 'password_changed', 'Security confirmation after password successfully changed'),
    ('general_notification', 'notifications', 'general_notification', 'System announcements and transactional updates')
ON CONFLICT (event_name) DO UPDATE SET
    sender_identity_key = EXCLUDED.sender_identity_key,
    template_key = EXCLUDED.template_key,
    description = EXCLUDED.description,
    updated_at = NOW();
