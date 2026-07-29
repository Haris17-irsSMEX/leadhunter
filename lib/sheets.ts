import * as jose from "jose";
import { buildLeadExportTable, type LeadExportProfile } from "@/lib/lead-export";
import type { Lead } from "@/lib/types";

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

async function formatLeadSheet(token: string, spreadsheetId: string, sheetId: number, columnCount: number) {
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
                endColumnIndex: columnCount,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.078,
                    green: 0.388,
                    blue: 1,
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
                endIndex: columnCount,
              },
            },
          },
        ],
      }),
    },
  );
}

async function writeHeaders(token: string, spreadsheetId: string, sheetName: string, headers: string[]) {
  const endColumn = columnName(headers.length);
  await clearValues(token, spreadsheetId, sheetName, "A1:AZ1");
  await updateValues(token, spreadsheetId, sheetName, `A1:${endColumn}1`, [headers]);
}

function columnName(count: number) {
  let value = Math.max(count, 1);
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

async function getOrCreateSheet(token: string, spreadsheetId: string, sheetName: string, headers: string[]) {
  const metadata = await getSpreadsheetMetadata(token, spreadsheetId);
  let sheet = metadata.sheets?.find((item) => item.properties?.title === sheetName);

  if (!sheet) {
    sheet = await addSheet(token, spreadsheetId, sheetName);
  }

  const sheetId = sheet?.properties?.sheetId;

  if (sheetId == null) {
    throw new Error(`Unable to resolve sheet "${sheetName}"`);
  }

  await writeHeaders(token, spreadsheetId, sheetName, headers);

  return { sheet, sheetId };
}

function formattingWarning(error: unknown) {
  const detail = error instanceof Error ? error.message : "Unknown formatting error";
  return `Google Sheets values synced, but formatting could not be applied: ${detail}`;
}

export async function exportLeadsToSheet(
  spreadsheetId: string,
  leads: Lead[],
  sheetName = "Leads",
  profile: LeadExportProfile = "standard",
): Promise<SheetsExportResult> {
  const token = await getAccessToken();
  const warnings: string[] = [];
  const table = buildLeadExportTable(leads, profile);

  const { sheetId } = await getOrCreateSheet(token, spreadsheetId, sheetName, table.headers);

  if (leads.length) {
    await appendValues(token, spreadsheetId, sheetName, "A1", table.rows);
  }

  try {
    await formatLeadSheet(token, spreadsheetId, sheetId, table.headers.length);
  } catch (error) {
    warnings.push(formattingWarning(error));
  }

  return {
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    rowsWritten: leads.length,
    ...(warnings.length ? { warnings } : {}),
  };
}

export async function syncLeadsToSheet(
  spreadsheetId: string,
  leads: Lead[],
  sheetName = "Leads",
  profile: LeadExportProfile = "standard",
): Promise<SheetsExportResult> {
  const token = await getAccessToken();
  const warnings: string[] = [];
  const table = buildLeadExportTable(leads, profile);

  const { sheetId } = await getOrCreateSheet(token, spreadsheetId, sheetName, table.headers);
  await clearValues(token, spreadsheetId, sheetName, "A2:AZ");

  if (leads.length) {
    await appendValues(token, spreadsheetId, sheetName, "A2", table.rows);
  }

  try {
    await formatLeadSheet(token, spreadsheetId, sheetId, table.headers.length);
  } catch (error) {
    warnings.push(formattingWarning(error));
  }

  return {
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    rowsWritten: leads.length,
    ...(warnings.length ? { warnings } : {}),
  };
}
