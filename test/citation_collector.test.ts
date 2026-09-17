import assert from "node:assert/strict";
import test from "node:test";
import { CitationCollector, type CitationRequest } from "../src/citation_collector.js";
import type { CitationIndex } from "../src/citation_collector.js";

const delivered: CitationRequest = {
  shipmentEvent: { shipmentId: "SHP-2048", eventType: "delivered", occurredAt: "2026-08-14T10:30:00Z" },
  source: {
    url: "https://research.example/carrier-pod-study",
    title: "Carrier proof-of-delivery study",
    excerpt: "Signed delivery records reduce ambiguity in final-mile shipment research.",
  },
  proofOfDelivery: { documentId: "POD-77", sha256: "a".repeat(64) },
};

test("keeps the existing citation when semantic similarity crosses the threshold", async () => {
  let writes = 0;
  const index: CitationIndex = {
    embedding: async () => [0.2, 0.8],
    query: async () => [{ id: "citation-existing", score: 0.96 }],
    upsert: async () => { writes += 1; },
  };

  const decision = await new CitationCollector(index).collect(delivered);

  assert.deepEqual(decision, {
    status: "duplicate",
    citationId: "61e40689aae752ccd9113d45944256a41c6a06a48571622d1cd06ff12fcd48ba",
    duplicateOf: "citation-existing",
    similarity: 0.96,
  });
  assert.equal(writes, 0);
});
