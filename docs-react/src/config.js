const DEFAULT_API_URL = "http://127.0.0.1:8000";

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
        return normalizeWsUrl(explicitWsUrl);
    }

    const apiUrl = getApiBaseUrl();
    if (apiUrl.startsWith("https://")) {
        return apiUrl.replace("https://", "wss://");
    }

    if (apiUrl.startsWith("http://")) {
        return apiUrl.replace("http://", "ws://");
    }

    return apiUrl;
}

export function getDocWsUrl(docId, token) {
    const wsBaseUrl = getWsBaseUrl();
    const encodedToken = encodeURIComponent(token || "");
    return `${wsBaseUrl}/ws/${docId}?token=${encodedToken}`;
}
