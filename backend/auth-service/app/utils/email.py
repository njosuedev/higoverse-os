import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings


def send_otp_email(to_email: str, otp: str) -> None:
    if not settings.SMTP_USER or not settings.SMTP_PASS:
        raise RuntimeError("SMTP credentials are not configured")

    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">

        <!-- header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1d4ed8,#4f46e5);padding:32px;text-align:center">
            <div style="font-size:24px;font-weight:700;color:#fff;letter-spacing:1px">Higoverse</div>
            <div style="color:#bfdbfe;font-size:13px;margin-top:4px">Business Management Platform</div>
          </td>
        </tr>

        <!-- body -->
        <tr>
          <td style="padding:36px 40px">
            <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Password Reset Request</h2>
            <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6">
              We received a request to reset the password for your Higoverse account.
              Use the code below — it expires in <strong>10 minutes</strong>.
            </p>

            <!-- OTP box -->
            <div style="background:#eff6ff;border:2px dashed #3b82f6;border-radius:12px;
                        padding:24px;text-align:center;margin-bottom:24px">
              <div style="color:#64748b;font-size:12px;text-transform:uppercase;
                          letter-spacing:2px;margin-bottom:8px">Your one-time code</div>
              <div style="font-size:42px;font-weight:800;letter-spacing:10px;
                          color:#1d4ed8;font-family:'Courier New',monospace">{otp}</div>
            </div>

            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6">
              If you didn't request a password reset, you can safely ignore this email.
              Your password will not change.
            </p>
          </td>
        </tr>

        <!-- footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;text-align:center;
                     border-top:1px solid #e2e8f0">
            <div style="color:#94a3b8;font-size:11px">
              &copy; 2025 Higoverse · This is an automated message, please do not reply.
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Your Higoverse reset code: {otp}"
    msg["From"]    = settings.SMTP_FROM
    msg["To"]      = to_email
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASS)
        server.sendmail(settings.SMTP_USER, to_email, msg.as_string())
