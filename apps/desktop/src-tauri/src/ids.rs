//! ID and timestamp helpers.
//!
//! `docs/DATA_MODEL.md` mandates UUIDv7 string ids and UTC timestamps; both
//! are produced here so repositories stay consistent.

use uuid::Uuid;

/// Generates a new UUIDv7 string (time-ordered).
pub fn new_id() -> String {
    Uuid::now_v7().to_string()
}

/// Current UTC time as unix epoch milliseconds.
pub fn now_unix_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_uuidv7_and_time_ordered() {
        let a = new_id();
        let b = new_id();
        assert_ne!(a, b);
        assert!(Uuid::parse_str(&a).unwrap().get_version_num() == 7);
        assert!(b > a, "UUIDv7 strings sort by creation time");
    }

    #[test]
    fn now_is_plausible() {
        let now = now_unix_ms();
        // After 2024-01-01 and before 2100.
        assert!(now > 1_704_067_200_000);
        assert!(now < 4_102_444_800_000);
    }
}
