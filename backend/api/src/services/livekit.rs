//! LiveKit access-token generation (JWT with video grants).

use anyhow::Result;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize)]
struct VideoGrant {
    #[serde(rename = "roomJoin")]
    room_join: bool,
    room: String,
    #[serde(rename = "canPublish")]
    can_publish: bool,
    #[serde(rename = "canSubscribe")]
    can_subscribe: bool,
}

#[derive(Serialize)]
struct LiveKitClaims {
    iss: String,
    sub: String,
    nbf: u64,
    exp: u64,
    video: VideoGrant,
    metadata: String,
}

pub fn generate_token(
    api_key: &str,
    api_secret: &str,
    room: &str,
    identity: &str,
    can_publish: bool,
    metadata: &str,
) -> Result<String> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();

    let claims = LiveKitClaims {
        iss: api_key.to_string(),
        sub: identity.to_string(),
        nbf: now,
        exp: now + 6 * 3600, // 6 hours
        video: VideoGrant {
            room_join: true,
            room: room.to_string(),
            can_publish,
            can_subscribe: true,
        },
        metadata: metadata.to_string(),
    };

    let mut header = Header::new(Algorithm::HS256);
    header.typ = Some("JWT".to_string());

    let token = encode(
        &header,
        &claims,
        &EncodingKey::from_secret(api_secret.as_bytes()),
    )?;

    Ok(token)
}
