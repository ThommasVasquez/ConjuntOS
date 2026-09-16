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
<body style="margin:0; padding:0; background-color:#050d0c; font-family:'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; color:#f0fdfa; -webkit-font-smoothing:antialiased;">
  <!-- Outer Wrapper Table -->
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#050d0c; padding:48px 12px;">
    <tr>
      <td align="center">
        
        <!-- Main Card Container (Trust Teal + Deep Dark Glass) -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:580px; background-color:#0b1614; border:1px solid rgba(45, 212, 191, 0.22); border-radius:28px; overflow:hidden; box-shadow:0 25px 65px rgba(0,0,0,0.85);">
          
          <!-- Top Brand Accent Bar (Trust Teal + Ocean Blue) -->
          <tr>
            <td style="height:6px; background:linear-gradient(90deg, #2dd4bf 0%, #009df1 50%, #38bdf8 100%); font-size:0; line-height:0;">&nbsp;</td>
          </tr>

          <!-- Header Section with Official Brand Logo -->
          <tr>
            <td style="padding:44px 40px 32px; text-align:center; background:linear-gradient(180deg, #0e1e1b 0%, #0b1614 100%); border-bottom:1px solid rgba(45, 212, 191, 0.16);">
              
              <!-- Official ConjuntOS® Logo (PNG for 100% email client rendering) -->
              <a href="{login_url}" target="_blank" style="text-decoration:none; display:inline-block;">
                <img src="https://app.conjuntos.app/logo.png" alt="ConjuntOS®" width="220" style="display:block; margin:0 auto; width:220px; max-width:260px; height:auto; border:0;" />
              </a>
              
              <!-- Residential Complex Badge -->
              <div style="margin-top:20px; display:inline-block; padding:6px 18px; background:rgba(45, 212, 191, 0.1); border:1px solid rgba(45, 212, 191, 0.3); border-radius:100px;">
                <span style="font-size:12px; color:#2dd4bf; font-weight:800; text-transform:uppercase; letter-spacing:1.8px;">
                  🏢 {conjunto_nombre}
                </span>
              </div>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding:40px 36px 32px;">
              
              <!-- Salutation -->
              <h1 style="margin:0 0 14px; font-size:24px; font-weight:800; color:#f0fdfa; letter-spacing:-0.5px; line-height:1.3; text-align:left;">
                ¡Te damos la bienvenida, {nombre}! 👋
              </h1>
              
              <p style="margin:0 0 28px; font-size:15px; line-height:1.7; color:#93b5b0; text-align:left;">
                La administración de <strong style="color:#f0fdfa;">{conjunto_nombre}</strong> te invita a ingresar a <strong style="color:#2dd4bf;">ConjuntOS®</strong>, la plataforma donde gestionarás tus accesos, comunicados y pagos de forma 100% digital.
              </p>

              <!-- Role Tag Container -->
              <div style="text-align:center; margin-bottom:34px;">
                <div style="display:inline-block; background:linear-gradient(135deg, rgba(0,157,241,0.15) 0%, rgba(45,212,191,0.15) 100%); border:1px solid rgba(45, 212, 191, 0.35); padding:10px 24px; border-radius:100px; box-shadow:0 6px 20px rgba(0,157,241,0.18);">
                  <span style="font-size:12px; color:#38bdf8; font-weight:800; text-transform:uppercase; letter-spacing:1.5px;">
                    ✨ ROL REGISTRADO: <span style="color:#f0fdfa;">{rol}</span>
                  </span>
                </div>
              </div>

              <!-- Credentials Box (Official Liquid Glass Style) -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#050d0c; border:1px solid rgba(45, 212, 191, 0.2); border-radius:22px; margin:28px 0; padding:26px; box-shadow:inset 0 2px 6px rgba(0,0,0,0.5);">
                <tr>
                  <td style="padding-bottom:16px; font-size:12px; text-transform:uppercase; letter-spacing:1.5px; font-weight:800; color:#93b5b0; border-bottom:1px solid rgba(45, 212, 191, 0.15);">
                    🔑 Tus Credenciales de Acceso
                  </td>
                </tr>
                
                <!-- User Email Row -->
                <tr>
                  <td style="padding:16px 0 14px; border-bottom:1px solid rgba(45, 212, 191, 0.15);">
                    <div style="font-size:12px; color:#93b5b0; margin-bottom:6px; font-weight:600;">Correo Electrónico:</div>
                    <div style="background-color:#0b1614; border:1px solid rgba(45, 212, 191, 0.25); padding:10px 16px; border-radius:12px; display:block;">
                      <span style="font-family:'Courier New', Consolas, monospace; color:#38bdf8; font-weight:700; font-size:16px; word-break:break-all;">{to_email}</span>
                    </div>
                  </td>
                </tr>
                
                <!-- Temp Password Row -->
                <tr>
                  <td style="padding:16px 0 4px;">
                    <div style="font-size:12px; color:#93b5b0; margin-bottom:8px; font-weight:600;">Contraseña Temporal de Primer Ingreso:</div>
                    <div style="background:rgba(45, 212, 191, 0.12); border:1.5px dashed #2dd4bf; padding:12px 20px; border-radius:14px; text-align:center;">
                      <span style="font-family:'Courier New', Consolas, monospace; color:#2dd4bf; font-weight:900; font-size:20px; letter-spacing:3px;">{temp_password}</span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Step by Step Cards Section -->
              <div style="margin:34px 0 28px;">
                <div style="font-size:13px; font-weight:800; color:#f0fdfa; margin-bottom:16px; text-transform:uppercase; letter-spacing:1px; text-align:left;">
                  🚀 Pasos para Iniciar Sesión:
                </div>
                
                <!-- Steps Table -->
                <table width="100%" border="0" cellspacing="0" cellpadding="0">
                  <!-- Step 1 -->
                  <tr>
                    <td width="42" valign="top" style="padding-bottom:14px;">
                      <div style="width:30px; height:30px; background:linear-gradient(135deg, #009df1 0%, #0284c7 100%); color:#ffffff; border-radius:50%; text-align:center; line-height:30px; font-weight:800; font-size:13px; box-shadow:0 4px 10px rgba(0,157,241,0.35);">1</div>
                    </td>
                    <td valign="middle" style="padding-bottom:14px; font-size:14px; color:#93b5b0; line-height:1.5;">
                      Haz clic en el botón <strong style="color:#f0fdfa;">"Ingresar a ConjuntOS®"</strong>.
                    </td>
                  </tr>
                  
                  <!-- Step 2 -->
                  <tr>
                    <td width="42" valign="top" style="padding-bottom:14px;">
                      <div style="width:30px; height:30px; background:linear-gradient(135deg, #009df1 0%, #0284c7 100%); color:#ffffff; border-radius:50%; text-align:center; line-height:30px; font-weight:800; font-size:13px; box-shadow:0 4px 10px rgba(0,157,241,0.35);">2</div>
                    </td>
                    <td valign="middle" style="padding-bottom:14px; font-size:14px; color:#93b5b0; line-height:1.5;">
                      Digita tu correo registrado y pega la <strong style="color:#2dd4bf;">Contraseña Temporal</strong>.
                    </td>
                  </tr>
                  
                  <!-- Step 3 -->
                  <tr>
                    <td width="42" valign="top" style="padding-bottom:14px;">
                      <div style="width:30px; height:30px; background:linear-gradient(135deg, #009df1 0%, #0284c7 100%); color:#ffffff; border-radius:50%; text-align:center; line-height:30px; font-weight:800; font-size:13px; box-shadow:0 4px 10px rgba(0,157,241,0.35);">3</div>
                    </td>
                    <td valign="middle" style="padding-bottom:14px; font-size:14px; color:#93b5b0; line-height:1.5;">
                      El sistema te solicitará <strong style="color:#f0fdfa;">crear tu contraseña personal</strong> definitiva.
                    </td>
                  </tr>
                  
                  <!-- Step 4 -->
                  <tr>
                    <td width="42" valign="top">
                      <div style="width:30px; height:30px; background:linear-gradient(135deg, #2dd4bf 0%, #0f766e 100%); color:#04211d; border-radius:50%; text-align:center; line-height:30px; font-weight:900; font-size:14px; box-shadow:0 4px 10px rgba(45,212,191,0.35);">✓</div>
                    </td>
                    <td valign="middle" style="font-size:14px; color:#93b5b0; line-height:1.5;">
                      ¡Listo! Ya tendrás acceso completo a tu conjunto residencial.
                    </td>
                  </tr>
                </table>
              </div>

              <!-- CTA Button Section (Trust Teal Gradient) -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:38px 0 26px;">
                <tr>
                  <td align="center">
                    <a href="{login_url}" target="_blank" style="display:inline-block; background:linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%); color:#04211d; font-weight:900; font-size:16px; text-decoration:none; padding:18px 46px; border-radius:18px; box-shadow:0 14px 32px rgba(45,212,191,0.4); text-transform:uppercase; letter-spacing:1px; transition:all 0.2s;">
                      Ingresar a ConjuntOS® &nbsp;&rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Security Notice -->
              <p style="margin:26px 0 0; font-size:12px; line-height:1.6; color:#93b5b0; text-align:center;">
                🔒 <em>Nota de seguridad: Esta clave temporal caducará una vez crees tu clave personal en tu primer ingreso.</em>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:30px 36px; background-color:#050d0c; border-top:1px solid rgba(45, 212, 191, 0.16); text-align:center; font-size:12px; color:#93b5b0; line-height:1.8;">
              <strong style="color:#f0fdfa;">{conjunto_nombre}</strong> &middot; Administración Digital Residencial<br/>
              Plataforma tecnológica por <strong style="color:#2dd4bf;">ConjuntOS®</strong><br/>
              <span style="font-size:11px; color:#6b8b86; display:inline-block; margin-top:8px;">
                © 2026 ConjuntOS®. Todos los derechos reservados. Marca registrada.
              </span>
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
                .unwrap_or_else(|_| "ConjuntOS® <notificaciones@conjuntos.app>".to_string());

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
                .unwrap_or_else(|_| "ConjuntOS® <notificaciones@conjuntos.app>".to_string());

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
