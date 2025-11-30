import { createClient } from "redis";

const client = createClient({
  url: process.env.REDIS_URL
});

client.on("connect", () => {
    console.log("Redis Cloud Connected")
});

client.on("error", (err) => {
    console.log("Redis Error:", err)
});

await client.connect();

export default client;
