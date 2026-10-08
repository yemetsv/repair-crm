
import assert from "node:assert/strict";
import api from "../worker/index.js";

const users = {
  manager: {
    username: "manager",
    role: "manager",
    point: null
  },
  technosmart: {
    username: "technosmart",
    role: "staff",
    point: "Техносмарт"
  },
  vodafone: {
    username: "vodafone",
    role: "staff",
    point: "Vodafone"
  }
};

const rows = [
  ["ID", "Дата", "Точка", "Клієнт", "Телефон",
   "Пристрій", "IMEI/SN", "Опис", "Статус", "Ціна"],
  ["TEST-1", "", "Техносмарт", "Test client", "",
   "Test device", "", "", "Нові", "0"],
  ["TEST-2", "", "Vodafone", "Test client", "",
   "Test device", "", "", "Нові", "0"]
];

const originalFetch = globalThis.fetch;
const originalImportKey = crypto.subtle.importKey;
const originalSign = crypto.subtle.sign;

let writes = 0;

try {
  // Mock Google service-account signing.
  crypto.subtle.importKey = async () => ({});
  crypto.subtle.sign = async () => new Uint8Array(64).buffer;

  // Mock every outgoing network call.
  globalThis.fetch = async (url, options = {}) => {
    const address = String(url);

    if (address === "https://oauth2.googleapis.com/token") {
      return Response.json({
        access_token: "TEST-ACCESS-TOKEN"
      });
    }

    if (address.startsWith(
      "https://sheets.googleapis.com/v4/spreadsheets/"
    )) {
      if (options.method === "PUT") {
        writes++;
        return Response.json({ updatedCells: 1 });
      }

      if (options.method === "POST") {
        writes++;
        return Response.json({
          updates: { updatedRows: 1 }
        });
      }

      return Response.json({ values: rows });
    }

    throw new Error("Unexpected network request: " + address);
  };

  async function test(name, user, id, expectedStatus, expectedWrites) {
    writes = 0;

    const token = "a".repeat(64);

    const request = new Request(
      "https://test.example.com/",
      {
        method: "POST",
        headers: {
          Origin: "http://localhost:5173",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "updateStatus",
          id,
          status: "В роботі"
        })
      }
    );

    const env = {
      SESSIONS: {
        async get() {
          return user;
        }
      },
      GOOGLE_SERVICE_ACCOUNT: JSON.stringify({
        private_key:
          "-----BEGIN PRIVATE KEY-----\nAA==\n-----END PRIVATE KEY-----",
        client_email: "test@example.com"
      }),
      GOOGLE_SHEET_ID: "TEST-SHEET-ID"
    };

    const response = await api.fetch(request, env);
    const body = await response.json();

    assert.equal(
      response.status,
      expectedStatus,
      `${name}: unexpected HTTP status (${JSON.stringify(body)})`
    );

    assert.equal(
      writes,
      expectedWrites,
      `${name}: unexpected Google Sheets writes`
    );

    console.log(`PASS - ${name}`);
  }

  await test(
    "Vodafone denied Technosmart repair",
    users.vodafone,
    "TEST-1",
    403,
    0
  );

  await test(
    "Technosmart denied Vodafone repair",
    users.technosmart,
    "TEST-2",
    403,
    0
  );

  await test(
    "Manager updates Technosmart repair",
    users.manager,
    "TEST-1",
    200,
    1
  );

  await test(
    "Manager updates Vodafone repair",
    users.manager,
    "TEST-2",
    200,
    1
  );

  console.log("TOTAL: 4/4 PASS");

} finally {
  globalThis.fetch = originalFetch;
  crypto.subtle.importKey = originalImportKey;
  crypto.subtle.sign = originalSign;
}
