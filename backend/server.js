import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import redis from "./redisClient.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// GEMINI SETUP (SDK 0.5.x style or adapted version you use)
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });

// UTILITIES
const CACHE_TIME = 86400;
const MEMORY_LIMIT = 8;

function normalize(text) {
  return (text || "").trim().toLowerCase();
}

async function getMemory(sessionId) {
  const arr = await redis.lRange(`mem:${sessionId}`, 0, -1);
  return arr.map((m) => JSON.parse(m));
}

async function saveMemory(sessionId, role, text) {
  const key = `mem:${sessionId}`;
  await redis.rPush(key, JSON.stringify({ role, text }));
  await redis.lTrim(key, -MEMORY_LIMIT, -1);
}

// store IP log
async function logIp(ip, sessionId) {
  const payload = { ip, sessionId, ts: new Date().toISOString() };
  await redis.rPush("ips", JSON.stringify(payload));
  if (sessionId) await redis.set(`session_ip:${sessionId}`, ip);
}

function chunkText(text, size = 30) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

const SYSTEM_PROMPT = `
You are Kaï, a helpful assistant that gives clear, professional,
context-aware answers. Keep responses clean and useful.
`;

// Helper to extract client IP robustly
function extractClientIp(req) {
  // X-Forwarded-For may contain a list, first is original client
  const xff = req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"];
  if (xff) return xff.split(",")[0].trim();
  // fallback to socket remote address
  if (req.socket && req.socket.remoteAddress) {
    // IPv6 mapped IPv4 addresses like ::ffff:1.2.3.4 -> normalize
    return req.socket.remoteAddress.replace(/^::ffff:/, "");
  }
  return "unknown";
}

// STREAMING ENDPOINT
app.post("/chat/stream", async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });

    const sid = sessionId || uuidv4();
    const cacheKey = `cache:${normalize(message)}`;

    // get client IP
    const clientIp = extractClientIp(req);
    // log IP
    await logIp(clientIp, sid);

    // CACHE CHECK
    const cached = await redis.get(cacheKey);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Immediately send init event containing IP + sessionId
    res.write(`data: ${JSON.stringify({ init: true, ip: clientIp, sessionId: sid })}\n\n`);

    if (cached) {
      chunkText(cached).forEach((part) => {
        res.write(`data: ${JSON.stringify({ text: part, sessionId: sid })}\n\n`);
      });
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      return res.end();
    }

    // MEMORY
    const memory = await getMemory(sid);

    // BUILD final prompt for SDK version you use (plain text style)
    const finalPrompt = `
      ${SYSTEM_PROMPT}

      Conversation history:
      ${memory.map((m) => `${m.role}: ${m.text}`).join("\n")}

      User: ${message}
      Assistant:
    `;

    // GEMINI CALL (plain text)
    const result = await model.generateContent(finalPrompt);
    const fullReply = result.response?.text?.() || result.response?.text || result.text || "";

    // SAVE MEMORY + CACHE
    await redis.set(cacheKey, fullReply, { EX: CACHE_TIME });
    await saveMemory(sid, "user", message);
    await saveMemory(sid, "assistant", fullReply);

    // STREAM the reply chunks
    const chunks = chunkText(fullReply, 30);
    let index = 0;
    const interval = setInterval(() => {
      if (index >= chunks.length) {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        clearInterval(interval);
        return res.end();
      }
      res.write(`data: ${JSON.stringify({ text: chunks[index], sessionId: sid })}\n\n`);
      index++;
    }, 50);
  } catch (err) {
    console.error("Streaming Error:", err);
    try {
      // send error event and close
      res.write(`data: ${JSON.stringify({ error: "Streaming failed" })}\n\n`);
      res.end();
    } catch (e) {}
  }
});

// Simple health check + endpoint to view recent IP logs (for debugging)
app.get("/", (req, res) => res.send("Kaï Backend Running"));
app.get("/admin/recent-ips", async (req, res) => {
  const rows = await redis.lRange("ips", -50, -1);
  res.json(rows.map((r) => JSON.parse(r)));
});

app.listen(process.env.PORT || 5000, () => {
  console.log(`🚀 Server running on http://localhost:${process.env.PORT || 5000}`);
});
