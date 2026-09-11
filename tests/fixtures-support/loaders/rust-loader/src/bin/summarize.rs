//! Prints the canonical FIXTURE_SUMMARY line for the golden fixtures so the
//! PowerShell runner can compare Node, Python, and Rust output byte for byte.
//! Must be started with the repository root as an ancestor of the crate
//! (repo_root() resolves the VERSION marker).

use morpho_fixture_loader::{load_fixture_envelopes, repo_root, summary_line};

fn main() {
    let root = match repo_root() {
        Ok(root) => root,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    };
    let fixtures_dir = root.join("examples").join("fixtures");
    let schemas_dir = root.join("packages").join("schemas");
    match load_fixture_envelopes(&fixtures_dir, &schemas_dir) {
        Ok(fixtures) => println!("FIXTURE_SUMMARY {}", summary_line(&fixtures)),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
