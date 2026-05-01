const DEFAULT_API_URL = "http://127.0.0.1:8000";
const DEFAULT_WS_DIRECT_URL = "wss://websocket-service-7hek.onrender.com";

function normalizeWsUrl(url) {
    const trimmed = (url || "").replace(/\/$/, "");
    if (!trimmed) return trimmed;
    if (trimmed.startsWith("wss://") || trimmed.startsWith("ws://")) return trimmed;
    if (trimmed.startsWith("https://")) return trimmed.replace("https://", "wss://");
    if (trimmed.startsWith("http://")) return trimmed.replace("http://", "ws://");
    return `ws://${trimmed}`;
}

export function getApiBaseUrl() {
    return (process.env.REACT_APP_API_URL || DEFAULT_API_URL).replace(/\/$/, "");
}

export function getWsBaseUrl() {
    const explicitWsUrl = process.env.REACT_APP_WS_URL;
    if (explicitWsUrl) {
        const normalized = normalizeWsUrl(explicitWsUrl);
        if (normalized.includes("your-docs.onrender.com")) {
            return DEFAULT_WS_DIRECT_URL;
        }
        return normalized;
    }

    return DEFAULT_WS_DIRECT_URL;
}

export function getDocWsUrl(docId, token) {
    const wsBaseUrl = getWsBaseUrl();
    const encodedToken = encodeURIComponent(token || "");
    return `${wsBaseUrl}/ws/${docId}?token=${encodedToken}`;
}
