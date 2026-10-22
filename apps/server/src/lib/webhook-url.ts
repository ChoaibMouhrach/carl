const PRIVATE_HOST =
  /^(localhost|.*\.localhost|.*\.local|.*\.internal|127\..*|10\..*|192\.168\..*|172\.(1[6-9]|2\d|3[01])\..*|169\.254\..*|0\.0\.0\.0|\[::1?\])$/i;

/** The public address FullEnrich can call, or null when the API is only reachable from this machine or network */
export const emailFinderWebhookUrl = (apiUrl: string) => {
  try {
    const url = new URL("/api/webhooks/email-finder", apiUrl);

    if (!/^https?:$/.test(url.protocol)) return null;
    if (PRIVATE_HOST.test(url.hostname)) return null;

    return url.toString();
  } catch {
    return null;
  }
};
