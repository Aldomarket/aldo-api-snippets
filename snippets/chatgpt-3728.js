import https from 'https'
import crypto from 'crypto'

const agent = new https.Agent({
  keepAlive: true
})

function syncCookies(jar, setCookies = []) {
  const list = Array.isArray(setCookies) ? setCookies : [setCookies]

  for (const item of list) {
    const pair = item.split(';')[0].split('=')

    if (pair.length >= 2) {
      jar[pair[0].trim()] = pair.slice(1).join('=').trim()
    }
  }
}

function buildCookieString(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

function request(url, {
  method = 'GET',
  headers = {},
  body = null,
  stream = false
} = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)

    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: body
        ? {
            ...headers,
            'content-length': Buffer.byteLength(body)
          }
        : headers,
      agent,
      maxHeaderSize: 1048576
    }

    const req = https.request(opts, res => {
      if (stream) {
        return resolve({
          res,
          headers: res.headers,
          status: res.statusCode
        })
      }

      const chunks = []

      res.on('data', chunk => chunks.push(chunk))

      res.on('end', () => {
        resolve({
          text: Buffer.concat(chunks).toString(),
          headers: res.headers,
          status: res.statusCode
        })
      })
    })

    req.on('error', reject)

    if (body) req.write(body)

    req.end()
  })
}

function fnv1a(str) {
  let h = 2166136261

  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }

  h ^= h >>> 16
  h = Math.imul(h, 2246822507) >>> 0

  h ^= h >>> 13
  h = Math.imul(h, 3266489909) >>> 0

  h ^= h >>> 16

  return (h >>> 0)
    .toString(16)
    .padStart(8, '0')
}

function encodeConfig(cfg) {
  return Buffer
    .from(JSON.stringify(cfg))
    .toString('base64')
}

function makeBrowserConfig(
  width,
  height,
  userAgent,
  buildNumber,
  lang
) {
  return [
    width + height,
    String(new Date()),
    2172649472,
    0,
    userAgent,
    null,
    buildNumber,
    lang,
    `${lang},en`,
    0,
    'contacts−[object ContactsManager]',
    '_reactListening',
    'User',
    performance.now(),
    crypto.randomUUID(),
    '',
    8,
    performance.timeOrigin,
    0,
    0,
    0,
    0,
    0,
    0,
    0
  ]
}

function computePow(seed, difficulty, cfg) {
  const start = performance.now()

  for (let i = 0; i < 500000; i++) {
    cfg[3] = i
    cfg[9] = Math.round(performance.now() - start)

    const encoded = encodeConfig(cfg)

    if (
      fnv1a(seed + encoded)
        .substring(0, difficulty.length) <= difficulty
    ) {
      return `gAAAAAB${encoded}~S`
    }
  }

  return 'wQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4De'
}

async function startSession(cookieStr = null) {
  const cookies = {}

  const userAgent =
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36'

  const oaiDid = crypto.randomUUID()
  const lang = 'id-ID'

  let buildNumber = null

  const homeRes = await request('https://chatgpt.com/', {
    method: 'GET',

    headers: {
      'User-Agent': userAgent,
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'accept-language':
        `${lang},en-US;q=0.9,en;q=0.8`
    }
  })

  const html = homeRes.text

  const match =
    html.match(/["']buildNumber["']\s*:\s*["']([^"']+)["']/) ||
    html.match(/buildNumber\s*=\s*["']([^"']+)["']/) ||
    html.match(/BUILD_NUMBER\s*["']([^"']+)["']/) ||
    html.match(/["']version["']\s*:\s*["']([^"']+)["']/) ||
    html.match(/["']appVersion["']\s*:\s*["']([^"']+)["']/) ||
    html.match(/["']build["']\s*:\s*["']([^"']+)["']/) ||
    html.match(/prod-([a-f0-9]+)/)

  if (match && match[1]) {
    buildNumber = match[1]
  }

  if (cookieStr) {
    for (const pair of cookieStr.split(';')) {
      const idx = pair.indexOf('=')

      if (idx > 0) {
        cookies[pair.slice(0, idx).trim()] =
          pair.slice(idx + 1).trim()
      }
    }
  }

  const headers = {
    'User-Agent': userAgent,
    accept: '*/*',
    'accept-language':
      `${lang},en-US;q=0.9,en;q=0.8`,
    'content-type': 'application/json',
    'OAI-Device-Id': oaiDid,

    'sec-ch-ua':
      '"Chromium";v="144", "Not/A)Brand";v="24"',

    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    origin: 'https://chatgpt.com',
    referer: 'https://chatgpt.com/',

    ...(Object.keys(cookies).length
      ? {
          cookie: buildCookieString(cookies)
        }
      : {})
  }

  return {
    cookies,
    headers,
    userAgent,
    oaiDid,
    buildNumber,
    lang,
    screenWidth: 423,
    screenHeight: 965
  }
}

async function generateSentinelTokens(auth) {
  const initCfg = makeBrowserConfig(
    auth.screenWidth,
    auth.screenHeight,
    auth.userAgent,
    auth.buildNumber,
    auth.lang
  )

  initCfg[3] = 1
  initCfg[9] = 0

  const initToken =
    `gAAAAAC${encodeConfig(initCfg)}`

  const prepareRes = await request(
    'https://chatgpt.com/backend-anon/sentinel/chat-requirements/prepare',
    {
      method: 'POST',

      headers: auth.headers,

      body: JSON.stringify({
        p: initToken
      })
    }
  )

  const prepareData = JSON.parse(
    prepareRes.text
  )

  let pow = null

  if (prepareData.proofofwork?.required) {
    pow = computePow(
      prepareData.proofofwork.seed,
      prepareData.proofofwork.difficulty,

      makeBrowserConfig(
        auth.screenWidth,
        auth.screenHeight,
        auth.userAgent,
        auth.buildNumber,
        auth.lang
      )
    )
  }

  const turnstile = crypto
    .randomBytes(
      Math.floor((2256 / 4) * 3)
    )
    .toString('base64')
    .slice(0, 2256)

  const finalizeBody = {
    prepare_token:
      prepareData.prepare_token ?? ''
  }

  if (pow) {
    finalizeBody.proofofwork = pow
  }

  if (turnstile) {
    finalizeBody.turnstile = turnstile
  }

  const finalizeRes = await request(
    'https://chatgpt.com/backend-anon/sentinel/chat-requirements/finalize',
    {
      method: 'POST',

      headers: auth.headers,

      body: JSON.stringify(
        finalizeBody
      )
    }
  )

  const finalizeData = JSON.parse(
    finalizeRes.text
  )

  return {
    pow,
    turnstile,
    chatRequirementsToken:
      finalizeData.token ?? null
  }
}

async function getConduitToken(
  message,
  msgId,
  auth,
  opts = {}
) {
  const {
    conversationId,
    parentMsgId,
    webSearch
  } = opts

  const parentMessageId =
    parentMsgId ||
    'client-created-root'

  const body = {
    action: 'next',

    fork_from_shared_post: false,

    parent_message_id:
      parentMessageId,

    model: 'auto',

    timezone_offset_min:
      new Date().getTimezoneOffset(),

    timezone:
      Intl.DateTimeFormat()
        .resolvedOptions()
        .timeZone,

    conversation_mode: {
      kind: 'primary_assistant'
    },

    system_hints:
      webSearch ? ['search'] : [],

    supports_buffering: true,

    supported_encodings: [
      'v1'
    ],

    partial_query: {
      id: msgId,

      author: {
        role: 'user'
      },

      content: {
        content_type: 'text',
        parts: [message]
      }
    },

    client_contextual_info: {
      app_name: 'chatgpt.com'
    }
  }

  if (conversationId) {
    body.conversation_id =
      conversationId
  }

  const res = await request(
    'https://chatgpt.com/backend-anon/f/conversation/prepare',
    {
      method: 'POST',

      headers: {
        ...auth.headers,
        'X-Conduit-Token': 'no-token'
      },

      body: JSON.stringify(body)
    }
  )

  const data = JSON.parse(res.text)

  return (
    data.token ||
    data.conduit_token
  )
}

function buildMessageBody(
  message,
  msgId,
  auth,
  opts = {}
) {
  const {
    conversationId,
    parentMsgId,
    webSearch
  } = opts

  const parentMessageId =
    parentMsgId ||
    'client-created-root'

  const content = {
    content_type: 'text',
    parts: [message]
  }

  const msgMeta = {
    selected_github_repos: [],
    selected_all_github_repos: false,

    serialization_metadata: {
      custom_symbol_offsets: []
    },

    ...(webSearch
      ? {
          system_hints: ['search']
        }
      : {})
  }

  const body = {
    action: 'next',

    messages: [
      {
        id: msgId,

        author: {
          role: 'user'
        },

        create_time:
          Date.now() / 1000,

        content,

        metadata: msgMeta
      }
    ],

    parent_message_id:
      parentMessageId,

    model: 'auto',

    timezone_offset_min:
      new Date().getTimezoneOffset(),

    timezone:
      Intl.DateTimeFormat()
        .resolvedOptions()
        .timeZone,

    conversation_mode: {
      kind: 'primary_assistant'
    },

    enable_message_followups: true,

    system_hints:
      webSearch ? ['search'] : [],

    supports_buffering: true,

    supported_encodings: [
      'v1'
    ],

    client_contextual_info: {
      is_dark_mode: true,
      time_since_loaded: 10,
      page_height: 845,
      page_width: 423,
      pixel_ratio: 1.7,
      screen_height:
        auth.screenHeight,
      screen_width:
        auth.screenWidth,
      app_name: 'chatgpt.com'
    },

    no_auth_ad_preferences: {
      personalization_enabled: true,
      history_enabled: true
    },

    paragen_cot_summary_display_override:
      'allow',

    force_parallel_switch:
      'auto'
  }

  if (conversationId) {
    body.conversation_id =
      conversationId
  }

  if (webSearch) {
    body.force_use_search = true

    body.client_reported_search_source =
      'conversation_composer_web_icon'
  }

  return body
}

function parseSSE(buffer) {
  const lines =
    buffer.split('\n')

  const results = []

  for (const line of lines) {
    if (!line.startsWith('data:')) {
      continue
    }

    const raw =
      line.slice(5).trim()

    if (!raw || raw === '[DONE]') {
      continue
    }

    try {
      results.push(
        JSON.parse(raw)
      )
    } catch {}
  }

  return results
}

async function chat(
  prompt,
  auth = null,
  chatId = null,
  parentMsgId = null,
  opts = {}
) {
  auth =
    auth ||
    await startSession()

  const {
    webSearch = false,
    stream = false,
    onChunk = null
  } = opts

  if (!prompt?.trim()) {
    throw new Error(
      'Pesan tidak boleh kosong.'
    )
  }

  const msgId =
    crypto.randomUUID()

  const parentMessageId =
    parentMsgId ||
    'client-created-root'

  const [
    tokens,
    conduitToken
  ] = await Promise.all([
    generateSentinelTokens(auth),

    getConduitToken(
      prompt,
      msgId,
      auth,
      {
        conversationId: chatId,
        parentMsgId:
          parentMessageId,
        webSearch
      }
    )
  ])

  const body =
    buildMessageBody(
      prompt,
      msgId,
      auth,
      {
        conversationId: chatId,
        parentMsgId:
          parentMessageId,
        webSearch
      }
    )

  const headers = {
    ...auth.headers,

    accept:
      'text/event-stream',

    'OAI-Language':
      auth.lang,

    'OpenAI-Sentinel-Chat-Requirements-Token':
      tokens.chatRequirementsToken,

    'OpenAI-Sentinel-Turnstile-Token':
      tokens.turnstile,

    'OpenAI-Sentinel-Proof-Token':
      tokens.pow,

    'X-Conduit-Token':
      conduitToken
  }

  const {
    res,
    headers: resHeaders
  } = await request(
    'https://chatgpt.com/backend-anon/f/conversation',
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      stream: true
    }
  )

  syncCookies(
    auth.cookies,
    resHeaders['set-cookie']
  )

  return new Promise(
    (resolve, reject) => {
      let fullText = ''
      let title = null
      let model = null
      let convId = null
      let assistantMsgId = null
      let buf = ''

      res.on('data', chunk => {
        try {
          buf += chunk.toString('utf8')

          const events =
            buf.split('\n\n')

          buf =
            events.pop() || ''

          for (const event of events) {
            const parsed =
              parseSSE(event)

            for (const json of parsed) {
              if (json.conversation_id) {
                convId =
                  json.conversation_id
              }

              else if (
                json.v?.conversation_id
              ) {
                convId =
                  json.v.conversation_id
              }

              if (
                json.v &&
                !Array.isArray(json.v) &&
                json.v.message?.author?.role ===
                  'assistant' &&
                json.v.message?.id
              ) {
                assistantMsgId =
                  json.v.message.id
              }

              if (
                json.type ===
                'title_generation'
              ) {
                title =
                  json.title
              }

              if (
                json.type ===
                'server_ste_metadata'
              ) {
                model =
                  json.metadata
                    ?.model_slug ||
                  null
              }

              const patches =
                Array.isArray(json.v)
                  ? json.v
                  : []

              for (const p of patches) {
                if (
                  p.o === 'append' &&
                  p.p?.includes(
                    '/message/content/parts/0'
                  )
                ) {
                  fullText += p.v

                  if (
                    stream &&
                    typeof onChunk ===
                      'function'
                  ) {
                    onChunk(p.v)
                  }
                }
              }
            }
          }
        } catch (err) {
          reject(err)
        }
      })

      res.on('end', () => {
        resolve({
          text: fullText,
          title,
          model,
          conversationId: convId,
          messageId:
            assistantMsgId,
          auth
        })
      })

      res.on('error', reject)
    }
  )
}



let handler = async (
  m,
  {
    conn,
    text,
    usedPrefix,
    command
  }
) => {
  if (!text?.trim()) {
    return m.reply(
      `🗿 Contoh:\n` +
      `${usedPrefix + command} Halo, siapa kamu?\n\n` +
      `Web Search:\n` +
      `${usedPrefix + command} --search berita Indonesia hari ini`
    )
  }

  try {
    let webSearch = false
    let prompt = text.trim()

    if (
      /^--search\b/i.test(prompt)
    ) {
      webSearch = true

      prompt = prompt
        .replace(
          /^--search\b/i,
          ''
        )
        .trim()
    }

    if (!prompt) {
      return m.reply(
        'Masukkan pertanyaannya juga 🗿'
      )
    }

    await m.reply(
      webSearch
        ? '🔎 Mencari informasi...'
        : '⏳ Tunggu sebentar...'
    )

    const auth =
      await startSession()

    const result =
      await chat(
        prompt,
        auth,
        null,
        null,
        {
          webSearch
        }
      )

    if (!result.text) {
      throw new Error(
        'ChatGPT tidak mengembalikan respons.'
      )
    }

    let output =
      `🤖 *ChatGPT AI*\n\n` +
      result.text

    if (result.model) {
      output +=
        `\n\n> Model: ${result.model}`
    }

    await conn.sendMessage(
      m.chat,
      {
        text: output
      },
      {
        quoted: m
      }
    )

  } catch (err) {
    console.error(
      '[ChatGPT Plugin]',
      err
    )

    await m.reply(
      `❌ *ChatGPT Error*\n\n` +
      `${err?.message || err}`
    )
  }
}

handler.help = [
  'chatgpt <text>',
  'chatgpt --search <text>'
]

handler.tags = [
  'ai'
]

handler.command =
  /^(chatgpt|gpt|askgpt)$/i

export default handler