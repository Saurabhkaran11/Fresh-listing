import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Server } from "socket.io";

const port = Number(process.env.PORT || 4000);
const sessionSecret = process.env.REALTIME_SESSION_SECRET || "";
const eventSecret = process.env.REALTIME_EVENT_SECRET || "";
const frontendOrigin = process.env.FRONTEND_ORIGIN || "*";

if (!sessionSecret || !eventSecret) {
  throw new Error("REALTIME_SESSION_SECRET and REALTIME_EVENT_SECRET are required.");
}

function verifyToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = createHmac("sha256", sessionSecret).update(`${header}.${payload}`).digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed.exp > Math.floor(Date.now() / 1000) ? parsed : null;
  } catch {
    return null;
  }
}

function isAuthorized(request) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
  const expected = Buffer.from(eventSecret);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 64_000) throw new Error("Payload too large.");
  }
  return JSON.parse(body || "{}");
}

const httpServer = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, service: "fresh-listings-realtime" }));
    return;
  }
  if (request.method === "POST" && request.url === "/internal/events") {
    if (!isAuthorized(request)) { response.writeHead(401); response.end("Unauthorized"); return; }
    try {
      const body = await readJson(request);
      const userId = String(body.payload?.userId || "");
      const event = String(body.event || "");
      if (!userId || !["scrape:started", "scrape:progress", "job:saved", "digest:ready"].includes(event)) { response.writeHead(400); response.end("Invalid event"); return; }
      io.to(`user:${userId}`).emit(event, body.payload);
      response.writeHead(202, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Invalid payload" }));
    }
    return;
  }
  response.writeHead(404);
  response.end("Not found");
});

const io = new Server(httpServer, {
  cors: { origin: frontendOrigin === "*" ? true : frontendOrigin, credentials: false },
  transports: ["websocket", "polling"],
});

io.use((socket, next) => {
  const user = verifyToken(socket.handshake.auth?.token);
  if (!user?.sub) return next(new Error("Unauthorized realtime session."));
  socket.data.userId = user.sub;
  next();
});

io.on("connection", (socket) => {
  socket.join(`user:${socket.data.userId}`);
  socket.emit("realtime:ready", { userId: socket.data.userId });
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Fresh Listings realtime service listening on :${port}`);
});
