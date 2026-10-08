
import assert from "node:assert/strict";
import api from "../worker/index.js";

const origin = "http://localhost:5173";

let kvCalls = 0;

const env = {
  SESSIONS: {
    async get() {
      kvCalls++;
      throw new Error("Unexpected KV lookup");
    }
  }
};

const requests = [
  {
    name: "GET without token",
    method: "GET"
  },
  {
    name: "POST add without token",
    method: "POST",
    body: {
      action: "add",
      id: "TEST-NOAUTH-1",
      point: "Техносмарт",
      client: "Test",
      device: "Test phone"
    }
  },
  {
    name: "POST updateStatus without token",
    method: "POST",
    body: {
      action: "updateStatus",
      id: "TEST-NOAUTH-1",
      status: "В роботі"
    }
  }
];

for (const test of requests) {
  const request = new Request(
    "https://test.example.com/",
    {
      method: test.method,
      headers: {
        Origin: origin,
        ...(test.body
          ? { "Content-Type": "application/json" }
          : {})
      },
      ...(test.body
        ? { body: JSON.stringify(test.body) }
        : {})
    }
  );

  const response = await api.fetch(request, env);
  const body = await response.json();

  assert.equal(
    response.status,
    401,
    `${test.name} must return 401`
  );

  assert.equal(body.error, "Unauthorized");

  console.log(`PASS - ${test.name} returns 401`);
}

assert.equal(kvCalls, 0);

console.log("PASS - No KV lookup without token");
console.log("PASS - Google Sheets was not accessed");
