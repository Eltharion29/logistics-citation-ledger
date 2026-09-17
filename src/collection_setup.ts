import { InfraiClient } from "./infrai_client.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");

await new InfraiClient(apiKey).createCollection("logistics-citations", 1536);
console.log("collection logistics-citations is ready");
