//! Offline PDF rendering.
//!
//! Pure-Rust (`printpdf`, built-in Helvetica) so it needs no external service,
//! no font asset, and keeps the build OpenSSL-free. Produces a structured text
//! document — enough for assembly actas (F8) and multa notices (F5) — and can
//! persist it through the existing object storage.

use printpdf::{BuiltinFont, Mm, PdfDocument};

use crate::services::storage::StorageService;

pub const PDF_MIME: &str = "application/pdf";

// US Letter, with comfortable margins (mm).
const PAGE_W: f32 = 215.9;
const PAGE_H: f32 = 279.4;
const MARGIN_X: f32 = 20.0;
const TOP_Y: f32 = PAGE_H - 20.0;
const BOTTOM_Y: f32 = 20.0;
const TITLE_SIZE: f32 = 18.0;
const BODY_SIZE: f32 = 11.0;
const LINE_H: f32 = 6.0;

/// A minimal structured document: a title plus a sequence of text lines (an empty
/// string renders as a blank line). Callers format their content into lines; this
/// stays deliberately simple until a feature needs richer layout (e.g. tables).
pub struct PdfDoc {
    pub title: String,
    pub lines: Vec<String>,
}

/// Render `doc` to PDF bytes, paginating when content runs past the bottom margin.
pub fn render_pdf(doc: &PdfDoc) -> anyhow::Result<Vec<u8>> {
    let (pdf, page1, layer1) = PdfDocument::new(&doc.title, Mm(PAGE_W), Mm(PAGE_H), "Layer 1");
    let font = pdf.add_builtin_font(BuiltinFont::HelveticaBold)?;
    let font_regular = pdf.add_builtin_font(BuiltinFont::Helvetica)?;

    let mut layer = pdf.get_page(page1).get_layer(layer1);
    let mut y = TOP_Y;

    // Title.
    layer.use_text(&doc.title, TITLE_SIZE, Mm(MARGIN_X), Mm(y), &font);
    y -= LINE_H * 2.0;

    for line in &doc.lines {
        if y < BOTTOM_Y {
            // Start a fresh page when we run out of vertical room.
            let (page, lyr) = pdf.add_page(Mm(PAGE_W), Mm(PAGE_H), "Layer 1");
            layer = pdf.get_page(page).get_layer(lyr);
            y = TOP_Y;
        }
        if !line.is_empty() {
            layer.use_text(line, BODY_SIZE, Mm(MARGIN_X), Mm(y), &font_regular);
        }
        y -= LINE_H;
    }

    Ok(pdf.save_to_bytes()?)
}

/// Render and persist a PDF through object storage, returning its URL.
pub async fn render_and_store(
    storage: &dyn StorageService,
    bucket: &str,
    path: &str,
    doc: &PdfDoc,
) -> anyhow::Result<String> {
    let bytes = render_pdf(doc)?;
    storage.upload(bucket, path, &bytes, PDF_MIME).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_pdf_produces_valid_pdf_bytes() {
        let doc = PdfDoc {
            title: "Acta de Asamblea".into(),
            lines: vec![
                "Quórum alcanzado: 60%".into(),
                String::new(),
                "Votación 1: aprobada (45 a favor, 5 en contra)".into(),
            ],
        };
        let bytes = render_pdf(&doc).unwrap();

        // Valid PDFs begin with the %PDF magic bytes and carry real content.
        assert!(bytes.starts_with(b"%PDF"), "missing %PDF header");
        assert!(
            bytes.len() > 200,
            "PDF suspiciously small: {} bytes",
            bytes.len()
        );
    }

    #[test]
    fn render_pdf_paginates_long_documents() {
        // Far more lines than fit on one page — must still yield a valid PDF.
        let lines: Vec<String> = (0..200).map(|i| format!("Renglón {i}")).collect();
        let doc = PdfDoc {
            title: "Documento largo".into(),
            lines,
        };
        let bytes = render_pdf(&doc).unwrap();
        assert!(bytes.starts_with(b"%PDF"));
    }
}
