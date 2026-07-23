const EMAIL_ONLY_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const UUID_LIKE_REGEX = /[a-f0-9]{8}[-_]?[a-f0-9]{4}[-_]?[a-f0-9]{4}[-_]?[a-f0-9]{4}[-_]?[a-f0-9]{12}/i;
const ASSET_EXTENSION_REGEX = /\.(png|jpe?g|webp|gif|svg|css|js)(\b|[?#])/i;
const IGNORED_EMAILS = new Set([
  "user@domain.com",
  "your@email.com",
  "example@example.com",
  "example@domain.com",
  "example@email.com",
  "email@example.com",
  "admin@example.com",
  "support@example.com",
  "test@test.com",
]);

export function isSafePublicEmail(email?: string | null, context = "") {
  const normalized = email?.trim().toLowerCase();

  if (!normalized || !EMAIL_ONLY_REGEX.test(normalized)) {
    return false;
  }

  const [local = "", domain = ""] = normalized.split("@");
  const contextLower = context.toLowerCase();

  return (
    !IGNORED_EMAILS.has(normalized) &&
    local.length <= 40 &&
    !UUID_LIKE_REGEX.test(local) &&
    !UUID_LIKE_REGEX.test(normalized) &&
    !local.includes("donotreply") &&
    !local.includes("do-not-reply") &&
    !local.includes("noreply") &&
    !local.includes("no-reply") &&
    !domain.startsWith("domain.") &&
    !domain.startsWith("example.") &&
    !normalized.endsWith("@example.com") &&
    !ASSET_EXTENSION_REGEX.test(normalized) &&
    !ASSET_EXTENSION_REGEX.test(contextLower) &&
    !/\b(src|srcset|data-src|image|captcha|asset|stylesheet|script)\b/i.test(contextLower)
  );
}

export function cleanSafePublicEmail(email?: string | null, context = "") {
  const trimmed = email?.trim();
  return trimmed && isSafePublicEmail(trimmed, context) ? trimmed : "";
}
