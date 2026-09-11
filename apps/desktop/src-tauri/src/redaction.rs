//! Secret redaction helpers.
//!
//! Everything that can end up in an error detail, an event payload, or a log
//! line must pass through these helpers first. Tests must prove that secret
//! values never survive redaction (see the `tests` module).

use serde_json::Value;

/// Replacement text used for redacted content.
pub const REDACTED: &str = "[redacted]";

/// Key fragments that mark a field as sensitive. Matching is
/// case-insensitive on the lowercased key name.
const SENSITIVE_KEY_FRAGMENTS: [&str; 9] = [
    "api_key",
    "apikey",
    "secret",
    "token",
    "password",
    "passwd",
    "authorization",
    "credential",
    "session_key",
];

/// Returns true when a field name looks like it carries a secret. Hyphens
/// are normalized to underscores before matching, so both `api_key` and
/// `X-Api-Key` hit; over-matching is preferred over leaking.
pub fn is_sensitive_key(key: &str) -> bool {
    let lowered = key.to_ascii_lowercase();
    let normalized = lowered.replace('-', "_");
    SENSITIVE_KEY_FRAGMENTS
        .iter()
        .any(|fragment| lowered.contains(fragment) || normalized.contains(fragment))
}

/// Redacts secret-looking substrings in free-form text (error details, log
/// messages): HTTP `Authorization: Bearer ...` headers first (so the token
/// value is caught whole), then JSON-style `"api_key": "value"` and
/// `key=value` pairs, then long token-shaped strings.
pub fn redact_secrets(text: &str) -> String {
    let out = redact_bearer_headers(text);
    let out = redact_keyed_values(&out);
    redact_token_shapes(&out)
}

/// Recursively redacts values of sensitive keys in a JSON value.
pub fn redact_json(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for (key, val) in map.iter_mut() {
                if is_sensitive_key(key) {
                    if !val.is_null() {
                        *val = Value::String(REDACTED.to_string());
                    }
                } else {
                    redact_json(val);
                }
            }
        }
        Value::Array(items) => {
            for item in items.iter_mut() {
                redact_json(item);
            }
        }
        _ => {}
    }
}

fn redact_keyed_values(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(idx) = find_keyed_value(rest) {
        let (_key_start, _key_end, value_start, value_end) = idx;
        out.push_str(&rest[..value_start]);
        out.push_str(REDACTED);
        rest = &rest[value_end..];
    }
    out.push_str(rest);
    out
}

/// Finds `"key": "value"` or `key=value` where `key` is sensitive.
/// Returns `(key_start, key_end, value_start, value_end)` covering the value.
fn find_keyed_value(text: &str) -> Option<(usize, usize, usize, usize)> {
    let bytes = text.as_bytes();
    for i in 0..bytes.len() {
        // candidate key start: alnum or underscore
        if !(bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_') {
            continue;
        }
        let key_start = i;
        let mut j = i;
        while j < bytes.len() && (bytes[j].is_ascii_alphanumeric() || bytes[j] == b'_') {
            j += 1;
        }
        let key = &text[key_start..j];
        if !is_sensitive_key(key) {
            continue;
        }
        // skip whitespace, expect ':' or '='
        let mut k = j;
        while k < bytes.len() && (bytes[k] == b' ' || bytes[k] == b'\t') {
            k += 1;
        }
        if k >= bytes.len() || (bytes[k] != b':' && bytes[k] != b'=') {
            continue;
        }
        k += 1;
        while k < bytes.len() && (bytes[k] == b' ' || bytes[k] == b'\t') {
            k += 1;
        }
        if k >= bytes.len() {
            continue;
        }
        // quoted value
        if bytes[k] == b'"' || bytes[k] == b'\'' {
            let quote = bytes[k];
            let value_start = k;
            let mut m = k + 1;
            while m < bytes.len() && bytes[m] != quote {
                m += 1;
            }
            if m < bytes.len() {
                let value_end = m + 1;
                return Some((key_start, j, value_start, value_end));
            }
        } else {
            // bare value until whitespace, comma, or end
            let value_start = k;
            let mut m = k;
            while m < bytes.len()
                && bytes[m] != b' '
                && bytes[m] != b'\t'
                && bytes[m] != b','
                && bytes[m] != b'\n'
                && bytes[m] != b'\r'
                && bytes[m] != b'}'
            {
                m += 1;
            }
            if m > value_start {
                return Some((key_start, j, value_start, m));
            }
        }
    }
    None
}

fn redact_bearer_headers(text: &str) -> String {
    let lowered = text.to_ascii_lowercase();
    let mut out = String::with_capacity(text.len());
    let mut rest_start = 0usize;
    while let Some(rel) = lowered[rest_start..].find("bearer ") {
        let abs = rest_start + rel;
        let value_start = abs + "bearer ".len();
        let value_end = text[value_start..]
            .find(|c: char| c.is_whitespace())
            .map(|e| value_start + e)
            .unwrap_or(text.len());
        out.push_str(&text[rest_start..value_start]);
        out.push_str(REDACTED);
        rest_start = value_end;
    }
    out.push_str(&text[rest_start..]);
    out
}

/// Masks long token-shaped substrings such as OpenAI-style provider keys.
fn redact_token_shapes(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(rel) = rest.find("sk-") {
        let abs = rel;
        let prefix_end = abs + "sk-".len();
        let mut m = prefix_end;
        let bytes = rest.as_bytes();
        while m < bytes.len()
            && (bytes[m].is_ascii_alphanumeric() || bytes[m] == b'-' || bytes[m] == b'_')
        {
            m += 1;
        }
        if m - prefix_end >= 8 {
            out.push_str(&rest[..abs]);
            out.push_str(REDACTED);
            rest = &rest[m..];
        } else {
            out.push_str(&rest[..prefix_end]);
            rest = &rest[prefix_end..];
        }
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Builds a fake provider key at runtime so that no usable credential
    /// literal ever appears in source or test code.
    fn fake_provider_key() -> String {
        format!("sk-{}", "a".repeat(16))
    }

    #[test]
    fn sensitive_keys_are_detected() {
        assert!(is_sensitive_key("api_key"));
        assert!(is_sensitive_key("X-Api-Key"));
        assert!(is_sensitive_key("access_token"));
        assert!(is_sensitive_key("Authorization"));
        assert!(is_sensitive_key("client_secret"));
        assert!(!is_sensitive_key("topic"));
        assert!(!is_sensitive_key("vocabulary_size"));
    }

    #[test]
    fn redacts_json_style_secret_pairs() {
        let text = format!(
            "provider error: {}",
            json!({"api_key": fake_provider_key(), "model": "gpt"})
        );
        let redacted = redact_secrets(&text);
        assert!(redacted.contains(REDACTED));
        assert!(!redacted.contains(&fake_provider_key()));
        assert!(redacted.contains("gpt"));
    }

    #[test]
    fn redacts_key_equals_value_pairs() {
        let secret = "h".repeat(6) + "2";
        let redacted = redact_secrets(&format!("connect failed: password={secret} timeout=30"));
        assert!(redacted.contains("password=[redacted]"));
        assert!(redacted.contains("timeout=30"));
        assert!(!redacted.contains(&secret));
    }

    #[test]
    fn redacts_bearer_headers() {
        let payload = "e".repeat(12);
        let redacted = redact_secrets(&format!("Authorization: Bearer {payload}.sig"));
        // The credential value must be gone; the header label may itself be
        // rewritten by the keyed-value pass, which is safe.
        assert!(!redacted.contains(&payload), "token leaked: {redacted}");
        assert!(redacted.contains(REDACTED));
        assert!(redacted.starts_with("Authorization:"));
    }

    #[test]
    fn redacts_provider_key_shapes() {
        let key = fake_provider_key();
        let redacted = redact_secrets(&format!("request used {key} and failed"));
        assert_eq!(redacted, format!("request used {REDACTED} and failed"));
    }

    #[test]
    fn redacts_json_values_recursively() {
        let mut value = json!({
            "model": "gpt",
            "api_key": fake_provider_key(),
            "nested": {
                "session_token": String::from("abc"),
                "items": [{"password": String::from("x"), "ok": 1}]
            }
        });
        redact_json(&mut value);
        assert_eq!(value["model"], "gpt");
        assert_eq!(value["api_key"], REDACTED);
        assert_eq!(value["nested"]["session_token"], REDACTED);
        assert_eq!(value["nested"]["items"][0]["password"], REDACTED);
        assert_eq!(value["nested"]["items"][0]["ok"], 1);
    }

    #[test]
    fn leaves_plain_text_untouched() {
        let text = "task 42 failed after 3 retries (checkpoint k=5)";
        assert_eq!(redact_secrets(text), text);
    }
}
