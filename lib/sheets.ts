import * as jose from "jose";
import type { Lead } from "@/lib/types";

export const HEADERS = [
  "Company Name",
  "Website",
  "Description",
  "Founder",
  "Email",
  "Phone",
  "LinkedIn",
  "Twitter",
  "Location",
  "Country",
  "Industry",
  "Employees",
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

type ValuesResponse = {
  values?: string[][];
};

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";

function cell(value: unknown) {
  if (value == null) {
    return "";
  }

  return String(value);
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
    cell(lead.company_name),
    cell(lead.website),
    cell(lead.description),
    cell(lead.founder_name),
    cell(lead.email),
    cell(lead.phone),
    cell(lead.linkedin_url),
    cell(lead.twitter_handle),
    cell(lead.location),
    cell(lead.country),
    cell(lead.industry),
    cell(lead.employee_count),
    cell(lead.pricing_model),
    Array.isArray(lead.tech_stack) ? lead.tech_stack.join(", ") : "",
    cell(lead.source),
    cell(lead.source_url),
    cell(lead.scraped_at),
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

async function getRangeValues(token: string, spreadsheetId: string, sheetName: string, range: string) {
  return sheetsRequest<ValuesResponse>(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetRange(sheetName, range)}`,
  );
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

async function boldHeaderRow(token: string, spreadsheetId: string, sheetId: number) {
  await sheetsRequest(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    bold: true,
                  },
                },
              },
              fields: "userEnteredFormat.textFormat.bold",
            },
          },
        ],
      }),
    },
  );
}

async function writeHeaders(token: string, spreadsheetId: string, sheetName: string, sheetId: number) {
  await updateValues(token, spreadsheetId, sheetName, "A1:Q1", [HEADERS]);
  await boldHeaderRow(token, spreadsheetId, sheetId);
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

  const existingHeader = await getRangeValues(token, spreadsheetId, sheetName, "A1:Q1");
  const hasData = Boolean(existingHeader.values?.some((row) => row.some((value) => cell(value).trim().length > 0)));

  if (!hasData) {
    await writeHeaders(token, spreadsheetId, sheetName, sheetId);
  }

  return sheet;
}

export async function exportLeadsToSheet(spreadsheetId: string, leads: Lead[], sheetName = "Leads") {
  const token = await getAccessToken();

  await getOrCreateSheet(token, spreadsheetId, sheetName);

  if (leads.length) {
    await appendValues(token, spreadsheetId, sheetName, "A1", leads.map(leadToRow));
  }

  return {
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    rowsWritten: leads.length,
  };
}

export async function syncLeadsToSheet(spreadsheetId: string, leads: Lead[], sheetName = "Leads") {
  const token = await getAccessToken();

  await getOrCreateSheet(token, spreadsheetId, sheetName);
  await clearValues(token, spreadsheetId, sheetName, "A2:Z");

  if (leads.length) {
    await appendValues(token, spreadsheetId, sheetName, "A2", leads.map(leadToRow));
  }

  return {
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    rowsWritten: leads.length,
  };
}
