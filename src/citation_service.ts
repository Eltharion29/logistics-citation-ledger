import { createServer } from "node:http";
import { CitationCollector, citationRequest } from "./citation_collector.js";
import { InfraiClient, InfraiError } from "./infrai_client.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");

const collector = new CitationCollector(new InfraiClient(apiKey));
const port = Number(process.env.PORT ?? 3000);

createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/citations") {
    response.writeHead(404).end(JSON.stringify({ error: "route not found" }));
    return;
  }

  try {
    const parsed = citationRequest.safeParse(await readJson(request));
    if (!parsed.success) {
      response.writeHead(400).end(JSON.stringify({ error: "invalid request", issues: parsed.error.issues }));
      return;
    }
    const decision = await collector.collect(parsed.data);
    response.writeHead(decision.status === "stored" ? 201 : 200).end(JSON.stringify(decision));
  } catch (error) {
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status).end(JSON.stringify({ error: error.code, details: error.details }));
      return;
    }
    response.writeHead(502).end(JSON.stringify({ error: "upstream transport failure" }));
  }
}).listen(port, () => console.log(`citation service listening on :${port}`));

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("request body too large");
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
