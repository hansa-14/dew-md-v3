const express = require("express");
const fs = require("fs");
const { exec } = require("child_process");
const path = require("path");
const axios = require("axios");
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
} = require("@whiskeysockets/baileys");
const { upload } = require("./mega");

const app = express();
const PORT = process.env.PORT || 8000;
require("events").EventEmitter.defaultMaxListeners = 500;

const MESSAGE = process.env.MESSAGE || `✅ SESSION GENERATED SUCCESSFULLY`;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========================= Pairing Logic =========================
app.get("/code", async (req, res) => {
  let number = req.query.number;
  if (!number) return res.status(400).send({ error: "Missing number" });

  number = number.replace(/[^0-9]/g, "");
  const sessionPath = `./bots/${number}/auth_info_baileys`;

  if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  try {
    const conn = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
      },
      printQRInTerminal: false,
      logger: pino({ level: "fatal" }),
      browser: Browsers.macOS("Safari"),
    });

    if (!conn.authState.creds.registered) {
      await delay(1500);
      const code = await conn.requestPairingCode(number);
      if (!res.headersSent) res.send({ code });
    }

    conn.ev.on("creds.update", saveCreds);

    conn.ev.on("connection.update", async (s) => {
      const { connection, lastDisconnect } = s;

      if (connection === "open") {
        try {
          await delay(10000);
          const user_jid = jidNormalizedUser(conn.user.id);

          function randomMegaId(length = 6, numberLength = 4) {
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            let result = "";
            for (let i = 0; i < length; i++) {
              result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            const num = Math.floor(Math.random() * Math.pow(10, numberLength));
            return `${result}${num}`;
          }

          const credsFile = path.join(sessionPath, "creds.json");
          const mega_url = await upload(fs.createReadStream(credsFile), `${randomMegaId()}.json`);
          const Scan_Id = mega_url.replace("https://mega.nz/file/", "");

          const msg = await conn.sendMessage(user_jid, { text: Scan_Id });
          await conn.sendMessage(user_jid, { text: MESSAGE }, { quoted: msg });

          // Save to bots.json
          const botsPath = path.join(__dirname, "bots.json");
          const bots = fs.existsSync(botsPath) ? JSON.parse(fs.readFileSync(botsPath)) : [];
          const newBot = {
            number,
            owner: "AutoPair",
            SessionID: Scan_Id,
            prefix: ".",
            mode: "public",
            presence: "auto",
            autoReply: true,
            autoVoice: true,
            autoReact: true,
            autoType: true,
            statusView: true,
            statusReact: true,
            statusReply: false,
            readCmd: true,
            statusReactEmoji: "💚",
            AutoReactEmoji: "💕",
            autoRec: true,
            online: true,
            button: true,
          };
          const existing = bots.find((b) => b.number === number);
          if (existing) Object.assign(existing, newBot);
          else bots.push(newBot);
          fs.writeFileSync(botsPath, JSON.stringify(bots, null, 2));

          // Auto-deploy the bot
          await axios
            .post("https://dew-md.up.railway.app/api/deploy", newBot)
            .then(() => console.log("✅ Bot auto-deploy request sent"))
            .catch((err) => console.error("❌ Deploy failed:", err.message));
        } catch (err) {
          console.error("❌ Error in connection open:", err.message);
        }

        await delay(100);
        process.exit(0);
      } else if (
        connection === "close" &&
        lastDisconnect?.error?.output?.statusCode !== 401
      ) {
        console.log("🔄 Retrying connection...");
        exec("pm2 restart DEW-MD");
      }
    });
  } catch (err) {
    console.error("❌ Pairing failed:", err.message);
    exec("pm2 restart DEW-MD");
    if (!res.headersSent) res.send({ error: "Pairing failed" });
  }
});

// ========================= Fallback HTML ========================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "pair.html"));
});

// ========================= Start Server =========================
app.listen(PORT, () => {
  console.log(`⏩ Server running on http://localhost:${PORT}`);
});

process.on("uncaughtException", function (err) {
  console.log("Caught exception: " + err);
  exec("pm2 restart DEW-MD");
});
