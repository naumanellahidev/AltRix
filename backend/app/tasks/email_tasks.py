"""
Email background tasks for AltRix.
Handles async email delivery via SMTP.
"""
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional

from app.celery_app import celery_app

logger = logging.getLogger("altrix.tasks.email")


@celery_app.task(
    name="app.tasks.email_tasks.send_email",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    queue="emails",
)
def send_email(
    self,
    to_email: str,
    subject: str,
    body_html: str,
    body_text: Optional[str] = None,
    from_name: str = "AltRix School ERP",
    from_email: str = "noreply@altrix.edu",
):
    """
    Send a single email. Retries up to 3 times with 60s delay on failure.
    """
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{from_name} <{from_email}>"
        msg["To"] = to_email

        if body_text:
            msg.attach(MIMEText(body_text, "plain"))
        msg.attach(MIMEText(body_html, "html"))

        # In development, just log — configure SMTP_HOST in env for production
        import os
        smtp_host = os.getenv("SMTP_HOST", "")
        if not smtp_host:
            logger.info(f"[DEV] Email to {to_email}: {subject}")
            return {"status": "logged", "to": to_email, "subject": subject}

        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_user = os.getenv("SMTP_USER", "")
        smtp_pass = os.getenv("SMTP_PASS", "")

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.ehlo()
            server.starttls()
            if smtp_user:
                server.login(smtp_user, smtp_pass)
            server.sendmail(from_email, to_email, msg.as_string())

        logger.info(f"Email sent to {to_email}: {subject}")
        return {"status": "sent", "to": to_email}

    except Exception as exc:
        logger.error(f"Email failed to {to_email}: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.tasks.email_tasks.send_bulk_notification",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="emails",
)
def send_bulk_notification(
    self,
    user_emails: List[str],
    subject: str,
    body_html: str,
    school_name: str = "Your School",
):
    """
    Send a notification email to multiple recipients.
    Splits into individual send_email tasks for reliability.
    """
    try:
        for email in user_emails:
            send_email.apply_async(
                kwargs={
                    "to_email": email,
                    "subject": subject,
                    "body_html": body_html,
                    "from_name": school_name,
                },
                queue="emails",
            )
        logger.info(f"Bulk notification queued for {len(user_emails)} recipients: {subject}")
        return {"status": "queued", "count": len(user_emails)}
    except Exception as exc:
        logger.error(f"Bulk notification failed: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.tasks.email_tasks.send_fee_reminder",
    bind=True,
    max_retries=2,
    queue="emails",
)
def send_fee_reminder(
    self,
    student_name: str,
    parent_email: str,
    voucher_number: str,
    amount: float,
    due_date: str,
    school_name: str = "AltRix School",
):
    """Send a fee due reminder email to a parent."""
    body_html = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
      <h2 style="color: #1e40af;">{school_name}</h2>
      <h3>Fee Payment Reminder</h3>
      <p>Dear Parent/Guardian,</p>
      <p>This is a reminder that the fee for <strong>{student_name}</strong> is due.</p>
      <table style="border-collapse: collapse; width: 100%;">
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Voucher</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">{voucher_number}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Amount</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">PKR {amount:,.2f}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Due Date</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">{due_date}</td></tr>
      </table>
      <p>Please make the payment before the due date to avoid late fees.</p>
      <p>Thank you,<br><strong>{school_name} Finance Office</strong></p>
    </div>
    """
    return send_email.apply_async(
        kwargs={
            "to_email": parent_email,
            "subject": f"Fee Reminder: {voucher_number} — {school_name}",
            "body_html": body_html,
            "from_name": school_name,
        },
        queue="emails",
    )
