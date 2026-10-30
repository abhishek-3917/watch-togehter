import express from "express";
import http from "http";
import path from "node:path";
import cors from "cors";
import { Server } from "socket.io";

const app = express();
app.use(cors({ origin: true }));
app.get("/health", (_req, res) => res.json({ ok: true }));

// Serve the built React app from the same origin as Socket.IO.
const clientDist = path.resolve(process.cwd(), "client", "dist");
app.use(express.static(clientDist));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, methods: ["GET", "POST"] } });
const rooms = new Map();

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, name }) => {
    if (!roomId || typeof roomId !== "string" || roomId.length > 48) return;
    const room = rooms.get(roomId) ?? { users: new Map(), playback: { playing: false, time: 0, src: "", embedUrl: "" } };
    if (room.users.size >= 2 && !room.users.has(socket.id)) {
      socket.emit("room-full");
      return;
    }
    room.users.set(socket.id, { name: String(name || "Guest").slice(0, 24) });
    rooms.set(roomId, room);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.emit("room-state", { playback: room.playback, peers: [...room.users.entries()].filter(([id]) => id !== socket.id).map(([id, user]) => ({ id, ...user })) });
    socket.to(roomId).emit("peer-joined", { id: socket.id, name: String(name || "Guest").slice(0, 24) });
    io.to(roomId).emit("participants", [...room.users.values()]);
  });

  socket.on("external-site", ({ embedUrl }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId) || typeof embedUrl !== "string") return;
    let parsed;
    try { parsed = new URL(embedUrl); } catch { return; }
    if (!["http:", "https:"].includes(parsed.protocol)) return;
    const room = rooms.get(roomId);
    room.playback = { ...room.playback, embedUrl: parsed.href };
    socket.to(roomId).emit("external-site", { embedUrl: parsed.href });
  });

  socket.on("playback", (state) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    room.playback = {
      playing: Boolean(state?.playing),
      time: Math.max(0, Number(state?.time) || 0),
      src: typeof state?.src === "string" ? state.src.slice(0, 2000) : room.playback.src
    };
    socket.to(roomId).emit("playback", room.playback);
  });

  socket.on("chat-message", (message) => {
    const roomId = socket.data.roomId;
    if (!roomId || typeof message !== "string") return;
    const clean = message.trim().slice(0, 500);
    if (clean) io.to(roomId).emit("chat-message", { id: `${Date.now()}-${socket.id}`, text: clean, from: socket.id, at: new Date().toISOString() });
  });

  // WebRTC signaling: relay offers, answers, and ICE candidates only within the room.
  for (const event of ["webrtc-offer", "webrtc-answer", "webrtc-ice"]) {
    socket.on(event, (payload) => {
      const roomId = socket.data.roomId;
      if (!roomId || !payload?.to || !rooms.get(roomId)?.users.has(payload.to)) return;
      io.to(payload.to).emit(event, { ...payload, from: socket.id });
    });
  }

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    room.users.delete(socket.id);
    socket.to(roomId).emit("peer-left", { id: socket.id });
    if (room.users.size === 0) rooms.delete(roomId);
    else io.to(roomId).emit("participants", [...room.users.values()]);
  });
});

app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));

const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => console.log(`Watch Together server on :${PORT}`));
