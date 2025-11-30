import React from "react";
import { Box, Paper } from "@mui/material";

export default function MessageBubble({ text, sender }) {
  const isUser = sender === "user";

  return (
    <Box display="flex" justifyContent={isUser ? "flex-end" : "flex-start"} mb={1.8}>
      <Paper elevation={2} sx={{
        p: 1.4, maxWidth: "75%", borderRadius: "16px",
        bgcolor: isUser ? "#06b6d4" : "#f3f4f6",
        color: isUser ? "#fff" : "#000",
        fontSize: "15px", lineHeight: "1.5",
        borderBottomRightRadius: isUser ? "4px" : "16px",
        borderBottomLeftRadius: isUser ? "16px" : "4px",
      }}>
        {text}
      </Paper>
    </Box>
  );
}
