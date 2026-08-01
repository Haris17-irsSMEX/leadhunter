export type StructuredPerson = {
  name?: string;
  role?: string;
  email?: string;
  profileUrl?: string;
  sourceUrl: string;
};

export type StructuredPublicData = {
  people: StructuredPerson[];
  emails: string[];
  phones: string[];
  socialUrls: string[];
  organizationNames: string[];
  openGraph: { title?: string; url?: string };
};

function decodeHtml(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 10)))
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function values(value: unknown) {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function metaContent(html: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const direct = html.match(new RegExp(`<meta\\b[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["']`, "i"));
  const reversed = html.match(new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["']`, "i"));
  return decodeHtml((direct?.[1] ?? reversed?.[1] ?? "").trim()) || undefined;
}

function itemPropValues(html: string, itemProp: string) {
  const escaped = itemProp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<[^>]+itemprop=["']${escaped}["'][^>]*(?:content|href)=["']([^"']+)["'][^>]*>|<[^>]+itemprop=["']${escaped}["'][^>]*>([^<]+)`, "gi");
  return [...html.matchAll(pattern)].map((match) => decodeHtml((match[1] ?? match[2] ?? "").trim())).filter(Boolean);
}

export function extractStructuredPublicData(html: string, sourceUrl: string): StructuredPublicData {
  const people: StructuredPerson[] = [];
  const emails = new Set<string>();
  const phones = new Set<string>();
  const socialUrls = new Set<string>();
  const organizationNames = new Set<string>();

  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1] ?? "")) as unknown;
      const queue = values(parsed);
      const visited = new Set<object>();
      while (queue.length) {
        const current = queue.shift();
        if (!current || typeof current !== "object") continue;
        if (visited.has(current)) continue;
        visited.add(current);
        if (Array.isArray(current)) {
          queue.push(...current);
          continue;
        }
        const record = current as Record<string, unknown>;
        const types = values(record["@type"]).map((value) => String(value).toLowerCase());
        const isPerson = types.includes("person");
        const isOrganization = types.some((value) => ["organization", "localbusiness", "corporation", "professionalservice"].includes(value));
        const email = text(record.email)?.replace(/^mailto:/i, "");
        const phone = text(record.telephone);
        if (email) emails.add(email);
        if (phone) phones.add(phone);
        for (const url of [...values(record.sameAs), ...values(record.url)].map(text).filter(Boolean) as string[]) {
          if (/^https?:\/\//i.test(url)) socialUrls.add(url);
        }
        if (isPerson) {
          people.push({
            name: text(record.name),
            role: text(record.jobTitle) ?? text(record.role),
            email,
            profileUrl: ([...values(record.sameAs), record.url].map(text).find((value) => value && /^https?:\/\//i.test(value))),
            sourceUrl,
          });
        }
        if (isOrganization) {
          const name = text(record.name);
          if (name) organizationNames.add(name);
        }
        for (const value of Object.values(record)) if (value && typeof value === "object") queue.push(value);
      }
    } catch {
      // Invalid third-party JSON-LD is ignored rather than failing public research.
    }
  }

  for (const email of itemPropValues(html, "email")) emails.add(email.replace(/^mailto:/i, ""));
  for (const phone of itemPropValues(html, "telephone")) phones.add(phone);
  for (const url of itemPropValues(html, "sameAs")) if (/^https?:\/\//i.test(url)) socialUrls.add(url);

  return {
    people,
    emails: [...emails],
    phones: [...phones],
    socialUrls: [...socialUrls],
    organizationNames: [...organizationNames],
    openGraph: {
      title: metaContent(html, "og:title"),
      url: metaContent(html, "og:url"),
    },
  };
}
