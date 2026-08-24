"""
Comprehensive Seed Definitions for AltRix Enterprise Email Templates.
Includes responsive, branded HTML templates across all 6 core categories:
1. Authentication (9 templates)
2. Staff & HR (4 templates)
3. Finance & Billing (8 templates)
4. Academic & Students (5 templates)
5. Communication & Notifications (4 templates)
6. System & Infrastructure (3 templates)
"""
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("app.services.email_seeds")


def _wrap_body(badge_text: str, badge_color: str, title: str, content: str, cta_text: str = None, cta_url: str = None, notice: str = None) -> str:
    cta_html = ""
    if cta_text and cta_url:
        cta_html = f"""
        <div style="text-align: center; margin: 32px 0 24px 0;">
          <a href="{cta_url}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff !important; font-size: 15px; font-weight: 700; text-decoration: none; padding: 13px 34px; border-radius: 10px; box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.35); letter-spacing: 0.2px;">
            {cta_text} &rarr;
          </a>
        </div>
        """
    notice_html = ""
    if notice:
        notice_html = f"""
        <div style="font-size: 12px; color: #64748b; background: #f8fafc; padding: 12px 16px; border-radius: 8px; border-left: 3px solid #64748b; margin-top: 24px; line-height: 1.5;">
          <strong>Security Notice:</strong> {notice}
        </div>
        """

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>
  body {{ margin: 0; padding: 0; background-color: #0b1120; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #334155; -webkit-font-smoothing: antialiased; }}
  table {{ border-spacing: 0; border-collapse: collapse; }}
  td {{ padding: 0; }}
  img {{ border: 0; outline: none; text-decoration: none; display: block; }}
  .wrapper {{ width: 100%; table-layout: fixed; background-color: #0b1120; padding: 40px 12px; }}
  .main-card {{ background-color: #ffffff; max-width: 600px; margin: 0 auto; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.45); border: 1px solid #1e293b; }}
  .header {{ background: linear-gradient(145deg, #0f172a 0%, #1e293b 100%); padding: 32px 32px 28px 32px; text-align: center; border-bottom: 3px solid #2563eb; }}
  .content {{ padding: 36px 32px 30px 32px; font-size: 15px; line-height: 1.65; color: #334155; }}
  .badge {{ display: inline-block; background: {badge_color}; font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 14px; color: #0f172a; }}
  .title {{ font-size: 22px; font-weight: 800; color: #0f172a; margin: 0 0 14px 0; line-height: 1.3; }}
  .info-box {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 20px 0; font-size: 14px; }}
  .footer {{ background-color: #f8fafc; padding: 26px 32px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; line-height: 1.6; }}
</style>
</head>
<body>
<div class="wrapper">
  <table class="main-card" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td class="header">
        <div style="text-align: center; margin: 0 auto;">
          <img src="{{{{brand.logo}}}}" alt="{{{{brand.name}}}}" style="height: 36px; width: auto; max-width: 190px; margin: 0 auto; display: block;" />
        </div>
        <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.12); color: #cbd5e1; font-size: 13px; font-weight: 600;">
          {{{{tenant.name}}}}
        </div>
      </td>
    </tr>
    <tr>
      <td class="content">
        <span class="badge">{badge_text}</span>
        <h2 class="title">{title}</h2>
        {content}
        {cta_html}
        {notice_html}
      </td>
    </tr>
    <tr>
      <td class="footer">
        <div style="display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 8px;">
          <img src="{{{{brand.icon}}}}" alt="Icon" style="height: 16px; width: 16px; display: inline-block; vertical-align: middle;" />
          <strong style="color: #64748b; font-size: 12px;">{{{{brand.name}}}} Cloud OS</strong>
        </div>
        <p style="margin: 0 0 6px 0;">&copy; {{{{year}}}} {{{{brand.name}}}} Operating System &bull; Enterprise Cloud Platform</p>
        <p style="margin: 0;">Support: <a href="mailto:{{{{support_email}}}}" style="color: #3b82f6; text-decoration: none;">{{{{support_email}}}}</a></p>
      </td>
    </tr>
  </table>
</div>
</body>
</html>"""


ALL_TEMPLATES = [
    # ── AUTHENTICATION ────────────────────────────────────────────────────────
    {
        "key": "staff_invitation",
        "name": "Staff Workspace Invitation",
        "category": "Authentication",
        "subject": "Invitation to Join {{tenant.name}} on AltRix Cloud OS",
        "sender_identity_key": "security",
        "cta_text": "Activate My Account",
        "cta_url_variable": "activation_link",
        "available_variables": ["name", "email", "role", "tenant.name", "activation_link", "expires_in"],
        "html_content": _wrap_body(
            badge_text="Identity & Access Invitation",
            badge_color="#eff6ff",
            title="Welcome to {{tenant.name}}",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p>You have been formally invited to join the official digital workspace of <strong>{{tenant.name}}</strong> powered by <strong>AltRix Cloud OS</strong>.</p>
            <div class="info-box">
              <p style="margin: 4px 0;"><strong>Official Account:</strong> {{email}}</p>
              <p style="margin: 4px 0;"><strong>Assigned Role:</strong> <span style="background: #2563eb; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 700; text-transform: uppercase;">{{role}}</span></p>
              <p style="margin: 4px 0;"><strong>Institution:</strong> {{tenant.name}}</p>
              <p style="margin: 4px 0;"><strong>Invitation Window:</strong> Valid for {{expires_in}}</p>
            </div>
            <p>Click the secure button below to set your confidential account password and access your enterprise tools.</p>
            """,
            cta_text="Activate My Account",
            cta_url="{{activation_link}}",
            notice="This activation link is cryptographically signed and single-use. If you did not expect this invitation, please contact security immediately."
        ),
        "text_content": "Hello {{name}}, you have been invited to {{tenant.name}} as {{role}}. Activate your account here: {{activation_link}} (Valid for {{expires_in}})."
    },
    {
        "key": "account_activation",
        "name": "Account Activation Confirmation",
        "category": "Authentication",
        "subject": "Your AltRix Account Has Been Activated — {{tenant.name}}",
        "sender_identity_key": "security",
        "cta_text": "Sign In to Workspace",
        "cta_url_variable": "login_link",
        "available_variables": ["name", "email", "tenant.name", "role", "login_link"],
        "html_content": _wrap_body(
            badge_text="Account Verified",
            badge_color="#ecfdf5",
            title="Account Successfully Activated",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p>Your official account for <strong>{{tenant.name}}</strong> has been verified and fully activated.</p>
            <div class="info-box">
              <p style="margin: 4px 0;"><strong>Account:</strong> {{email}}</p>
              <p style="margin: 4px 0;"><strong>Active Role:</strong> {{role}}</p>
              <p style="margin: 4px 0;"><strong>Status:</strong> Active &amp; Operational</p>
            </div>
            <p>You can now sign in at any time to collaborate, manage workflows, and access institutional resources.</p>
            """,
            cta_text="Sign In to Workspace",
            cta_url="{{login_link}}",
            notice="Keep your credentials confidential. AltRix administrators will never ask for your password."
        ),
        "text_content": "Hello {{name}}, your account for {{tenant.name}} is now active. Sign in here: {{login_link}}"
    },
    {
        "key": "password_reset",
        "name": "Password Reset Request",
        "category": "Authentication",
        "subject": "Reset Your {{brand.name}} Password",
        "sender_identity_key": "security",
        "cta_text": "Reset My Password",
        "cta_url_variable": "reset_link",
        "available_variables": ["name", "email", "reset_link", "expires_in"],
        "html_content": _wrap_body(
            badge_text="Security Verification",
            badge_color="#fef2f2",
            title="Password Reset Request",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p>We received a request to reset the password for your account (<strong>{{email}}</strong>).</p>
            <p>Click the button below to choose a strong, new password. This security link expires in <strong>{{expires_in}}</strong>.</p>
            """,
            cta_text="Reset My Password",
            cta_url="{{reset_link}}",
            notice="If you did not request this password reset, please ignore this email or contact support if you suspect unauthorized activity."
        ),
        "text_content": "Hello {{name}}, reset your password using this link: {{reset_link}} (Expires in {{expires_in}})."
    },
    {
        "key": "password_changed",
        "name": "Password Changed Notification",
        "category": "Authentication",
        "subject": "Security Alert: Your {{brand.name}} Password Was Changed",
        "sender_identity_key": "security",
        "available_variables": ["name", "email", "timestamp", "ip_address"],
        "html_content": _wrap_body(
            badge_text="Security Notice",
            badge_color="#fffbeb",
            title="Password Successfully Updated",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p>This is confirmation that the password for your account (<strong>{{email}}</strong>) was successfully changed.</p>
            <div class="info-box">
              <p style="margin: 4px 0;"><strong>Timestamp:</strong> {{timestamp}}</p>
              <p style="margin: 4px 0;"><strong>IP Address:</strong> {{ip_address}}</p>
            </div>
            """,
            notice="If you did not make this change, please lock your account immediately and contact our security desk at support@altrixcore.com."
        ),
        "text_content": "Hello {{name}}, your password was changed on {{timestamp}} from IP {{ip_address}}."
    },
    {
        "key": "email_verification",
        "name": "Email Address Verification",
        "category": "Authentication",
        "subject": "Verify Your Email Address — {{brand.name}}",
        "sender_identity_key": "no_reply",
        "cta_text": "Verify Email Address",
        "cta_url_variable": "verification_link",
        "available_variables": ["name", "email", "verification_link"],
        "html_content": _wrap_body(
            badge_text="Verification Required",
            badge_color="#eff6ff",
            title="Verify Your Official Email",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p>Please confirm that <strong>{{email}}</strong> belongs to you by clicking the verification button below.</p>
            """,
            cta_text="Verify Email Address",
            cta_url="{{verification_link}}",
            notice="This step ensures secure communications and prevents unauthorized identity spoofing."
        ),
        "text_content": "Hello {{name}}, please verify your email address: {{verification_link}}"
    },
    {
        "key": "welcome_user",
        "name": "Welcome to AltRix",
        "category": "Authentication",
        "subject": "Welcome to {{brand.name}} Cloud OS",
        "sender_identity_key": "info",
        "cta_text": "Explore AltRix Portal",
        "cta_url_variable": "portal_link",
        "available_variables": ["name", "portal_link"],
        "html_content": _wrap_body(
            badge_text="Platform Welcome",
            badge_color="#eff6ff",
            title="Welcome to AltRix Cloud OS",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p>We are delighted to welcome you to <strong>AltRix Cloud OS</strong>, the unified institutional intelligence and operating platform.</p>
            <p>Get started by exploring your personalized workspace, real-time collaboration channels, and automated administrative workflows.</p>
            """,
            cta_text="Explore AltRix Portal",
            cta_url="{{portal_link}}"
        ),
        "text_content": "Hello {{name}}, welcome to AltRix Cloud OS. Visit: {{portal_link}}"
    },
    {
        "key": "security_alert",
        "name": "Critical Security Alert",
        "category": "Authentication",
        "subject": "CRITICAL: Security Alert for Your {{brand.name}} Account",
        "sender_identity_key": "security",
        "cta_text": "Review Account Activity",
        "cta_url_variable": "security_link",
        "available_variables": ["name", "email", "event_description", "ip_address", "timestamp", "security_link"],
        "html_content": _wrap_body(
            badge_text="Security Alert",
            badge_color="#fef2f2",
            title="Suspicious Activity Detected",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p style="color: #dc2626; font-weight: 600;">We detected unusual activity on your AltRix account (<strong>{{email}}</strong>).</p>
            <div class="info-box" style="border-left: 4px solid #ef4444;">
              <p style="margin: 4px 0;"><strong>Event:</strong> {{event_description}}</p>
              <p style="margin: 4px 0;"><strong>IP Address:</strong> {{ip_address}}</p>
              <p style="margin: 4px 0;"><strong>Time:</strong> {{timestamp}}</p>
            </div>
            <p>If this was not you, please review your active sessions immediately and secure your account.</p>
            """,
            cta_text="Review Account Activity",
            cta_url="{{security_link}}",
            notice="Our automated intrusion defense system has flagged this event for your protection."
        ),
        "text_content": "CRITICAL SECURITY ALERT: Suspicious activity on {{email}} ({{event_description}} from {{ip_address}}). Review: {{security_link}}"
    },
    {
        "key": "account_suspended",
        "name": "Account Suspended Notice",
        "category": "Authentication",
        "subject": "Account Notice: Access Temporarily Suspended",
        "sender_identity_key": "security",
        "available_variables": ["name", "email", "reason", "support_email"],
        "html_content": _wrap_body(
            badge_text="Account Suspended",
            badge_color="#fef2f2",
            title="Account Access Suspended",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p>Access to your account (<strong>{{email}}</strong>) has been temporarily suspended by system administration.</p>
            <div class="info-box">
              <p style="margin: 4px 0;"><strong>Reason:</strong> {{reason}}</p>
            </div>
            <p>To appeal or request clarification, please contact our support desk at <a href="mailto:{{support_email}}">{{support_email}}</a>.</p>
            """
        ),
        "text_content": "Hello {{name}}, your account {{email}} has been suspended. Reason: {{reason}}."
    },
    {
        "key": "account_reactivated",
        "name": "Account Reactivated Notice",
        "category": "Authentication",
        "subject": "Account Notice: Access Restored",
        "sender_identity_key": "security",
        "cta_text": "Log In to Workspace",
        "cta_url_variable": "login_link",
        "available_variables": ["name", "email", "login_link"],
        "html_content": _wrap_body(
            badge_text="Access Restored",
            badge_color="#ecfdf5",
            title="Account Reactivated",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p>Access to your account (<strong>{{email}}</strong>) has been fully restored.</p>
            <p>You may now sign in using your existing credentials.</p>
            """,
            cta_text="Log In to Workspace",
            cta_url="{{login_link}}"
        ),
        "text_content": "Hello {{name}}, your account {{email}} has been reactivated. Log in here: {{login_link}}"
    },

    # ── STAFF & HR ────────────────────────────────────────────────────────────
    {
        "key": "staff_added",
        "name": "Staff Member Onboarding",
        "category": "Staff/HR",
        "subject": "Welcome to the Staff Team at {{tenant.name}}",
        "sender_identity_key": "info",
        "available_variables": ["name", "role", "department", "tenant.name"],
        "html_content": _wrap_body(
            badge_text="HR Onboarding",
            badge_color="#eff6ff",
            title="Welcome to {{tenant.name}}",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p>You have been officially registered as a staff member at <strong>{{tenant.name}}</strong>.</p>
            <div class="info-box">
              <p style="margin: 4px 0;"><strong>Designation:</strong> {{role}}</p>
              <p style="margin: 4px 0;"><strong>Department:</strong> {{department}}</p>
              <p style="margin: 4px 0;"><strong>Institution:</strong> {{tenant.name}}</p>
            </div>
            """
        ),
        "text_content": "Hello {{name}}, welcome to the staff team at {{tenant.name}} as {{role}}."
    },
    {
        "key": "staff_role_changed",
        "name": "Staff Role Updated",
        "category": "Staff/HR",
        "subject": "Staff Role Updated — {{tenant.name}}",
        "sender_identity_key": "security",
        "available_variables": ["name", "old_role", "new_role", "tenant.name"],
        "html_content": _wrap_body(
            badge_text="Role Assignment",
            badge_color="#eff6ff",
            title="Institutional Role Updated",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p>Your institutional permissions and role assignments at <strong>{{tenant.name}}</strong> have been updated.</p>
            <div class="info-box">
              <p style="margin: 4px 0;"><strong>Previous Role:</strong> {{old_role}}</p>
              <p style="margin: 4px 0;"><strong>New Role:</strong> <span style="background: #2563eb; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">{{new_role}}</span></p>
            </div>
            """
        ),
        "text_content": "Hello {{name}}, your role at {{tenant.name}} was updated to {{new_role}}."
    },

    # ── FINANCE ───────────────────────────────────────────────────────────────
    {
        "key": "payment_confirmation",
        "name": "Payment Confirmation",
        "category": "Finance",
        "subject": "Payment Received — {{tenant.name}}",
        "sender_identity_key": "billing",
        "available_variables": ["name", "amount", "invoice_number", "transaction_ref", "payment_date", "tenant.name"],
        "html_content": _wrap_body(
            badge_text="Payment Confirmed",
            badge_color="#ecfdf5",
            title="Payment Successfully Processed",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p>Thank you. We have successfully received and processed your payment for <strong>{{tenant.name}}</strong>.</p>
            <div class="info-box" style="border-left: 4px solid #10b981;">
              <p style="margin: 4px 0;"><strong>Amount Paid:</strong> <span style="font-size: 18px; font-weight: 800; color: #047857;">{{amount}}</span></p>
              <p style="margin: 4px 0;"><strong>Invoice / Voucher:</strong> {{invoice_number}}</p>
              <p style="margin: 4px 0;"><strong>Transaction Reference:</strong> {{transaction_ref}}</p>
              <p style="margin: 4px 0;"><strong>Date:</strong> {{payment_date}}</p>
            </div>
            """
        ),
        "text_content": "Payment of {{amount}} confirmed for invoice {{invoice_number}} (Ref: {{transaction_ref}})."
    },
    {
        "key": "fee_invoice",
        "name": "Fee Invoice Notification",
        "category": "Finance",
        "subject": "Fee Invoice #{{invoice_number}} — {{tenant.name}}",
        "sender_identity_key": "billing",
        "cta_text": "View & Pay Invoice",
        "cta_url_variable": "invoice_link",
        "available_variables": ["name", "invoice_number", "amount", "due_date", "invoice_link", "tenant.name"],
        "html_content": _wrap_body(
            badge_text="Fee Invoice",
            badge_color="#eff6ff",
            title="New Fee Voucher Issued",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p>A new fee voucher has been issued for your student account at <strong>{{tenant.name}}</strong>.</p>
            <div class="info-box">
              <p style="margin: 4px 0;"><strong>Voucher Number:</strong> {{invoice_number}}</p>
              <p style="margin: 4px 0;"><strong>Total Payable:</strong> <span style="font-weight: 800; color: #1e293b;">{{amount}}</span></p>
              <p style="margin: 4px 0;"><strong>Due Date:</strong> <span style="color: #dc2626; font-weight: 700;">{{due_date}}</span></p>
            </div>
            <p>You can review the itemized breakdown and complete payment through our online payment portal.</p>
            """,
            cta_text="View & Pay Invoice",
            cta_url="{{invoice_link}}"
        ),
        "text_content": "New invoice #{{invoice_number}} issued for {{amount}} (Due: {{due_date}}). View here: {{invoice_link}}"
    },
    {
        "key": "fee_reminder",
        "name": "Upcoming Fee Reminder",
        "category": "Finance",
        "subject": "Upcoming Fee Reminder — {{tenant.name}}",
        "sender_identity_key": "billing",
        "cta_text": "Pay Voucher Now",
        "cta_url_variable": "invoice_link",
        "available_variables": ["name", "invoice_number", "amount", "due_date", "invoice_link", "tenant.name"],
        "html_content": _wrap_body(
            badge_text="Payment Reminder",
            badge_color="#fffbeb",
            title="Upcoming Fee Deadline",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p>This is a gentle reminder that fee voucher <strong>#{{invoice_number}}</strong> for <strong>{{amount}}</strong> is due on <strong>{{due_date}}</strong>.</p>
            <p>To avoid late payment surcharges, please submit payment before the deadline.</p>
            """,
            cta_text="Pay Voucher Now",
            cta_url="{{invoice_link}}"
        ),
        "text_content": "Reminder: Fee voucher #{{invoice_number}} for {{amount}} is due on {{due_date}}."
    },
    {
        "key": "payment_overdue",
        "name": "Overdue Fee Notice",
        "category": "Finance",
        "subject": "URGENT: Overdue Payment Notice — {{tenant.name}}",
        "sender_identity_key": "billing",
        "cta_text": "Settle Overdue Balance",
        "cta_url_variable": "invoice_link",
        "available_variables": ["name", "invoice_number", "amount", "due_date", "invoice_link", "tenant.name"],
        "html_content": _wrap_body(
            badge_text="Urgent Notice",
            badge_color="#fef2f2",
            title="Overdue Payment Notice",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p style="color: #dc2626; font-weight: 600;">The payment for voucher #{{invoice_number}} is now past its due date ({{due_date}}).</p>
            <div class="info-box" style="border-left: 4px solid #ef4444;">
              <p style="margin: 4px 0;"><strong>Overdue Amount:</strong> <span style="font-size: 16px; font-weight: 800; color: #b91c1c;">{{amount}}</span></p>
              <p style="margin: 4px 0;"><strong>Voucher:</strong> {{invoice_number}}</p>
            </div>
            <p>Please clear the outstanding balance immediately to prevent interruption of academic portal access.</p>
            """,
            cta_text="Settle Overdue Balance",
            cta_url="{{invoice_link}}"
        ),
        "text_content": "URGENT: Overdue fee payment for voucher #{{invoice_number}} ({{amount}}). Settle now: {{invoice_link}}"
    },

    # ── ACADEMIC ──────────────────────────────────────────────────────────────
    {
        "key": "exam_notification",
        "name": "Exam Datesheet & Schedule",
        "category": "Academic",
        "subject": "Exam Schedule Released — {{tenant.name}}",
        "sender_identity_key": "notifications",
        "cta_text": "View Exam Schedule",
        "cta_url_variable": "exam_link",
        "available_variables": ["name", "exam_title", "class_name", "start_date", "exam_link", "tenant.name"],
        "html_content": _wrap_body(
            badge_text="Academic Schedule",
            badge_color="#eff6ff",
            title="Examination Schedule Announced",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p>The datesheet for <strong>{{exam_title}}</strong> ({{class_name}}) at <strong>{{tenant.name}}</strong> has been officially published.</p>
            <div class="info-box">
              <p style="margin: 4px 0;"><strong>Examination:</strong> {{exam_title}}</p>
              <p style="margin: 4px 0;"><strong>Class / Group:</strong> {{class_name}}</p>
              <p style="margin: 4px 0;"><strong>Start Date:</strong> {{start_date}}</p>
            </div>
            <p>Students are advised to review the subject breakdown and examination hall guidelines.</p>
            """,
            cta_text="View Exam Schedule",
            cta_url="{{exam_link}}"
        ),
        "text_content": "Exam schedule for {{exam_title}} ({{class_name}}) published. Starts {{start_date}}. View: {{exam_link}}"
    },
    {
        "key": "result_published",
        "name": "Academic Results Published",
        "category": "Academic",
        "subject": "Term Examination Results Published — {{tenant.name}}",
        "sender_identity_key": "notifications",
        "cta_text": "View Report Card",
        "cta_url_variable": "result_link",
        "available_variables": ["name", "student_name", "exam_title", "class_name", "result_link", "tenant.name"],
        "html_content": _wrap_body(
            badge_text="Results Published",
            badge_color="#ecfdf5",
            title="Academic Results Announced",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p>The academic evaluation results for <strong>{{student_name}}</strong> in <strong>{{exam_title}}</strong> ({{class_name}}) are now available online.</p>
            <p>You can view the detailed subject-wise marks, grades, attendance record, and principal remarks by clicking below.</p>
            """,
            cta_text="View Report Card",
            cta_url="{{result_link}}"
        ),
        "text_content": "Results for {{student_name}} in {{exam_title}} are published. View report: {{result_link}}"
    },
    {
        "key": "attendance_notification",
        "name": "Student Attendance Alert",
        "category": "Academic",
        "subject": "Daily Attendance Notice — {{tenant.name}}",
        "sender_identity_key": "notifications",
        "available_variables": ["parent_name", "student_name", "status", "date", "tenant.name"],
        "html_content": _wrap_body(
            badge_text="Attendance Notice",
            badge_color="#fffbeb",
            title="Daily Attendance Report",
            content="""
            <p>Dear <strong>{{parent_name}}</strong>,</p>
            <p>This is to inform you that your child <strong>{{student_name}}</strong> was marked <span style="font-weight: 700; color: #dc2626;">{{status}}</span> today ({{date}}) at <strong>{{tenant.name}}</strong>.</p>
            <p>If you have any questions or this was an excused absence, please contact the campus coordinator.</p>
            """
        ),
        "text_content": "Dear {{parent_name}}, {{student_name}} was marked {{status}} on {{date}} at {{tenant.name}}."
    },

    # ── COMMUNICATION ─────────────────────────────────────────────────────────
    {
        "key": "school_announcement",
        "name": "Campus Announcement / Circular",
        "category": "Communication",
        "subject": "Official Campus Announcement — {{tenant.name}}",
        "sender_identity_key": "info",
        "available_variables": ["name", "title", "message", "sender_name", "date", "tenant.name"],
        "html_content": _wrap_body(
            badge_text="Official Circular",
            badge_color="#eff6ff",
            title="{{title}}",
            content="""
            <p>Dear <strong>{{name}}</strong>,</p>
            <div class="info-box">
              <p style="margin: 0; font-size: 15px; line-height: 1.6;">{{message}}</p>
            </div>
            <p style="font-size: 13px; color: #64748b; margin-top: 16px;"><strong>Issued By:</strong> {{sender_name}} &bull; {{date}}</p>
            """
        ),
        "text_content": "Official Announcement from {{tenant.name}}: {{title}}\n\n{{message}}"
    },
    {
        "key": "message_notification",
        "name": "Direct Message Notification",
        "category": "Communication",
        "subject": "New Message from {{sender_name}}",
        "sender_identity_key": "notifications",
        "cta_text": "Reply on Portal",
        "cta_url_variable": "message_link",
        "available_variables": ["name", "sender_name", "message_preview", "message_link", "tenant.name"],
        "html_content": _wrap_body(
            badge_text="Collaboration Message",
            badge_color="#eff6ff",
            title="You Have a New Message",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p><strong>{{sender_name}}</strong> sent you a message on the <strong>{{tenant.name}}</strong> collaboration network:</p>
            <div class="info-box" style="font-style: italic;">
              "{{message_preview}}"
            </div>
            """,
            cta_text="Reply on Portal",
            cta_url="{{message_link}}"
        ),
        "text_content": "New message from {{sender_name}}: \"{{message_preview}}\". Reply here: {{message_link}}"
    },
    {
        "key": "support_notification",
        "name": "Support Ticket Update",
        "category": "Communication",
        "subject": "Support Ticket #{{ticket_id}} Update — {{brand.name}}",
        "sender_identity_key": "support",
        "cta_text": "View Support Ticket",
        "cta_url_variable": "ticket_link",
        "available_variables": ["name", "ticket_id", "subject_text", "status", "update_text", "ticket_link"],
        "html_content": _wrap_body(
            badge_text="Helpdesk Update",
            badge_color="#eff6ff",
            title="Ticket #{{ticket_id}} Update",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p>Your support inquiry regarding <strong>{{subject_text}}</strong> has been updated.</p>
            <div class="info-box">
              <p style="margin: 4px 0;"><strong>Status:</strong> <span style="font-weight: 700; text-transform: uppercase;">{{status}}</span></p>
              <p style="margin: 4px 0;"><strong>Latest Resolution:</strong> {{update_text}}</p>
            </div>
            """,
            cta_text="View Support Ticket",
            cta_url="{{ticket_link}}"
        ),
        "text_content": "Support ticket #{{ticket_id}} ({{subject_text}}) status updated to {{status}}."
    },

    # ── SYSTEM ────────────────────────────────────────────────────────────────
    {
        "key": "maintenance_notification",
        "name": "Planned Maintenance Notice",
        "category": "System",
        "subject": "Scheduled Platform Maintenance Notice — {{brand.name}}",
        "sender_identity_key": "system",
        "available_variables": ["name", "window_start", "window_end", "expected_downtime", "brand.name"],
        "html_content": _wrap_body(
            badge_text="System Advisory",
            badge_color="#fffbeb",
            title="Scheduled Infrastructure Maintenance",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p>Our engineering team will be performing scheduled security and performance enhancements on the <strong>{{brand.name}}</strong> infrastructure.</p>
            <div class="info-box">
              <p style="margin: 4px 0;"><strong>Maintenance Window:</strong> {{window_start}} &mdash; {{window_end}}</p>
              <p style="margin: 4px 0;"><strong>Expected Downtime:</strong> {{expected_downtime}}</p>
            </div>
            <p>During this window, services may be briefly intermittent. All tenant data and backups remain fully protected.</p>
            """
        ),
        "text_content": "Scheduled maintenance on {{brand.name}} infrastructure from {{window_start}} to {{window_end}}."
    },
    {
        "key": "platform_update",
        "name": "Platform Release Changelog",
        "category": "System",
        "subject": "{{brand.name}} Cloud OS — Version {{version_number}} Released",
        "sender_identity_key": "info",
        "cta_text": "Read Full Release Notes",
        "cta_url_variable": "changelog_link",
        "available_variables": ["name", "version_number", "release_highlights", "changelog_link", "brand.name"],
        "html_content": _wrap_body(
            badge_text="Feature Release",
            badge_color="#ecfdf5",
            title="Version {{version_number}} Now Live",
            content="""
            <p>Hello <strong>{{name}}</strong>,</p>
            <p>We are excited to announce the release of <strong>{{brand.name}} Cloud OS v{{version_number}}</strong>!</p>
            <div class="info-box">
              <p style="margin: 0 0 8px 0; font-weight: 700;">Release Highlights:</p>
              <p style="margin: 0; line-height: 1.6;">{{release_highlights}}</p>
            </div>
            """,
            cta_text="Read Full Release Notes",
            cta_url="{{changelog_link}}"
        ),
        "text_content": "AltRix Cloud OS v{{version_number}} is live! Highlights: {{release_highlights}}. Read more: {{changelog_link}}"
    },
]


async def seed_all_email_templates(db: AsyncSession) -> None:
    """Inserts or updates all standard system templates into public.email_templates and mappings."""
    import json
    import uuid

    for tmpl in ALL_TEMPLATES:
        clean_key = tmpl["key"]
        try:
            await db.execute(
                text("""
                    INSERT INTO public.email_templates (
                        id, key, name, category, subject, sender_identity_key, html_content, text_content,
                        cta_text, cta_url_variable, available_variables, version, is_system, is_active, created_at, updated_at
                    ) VALUES (
                        :id, :key, :name, :category, :subject, :senderKey, :html, :text,
                        :ctaText, :ctaUrl, CAST(:vars AS jsonb), 1, TRUE, TRUE, NOW(), NOW()
                    )
                    ON CONFLICT (key) DO UPDATE SET
                        name = EXCLUDED.name,
                        category = EXCLUDED.category,
                        sender_identity_key = EXCLUDED.sender_identity_key,
                        available_variables = EXCLUDED.available_variables,
                        is_system = TRUE,
                        updated_at = NOW()
                """),
                {
                    "id": uuid.uuid4(),
                    "key": clean_key,
                    "name": tmpl["name"],
                    "category": tmpl["category"],
                    "subject": tmpl["subject"],
                    "senderKey": tmpl.get("sender_identity_key", "security"),
                    "html": tmpl["html_content"],
                    "text": tmpl.get("text_content", ""),
                    "ctaText": tmpl.get("cta_text"),
                    "ctaUrl": tmpl.get("cta_url_variable"),
                    "vars": json.dumps(tmpl.get("available_variables", [])),
                },
            )

            # Insert default event mapping if not exists
            await db.execute(
                text("""
                    INSERT INTO public.email_event_mappings (event_name, sender_identity_key, template_key, description, updated_at)
                    VALUES (:event, :sender, :tmpl, :desc, NOW())
                    ON CONFLICT (event_name) DO NOTHING
                """),
                {
                    "event": clean_key,
                    "sender": tmpl.get("sender_identity_key", "security"),
                    "tmpl": clean_key,
                    "desc": f"Automated mapping for {tmpl['name']}",
                },
            )
        except Exception as e:
            logger.warning(f"Error seeding template '{clean_key}': {e}")

    await db.commit()
    logger.info("All AltRix professional email templates seeded successfully.")
