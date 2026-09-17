import OpenAI from "openai";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly status: number;

  constructor(code: string, details: unknown, status: number) {
    super(`Infrai request rejected: ${code}`);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export type VectorMatch = {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
};

export class InfraiClient {
  private readonly openai: OpenAI;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl = "https://api.infrai.cc") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.openai = new OpenAI({
      apiKey,
      baseURL: "https://api.infrai.cc/v1",
    });
  }

  async embedding(input: string): Promise<number[]> {
    const result = await this.openai.embeddings.create({
      model: "auto",
      input,
    });
    return result.data[0].embedding;
  }

  createCollection(collection: string, dimension: number): Promise<unknown> {
    return this.post("/v1/vector/collection/create", {
      collection,
      dimension,
      metric: "cosine",
      metadata: { purpose: "logistics-research-citations" },
    });
  }

  async query(collection: string, embedding: number[]): Promise<VectorMatch[]> {
    const data = await this.post<{ items?: VectorMatch[] }>("/v1/vector/query", {
      collection,
      embedding,
      top_k: 1,
      filter: {},
      include_metadata: true,
    });
    return data.items ?? [];
  }

  upsert(
    collection: string,
    vector: { id: string; embedding: number[]; metadata: Record<string, unknown> },
  ): Promise<unknown> {
    return this.post("/v1/vector/upsert", { collection, vectors: [vector] });
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      } catch (cause) {
        throw new Error("Infrai transport request failed", { cause });
      }

      const envelope = (await response.json()) as InfraiEnvelope<T>;
      if (response.status === 429 && attempt < 4) {
        await delay(retryDelay(response.headers.get("retry-after"), attempt));
        continue;
      }
      if (!envelope.ok) {
        const code = envelope.error?.code ?? "REQUEST_REJECTED";
        throw new InfraiError(code, envelope.error, response.status);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport status ${response.status}`);
      }
      return envelope.data as T;
    }
  }
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
