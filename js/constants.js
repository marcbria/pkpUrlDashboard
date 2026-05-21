// ============================================================
// constants.js - Shared constants for the application
// ============================================================

export const PROXY_PATH = "proxy.php";
export const EXTERNAL_DELAY_US = 0;		// Delay for external petitions (to avoid blocking)
export const CSV_FILE = "./configs/journals.csv";
export const ENDPOINTS_FILE = "./configs/endpoints.json";
export const CLEANUP_WAIT_SECONDS = 70;	// Countdown to let petitions finish
export const FETCH_TIMEOUT_MS = 10000;  // Timeout for each proxy request (10 seconds)
