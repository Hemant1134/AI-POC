import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  TextField,
  IconButton,
  CircularProgress,
  Paper,
  Typography,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import MessageBubble from "./MessageBubble";
import ChatHeader from "./ChatHeader";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

export default function ChatBox() {
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [sessionId, setSessionId] = useState(localStorage.getItem("sid") || null);
  const [clientIp, setClientIp] = useState(null);

  const bottomRef = useRef();

  useEffect(() => {
    if (!sessionId) {
      const id = (crypto && crypto.randomUUID && crypto.randomUUID()) || Math.random().toString(36).slice(2);
      setSessionId(id);
      localStorage.setItem("sid", id);
    }
  }, []);

  const scrollDown = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  const handleSend = async () => {
    if (!text.trim()) return;

    const userMsg = text.trim();
    setText("");
    setMessages((m) => [...m, { sender: "user", text: userMsg }]);
    scrollDown();
    setTyping(true);

    const response = await fetch(`${BACKEND_URL}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMsg, sessionId }),
    });

    if (!response.ok) {
      setMessages((m) => [...m, { sender: "assistant", text: "Server error" }]);
      setTyping(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let aiMessage = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const event = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);

        // parse lines inside event
        const lines = event.split(/\n/);
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payloadText = line.replace(/^data:\s*/, "");
          let payload;
          try {
            payload = JSON.parse(payloadText);
          } catch (e) {
            continue;
          }

          // handle init meta event (contains ip)
          if (payload.init) {
            if (payload.ip) setClientIp(payload.ip);
            if (payload.sessionId && !sessionId) {
              setSessionId(payload.sessionId);
              localStorage.setItem("sid", payload.sessionId);
            }
            continue;
          }

          if (payload.text) {
            aiMessage += payload.text;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.sender === "assistant") {
                return [...prev.slice(0, -1), { sender: "assistant", text: aiMessage }];
              }
              return [...prev, { sender: "assistant", text: aiMessage }];
            });
            scrollDown();
          }

          if (payload.done) {
            setTyping(false);
            scrollDown();
            return;
          }
        }
      }
    }

    setTyping(false);
  };

  return (
    <div className="app-wrapper">
      <div className="chat-container">
        <ChatHeader title="Kaï" />
        <Paper className="chat-window" elevation={0}>
          {messages.map((m, i) => (
            <MessageBubble key={i} text={m.text} sender={m.sender} />
          ))}
          {typing && (
            <Box display="flex" justifyContent="flex-start" mt={1}>
              <CircularProgress size={22} />
            </Box>
          )}
          <div ref={bottomRef} />
        </Paper>

        <div className="chat-input-box">
          <TextField
            fullWidth
            label="Ask Kaï..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />

          <IconButton
            sx={{ bgcolor: "#7c3aed", color: "#fff", width: 50, height: 50, "&:hover": { bgcolor: "#5b21b6" } }}
            onClick={handleSend}
          >
            <SendIcon />
          </IconButton>
        </div>

        <Box sx={{ p: 1, textAlign: "center", fontSize: 12, color: "#374151" }}>
          <Typography variant="caption">
            Kaï — Powered by Hemant {clientIp ? `• IP: ${clientIp}` : ""}
          </Typography>
        </Box>
      </div>
    </div>
  );
}
