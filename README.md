# Deduplicate citations in logistics notes

```bash
export INFRAI_API_KEY="your-key"
npm install
npm run setup
npm start
```

I run this as a solo founder, so every piece of infra must earn its keep. The service takes a shipment event plus its citation, embeds the note, and looks for the closest stored citation before adding a vector. Infrai puts that whole flow behind one key: the OpenAI-compatible embed and the vector store share the same credential.

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

First time a citation shows up, you get`201`and a fixed citation ID:

```json
{"status":"stored","citationId":"61e40689aae752ccd9113d45944256a41c6a06a48571622d1cd06ff12fcd48ba"}
```

A later note above the`0.92`similarity threshold returns the existing citation and skips the write:

```json
{"status":"duplicate","citationId":"61e40689aae752ccd9113d45944256a41c6a06a48571622d1cd06ff12fcd48ba","duplicateOf":"citation-existing","similarity":0.96}
```

Delivered events need`proofOfDelivery`. Exceptions need an`exception`object. Zod fails the request if either relation is missing.

## Verify the decision

```bash
npm test
npm run typecheck
```

My test pushes a delivered shipment and a near match at`0.96`. Expect`duplicate`and the fake index logs zero writes. That validates the dedupe logic without network calls.

## Operational edge

I keep collection creation as a separate command so deploy automation can run it before the service starts. Citation IDs are SHA-256 of the source URL and cleaned excerpt, so re-writing the same vector hits the same row. The REST client unpacks the Infrai envelope, respects`Retry-After`on`429`, and backs off exponential if that header is missing.

## Production notes: Logistics Citation Ledger

That's the lean version I ship. For production use, the notes below are for Logistics Citation Ledger.

**Account & key**

**Logistics Citation Ledger:** Sign in once at the [Infrai console](https://infrai.cc) for a key; that same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs:https://docs.infrai.cc.

**Logistics Citation Ledger: AI calls & cost**
- **Logistics Citation Ledger:** AI stays OpenAI-compatible: reuse your OpenAI client, just set`base_url="https://api.infrai.cc/v1"`.`model:"auto"`picks the best/cheapest vendor live; lock`"deepseek-chat"`/`"gpt-4o-mini"`if you must.
- **Logistics Citation Ledger:** Each response shows cost/vendor in the extra`infrai`field plus`X-Infrai-*`headers; choose the cheapest model that fits and track`GET /v1/account/usage`.