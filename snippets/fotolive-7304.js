import * as baileys from "baileys";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import { downloadQuotedMedia, downloadMedia } from "../../lib/utils.js";

const { prepareWAMessageMedia, generateWAMessageFromContent } = baileys;

function extractFrame(videoPath) {
  const filename = `tmp_fl_${Date.now()}.jpg`;
  const outputPath = `tmp/${filename}`;

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .on("end", () => resolve(outputPath))
      .on("error", (err) => reject(err))
      .screenshots({
        timestamps: ["0"],
        filename,
        folder: "tmp",
      });
  });
}

function removeFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}

async function sendFotoLive(sock, jid, imagePath, videoPath) {
  const img = await prepareWAMessageMedia(
    { image: { url: imagePath } },
    { upload: sock.waUploadToServer }
  );

  const vid = await prepareWAMessageMedia(
    { video: { url: videoPath } },
    { upload: sock.waUploadToServer }
  );

  const first = generateWAMessageFromContent(
    jid,
    {
      imageMessage: {
        ...img.imageMessage,
        contextInfo: {
          pairedMediaType: 5,
          statusSourceType: 0,
        },
      },
    },
    {}
  );

  await sock.relayMessage(jid, first.message, {
    messageId: first.key.id,
  });

  await sock.relayMessage(
    jid,
    {
      videoMessage: {
        ...vid.videoMessage,
        contextInfo: {
          pairedMediaType: 6,
          statusSourceType: 0,
        },
      },
      messageContextInfo: {
        messageAssociation: {
          associationType: 12,
          parentMessageKey: first.key,
        },
      },
    },
    {}
  );
}

async function handle(sock, messageInfo) {
  const { remoteJid, message, type, isQuoted, prefix, command, fq } =
    messageInfo;

  const mediaType = isQuoted ? `${isQuoted.type}Message` : `${type}Message`;

  if (mediaType !== "videoMessage") {
    return await sock.sendMessage(
      remoteJid,
      { text: `⚠️ _Kirim/Balas video dengan caption *${prefix + command}*_` },
      { quoted: fq }
    );
  }

  let videoPath = null;
  let imagePath = null;

  try {
    const media = isQuoted
      ? await downloadQuotedMedia(message)
      : await downloadMedia(message);

    if (!media) {
      return await sock.sendMessage(
        remoteJid,
        { text: "⚠️ _Gagal mengunduh video._" },
        { quoted: fq }
      );
    }

    videoPath = `tmp/${media}`;

    if (!fs.existsSync(videoPath)) {
      throw new Error(`File video tidak ditemukan: ${videoPath}`);
    }

    imagePath = await extractFrame(videoPath);

    if (!fs.existsSync(imagePath)) {
      throw new Error("Gagal mengambil frame dari video.");
    }

    await sendFotoLive(sock, remoteJid, imagePath, videoPath);
  } catch (error) {
    console.error("[FOTOLIVE ERROR]", error);
    await sock.sendMessage(
      remoteJid,
      {
        text: `❌ _Terjadi kesalahan saat memproses foto live._\n\n_${error.message}_`,
      },
      { quoted: fq }
    );
  } finally {
    removeFile(imagePath);
    removeFile(videoPath);
  }
}

export default {
  handle,
  Commands: ["fotolive"],
  OnlyPremium: false,
  OnlyOwner: false,
  limitDeduction: 1,
};