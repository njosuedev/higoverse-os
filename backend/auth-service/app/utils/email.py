import smtplib
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape

from app.core.config import settings

LOGO_URL = "https://higoverse.com/higoverse-logo.png"
BRAND    = "#0a66c2"
SUPPORT_EMAIL = "higoverse@gmail.com"
SUPPORT_PHONE = "+250 790 885 174"
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"


def _reset_html(to_email: str, otp: str) -> str:
    year = datetime.now(timezone.utc).year
    email = escape(to_email)
    # Email clients ignore <style> blocks unevenly, so everything is inline
    # and laid out with tables.
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Reset your Higoverse password</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:{FONT};-webkit-font-smoothing:antialiased">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">
    Your Higoverse verification code is {otp}. It expires in 10 minutes.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6">
    <tr><td align="center" style="padding:40px 16px">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-top:3px solid {BRAND};border-radius:8px">

        <tr><td style="padding:28px 40px 0">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="vertical-align:middle"><img src="{LOGO_URL}" width="32" height="32" alt="" style="display:block;border:0;border-radius:50%"></td>
            <td style="vertical-align:middle;padding-left:10px;font-size:17px;font-weight:600;color:#111827;letter-spacing:-0.2px">Higoverse</td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:28px 40px 0">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:600;color:#111827">Reset your password</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#374151">
            We received a request to reset the password for the Higoverse account
            <span style="color:#111827;font-weight:600">{email}</span>.
            Enter the verification code below to continue.
          </p>
        </td></tr>

        <tr><td style="padding:24px 40px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:20px 12px">
              <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:8px">Verification code</div>
              <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#111827">{otp}</div>
            </td></tr>
          </table>
          <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#4b5563">
            This code expires in <strong style="color:#111827">10 minutes</strong> and can be used only once.
          </p>
        </td></tr>

        <tr><td style="padding:0 40px"><div style="border-top:1px solid #e5e7eb;font-size:0;line-height:0">&nbsp;</div></td></tr>

        <tr><td style="padding:20px 40px 28px">
          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b7280">
            <strong style="color:#374151">Didn't request this?</strong>
            You can safely ignore this email. Your password will not change unless this code is used.
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280">
            For your security, never share this code. Higoverse staff will never ask you for it.
          </p>
        </td></tr>

      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
        <tr><td align="center" style="padding:24px 24px 0;font-size:12px;line-height:1.7;color:#9ca3af">
          Need help? Contact us at
          <a href="mailto:{SUPPORT_EMAIL}" style="color:{BRAND};text-decoration:none">{SUPPORT_EMAIL}</a>
          or {SUPPORT_PHONE}.<br>
          Higoverse &middot; Business Management Platform &middot; Kigali, Rwanda<br>
          &copy; {year} Higoverse. This is an automated message; please do not reply.
        </td></tr>
      </table>

    </td></tr>
  </table>
</body>
</html>
"""


def _reset_text(to_email: str, otp: str) -> str:
    return (
        "Reset your Higoverse password\n\n"
        f"We received a request to reset the password for the Higoverse account {to_email}.\n\n"
        f"Verification code: {otp}\n\n"
        "This code expires in 10 minutes and can be used only once.\n\n"
        "Didn't request this? You can safely ignore this email. Your password will not "
        "change unless this code is used. Never share this code; Higoverse staff will "
        "never ask you for it.\n\n"
        f"Need help? {SUPPORT_EMAIL} or {SUPPORT_PHONE}\n"
        "Higoverse - Business Management Platform - Kigali, Rwanda\n"
    )


def send_otp_email(to_email: str, otp: str) -> None:
    if not settings.SMTP_USER or not settings.SMTP_PASS:
        raise RuntimeError("SMTP credentials are not configured")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"{otp} is your Higoverse verification code"
    msg["From"]    = settings.SMTP_FROM
    msg["To"]      = to_email
    # Plain text first, HTML last: mail apps show the last part they can.
    msg.attach(MIMEText(_reset_text(to_email, otp), "plain", "utf-8"))
    msg.attach(MIMEText(_reset_html(to_email, otp), "html", "utf-8"))

    # Port 465 talks TLS from the start; 587 (Gmail's default) upgrades with STARTTLS.
    # The timeout keeps a slow mail server from holding the request open.
    if settings.SMTP_PORT == 465:
        server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20)
    else:
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20)
    with server:
        if settings.SMTP_PORT != 465:
            server.ehlo()
            server.starttls()
            server.ehlo()
        server.login(settings.SMTP_USER, settings.SMTP_PASS)
        server.sendmail(settings.SMTP_USER, [to_email], msg.as_string())
