//! Released minors of contract major 1 (see `packages/schemas/README.md`).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SchemaVersionV1 {
    #[serde(rename = "1.0")]
    V1_0,
}
