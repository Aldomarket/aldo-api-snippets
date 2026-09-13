import { AldoStyle } from "../../lib/fq.js";
import axios from "axios";
import { logCustom } from "../../lib/logger.js";
import { Button } from "../../lib/MessageBuilder.js";

async function sendMessageWithQuote(sock, remoteJid, messageInfo, text) {
  return sock.sendMessage(
    remoteJid,
    { text },
    { quoted: await AldoStyle(sock, messageInfo) }
  );
}

async function sendReaction(sock, message, reaction) {
  return;
}

async function handle(sock, messageInfo) {
  const { remoteJid, message, prefix, command } = messageInfo;

  try {
    const res = await axios.get("https://www.aldo-api.web.id/random/pap", {
      params: { t: Date.now() },
      responseType: "arraybuffer",
      timeout: 30000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
      },
    });

    const buffer = Buffer.from(res.data);

    await new Button(sock)
      .setImage(buffer)
      .setBody("📷Random PAP berhasil diambil.")
      .setFooter("AldoStyle")
      .addReply("♻️PAP Lagi", `${prefix}${command}`)
      .send(remoteJid, { quoted: await AldoStyle(sock, messageInfo) });
  } catch (error) {
    logCustom("info", "", `ERROR-COMMAND-${command}.txt`);
    await sendReaction(sock, message, "❌");
    await sendMessageWithQuote(
      sock,
      remoteJid,
      messageInfo,
      `🖤 Gagal mengambil PAP random. Coba lagi nanti.\n\n_Error: ${error.message}_`
    );
  }
}

export default {
  handle,
  Commands: ["randompap", "pap"],
  OnlyPremium: false,
  OnlyOwner: false,
  limitDeduction: 0,
};
