use std::env;
use tracing::{error, info};

pub struct InvitationEmailParams {
    pub to_email: String,
    pub nombre: String,
    pub conjunto_nombre: String,
    pub rol: String,
    pub temp_password: String,
}

/// Send invitation email asynchronously via Resend HTTP API, SMTP, or console logger.
pub async fn send_invitation_email(params: InvitationEmailParams) {
    let to_email = params.to_email.trim().to_string();
    let nombre = params.nombre.trim().to_string();
    let conjunto_nombre = if params.conjunto_nombre.is_empty() {
        "ConjuntOS".to_string()
    } else {
        params.conjunto_nombre.trim().to_string()
    };
    let rol = params.rol;
    let temp_password = params.temp_password;

    let login_url = env::var("APP_URL").unwrap_or_else(|_| "https://app.conjuntos.app/login".to_string());
    let subject = format!("Te han invitado a {conjunto_nombre} en ConjuntOS");

    let html_body = format!(
        r#"<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Invitación a ConjuntOS</title>
</head>
<body style="margin:0; padding:0; background-color:#0f172a; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color:#f8fafc;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0f172a; padding:40px 10px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; background-color:#1e293b; border:1px solid #334155; border-radius:24px; overflow:hidden; box-shadow:0 20px 50px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 24px; text-align:center; background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%);">
              <h1 style="margin:0; font-size:28px; font-weight:800; color:#ffffff; letter-spacing:-0.5px;">ConjuntOS</h1>
              <p style="margin:4px 0 0; font-size:14px; color:#e0f2fe; font-weight:500;">{conjunto_nombre}</p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px; font-size:20px; font-weight:700; color:#ffffff;">¡Hola, {nombre}! 👋</h2>
              <p style="margin:0 0 20px; font-size:14px; line-height:1.6; color:#94a3b8;">
                Has sido registrado e invitado a formar parte de <strong style="color:#ffffff;">{conjunto_nombre}</strong> con el rol de <span style="background-color:#0284c726; color:#38bdf8; padding:2px 8px; border-radius:6px; font-weight:700; font-size:12px;">{rol}</span>.
              </p>

              <!-- Credentials Box -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0f172a; border:1px solid #334155; border-radius:16px; margin:24px 0; padding:20px;">
                <tr>
                  <td style="padding-bottom:12px; font-size:11px; text-transform:uppercase; letter-spacing:1px; font-weight:800; color:#64748b;">
                    Tus Credenciales de Acceso
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0; font-size:14px; color:#cbd5e1;">
                    <strong style="color:#ffffff;">Correo:</strong> <span style="font-family:monospace; color:#38bdf8;">{to_email}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0; font-size:14px; color:#cbd5e1;">
                    <strong style="color:#ffffff;">Contraseña Temporal:</strong> <span style="font-family:monospace; color:#f59e0b; font-weight:bold; background-color:#f59e0b15; padding:2px 8px; border-radius:4px;">{temp_password}</span>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0 16px;">
                <tr>
                  <td align="center">
                    <a href="{login_url}" target="_blank" style="display:inline-block; background-color:#0284c7; color:#ffffff; font-weight:800; font-size:15px; text-decoration:none; padding:16px 36px; border-radius:14px; box-shadow:0 10px 25px rgba(2,132,199,0.4);">
                      Iniciar Sesión en ConjuntOS
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Security Notice -->
              <p style="margin:20px 0 0; font-size:12px; line-height:1.5; color:#64748b; text-align:center;">
                🔒 <em>Por motivos de seguridad, el sistema te pedirá cambiar esta contraseña al ingresar por primera vez.</em>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px; background-color:#0f172a; border-top:1px solid #334155; text-align:center; font-size:12px; color:#64748b;">
              &copy; {conjunto_nombre} &middot; Impulsado por ConjuntOS
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"#
    );

    // 1. Check for RESEND_API_KEY
    if let Ok(resend_key) = env::var("RESEND_API_KEY") {
        if !resend_key.trim().is_empty() {
            let from_email = env::var("RESEND_FROM_EMAIL")
                .unwrap_or_else(|_| "ConjuntOS <onboarding@resend.dev>".to_string());

            let client = reqwest::Client::new();
            let payload = serde_json::json!({
                "from": from_email,
                "to": [to_email],
                "subject": subject,
                "html": html_body,
            });

            match client
                .post("https://api.resend.com/emails")
                .header("Authorization", format!("Bearer {}", resend_key.trim()))
                .header("Content-Type", "application/json")
                .json(&payload)
                .send()
                .await
            {
                Ok(resp) if resp.status().is_success() => {
                    info!("✅ [EMAIL] Sent invitation email via Resend to {to_email}");
                    return;
                }
                Ok(resp) => {
                    let err_text = resp.text().await.unwrap_or_default();
                    error!("❌ [EMAIL] Resend API error: {err_text}");
                }
                Err(e) => {
                    error!("❌ [EMAIL] Failed to send via Resend: {e}");
                }
            }
        }
    }

    // 2. Check for SMTP credentials (lettre)
    if let (Ok(smtp_host), Ok(smtp_user), Ok(smtp_pass)) = (
        env::var("SMTP_HOST"),
        env::var("SMTP_USER"),
        env::var("SMTP_PASS"),
    ) {
        if !smtp_host.trim().is_empty() {
            let port: u16 = env::var("SMTP_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(587);
            let from_address = env::var("SMTP_FROM")
                .unwrap_or_else(|_| format!("notificaciones@{smtp_host}"));

            use lettre::message::header::ContentType;
            use lettre::transport::smtp::authentication::Credentials;
            use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

            let email_res = Message::builder()
                .from(from_address.parse().unwrap())
                .to(to_email.parse().unwrap())
                .subject(&subject)
                .header(ContentType::TEXT_HTML)
                .body(html_body.clone());

            if let Ok(email) = email_res {
                let creds = Credentials::new(smtp_user, smtp_pass);
                let mailer = AsyncSmtpTransport::<Tokio1Executor>::relay(&smtp_host)
                    .unwrap()
                    .port(port)
                    .credentials(creds)
                    .build();

                match mailer.send(email).await {
                    Ok(_) => {
                        info!("✅ [EMAIL] Sent invitation email via SMTP ({smtp_host}) to {to_email}");
                        return;
                    }
                    Err(e) => {
                        error!("❌ [EMAIL] SMTP send error: {e}");
                    }
                }
            }
        }
    }

    // 3. Fallback: Log invitation email details to tracing/console
    info!(
        "📧 [INVITATION EMAIL LOGGED] To: {to_email} | Temp Password: {temp_password} | Subject: {subject}"
    );
}
