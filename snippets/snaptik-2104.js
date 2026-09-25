
import axios from 'axios'

const BASE_URL = 'https://snaptik.com.pl'
const TIMEOUT = 60000
const MAX_RETRY = 2

export const FORMATS = ['video', 'mp3', 'slideshow', 'story']

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function absUrl(u) {
  if (!u || u === '#') return null
  if (/^https?:\/\//i.test(u)) return u
  return BASE_URL + (u.startsWith('/') ? u : `/${u}`)
}


export async function snaptikDl(url, format = 'video') {
  if (!url) return { ok: false, why: 'URL TikTok wajib diisi' }
  const fmt = FORMATS.includes(String(format).toLowerCase()) ? String(format).toLowerCase() : 'video'

  let last = null
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      const params = new URLSearchParams()
      params.append('url', String(url).trim())
      params.append('format', fmt)

      const { data } = await axios.post(`${BASE_URL}/process.php`, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
          Accept: 'application/json, */*',
          Referer: `${BASE_URL}/`,
          Origin: BASE_URL,
        },
        timeout: TIMEOUT,
        validateStatus: () => true,
      })

      if (data?.success) {
        const downloads = [absUrl(data.download_url), absUrl(data.download_url_2)].filter(Boolean)
        if (!downloads.length) return { ok: false, why: 'Server tidak mengembalikan link download.' }
        return {
          ok: true,
          format: fmt,
          title: data.title || 'TikTok Video',
          author: data.author || '-',
          thumbnail: data.thumbnail || null,
          downloads,
        }
      }
      // success:false + pesan = respons logis (video mati/dihapus) → final
      return { ok: false, why: data?.error || 'Video tidak ditemukan atau tidak tersedia.' }
    } catch (e) {
      last = e
    }
    if (attempt < MAX_RETRY) await sleep(2000 * attempt)
  }
  return { ok: false, why: last?.message || 'Gagal menghubungi server.' }
}

export default { snaptikDl, FORMATS }