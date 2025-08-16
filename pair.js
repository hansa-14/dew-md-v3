const express = require("express");
const fs = require("fs");
const { exec } = require("child_process");
const path = require("path");
const axios = require("axios");
let router = express.Router();
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

const MESSAGE = process.env.MESSAGE || `✅ SESSION GENERATED SUCCESSFULLY`;

function removeFile(FilePath) {
  if (fs.existsSync(FilePath)) {
    fs.rmSync(FilePath, { recursive: true, force: true });
  }
}

router.get("/", async (req, res) => {
  let number = req.query.number;
  if (!number) return res.status(400).send({ error: "Missing number" });

  async function RobinPair() {
    const { state, saveCreds } = await useMultiFileAuthState(`./auth_info_baileys`);
    try {
      let RobinPairWeb = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: "fatal" }).child({ level: "fatal" })
          ),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        browser: Browsers.macOS("Safari"),
      });

      if (!RobinPairWeb.authState.creds.registered) {
        await delay(1500);
        number = number.replace(/[^0-9]/g, "");
        const code = await RobinPairWeb.requestPairingCode(number);
        if (!res.headersSent) {
          res.send({ code });
        }
      }

      RobinPairWeb.ev.on("creds.update", saveCreds);

      RobinPairWeb.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;
        if (connection === "open") {
          try {
            await delay(10000);
            const auth_path = "./auth_info_baileys/";
            const user_jid = jidNormalizedUser(RobinPairWeb.user.id);

            function randomMegaId(length = 6, numberLength = 4) {
              const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
              let result = "";
              for (let i = 0; i < length; i++) {
                result += characters.charAt(Math.floor(Math.random() * characters.length));
              }
              const num = Math.floor(Math.random() * Math.pow(10, numberLength));
              return `${result}${num}`;
            }

            const mega_url = await upload(
              fs.createReadStream(path.join(auth_path, "creds.json")),
              `${randomMegaId()}.json`
            );

            const string_session = mega_url.replace("https://mega.nz/file/", "");
            const Scan_Id = string_session;

            const msgsss = await RobinPairWeb.sendMessage(user_jid, { text: Scan_Id });
            await RobinPairWeb.sendMessage(user_jid, { text: MESSAGE }, { quoted: msgsss });

            // Save to bots.json
            const botsPath = path.join(__dirname, "bots.json");
            const bots = fs.existsSync(botsPath) ? JSON.parse(fs.readFileSync(botsPath)) : [];
            const botExists = bots.find((b) => b.number === number);
            const newBot = {
              number,
              owner: "AutoPair",
              session: Scan_Id,
              prefix: ".",
              mode: "public",
              autoReply: true,
              autoVoice: true,
              autoReact: true,
              autoType: true,
              statusView: true,
              statusReact: true,
              statusReply: false,
              readCmd: true,
              sendWelcome: false,
              statusReactEmoji: "💚",
              AutoReactEmoji: "💕",
              autoRec: true,
              online: true,
            };
            if (!botExists) bots.push(newBot);
            else Object.assign(botExists, newBot);
            fs.writeFileSync(botsPath, JSON.stringify(bots, null, 2));

            // Deploy
            await axios
              .post("https://dew-md.up.railway.app/api/deploy", newBot)
              .then(() => console.log("✅ Bot auto-deploy request sent"))
              .catch((err) => console.error("❌ Deploy failed:", err.message));
          } catch (e) {
            console.log("❌ Pairing failed, restarting bot:", e.message);
            exec("pm2 restart DEW-MD");
          }

          await delay(100);
          removeFile("./auth_info_baileys");
          process.exit(0);
        } else if (
          connection === "close" &&
          lastDisconnect &&
          lastDisconnect.error &&
          lastDisconnect.error.output.statusCode !== 401
        ) {
          await delay(10000);
          RobinPair(); // recursive call
        }
      });
    } catch (err) {
      console.log("❌ Main error caught:", err.message);
      exec("pm2 restart DEW-MD");
      removeFile("./auth_info_baileys");
      if (!res.headersSent) {
        res.send({ code: "Service Unavailable" });
      }
    }
  }

  await RobinPair();
});

process.on("uncaughtException", function (err) {
  console.log("Caught exception: " + err);
  exec("pm2 restart DEW-MD");
});

module.exports = router;
