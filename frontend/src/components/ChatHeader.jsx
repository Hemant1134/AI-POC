// src/components/ChatHeader.jsx
import React from "react";
import { AppBar, Toolbar, Typography } from "@mui/material";

export default function ChatHeader({ title = "Kaï" }) {
  return (
    <AppBar position="static" sx={{ background: "linear-gradient(90deg,#7c3aed,#06b6d4)", borderRadius: "18px 18px 0 0", boxShadow: "none" }}>
      <Toolbar>
        <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>AI Assistant</Typography>
      </Toolbar>
    </AppBar>
  );
}
