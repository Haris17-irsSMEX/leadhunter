const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function safeSpreadsheetCell(value: unknown, maxLength = 20_000) {
  const text = value == null
    ? ""
    : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : "";
  const bounded = text.slice(0, Math.max(maxLength, 0));
  return FORMULA_PREFIX.test(bounded) ? `'${bounded}` : bounded;
}
