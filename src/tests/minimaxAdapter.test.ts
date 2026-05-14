import assert from "node:assert/strict";
import { createMiniMaxAdapter, MiniMaxUnavailableError } from "../agent/minimaxAdapter";

const missingKeyAdapter = createMiniMaxAdapter({ apiKey: "", mock: true });

assert.equal(missingKeyAdapter.configured, false, "empty MiniMax key should mean adapter is not configured");

await assert.rejects(
  () => missingKeyAdapter.complete({ messages: [{ role: "user", content: "hello" }] }),
  MiniMaxUnavailableError,
  "MiniMax completions should be blocked without an API key, even in mock mode",
);

const keyedMockAdapter = createMiniMaxAdapter({ apiKey: "test-key", mock: true });
const response = await keyedMockAdapter.complete({ messages: [{ role: "user", content: "summarize this run" }] });

assert.equal(keyedMockAdapter.configured, true, "provided MiniMax key should configure adapter");
assert.equal(response.usedMock, true, "explicit mock mode should still be available for tests when a key exists");
assert.match(response.content, /Operator Analysis/, "mock response should render an operator analysis");

console.log("PlayLens MiniMax adapter tests passed.");

