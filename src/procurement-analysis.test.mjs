import assert from "node:assert/strict";
import test from "node:test";
import { buildAnalysisJob, extractAnalysisResult, analysisSession } from "./procurement-analysis.js";

test("all migrated operations create isolated analysis jobs", () => {
  for (const operation of ["commercial_parse", "multi_rfq_quote_parser", "quote_ranking"]) {
    const a = buildAnalysisJob({ operation, data: { message: "Supplier data" }, schema: { type: "object" } });
    const b = buildAnalysisJob({ operation, data: {}, schema: {} });
    assert.notEqual(a.sessionKey, b.sessionKey);
    assert.equal(analysisSession(a.sessionKey), true);
    assert.equal(analysisSession("agent:main:whatsapp:direct:+123"), false);
    assert.match(a.prompt, /untrusted data/);
  }
});

test("rejects unknown operations and unbounded input", () => {
  assert.throws(() => buildAnalysisJob({ operation: "send_whatsapp", data: {}, schema: {} }));
  assert.throws(() => buildAnalysisJob({ operation: "toString", data: {}, schema: {} }));
  assert.throws(() => buildAnalysisJob({ operation: "commercial_parse", data: { text: "x".repeat(150001) }, schema: {} }));
});

test("extracts JSON from both known CLI response envelopes", () => {
  const payloads = [{ text: '{"items":[]}' }];
  assert.deepEqual(extractAnalysisResult({ payloads }), { items: [] });
  assert.deepEqual(extractAnalysisResult({ status: "ok", result: { payloads } }), { items: [] });
  assert.deepEqual(extractAnalysisResult({ final: '```json\n{"items":[]}\n```' }), { items: [] });
});

test("fails closed on unsuccessful, missing or prose output", () => {
  for (const payload of [null, { status: "error", final: '{}' }, { result: {} },
    { final: 'I think {"items":[]}' }, { final: '[]' }, { final: 'null' }]) {
    assert.throws(() => extractAnalysisResult(payload));
  }
});
