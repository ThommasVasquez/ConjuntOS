//! QR code generation.
//!
//! Pure-Rust (`qrcode` + `image` PNG only) so it needs no external service and
//! keeps the build OpenSSL-free. Encodes an **opaque** token (e.g. a visitor
//! access code) into a scannable PNG. Callers must pass an opaque identifier,
//! never PII — the image is shared/printed and the token is what gets validated
//! server-side at the gate (F2).

use image::{ImageFormat, Luma};
use qrcode::QrCode;

/// Minimum rendered size in pixels — large enough to scan reliably from a phone.
const MIN_PX: u32 = 320;

/// Encode an opaque token into a scannable QR PNG.
pub fn make_qr_png(token: &str) -> anyhow::Result<Vec<u8>> {
    anyhow::ensure!(!token.is_empty(), "cannot encode an empty token");
    let code = QrCode::new(token.as_bytes())?;
    let img = code
        .render::<Luma<u8>>()
        .min_dimensions(MIN_PX, MIN_PX)
        .build();

    let mut bytes = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut bytes), ImageFormat::Png)?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn qr_png_round_trips_to_the_exact_token() {
        let token = "VIS-7K3QF9XR2M"; // opaque, no PII

        let png = make_qr_png(token).unwrap();
        assert!(png.starts_with(&[0x89, b'P', b'N', b'G']), "not a PNG");

        // Decode the rendered image back and confirm it carries the same token.
        let gray = image::load_from_memory(&png).unwrap().to_luma8();
        let mut prepared = rqrr::PreparedImage::prepare(gray);
        let grids = prepared.detect_grids();
        assert_eq!(grids.len(), 1, "expected exactly one QR grid");
        let (_meta, decoded) = grids[0].decode().unwrap();
        assert_eq!(decoded, token);
    }

    #[test]
    fn empty_token_is_rejected() {
        // A QR with no payload is meaningless; surface it as an error, not a blank image.
        assert!(make_qr_png("").is_err());
    }
}
