const GENERIC_GOOGLE_CATEGORIES = new Set([
  "business",
  "establishment",
  "local business",
  "point of interest",
  "service",
]);

const ACRONYMS = new Map([
  ["ai", "AI"],
  ["b2b", "B2B"],
  ["crm", "CRM"],
  ["hvac", "HVAC"],
  ["ppc", "PPC"],
  ["saas", "SaaS"],
  ["seo", "SEO"],
]);

function humanizeCategory(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => ACRONYMS.get(word.toLowerCase()) ?? `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

export function getCleanCategoryLabels(value?: string | null) {
  const labels = (value ?? "")
    .split(/[,;|]/)
    .map(humanizeCategory)
    .filter((label) => label && !GENERIC_GOOGLE_CATEGORIES.has(label.toLowerCase()));

  const unique = [...new Set(labels)];
  return unique.filter((label) => {
    const normalized = label.toLowerCase();
    return !unique.some((other) => {
      const otherNormalized = other.toLowerCase();
      return otherNormalized !== normalized && otherNormalized.length > normalized.length && otherNormalized.includes(normalized);
    });
  });
}

export function getCategorySummary(value?: string | null, max = 3) {
  return getCleanCategoryLabels(value).slice(0, Math.max(1, max)).join(", ");
}
