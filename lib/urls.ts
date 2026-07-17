const PRIVATE_IPV4_PATTERNS = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
];

export function normalizePublicHttpUrl(value: string) {
  const trimmed = value.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  const hostname = url.hostname.toLowerCase();

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }

  if (
    !hostname ||
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(hostname))
  ) {
    throw new Error("Enter a public website URL.");
  }

  if (url.username || url.password) {
    throw new Error("URLs containing credentials are not supported.");
  }

  url.hash = "";
  return url.toString();
}
