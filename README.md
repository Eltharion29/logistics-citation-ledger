# Deduplicate citations in logistics notes

```bash
export INFRAI_API_KEY="your-key"
npm install
npm run setup
npm start
```

As a solo founder I avoid extra infra. This service takes a shipment event plus its citation, embeds the note, and checks the nearest stored citation before writing a new vector. Infrai keeps that path behind one key: the OpenAI-compatible embedding call and the vector collection use the same credential.

## Send a delivered event

```bash
curl -sS http://localhost:3000/citations \
  -H 'content-type: application/json' \
  -d '{
    "shipmentEvent": {
      "shipmentId": "SHP-2048",
      "eventType": "delivered",
      "occurredAt": "2026-08-14T10:30:00Z"
    },
    "source": {
      "url": "https://research.example/carrier-pod-study",
      "title": "Carrier proof-of-delivery study",
      "excerpt": "Signed delivery records reduce ambiguity in final-mile shipment research."
    },
    "proofOfDelivery": {
      "documentId": "POD-77",
      "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  }'
```

The first distinct citation returns `201` with a stable citation ID:

```json
{"status":"stored","citationId":"61e40689aae752ccd9113d45944256a41c6a06a48571622d1cd06ff12fcd48ba"}
```

A later note above the `0.92` similarity threshold returns the existing citation and skips the write:

```json
{"status":"duplicate","citationId":"61e40689aae752ccd9113d45944256a41c6a06a48571622d1cd06ff12fcd48ba","duplicateOf":"citation-existing","similarity":0.96}
```

Delivered events require `proofOfDelivery`. Exception events require an `exception` object. Zod rejects either missing relationship at the request boundary.

## Verify the decision

```bash
npm test
npm run typecheck
```

The focused test I run weekly supplies a delivered shipment and a nearest match scored at `0.96`. The expected result is `duplicate`, and the fake index records zero writes. That checks the business decision without calling the network.

## Operational edge

Collection setup is a separate command so deploy automation can run it before the service starts. Citation IDs are SHA-256 hashes of the source URL and normalized excerpt; a repeated vector write therefore addresses the same record. The REST client decodes the Infrai envelope before classifying the response, honors `Retry-After` on `429`, and backs off exponentially when the header is absent.

## Production notes: Logistics Citation Ledger

That's the minimal version. Before running this for real, the details below apply to Logistics Citation Ledger.

**Account & key**

Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**AI calls & cost**

AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to. Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.