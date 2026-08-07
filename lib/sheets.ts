import * as jose from "jose";
import { createHash } from "node:crypto";
import { PublicApiError } from "@/lib/api-errors";
import {
  buildGoogleSheetsTable,
  type GoogleSheetsColumn,
} from "@/lib/google-sheets-schema";
import { logWorkflowEvent } from "@/lib/operational-errors";
import type { Lead } from "@/lib/types";
import { acquireWorkloadLease } from "@/lib/workload-guards";
import { WORKLOAD_LIMITS } from "@/lib/workload-limits";

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
    gridProperties?: {
      columnCount?: number;
      rowCount?: number;
    };
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
  const escapedName = sheetName.replace(/'/g, "''");
  return encodeURIComponent(`'${escapedName}'!${range}`);
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
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title,gridProperties(columnCount,rowCount)))`,
  );
}

async function addSheet(token: string, spreadsheetId: string, sheetName: string) {
  const data = await sheetsRequest<{
    replies?: Array<{
      addSheet?: {
        properties?: {
          sheetId?: number;
          title?: string;
          gridProperties?: {
            columnCount?: number;
            rowCount?: number;
          };
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

async function resizeSheetColumns(token: string, spreadsheetId: string, sheetId: number, columnCount: number) {
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
                  columnCount,
                },
              },
              fields: "gridProperties.columnCount",
            },
          },
        ],
      }),
    },
  );
}

async function resetLeadSheetFormatting(
  token: string,
  spreadsheetId: string,
  sheetId: number,
  columnCount: number,
  rowCount: number,
) {
  await sheetsRequest(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            clearBasicFilter: {
              sheetId,
            },
          },
          {
            updateSheetProperties: {
              properties: {
                sheetId,
                gridProperties: {
                  frozenColumnCount: 0,
                  frozenRowCount: 0,
                },
              },
              fields: "gridProperties.frozenColumnCount,gridProperties.frozenRowCount",
            },
          },
          {
            repeatCell: {
              range: {
                sheetId,
                startColumnIndex: 0,
                endColumnIndex: columnCount,
              },
              cell: {
                userEnteredFormat: {},
                dataValidation: null,
                note: null,
              },
              fields: "userEnteredFormat,dataValidation,note",
            },
          },
          {
            updateDimensionProperties: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: 0,
                endIndex: Math.max(rowCount, 1),
              },
              properties: {
                pixelSize: 21,
              },
              fields: "pixelSize",
            },
          },
        ],
      }),
    },
  );
}

async function formatLeadSheet(
  token: string,
  spreadsheetId: string,
  sheetId: number,
  columns: readonly GoogleSheetsColumn[],
  rowCount: number,
) {
  const columnCount = columns.length;
  const requests: Record<string, unknown>[] = [
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
              borders: {
                bottom: {
                  style: "SOLID_MEDIUM",
                  color: {
                    red: 0.055,
                    green: 0.286,
                    blue: 0.78,
                  },
                },
              },
              horizontalAlignment: "LEFT",
            verticalAlignment: "MIDDLE",
            wrapStrategy: "CLIP",
            textFormat: {
              bold: true,
              fontSize: 10,
              foregroundColor: {
                red: 1,
                green: 1,
                blue: 1,
              },
            },
          },
        },
        fields:
          "userEnteredFormat(backgroundColor,borders,horizontalAlignment,verticalAlignment,wrapStrategy,textFormat)",
      },
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: "ROWS",
          startIndex: 0,
          endIndex: 1,
        },
        properties: {
          pixelSize: 36,
        },
        fields: "pixelSize",
      },
    },
  ];

  if (rowCount > 1) {
    requests.push(
      {
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount,
            startColumnIndex: 0,
            endColumnIndex: columnCount,
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: "LEFT",
              verticalAlignment: "MIDDLE",
              wrapStrategy: "CLIP",
              borders: {
                bottom: {
                  style: "SOLID",
                  color: {
                    red: 0.89,
                    green: 0.92,
                    blue: 0.96,
                  },
                },
              },
              textFormat: {
                fontSize: 10,
              },
            },
          },
          fields: "userEnteredFormat(horizontalAlignment,verticalAlignment,wrapStrategy,borders,textFormat.fontSize)",
        },
      },
      {
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: 1,
            endIndex: rowCount,
          },
          properties: {
            pixelSize: 40,
          },
          fields: "pixelSize",
        },
      },
    );
  }

  for (const [index, column] of columns.entries()) {
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: index,
          endIndex: index + 1,
        },
        properties: {
          pixelSize: column.width,
        },
        fields: "pixelSize",
      },
    });
  }

  if (rowCount > 1) {
    for (const [index, column] of columns.entries()) {
      if (column.wrapStrategy !== "WRAP") continue;
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount,
            startColumnIndex: index,
            endColumnIndex: index + 1,
          },
          cell: {
            userEnteredFormat: {
              wrapStrategy: "WRAP",
            },
          },
          fields: "userEnteredFormat.wrapStrategy",
        },
      });
    }

    for (const [index, column] of columns.entries()) {
      if (!column.plainText) continue;
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount,
            startColumnIndex: index,
            endColumnIndex: index + 1,
          },
          cell: {
            userEnteredFormat: {
              numberFormat: {
                type: "TEXT",
                pattern: "@",
              },
            },
          },
          fields: "userEnteredFormat.numberFormat",
        },
      });
    }
  }

  requests.push({
    setBasicFilter: {
      filter: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: Math.max(rowCount, 1),
          startColumnIndex: 0,
          endColumnIndex: columnCount,
        },
      },
    },
  });

  await sheetsRequest(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    },
  );
}

async function applyLeadSheetHyperlinks(
  token: string,
  spreadsheetId: string,
  sheetId: number,
  columns: readonly GoogleSheetsColumn[],
  rows: string[][],
) {
  if (!rows.length) return;

  const hyperlinkColumns = columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => column.hyperlink);

  for (let offset = 0; offset < rows.length; offset += WORKLOAD_LIMITS.exports.googleSheetsBatchRows) {
    const batch = rows.slice(offset, offset + WORKLOAD_LIMITS.exports.googleSheetsBatchRows);
    const requests = hyperlinkColumns.map(({ index }) => ({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: offset + 1,
          endRowIndex: offset + batch.length + 1,
          startColumnIndex: index,
          endColumnIndex: index + 1,
        },
        rows: batch.map((row) => {
          const value = row[index] ?? "";
          const hyperlink = isPublicHttpUrl(value);
          return {
            values: [
              {
                userEnteredValue: { stringValue: value },
                userEnteredFormat: hyperlink
                  ? { textFormat: { link: { uri: value } } }
                  : { textFormat: {} },
              },
            ],
          };
        }),
        fields: "userEnteredValue,userEnteredFormat.textFormat.link",
      },
    }));

    if (!requests.length) return;
    await sheetsRequest(
      token,
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests }),
      },
    );
  }
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

function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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

  return {
    sheetId,
    columnCount: Math.max(sheet?.properties?.gridProperties?.columnCount ?? 26, 1),
    rowCount: Math.max(sheet?.properties?.gridProperties?.rowCount ?? 1000, 1),
  };
}

function formattingWarning(error: unknown) {
  logWorkflowEvent("google-sheets", "formatting warning", {
    error: error instanceof Error ? error.message : "Unknown formatting error",
  });
  return "Google Sheets values synced, but some visual formatting could not be applied.";
}

async function replaceLeadSheet(
  spreadsheetId: string,
  sheetName: string,
  leads: Lead[],
) {
  const lockDigest = createHash("sha256")
    .update(`${spreadsheetId}|${sheetName.trim().toLowerCase()}`)
    .digest("hex");
  const lease = await acquireWorkloadLease(`google-sheets:replace:${lockDigest}`, 120);
  if (!lease) {
    throw new PublicApiError(
      "A sync is already running for this spreadsheet tab. Please wait for it to finish.",
      409,
      "SHEETS_SYNC_ALREADY_RUNNING",
    );
  }

  try {
    const token = await getAccessToken();
    const warnings: string[] = [];
    const table = buildGoogleSheetsTable(leads);
    const { sheetId, columnCount: previousColumnCount, rowCount: gridRowCount } = await getOrCreateSheet(
      token,
      spreadsheetId,
      sheetName,
    );

    await clearValues(token, spreadsheetId, sheetName, `A1:${columnName(previousColumnCount)}`);

    try {
      await resetLeadSheetFormatting(token, spreadsheetId, sheetId, previousColumnCount, gridRowCount);
    } catch (error) {
      warnings.push(formattingWarning(error));
    }

    await resizeSheetColumns(token, spreadsheetId, sheetId, table.headers.length);

    const endColumn = columnName(table.headers.length);
    await updateValues(token, spreadsheetId, sheetName, `A1:${endColumn}1`, [table.headers]);
    for (let offset = 0; offset < table.rows.length; offset += WORKLOAD_LIMITS.exports.googleSheetsBatchRows) {
      const batch = table.rows.slice(offset, offset + WORKLOAD_LIMITS.exports.googleSheetsBatchRows);
      const startRow = offset + 2;
      const endRow = startRow + batch.length - 1;
      await updateValues(token, spreadsheetId, sheetName, `A${startRow}:${endColumn}${endRow}`, batch);
    }

    try {
      await formatLeadSheet(token, spreadsheetId, sheetId, table.columns, table.rows.length + 1);
      await applyLeadSheetHyperlinks(token, spreadsheetId, sheetId, table.columns, table.rows);
    } catch (error) {
      warnings.push(formattingWarning(error));
    }

    logWorkflowEvent("google-sheets", "replace complete", {
      rows: table.rows.length,
      columns: table.headers.length,
      schema: table.headers.length > 12 ? "business_contacts_delivery_dynamic_v1" : "business_contacts_v1",
      batches: Math.ceil(table.rows.length / WORKLOAD_LIMITS.exports.googleSheetsBatchRows),
    });
    return warnings;
  } finally {
    await lease.release();
  }
}

export async function exportLeadsToSheet(
  spreadsheetId: string,
  leads: Lead[],
  sheetName = "Leads",
): Promise<SheetsExportResult> {
  const warnings = await replaceLeadSheet(spreadsheetId, sheetName, leads);

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
): Promise<SheetsExportResult> {
  const warnings = await replaceLeadSheet(spreadsheetId, sheetName, leads);

  return {
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    rowsWritten: leads.length,
    ...(warnings.length ? { warnings } : {}),
  };
}
