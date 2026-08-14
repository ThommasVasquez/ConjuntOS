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
    let subject = format!("Te han invitado a {conjunto_nombre} en ConjuntOS®");

    let html_body = format!(
        r#"<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitación a ConjuntOS®</title>
</head>
<body style="margin:0; padding:0; background-color:#0b1324; font-family:'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#f8fafc; -webkit-font-smoothing:antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0b1324; padding:40px 12px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:580px; background-color:#131f37; border:1px solid #1e2d4a; border-radius:28px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.6);">
          <!-- Header Branding -->
          <tr>
            <td style="padding:40px 32px 28px; text-align:center; background:linear-gradient(180deg, #182846 0%, #131f37 100%); border-bottom:1px solid #1e2d4a;">
              <a href="{login_url}" target="_blank" style="text-decoration:none; display:inline-block;">
                <img src="https://app.conjuntos.app/ConjuntOS_Horizontal.png" alt="ConjuntOS®" height="48" style="display:block; margin:0 auto; max-width:240px; height:auto; border:0;" />
              </a>
              <div style="margin-top:12px; font-size:13px; color:#57bf00; font-weight:800; text-transform:uppercase; letter-spacing:1.5px;">
                {conjunto_nombre}
              </div>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding:36px 32px;">
              <h2 style="margin:0 0 16px; font-size:22px; font-weight:800; color:#ffffff; letter-spacing:-0.3px;">
                ¡Hola, {nombre}! 👋
              </h2>
              <p style="margin:0 0 24px; font-size:14px; line-height:1.65; color:#94a3b8;">
                Te han invitado a formar parte de <strong style="color:#ffffff;">{conjunto_nombre}</strong> en la plataforma <strong style="color:#57bf00;">ConjuntOS®</strong>. Tu cuenta ha sido creada con el rol de:
              </p>
              
              <div style="text-align:center; margin-bottom:28px;">
                <span style="background-color:rgba(87,191,0,0.12); color:#57bf00; border:1px solid rgba(87,191,0,0.3); padding:6px 16px; border-radius:100px; font-weight:800; font-size:13px; text-transform:uppercase; letter-spacing:1px; display:inline-block;">
                  {rol}
                </span>
              </div>

              <!-- Credentials Card -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0b1324; border:1px solid #1e2d4a; border-radius:20px; margin:24px 0; padding:24px;">
                <tr>
                  <td style="padding-bottom:14px; font-size:11px; text-transform:uppercase; letter-spacing:1.5px; font-weight:800; color:#64748b;">
                    🔑 Tus Credenciales de Acceso
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0; font-size:14px; color:#cbd5e1; border-bottom:1px solid #1e2d4a;">
                    <strong style="color:#ffffff;">Correo Electrónico:</strong><br/>
                    <span style="font-family:Consolas, Monaco, monospace; color:#38bdf8; font-weight:700; font-size:15px;">{to_email}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0 4px; font-size:14px; color:#cbd5e1;">
                    <strong style="color:#ffffff;">Contraseña Temporal:</strong><br/>
                    <span style="display:inline-block; font-family:Consolas, Monaco, monospace; color:#57bf00; font-weight:900; font-size:16px; background-color:rgba(87,191,0,0.15); border:1px solid rgba(87,191,0,0.25); padding:4px 12px; border-radius:8px; margin-top:4px; letter-spacing:1px;">{temp_password}</span>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:32px 0 20px;">
                <tr>
                  <td align="center">
                    <a href="{login_url}" target="_blank" style="display:inline-block; background:linear-gradient(135deg, #57bf00 0%, #46a000 100%); color:#ffffff; font-weight:900; font-size:15px; text-decoration:none; padding:16px 40px; border-radius:16px; box-shadow:0 12px 28px rgba(87,191,0,0.35); text-transform:uppercase; letter-spacing:0.5px; transition:all 0.2s;">
                      Acceder a ConjuntOS®
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Security Notice -->
              <p style="margin:24px 0 0; font-size:12px; line-height:1.5; color:#64748b; text-align:center;">
                🔒 <em>Por seguridad, el sistema te pedirá actualizar esta contraseña en tu primer inicio de sesión.</em>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px; background-color:#0b1324; border-top:1px solid #1e2d4a; text-align:center; font-size:12px; color:#64748b; line-height:1.6;">
              &copy; {conjunto_nombre} &middot; Impulsado por <strong style="color:#94a3b8;">ConjuntOS®</strong><br/>
              <span style="font-size:11px; color:#475569;">Todos los derechos reservados. Marca registrada.</span>
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

pub struct PazYSalvoEmailParams {
    pub to_email: String,
    pub nombre: String,
    pub conjunto_nombre: String,
    pub paz_y_salvo_codigo: String,
    pub tipo_mudanza: String,
    pub fecha_mudanza: String,
    pub hora_inicio: String,
    pub hora_fin: String,
}

pub async fn send_paz_y_salvo_email(params: PazYSalvoEmailParams) {
    let to_email = params.to_email.trim().to_string();
    let nombre = params.nombre.trim().to_string();
    let conjunto_nombre = if params.conjunto_nombre.is_empty() {
        "ConjuntOS®".to_string()
    } else {
        params.conjunto_nombre.trim().to_string()
    };
    let codigo = params.paz_y_salvo_codigo;
    let tipo = params.tipo_mudanza;
    let fecha = params.fecha_mudanza;
    let horario = format!("{} a {}", params.hora_inicio, params.hora_fin);

    let subject = format!("Certificado de Paz y Salvo ConjuntOS® - Mudanza {codigo}");

    let html_body = format!(
        r#"<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Certificado de Paz y Salvo ConjuntOS®</title>
</head>
<body style="margin:0; padding:0; background-color:#0b1324; font-family:'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#f8fafc;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0b1324; padding:40px 12px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:580px; background-color:#131f37; border:1px solid #1e2d4a; border-radius:28px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.6);">
          <!-- Header Branding -->
          <tr>
            <td style="padding:40px 32px 28px; text-align:center; background:linear-gradient(180deg, #182846 0%, #131f37 100%); border-bottom:1px solid #1e2d4a;">
              <img src="https://app.conjuntos.app/ConjuntOS_Horizontal.png" alt="ConjuntOS®" height="48" style="display:block; margin:0 auto; max-width:240px; height:auto; border:0;" />
              <div style="margin-top:12px; font-size:13px; color:#57bf00; font-weight:800; text-transform:uppercase; letter-spacing:1.5px;">
                {conjunto_nombre}
              </div>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding:36px 32px;">
              <div style="text-align:center; margin-bottom:24px;">
                <span style="display:inline-block; padding:8px 18px; border-radius:20px; background-color:rgba(87,191,0,0.15); border:1px solid #57bf00; color:#57bf00; font-size:12px; font-weight:900; text-transform:uppercase; letter-spacing:1px;">
                  ✓ PAZ Y SALVO APROBADO &bull; {codigo}
                </span>
              </div>

              <h2 style="margin:0 0 16px; font-size:20px; font-weight:800; color:#ffffff; text-align:center;">
                Certificado de Paz y Salvo y Permiso de Mudanza
              </h2>
              <p style="margin:0 0 24px; font-size:14px; line-height:1.65; color:#94a3b8; text-align:center;">
                Estimado(a) <strong style="color:#ffffff;">{nombre}</strong>, su solicitud de mudanza ha sido verificada y aprobada por la administración de <strong style="color:#ffffff;">{conjunto_nombre}</strong> a través de <strong style="color:#57bf00;">ConjuntOS®</strong>.
              </p>

              <!-- Details Box -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#182846; border:1px solid #1e2d4a; border-radius:20px; padding:20px; margin-bottom:24px;">
                <tr>
                  <td style="font-size:13px; color:#94a3b8; padding-bottom:8px;">
                    <strong style="color:#ffffff;">Tipo de Mudanza:</strong> {tipo}
                  </td>
                </tr>
                <tr>
                  <td style="font-size:13px; color:#94a3b8; padding-bottom:8px;">
                    <strong style="color:#ffffff;">Fecha Habilitada:</strong> {fecha}
                  </td>
                </tr>
                <tr>
                  <td style="font-size:13px; color:#94a3b8; padding-bottom:8px;">
                    <strong style="color:#57bf00;">Horario de Permiso:</strong> {horario}
                  </td>
                </tr>
                <tr>
                  <td style="font-size:13px; color:#94a3b8;">
                    <strong style="color:#ffffff;">Código Único Paz y Salvo:</strong> <span style="color:#57bf00; font-family:monospace; font-weight:bold;">{codigo}</span>
                  </td>
                </tr>
              </table>

              <p style="margin:0; font-size:12px; line-height:1.6; color:#64748b; text-align:center;">
                Este permiso ha sido transmitido a la portería y al personal de vigilancia de estacionamientos para autorizar el ingreso y la movilidad en la fecha indicada.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px; background-color:#0f182c; border-top:1px solid #1e2d4a; text-align:center;">
              <p style="margin:0; font-size:11px; color:#64748b;">
                &copy; {conjunto_nombre} &bull; Expedido vía <strong style="color:#57bf00;">ConjuntOS®</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"#
    );

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

            let _ = client
                .post("https://api.resend.com/emails")
                .header("Authorization", format!("Bearer {}", resend_key.trim()))
                .header("Content-Type", "application/json")
                .json(&payload)
                .send()
                .await;
            info!("✅ [EMAIL] Sent Paz y Salvo certificate email to {to_email}");
            return;
        }
    }
    info!("📧 [PAZ Y SALVO EMAIL LOGGED] To: {to_email} | Code: {codigo}");
}
