
// nontonime
import axios from 'axios'
import * as cheerio from 'cheerio'

export const SOURCE = 'https://nontonime.vercel.app'

const BASE_URL = 'https://nontonime.vercel.app'
const TIMEOUT = 25000
const MAX_RETRY = 2

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
]

function headers() {
  return {
    'User-Agent': UAS[Math.floor(Math.random() * UAS.length)],
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchHtml(path) {
  let last = null
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      const { data } = await axios.get(BASE_URL + path, {
        headers: headers(),
        timeout: TIMEOUT,
        validateStatus: (s) => s === 200,
      })
      if (typeof data === 'string' && data.length > 1000) return data
      last = new Error('Respons kosong/invalid')
    } catch (e) {
      last = e
    }
    if (attempt < MAX_RETRY) await sleep(1500 * attempt)
  }
  throw last || new Error('Gagal fetch halaman')
}

/**
 * Daftar anime ongoing dari homepage.
 * @returns {Promise<Array<{title, slug, url, meta}>>}
 */
export async function getOngoing() {
  const html = await fetchHtml('/')
  const $ = cheerio.load(html)
  const out = []
  const seen = new Set()

  $('a[href^="/anime/"]').each((_, el) => {
    const href = $(el).attr('href') || ''
    const slug = href.replace(/^\/anime\//, '').replace(/\/$/, '')
    if (!slug || seen.has(slug)) return
    // Judul WAJIB dari h3 (link poster cuma berisi badge "HD" → skip)
    const title = $(el).find('h3').first().text().trim()
    if (!title) return
    // Meta (badge eps + hari) ada di teks kartu sekitar link — buang
    // teks tombol navigasi biar ringkas.
    const card = $(el).parent()
    const meta = card
      .text()
      .replace(title, '')
      .replace(/Nonton Sekarang|Detail Anime|→/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60)
    seen.add(slug)
    out.push({ title, slug, url: `${BASE_URL}/anime/${slug}`, meta })
  })

  if (!out.length) throw new Error('Daftar ongoing kosong (struktur situs berubah?)')
  return out
}

/**
 * Cari di daftar ongoing (filter lokal, tanpa endpoint search server).
 */
export async function searchOngoing(query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return []
  const list = await getOngoing()
  return list.filter((a) => a.title.toLowerCase().includes(q) || a.slug.includes(q.replace(/\s+/g, '-')))
}

export default { getOngoing, searchOngoing }