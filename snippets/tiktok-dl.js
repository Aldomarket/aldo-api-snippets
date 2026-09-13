const axios = require('axios');

/**
 * Download TikTok Video tanpa watermark via Aldo-Api
 * @param {string} videoUrl - URL Video TikTok
 */
async function downloadTikTok(videoUrl) {
  const apiUrl = `https://aldo-api.web.id/download/tiktok?url=${encodeURIComponent(videoUrl)}`;

  try {
    const { data } = await axios.get(apiUrl);
    if (data.status) {
      console.log('--- TikTok Download Success ---');
      console.log('Judul:', data.result.title);
      console.log('Author:', data.result.author);
      console.log('No-Watermark Video URL:', data.result.play);
      return data.result;
    } else {
      console.error('Gagal:', data.error);
    }
  } catch (error) {
    console.error('Error Request:', error.message);
  }
}

// Contoh penggunaan:
downloadTikTok('https://www.tiktok.com/@username/video/1234567890');
