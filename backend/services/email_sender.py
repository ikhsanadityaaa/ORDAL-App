"""ORDAL email sender — kirim kode verifikasi email via SMTP (Gmail App Password).

Konfigurasi (.env):
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_USER=nama@gmail.com
  SMTP_APP_PASSWORD=xxxx xxxx xxxx xxxx   (Gmail App Password)
  SMTP_FROM="ORDAL <nama@gmail.com>"      (opsional)

Kalau SMTP belum dikonfigurasi, kode verifikasi dikembalikan ke frontend
sebagai dev_code (mode pengembangan) supaya flow tetap bisa dites.
"""
import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or 587)
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_APP_PASSWORD = os.getenv("SMTP_APP_PASSWORD", "").strip()
SMTP_FROM = os.getenv("SMTP_FROM", "").strip() or (SMTP_USER if SMTP_USER else "ORDAL <no-reply@ordal.app>")
SMTP_SSL_PORT = int(os.getenv("SMTP_SSL_PORT", "465") or 465)


def is_smtp_configured() -> bool:
    return bool(SMTP_USER and SMTP_APP_PASSWORD)


def _send(to_email: str, subject: str, html: str, text: str):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to_email
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    host, port = SMTP_HOST, SMTP_PORT
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=ssl.create_default_context(), timeout=20) as server:
            server.login(SMTP_USER, SMTP_APP_PASSWORD)
            server.sendmail(SMTP_USER, [to_email], msg.as_string())
    else:
        with smtplib.SMTP(host, port, timeout=20) as server:
            server.starttls(context=ssl.create_default_context())
            server.login(SMTP_USER, SMTP_APP_PASSWORD)
            server.sendmail(SMTP_USER, [to_email], msg.as_string())


_VERIF_HTML = """\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F4F2EC;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F2EC;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0"
             style="background:#FFFFFF;border:2px solid #33363F;border-radius:20px;overflow:hidden;">
        <!-- orange strip -->
        <tr><td style="height:8px;background:#F2661A;"></td></tr>
        <!-- header charcoal -->
        <tr><td style="background:#33363F;padding:28px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:44px;height:44px;background:#F2661A;border-radius:10px;border:2px solid #F4F2EC;
                       text-align:center;font-size:26px;font-weight:bold;color:#FFFFFF;">O</td>
            <td style="padding-left:12px;font-size:22px;font-weight:bold;color:#FFFFFF;letter-spacing:-0.5px;">ORDAL</td>
          </tr></table>
        </td></tr>
        <!-- body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#33363F;">Verifikasi Email Kamu</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#6B6E76;">
            Halo! Masukkan kode berikut untuk memverifikasi email kamu dan melanjutkan
            menggunakan ORDAL — AI Job Search Agent.
          </p>
          <div style="text-align:center;margin:0 0 24px;">
            <span style="display:inline-block;padding:14px 28px;background:#F4F2EC;border:2px solid #33363F;
                         border-radius:14px;font-family:'Courier New',monospace;font-size:30px;font-weight:bold;
                         letter-spacing:8px;color:#33363F;">{code}</span>
          </div>
          <p style="margin:0 0 4px;font-size:12px;color:#6B6E76;">Kode ini berlaku <b>15 menit</b>.</p>
          <p style="margin:0;font-size:12px;color:#6B6E76;">
            Kalau kamu tidak meminta kode ini, abaikan saja email-nya.
          </p>
        </td></tr>
        <!-- footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #DDD9CC;font-size:11px;color:#9CA3AF;">
          ORDAL &middot; AI Job Search Agent &middot; Auto-Apply JobStreet &amp; LinkedIn
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""

_VERIF_TEXT = """ORDAL — Verifikasi Email

Kode verifikasi kamu: {code}

Kode berlaku 15 menit. Kalau kamu tidak meminta kode ini, abaikan email ini.

— ORDAL · AI Job Search Agent
"""


def send_verification_email(to_email: str, code: str) -> bool:
    """Kirim email kode verifikasi. Return True kalau terkirim.
    Raise Exception dengan pesan jelas kalau gagal."""
    if not is_smtp_configured():
        raise RuntimeError("SMTP belum dikonfigurasi (SMTP_USER / SMTP_APP_PASSWORD)")
    html = _VERIF_HTML.replace("{code}", code)
    text = _VERIF_TEXT.replace("{code}", code)
    _send(to_email, "Kode Verifikasi ORDAL — {code}".replace("{code}", code), html, text)
    return True


# ── Activation code (lisensi ORDAL) ───────────────────────────────────────
_ACTIV_HTML = """\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F4F2EC;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F2EC;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0"
             style="background:#FFFFFF;border:2px solid #33363F;border-radius:20px;overflow:hidden;">
        <tr><td style="height:8px;background:#F2661A;"></td></tr>
        <tr><td style="background:#33363F;padding:28px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:44px;height:44px;background:#F2661A;border-radius:10px;border:2px solid #F4F2EC;
                       text-align:center;font-size:26px;font-weight:bold;color:#FFFFFF;">O</td>
            <td style="padding-left:12px;font-size:22px;font-weight:bold;color:#FFFFFF;letter-spacing:-0.5px;">ORDAL</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#33363F;">Pembayaran Berhasil — Kode Aktivasi Kamu</p>
          <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#6B6E76;">
            Terima kasih sudah mengaktifkan ORDAL! Berikut kode aktivasi personal kamu.
            Masukkan kode ini di aplikasi ORDAL untuk membuka akses penuh.
            <b>Simpan email ini</b> — kode yang sama dipakai selamanya untuk akun kamu.
          </p>
          <div style="text-align:center;margin:0 0 24px;">
            <span style="display:inline-block;padding:14px 24px;background:#F4F2EC;border:2px solid #33363F;
                         border-radius:14px;font-family:'Courier New',monospace;font-size:22px;font-weight:bold;
                         letter-spacing:2px;color:#33363F;">{code}</span>
          </div>
          <p style="margin:0 0 4px;font-size:12px;color:#6B6E76;">
            Detail pembayaran: {amount} &middot; metode QRIS BCA / PayPal
          </p>
          <p style="margin:0;font-size:12px;color:#6B6E76;">
            Lupa kode di lain waktu? Buka app ORDAL &rarr; tombol <b>Kirim ulang kode</b> di jendela aktivasi.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #DDD9CC;font-size:11px;color:#9CA3AF;">
          ORDAL &middot; AI Job Search Agent &middot; Auto-Apply JobStreet &amp; LinkedIn
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""

_ACTIV_TEXT = """ORDAL — Kode Aktivasi

Pembayaran kamu sudah diverifikasi. Kode aktivasi personal kamu:

    {code}

Masukkan kode ini di aplikasi ORDAL untuk membuka akses penuh.
Simpan kode ini — kode yang sama dipakai selamanya untuk akun kamu.
({amount})

— ORDAL · AI Job Search Agent
"""


def send_activation_email(to_email: str, code: str, amount_display: str = "") -> bool:
    """Kirim email berisi activation code (setelah pembayaran verified)."""
    if not is_smtp_configured():
        raise RuntimeError("SMTP belum dikonfigurasi (SMTP_USER / SMTP_APP_PASSWORD)")
    html = _ACTIV_HTML.replace("{code}", code).replace("{amount}", amount_display or "—")
    text = _ACTIV_TEXT.replace("{code}", code).replace("{amount}", amount_display or "—")
    _send(to_email, "Kode Aktivasi ORDAL — {code}".replace("{code}", code), html, text)
    return True


def send_admin_notification(to_email: str, subject: str, body_text: str) -> bool:
    """Notifikasi teks sederhana untuk admin (mis. konfirmasi pembayaran manual)."""
    if not is_smtp_configured():
        raise RuntimeError("SMTP belum dikonfigurasi (SMTP_USER / SMTP_APP_PASSWORD)")
    html = (
        '<body style="margin:0;padding:24px;background:#F4F2EC;font-family:Arial,Helvetica,sans-serif;">'
        '<div style="background:#FFFFFF;border:2px solid #33363F;border-radius:16px;padding:24px;">'
        f'<pre style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#33363F;white-space:pre-wrap;">{body_text}</pre>'
        '</div></body>'
    )
    _send(to_email, subject, html, body_text)
    return True
