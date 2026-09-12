// Detector test data (inert). Excluded from repository-wide scans.
// Frontend code must never read credential material, even from build-time env.
export const apiKey = import.meta.env.VITE_API_KEY;
