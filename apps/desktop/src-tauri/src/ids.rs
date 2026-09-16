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

/// Parses an RFC 3339 timestamp (`2026-09-16T12:34:56.789Z` or with a
/// `±HH:MM` offset) into unix epoch milliseconds. Returns `None` for
/// anything else — callers decide the fallback. Hand-rolled (days-from-civil)
/// so the core picks up no new dependency for a 30-line job.
pub fn parse_rfc3339_ms(value: &str) -> Option<i64> {
    let bytes = value.as_bytes();
    if bytes.len() < 20 {
        return None;
    }
    let num = |range: std::ops::Range<usize>| -> Option<i64> {
        std::str::from_utf8(&bytes[range]).ok()?.parse().ok()
    };
    let year = num(0..4)?;
    let month = num(5..7)?;
    let day = num(8..10)?;
    let hour = num(11..13)?;
    let minute = num(14..16)?;
    let second = num(17..19)?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    // Optional fractional seconds.
    let mut rest = &value[19..];
    let mut millis = 0_i64;
    if rest.starts_with('.') {
        let digits: String = rest[1..]
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect();
        if digits.is_empty() {
            return None;
        }
        let scaled = format!("{digits:0<3}");
        millis = scaled[..3].parse().ok()?;
        rest = &rest[1 + digits.len()..];
    }
    // Timezone: Z or ±HH:MM.
    let offset_seconds = match rest {
        "Z" | "z" => 0,
        _ => {
            let (sign, digits) = match rest.as_bytes().first() {
                Some(b'+') => (1_i64, &rest[1..]),
                Some(b'-') => (-1_i64, &rest[1..]),
                _ => return None,
            };
            if digits.len() != 5 || digits.as_bytes().get(2) != Some(&b':') {
                return None;
            }
            let oh: i64 = digits[0..2].parse().ok()?;
            let om: i64 = digits[3..5].parse().ok()?;
            sign * (oh * 3600 + om * 60)
        }
    };
    // Days from civil (Howard Hinnant's algorithm): days since 1970-01-01.
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let m = month;
    let d = day;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    let seconds = days * 86_400 + hour * 3600 + minute * 60 + second - offset_seconds;
    Some(seconds * 1000 + millis)
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

    #[test]
    fn rfc3339_parsing_covers_the_worker_timestamp_shapes() {
        assert_eq!(parse_rfc3339_ms("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(
            parse_rfc3339_ms("2026-09-16T12:00:00Z"),
            Some(1_789_560_000_000)
        );
        // Fractional seconds truncate to milliseconds.
        assert_eq!(
            parse_rfc3339_ms("2026-09-16T12:00:00.5Z"),
            Some(1_789_560_000_500)
        );
        // Numeric offsets shift the instant.
        assert_eq!(
            parse_rfc3339_ms("2026-09-16T14:00:00+02:00"),
            Some(1_789_560_000_000)
        );
        // Leap-day and year-boundary dates.
        assert_eq!(
            parse_rfc3339_ms("2024-02-29T00:00:00Z"),
            Some(1_709_164_800_000)
        );
        for bad in ["", "not-a-time", "2026-09-16", "2026-09-16T12:00Z"] {
            assert_eq!(parse_rfc3339_ms(bad), None, "{bad}");
        }
    }
}
