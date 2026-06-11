use std::path::Path;

use anyhow::Result;

/// A single row in the migration report CSV.
pub struct ReportRow {
    pub table: String,
    pub legacy_id: String,
    pub column: String,
    pub raw_value: String,
    pub action: String,
}

/// Write report rows to a CSV file at `path`.
pub fn write_report(path: &Path, rows: &[ReportRow]) -> Result<()> {
    let mut wtr = csv::Writer::from_path(path)?;
    wtr.write_record(["table", "legacy_id", "column", "raw_value", "action"])?;
    for row in rows {
        wtr.write_record([
            &row.table,
            &row.legacy_id,
            &row.column,
            &row.raw_value,
            &row.action,
        ])?;
    }
    wtr.flush()?;
    Ok(())
}
