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
    /// Data messages (reactions) are NOT media: everyone in the room may send
    /// them, including watch-only participants.
    ///
    /// This must be set explicitly. LiveKit's `GetCanPublishData()` falls back
    /// to `GetCanPublish()` when the claim is absent, so leaving it out meant
    /// every resident without the floor — i.e. nearly the whole assembly — had
    /// their reactions dropped by the server while still seeing their own
    /// emoji animate locally.
    #[serde(rename = "canPublishData")]
    can_publish_data: bool,
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
            can_publish_data: true,
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
