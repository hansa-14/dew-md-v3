const { exec } = require("child_process");
const { upload } = require('./mega');
const express = require('express');
const router = express.Router();
const fs = require("fs-extra");
const path = require('path');
const pino = require("pino");
const { toBuffer } = require("qrcode");
const { Boom } = require("@hapi/boom");

const {
  default: SuhailWASocket,
  useMultiFileAuthState,
  Browsers,
  delay,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const MESSAGE = process.env.MESSAGE || `
*SESSION GENERATED SUCCESSFULY* ✅
> https://whatsapp.com/channel/0029Vb2bFCq0LKZGEl4xEe2G

*㋛ DEW-MD BY HANSA DEWMINA*
> Hansa Dewmina
> Dew-Coders-LK`;

if (fs.existsSync('./auth_info_baileys')) {
  fs.emptyDirSync(path.join(__dirname, '/auth_info_baileys'));
}

router.get('/', async (req, res) => {
  async function SUHAIL() {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '/auth_info_baileys'));

    try {
      const Smd = SuhailWASocket({
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS("Desktop"),
        auth: state
      });

      Smd.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
        if (qr && !res.headersSent) {
          try {
            const qrBuffer = await toBuffer(qr);
            res.setHeader('Content-Type', 'image/png');
            res.end(qrBuffer);
            return;
          } catch (err) {
            console.error("QR Buffer Error:", err);
            return;
          }
        }

        if (connection === "open") {
          await delay(3000);
          const user = Smd.user.id;

          function randomMegaId(length = 6, numberLength = 4) {
            const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let result = '';
            for (let i = 0; i < length; i++) {
              result += characters.charAt(Math.floor(Math.random() * characters.length));
            }
            const number = Math.floor(Math.random() * Math.pow(10, numberLength));
            return `${result}${number}`;
          }

          const authPath = path.join(__dirname, '/auth_info_baileys/creds.json');
          const megaUrl = await upload(fs.createReadStream(authPath), `${randomMegaId()}.json`);
          const scanId = megaUrl.replace('https://mega.nz/file/', '');

          console.log(`\nSESSION-ID ==> ${scanId}\n---------------- SESSION CLOSED ----------------`);

          const msg = await Smd.sendMessage(user, { text: scanId });
          await Smd.sendMessage(user, { text: MESSAGE }, { quoted: msg });

          await delay(1000);
          await fs.emptyDir(path.join(__dirname, '/auth_info_baileys'));
        }

        if (connection === "close") {
          const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
          switch (reason) {
            case DisconnectReason.connectionClosed:
              console.log("Connection closed!");
              break;
            case DisconnectReason.connectionLost:
              console.log("Connection Lost from Server!");
              break;
            case DisconnectReason.restartRequired:
              console.log("Restart Required, Restarting...");
              SUHAIL().catch(console.error);
              break;
            case DisconnectReason.timedOut:
              console.log("Connection TimedOut!");
              break;
            default:
              console.log('Connection closed with bot. Restarting...');
              await delay(5000);
              exec('pm2 restart DEW-MD');
              process.exit(0);
          }
        }
      });

      Smd.ev.on('creds.update', saveCreds);

    } catch (err) {
      console.error("SUHAIL Error:", err);
      exec('pm2 restart DEW-MD');
      await fs.emptyDir(path.join(__dirname, '/auth_info_baileys'));
    }
  }

  try {
    await SUHAIL();
  } catch (err) {
    console.error("Outer SUHAIL Error:", err);
    await fs.emptyDir(path.join(__dirname, '/auth_info_baileys'));
    exec('pm2 restart DEW-MD');
  }
});

module.exports = router;
