import * as jose from "jose";
import { getBestContactMethod, getContactabilityStatus, getContactPageUrl } from "@/lib/contactability";
import { deliveryStatusLabelForLead } from "@/lib/delivery-status-label";
import { cleanSafePublicEmail } from "@/lib/email-safety";
import type { Lead } from "@/lib/types";

export const HEADERS = [
  "Company Name",
  "Website",
  "Best Contact Method",
  "Contactability",
  "Email",
  "Email Source",
  "Email Confidence",
  "Contact Page URL",
  "Phone",
  "Location",
  "Country",
  "Industry",
  "Uber Eats",
  "Uber Eats Menu URL",
  "Uber Eats Confidence",
  "DoorDash",
  "DoorDash Menu URL",
  "DoorDash Confidence",
  "Grubhub",
  "Grubhub Menu URL",
  "Grubhub Confidence",
  "Deliveroo",
  "Deliveroo Menu URL",
  "Deliveroo Confidence",
  "Just Eat",
  "Just Eat Menu URL",
  "Just Eat Confidence",
  "Restaurant Enrichment",
  "Description",
  "Founder Name",
  "LinkedIn",
  "Twitter",
  "Employee Count",
  "Pricing",
  "Tech Stack",
  "Source",
  "Source URL",
  "Scraped At",
];

export class GoogleSheetsNotConfiguredError extends Error {
  constructor() {
    super("Google Sheets not configured");
    this.name = "GoogleSheetsNotConfiguredError";
  }
}

type ResolvedGoogleCredentials = {
  client_email: string;
  private_key: string;
};

type SpreadsheetSheet = {
  properties?: {
    sheetId?: number;
    title?: string;
  };
};

type SpreadsheetMetadata = {
  sheets?: SpreadsheetSheet[];
};

type SheetsExportResult = {
  spreadsheetUrl: string;
  rowsWritten: number;
  warnings?: string[];
};

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";

function cleanText(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ");
  }

  return value?.trim() ?? "";
}

function cleanNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function restaurantEnrichmentLabel(value: Lead["restaurant_enrichment_status"]) {
  const labels = {
    completed: "Completed",
    partial: "Partial",
    error: "Error",
    not_checked: "Not checked",
  };

  return value ? labels[value] : "";
}

function sourceLabel(source: Lead["source"]) {
  const labels: Record<Lead["source"], string> = {
    website: "Website",
    google_maps: "Google Maps",
    directory: "Directory",
    hackernews: "Hacker News",
    reddit: "Reddit",
    indiehackers: "Indie Hackers",
    producthunt: "Product Hunt",
  };

  return labels[source] ?? cleanText(source);
}

function formatDate(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return cleanText(value);
  }

  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

function getCredentials(): ResolvedGoogleCredentials {
  const b64 = process.env.GOOGLE_CREDENTIALS_B64;

  if (!b64) {
    throw new Error("GOOGLE_CREDENTIALS_B64 not set");
  }

  const credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf-8")) as {
    client_email?: string;
    private_key?: string;
  };

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("GOOGLE_CREDENTIALS_B64 is missing client_email or private_key");
  }

  return {
    client_email: credentials.client_email,
    private_key: credentials.private_key,
  };
}

export function leadToRow(lead: Lead): string[] {
  return [
    cleanText(lead.company_name),
    cleanText(lead.website),
    getBestContactMethod(lead),
    getContactabilityStatus(lead),
    cleanSafePublicEmail(lead.email),
    cleanSafePublicEmail(lead.email) ? cleanText(lead.email_source_url) : "",
    cleanSafePublicEmail(lead.email) ? cleanNumber(lead.email_confidence) : "",
    cleanText(getContactPageUrl(lead)),
    cleanText(lead.phone),
    cleanText(lead.location),
    cleanText(lead.country),
    cleanText(lead.industry),
    deliveryStatusLabelForLead(lead, "ubereats"),
    cleanText(lead.delivery_ubereats_menu_url),
    cleanNumber(lead.delivery_ubereats_confidence),
    deliveryStatusLabelForLead(lead, "doordash"),
    cleanText(lead.delivery_doordash_menu_url),
    cleanNumber(lead.delivery_doordash_confidence),
    deliveryStatusLabelForLead(lead, "grubhub"),
    cleanText(lead.delivery_grubhub_menu_url),
    cleanNumber(lead.delivery_grubhub_confidence),
    deliveryStatusLabelForLead(lead, "deliveroo"),
    cleanText(lead.delivery_deliveroo_menu_url),
    cleanNumber(lead.delivery_deliveroo_confidence),
    deliveryStatusLabelForLead(lead, "justeat"),
    cleanText(lead.delivery_justeat_menu_url),
    cleanNumber(lead.delivery_justeat_confidence),
    restaurantEnrichmentLabel(lead.restaurant_enrichment_status),
    cleanText(lead.description),
    cleanText(lead.founder_name),
    cleanText(lead.linkedin_url),
    cleanText(lead.twitter_handle),
    cleanText(lead.employee_count),
    cleanText(lead.pricing_model),
    cleanText(lead.tech_stack),
    sourceLabel(lead.source),
    cleanText(lead.source_url),
    formatDate(lead.scraped_at),
  ];
}

function sheetRange(sheetName: string, range: string) {
  return encodeURIComponent(`${sheetName}!${range}`);
}

async function getAccessToken(): Promise<string> {
  const credentials = getCredentials();
  const privateKey = await jose.importPKCS8(credentials.private_key.replace(/\\n/g, "\n"), "RS256");
  const clientEmail = credentials.client_email;
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new jose.SignJWT({
    iss: clientEmail,
    scope: SHEETS_SCOPE,
    aud: TOKEN_AUDIENCE,
    iat: now,
    exp: now + 3600,
  })
    .setProtectedHeader({ alg: "RS256" })
    .sign(privateKey);

  const response = await fetch(TOKEN_AUDIENCE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = (await response.json()) as { access_token?: string; error?: string; error_description?: string };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? "Unable to fetch Google Sheets access token");
  }

  return data.access_token;
}

async function sheetsRequest<T>(token: string, input: string, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  const contentType = response.headers.get("content-type") ?? "";
  let payload: T | { error?: { message?: string } } | { error?: string } | null = null;

  if (contentType.includes("application/json")) {
    payload = (await response.json()) as T | { error?: { message?: string } } | { error?: string };
  } else if (!response.ok) {
    const text = await response.text();
    payload = { error: text.slice(0, 200) };
  }

  if (!response.ok) {
    const message =
      (typeof payload === "object" &&
        payload &&
        "error" in payload &&
        (typeof payload.error === "string" ? payload.error : payload.error?.message)) ||
      `Google Sheets request failed (${response.status})`;
    throw new Error(message);
  }

  return payload as T;
}

async function getSpreadsheetMetadata(token: string, spreadsheetId: string) {
  return sheetsRequest<SpreadsheetMetadata>(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
  );
}

async function addSheet(token: string, spreadsheetId: string, sheetName: string) {
  const data = await sheetsRequest<{
    replies?: Array<{
      addSheet?: {
        properties?: {
          sheetId?: number;
          title?: string;
        };
      };
    }>;
  }>(token, `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          addSheet: {
            properties: {
              title: sheetName,
            },
          },
        },
      ],
    }),
  });

  return data.replies?.[0]?.addSheet;
}

async function updateValues(
  token: string,
  spreadsheetId: string,
  sheetName: string,
  range: string,
  values: string[][],
) {
  return sheetsRequest(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetRange(sheetName, range)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    },
  );
}

async function appendValues(
  token: string,
  spreadsheetId: string,
  sheetName: string,
  range: string,
  values: string[][],
) {
  return sheetsRequest(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetRange(sheetName, range)}:append?valueInputOption=RAW`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    },
  );
}

async function clearValues(token: string, spreadsheetId: string, sheetName: string, range: string) {
  return sheetsRequest(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetRange(sheetName, range)}:clear`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
}

async function formatLeadSheet(token: string, spreadsheetId: string, sheetId: number) {
  await sheetsRequest(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            updateSheetProperties: {
              properties: {
                sheetId,
                gridProperties: {
                  frozenRowCount: 1,
                },
              },
              fields: "gridProperties.frozenRowCount",
            },
          },
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: HEADERS.length,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.486,
                    green: 0.361,
                    blue: 0.988,
                  },
                  textFormat: {
                    bold: true,
                    foregroundColor: {
                      red: 1,
                      green: 1,
                      blue: 1,
                    },
                  },
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat)",
            },
          },
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId,
                dimension: "COLUMNS",
                startIndex: 0,
                endIndex: HEADERS.length,
              },
            },
          },
        ],
      }),
    },
  );
}

async function writeHeaders(token: string, spreadsheetId: string, sheetName: string) {
  await updateValues(token, spreadsheetId, sheetName, "A1:AL1", [HEADERS]);
}

async function getOrCreateSheet(token: string, spreadsheetId: string, sheetName: string) {
  const metadata = await getSpreadsheetMetadata(token, spreadsheetId);
  let sheet = metadata.sheets?.find((item) => item.properties?.title === sheetName);

  if (!sheet) {
    sheet = await addSheet(token, spreadsheetId, sheetName);
  }

  const sheetId = sheet?.properties?.sheetId;

  if (sheetId == null) {
    throw new Error(`Unable to resolve sheet "${sheetName}"`);
  }

  await writeHeaders(token, spreadsheetId, sheetName);

  return { sheet, sheetId };
}

function formattingWarning(error: unknown) {
  const detail = error instanceof Error ? error.message : "Unknown formatting error";
  return `Google Sheets values synced, but formatting could not be applied: ${detail}`;
}

export async function exportLeadsToSheet(spreadsheetId: string, leads: Lead[], sheetName = "Leads"): Promise<SheetsExportResult> {
  const token = await getAccessToken();
  const warnings: string[] = [];

  const { sheetId } = await getOrCreateSheet(token, spreadsheetId, sheetName);

  if (leads.length) {
    await appendValues(token, spreadsheetId, sheetName, "A1", leads.map(leadToRow));
  }

  try {
    await formatLeadSheet(token, spreadsheetId, sheetId);
  } catch (error) {
    warnings.push(formattingWarning(error));
  }

  return {
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    rowsWritten: leads.length,
    ...(warnings.length ? { warnings } : {}),
  };
}

export async function syncLeadsToSheet(spreadsheetId: string, leads: Lead[], sheetName = "Leads"): Promise<SheetsExportResult> {
  const token = await getAccessToken();
  const warnings: string[] = [];

  const { sheetId } = await getOrCreateSheet(token, spreadsheetId, sheetName);
  await clearValues(token, spreadsheetId, sheetName, "A2:AL");

  if (leads.length) {
    await appendValues(token, spreadsheetId, sheetName, "A2", leads.map(leadToRow));
  }

  try {
    await formatLeadSheet(token, spreadsheetId, sheetId);
  } catch (error) {
    warnings.push(formattingWarning(error));
  }

  return {
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    rowsWritten: leads.length,
    ...(warnings.length ? { warnings } : {}),
  };
}
