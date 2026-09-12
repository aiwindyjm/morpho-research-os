// Detector test data (inert): the APPROVED pattern. Typed service boundary
// calling Tauri commands through the invoke layer is allowed.
import { invoke } from "@tauri-apps/api/core";

export function listProjects() {
  return invoke("list_projects");
}
