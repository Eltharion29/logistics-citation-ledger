import { createHash } from "node:crypto";
import { z } from "zod";
import type { InfraiClient, VectorMatch } from "./infrai_client.js";

export const citationRequest = z.object({
  shipmentEvent: z.object({
    shipmentId: z.string().min(1),
    eventType: z.enum(["picked_up", "in_transit", "delivered", "exception"]),
    occurredAt: z.iso.datetime(),
  }),
  source: z.object({
    url: z.url(),
    title: z.string().min(1),
    excerpt: z.string().min(20),
  }),
  proofOfDelivery: z.object({
    documentId: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).optional(),
  exception: z.object({
    code: z.string().min(1),
    note: z.string().min(1),
  }).optional(),
}).superRefine((value, context) => {
  if (value.shipmentEvent.eventType === "delivered" && !value.proofOfDelivery) {
    context.addIssue({ code: "custom", path: ["proofOfDelivery"], message: "required for delivered events" });
  }
  if (value.shipmentEvent.eventType === "exception" && !value.exception) {
    context.addIssue({ code: "custom", path: ["exception"], message: "required for exception events" });
  }
});

export type CitationRequest = z.infer<typeof citationRequest>;
export type CitationDecision =
  | { status: "stored"; citationId: string }
  | { status: "duplicate"; citationId: string; duplicateOf: string; similarity: number };

export interface CitationIndex {
  embedding(input: string): Promise<number[]>;
  query(collection: string, embedding: number[]): Promise<VectorMatch[]>;
  upsert(collection: string, vector: { id: string; embedding: number[]; metadata: Record<string, unknown> }): Promise<unknown>;
}

export class CitationCollector {
  private readonly index: CitationIndex;
  private readonly collection: string;
  private readonly duplicateThreshold: number;

  constructor(index: CitationIndex, collection = "logistics-citations", duplicateThreshold = 0.92) {
    this.index = index;
    this.collection = collection;
    this.duplicateThreshold = duplicateThreshold;
  }

  async collect(input: CitationRequest): Promise<CitationDecision> {
    const citationId = stableCitationId(input);
    const embedding = await this.index.embedding(indexText(input));
    const nearest = (await this.index.query(this.collection, embedding))[0];

    if (nearest && nearest.score >= this.duplicateThreshold) {
      return { status: "duplicate", citationId, duplicateOf: nearest.id, similarity: nearest.score };
    }

    await this.index.upsert(this.collection, {
      id: citationId,
      embedding,
      metadata: {
        shipment_id: input.shipmentEvent.shipmentId,
        event_type: input.shipmentEvent.eventType,
        source_url: input.source.url,
        source_title: input.source.title,
      },
    });
    return { status: "stored", citationId };
  }
}

function stableCitationId(input: CitationRequest): string {
  return createHash("sha256")
    .update(`${input.source.url}\n${input.source.excerpt.trim().toLowerCase()}`)
    .digest("hex");
}

function indexText(input: CitationRequest): string {
  return [
    input.shipmentEvent.eventType,
    input.source.title,
    input.source.excerpt,
    input.exception?.note ?? "",
  ].join("\n");
}
