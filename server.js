const express = require('express')
const axios = require('axios')
const FormData = require('form-data')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const path = require('path')
const net = require('net')
const dns = require('dns').promises
require('dotenv').config()

const app = express()

// Built-in sensible defaults so only PLANTNET_API_KEY is needed
const PORT = 3000
const HOST = '0.0.0.0'
const BODY_LIMIT = '8mb'
const RATE_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const RATE_MAX_REQUESTS = 90
const PLANTNET_PROJECT = 'all'

// Trust first proxy so express-rate-limit reads client IP accurately behind reverse proxies
app.set('trust proxy', 1)

// Security headers with explicit Content Security Policy
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'", 'https://*.run.app', 'https://aistudio.google.com']
      }
    },
    crossOriginEmbedderPolicy: false
  })
)

// Same-origin CORS by default
app.use(cors({ origin: false }))

// Body parsing with bounded limit to prevent memory exhaustion
app.use(express.json({ limit: BODY_LIMIT }))

// Serve static frontend files from /web
const webDir = path.join(__dirname, 'web')
app.use(express.static(webDir))

function isPrivateOrLoopbackIp(ip) {
  if (!ip) return true
  const normalized = ip.replace(/^::ffff:/i, '')
  if (normalized === '127.0.0.1' || normalized === '::1' || normalized === '0.0.0.0') return true
  if (net.isIPv4(normalized)) {
    const parts = normalized.split('.').map(Number)
    if (parts[0] === 10) return true
    if (parts[0] === 127) return true
    if (parts[0] === 169 && parts[1] === 254) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] === 0) return true
  } else if (net.isIPv6(normalized)) {
    const lower = normalized.toLowerCase()
    if (lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) {
      return true
    }
  }
  return false
}

// Validate external HTTPS URLs against SSRF (blocks non-HTTPS and private/internal IPs)
async function validateSafeExternalHttpsUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('URL is required.')
  }
  let parsed
  try {
    parsed = new URL(rawUrl.trim())
  } catch (_) {
    throw new Error('Invalid URL format.')
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS image URLs are supported.')
  }
  const hostname = parsed.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Internal hostnames are not permitted.')
  }
  const addresses = await dns.lookup(hostname, { all: true })
  if (!addresses || addresses.length === 0 || addresses.some(a => isPrivateOrLoopbackIp(a.address))) {
    throw new Error('Target address is not permitted.')
  }
  return parsed
}

// Rate limiter for image proxy & wiki lookups
const proxyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many image requests, please try again later.' }
})

// Hardened image proxy to avoid CORS/referrer hotlink issues while blocking SSRF
app.get('/image-proxy', proxyLimiter, async (req, res) => {
  try {
    const parsed = await validateSafeExternalHttpsUrl(req.query.url)
    const resp = await axios.get(parsed.toString(), {
      responseType: 'stream',
      timeout: 10000,
      maxRedirects: 2,
      maxContentLength: 8 * 1024 * 1024,
      headers: {
        'User-Agent': 'PlantIdentifierBotanicalApp/1.0 (https://my.plantnet.org)'
      }
    })

    const contentType = (resp.headers['content-type'] || '').toLowerCase()
    if (!contentType.startsWith('image/')) {
      resp.data.destroy()
      return res.status(415).json({ error: 'The provided URL does not point to an image.' })
    }

    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    resp.data.pipe(res)
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to fetch image from URL.' })
  }
})

// Helper to resolve the active Pl@ntNet API key dynamically from env
function getPlantNetKey() {
  const candidates = [
    process.env.PLANTNET_API_KEY,
    process.env.PLANT_NET_API_KEY,
    process.env.PLANT_ID_API_KEY,
    process.env.API_KEY
  ]
  for (const raw of candidates) {
    const key = (raw || '').trim()
    if (key && !key.startsWith('0raGIr7xsmSglqREWd26v5L')) {
      return key
    }
  }
  return ''
}

// Botanical Care & Safety Knowledge Engine (by Family, Genus, and Species)
function buildCareGuide(scientificName, family, genus, wikiExtract) {
  const sci = (scientificName || '').toLowerCase()
  const fam = (family || '').toLowerCase()
  const gen = (genus || '').toLowerCase()
  const text = (wikiExtract || '').toLowerCase()

  // Default balanced care profile
  let sunlight = 'Bright indirect light to partial sun (4–6 hrs daily)'
  let watering = 'Water when the top 2–3 cm (1 in) of soil feels dry'
  let toxicity = 'Verify before ingestion; keep foliage away from pets'
  let environment = 'Adaptable to indoor containers or sheltered garden beds'
  let careTip = 'Ensure well-draining potting mix and avoid waterlogged roots.'

  if (fam === 'araceae' || gen === 'monstera' || gen === 'philodendron' || gen === 'epipremnum' || gen === 'zamioculcas' || gen === 'spathiphyllum' || gen === 'aglaonema') {
    sunlight = 'Bright, filtered indirect light; protect from harsh midday sun'
    watering = 'Every 7–10 days; allow top 5 cm (2 in) of soil to dry between waterings'
    toxicity = 'Toxic to cats & dogs if chewed (contains calcium oxalate crystals)'
    environment = 'Thrives indoors (18–29°C / 65–85°F) with moderate-to-high humidity'
    careTip = 'Use a chunky, airy aroid mix (orchid bark, perlite, peat/coir) and wipe leaves occasionally.'
  } else if (gen === 'ficus' || fam === 'moraceae') {
    sunlight = 'Bright indirect light with a few hours of gentle morning sun'
    watering = 'Every 7–14 days; allow top half of soil to dry out slightly'
    toxicity = 'Mildly toxic to pets (milky latex sap can irritate skin and stomach)'
    environment = 'Popular indoor tree or warm-climate patio specimen; avoid cold drafts'
    careTip = 'Ficus dislikes sudden changes in light or temperature—pick a bright spot and keep it consistent.'
  } else if (gen === 'hibiscus' || fam === 'malvaceae') {
    sunlight = 'Full sun to bright light (at least 6 hours of direct sunlight for blooms)'
    watering = 'Keep soil evenly moist during blooming season; reduce in winter'
    toxicity = 'Generally non-toxic to dogs and cats (most Hibiscus rosa-sinensis varieties)'
    environment = 'Warm outdoor garden shrub or sunny windowsill container'
    careTip = 'Feed with a potassium-rich bloom fertilizer during spring and summer for continuous flowers.'
  } else if (gen === 'lavandula' || fam === 'lamiaceae' || gen === 'rosmarinus' || gen === 'salvia' || gen === 'mentha' || gen === 'ocimum') {
    sunlight = 'Full, direct sunlight (6–8+ hours daily)'
    watering = 'Low to moderate; allow soil to dry thoroughly between waterings'
    toxicity = sci.includes('lavandula')
      ? 'Contain linalool; safe in small amounts for humans, mildly toxic to cats/dogs in large quantities'
      : 'Many Lamiaceae herbs (mint, basil, rosemary) are culinary and pet-safe'
    environment = 'Sunny outdoor beds, balconies, or bright south-facing windows'
    careTip = 'Requires sandy, fast-draining soil and good airflow; overwatering is the most common cause of root rot.'
  } else if (fam === 'cactaceae' || fam === 'crassulaceae' || gen === 'aloe' || gen === 'echeveria' || gen === 'sedum' || gen === 'haworthia') {
    sunlight = 'Bright direct to filtered sunlight (south or west exposure)'
    watering = 'Soak and dry method—water deeply every 2–3 weeks only when soil is bone dry'
    toxicity = gen === 'aloe' ? 'Aloe latex is toxic to cats and dogs if ingested' : 'Mostly pet-friendly (except Kalanchoe & Jade plant / Crassula ovata)'
    environment = 'Indoor sunny windowsills or arid outdoor rock gardens'
    careTip = 'Use cactus/succulent grit mix and a pot with a drainage hole; never leave water sitting in the saucer.'
  } else if (fam === 'orchidaceae' || gen === 'phalaenopsis' || gen === 'dendrobium') {
    sunlight = 'Bright, diffused east or west window light; no direct midday sun'
    watering = 'Water every 7–10 days when aerial roots turn silvery-white'
    toxicity = 'Non-toxic and safe for cats and dogs'
    environment = 'Indoor humid spaces (50–70% humidity) with gentle air circulation'
    careTip = 'Grow in coarse orchid bark rather than standard potting soil so roots can breathe.'
  } else if (fam === 'rosaceae' || gen === 'rosa' || gen === 'prunus' || gen === 'fragaria') {
    sunlight = 'Full sun (6+ hours of direct sunlight daily)'
    watering = 'Deep watering 1–2 times per week at the base of the plant'
    toxicity = 'Flowers/fruits are generally safe; seeds/pits of Prunus species contain cyanogenic glycosides'
    environment = 'Outdoor garden beds and patio containers'
    careTip = 'Water at soil level rather than overhead to keep foliage dry and prevent fungal leaf spot.'
  } else if (fam === 'solanaceae') {
    sunlight = 'Full sun (6–8 hours daily)'
    watering = 'Consistent, even moisture—do not let soil dry out completely'
    toxicity = 'Caution: Foliage and unripe berries of Nightshade family (Solanaceae) contain toxic alkaloids'
    environment = 'Warm outdoor garden beds or bright greenhouse'
    careTip = 'Provide sturdy support stakes and rich, compost-amended soil.'
  } else if (text.includes('succulent') || text.includes('drought')) {
    sunlight = 'Bright direct sunlight (6+ hours daily)'
    watering = 'Drought-tolerant; allow soil to dry completely between waterings'
  } else if (text.includes('tropical') || text.includes('rainforest')) {
    sunlight = 'Bright, filtered indirect light'
    watering = 'Keep soil lightly moist; prefers higher ambient humidity'
    environment = 'Warm indoor room or humid conservatory (above 16°C / 60°F)'
  }

  return {
    sunlight,
    watering,
    toxicity,
    environment,
    careTip
  }
}

// Helper to fetch a concise botanical summary & thumbnail from Wikipedia REST API
async function fetchWikipediaSummary(scientificName) {
  if (!scientificName) return { extract: null, url: null, thumbnail: null }
  try {
    const encoded = encodeURIComponent(scientificName.trim().replace(/\s+/g, '_'))
    const wikiResp = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`, {
      timeout: 6000,
      headers: { 'User-Agent': 'PlantIdentifierBotanicalApp/1.0' }
    })
    const data = wikiResp.data || {}
    return {
      extract: data.extract || null,
      url: data.content_urls?.desktop?.page || null,
      thumbnail: data.originalimage?.source || data.thumbnail?.source || null
    }
  } catch (_) {
    return { extract: null, url: null, thumbnail: null }
  }
}

// Endpoint to fetch Wikipedia botanical summary + Care Guide for any candidate species selected by the user
app.get('/wiki-summary', proxyLimiter, async (req, res) => {
  const species = typeof req.query.species === 'string' ? req.query.species.trim() : ''
  const family = typeof req.query.family === 'string' ? req.query.family.trim() : ''
  const genus = typeof req.query.genus === 'string' ? req.query.genus.trim() : ''
  if (!species || species.length > 120) {
    return res.status(400).json({ error: 'valid species query required' })
  }
  const summary = await fetchWikipediaSummary(species)
  const careGuide = buildCareGuide(species, family, genus, summary.extract)
  res.json({ ...summary, careGuide })
})

// Rate limiter for identify endpoint
const identifyLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: RATE_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many identification requests, please try again later.' }
})

const BASE64_REGEX = /^[A-Za-z0-9+/=\r\n]+$/
const ALLOWED_ORGANS = new Set(['auto', 'leaf', 'flower', 'fruit', 'bark'])
const ALLOWED_SAMPLES = {
  monstera: {
    wikiTitle: 'Monstera_deliciosa',
    organ: 'leaf',
    label: 'Monstera deliciosa'
  },
  ficus: {
    wikiTitle: 'Ficus_elastica',
    organ: 'leaf',
    label: 'Ficus elastica'
  },
  hibiscus: {
    wikiTitle: 'Hibiscus_rosa-sinensis',
    organ: 'flower',
    label: 'Hibiscus rosa-sinensis'
  },
  lavandula: {
    wikiTitle: 'Lavandula_angustifolia',
    organ: 'flower',
    label: 'Lavandula angustifolia'
  }
}

app.post('/identify', identifyLimiter, async (req, res) => {
  try {
    const requestedOrgan = req.body && typeof req.body.organ === 'string' ? req.body.organ.toLowerCase() : 'auto'
    let organ = ALLOWED_ORGANS.has(requestedOrgan) ? requestedOrgan : 'auto'
    const sampleId = req.body && typeof req.body.sampleId === 'string' ? req.body.sampleId.toLowerCase() : null
    const imageUrl = req.body && typeof req.body.imageUrl === 'string' ? req.body.imageUrl.trim() : null

    let imageBuffer = null
    let samplePreviewUrl = null

    if (sampleId && ALLOWED_SAMPLES[sampleId]) {
      const sampleMeta = ALLOWED_SAMPLES[sampleId]
      if (organ === 'auto') organ = sampleMeta.organ
      const wikiInfo = await fetchWikipediaSummary(sampleMeta.wikiTitle)
      if (wikiInfo.thumbnail) {
        samplePreviewUrl = wikiInfo.thumbnail
        try {
          const imgResp = await axios.get(wikiInfo.thumbnail, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: { 'User-Agent': 'PlantIdentifierBotanicalApp/1.0' }
          })
          imageBuffer = Buffer.from(imgResp.data)
        } catch (err) {
          console.error('Failed to download sample image from Wikimedia:', err.message)
        }
      }
    } else if (imageUrl) {
      // Laptop user pasted a web image URL
      let parsedUrl
      try {
        parsedUrl = await validateSafeExternalHttpsUrl(imageUrl)
      } catch (urlErr) {
        return res.status(400).json({ error: urlErr.message })
      }
      try {
        const imgResp = await axios.get(parsedUrl.toString(), {
          responseType: 'arraybuffer',
          timeout: 12000,
          maxRedirects: 2,
          maxContentLength: 8 * 1024 * 1024,
          headers: { 'User-Agent': 'PlantIdentifierBotanicalApp/1.0' }
        })
        const cType = (imgResp.headers['content-type'] || '').toLowerCase()
        if (!cType.startsWith('image/')) {
          return res.status(400).json({ error: 'That link does not point directly to an image file (JPEG, PNG, or WebP).' })
        }
        imageBuffer = Buffer.from(imgResp.data)
        samplePreviewUrl = parsedUrl.toString()
      } catch (fetchErr) {
        return res.status(400).json({ error: 'Could not download image from that URL. Try right-clicking the image and copying the direct image address.' })
      }
    } else {
      const rawImage = req.body && req.body.image
      if (!rawImage || typeof rawImage !== 'string') {
        return res.status(400).json({ error: 'Please select, paste, or provide a plant image first.' })
      }

      const cleanBase64 = rawImage.includes(',') ? rawImage.split(',')[1].trim() : rawImage.trim()
      if (cleanBase64.length < 200) {
        return res.status(400).json({ error: 'Selected image is too small or invalid.' })
      }
      if (cleanBase64.length > 8 * 1024 * 1024) {
        return res.status(413).json({ error: 'Image exceeds the 8 MB maximum size limit.' })
      }
      if (!BASE64_REGEX.test(cleanBase64)) {
        return res.status(400).json({ error: 'Invalid base64 image encoding.' })
      }
      imageBuffer = Buffer.from(cleanBase64, 'base64')
    }

    const plantNetKey = getPlantNetKey()

    // Fallback demo response if PLANTNET_API_KEY is not set or sample image fetch failed offline
    if (!plantNetKey || !imageBuffer) {
      await new Promise(r => setTimeout(r, 450))
      const samples = {
        ficus: {
          plantName: 'Rubber Plant',
          scientificName: 'Ficus elastica Roxb. ex Hornem.',
          scientificNameWithoutAuthor: 'Ficus elastica',
          confidence: 0.914,
          commonNames: ['Rubber Plant', 'Rubber Fig', 'Indian Rubber Bush'],
          wikiDescription:
            'Ficus elastica, the rubber fig, rubber bush, rubber tree, rubber plant, or Indian rubber bush, is a species of flowering plant in the family Moraceae, native to eastern parts of South and Southeast Asia. It is a robust evergreen tree widely cultivated as an indoor houseplant for its thick, glossy leaves.',
          wikiUrl: 'https://en.wikipedia.org/wiki/Ficus_elastica',
          similarImageUrls: samplePreviewUrl ? [samplePreviewUrl] : [],
          taxonomy: {
            kingdom: 'Plantae',
            family: 'Moraceae',
            genus: 'Ficus',
            species: 'Ficus elastica'
          },
          gbifId: '5361903'
        },
        hibiscus: {
          plantName: 'China Rose',
          scientificName: 'Hibiscus rosa-sinensis L.',
          scientificNameWithoutAuthor: 'Hibiscus rosa-sinensis',
          confidence: 0.892,
          commonNames: ['China Rose', 'Chinese Hibiscus', 'Hawaiian Hibiscus', 'Rose Mallow'],
          wikiDescription:
            'Hibiscus rosa-sinensis, known colloquially as Chinese hibiscus, China rose, Hawaiian hibiscus, rose mallow and shoeblackplant, is a species of tropical hibiscus in the family Malvaceae, widely cultivated in tropical and subtropical regions.',
          wikiUrl: 'https://en.wikipedia.org/wiki/Hibiscus_rosa-sinensis',
          similarImageUrls: samplePreviewUrl ? [samplePreviewUrl] : [],
          taxonomy: {
            kingdom: 'Plantae',
            family: 'Malvaceae',
            genus: 'Hibiscus',
            species: 'Hibiscus rosa-sinensis'
          },
          gbifId: '3152559'
        },
        monstera: {
          plantName: 'Swiss Cheese Plant',
          scientificName: 'Monstera deliciosa Liebm.',
          scientificNameWithoutAuthor: 'Monstera deliciosa',
          confidence: 0.942,
          commonNames: ['Swiss Cheese Plant', 'Split-leaf Philodendron', 'Ceriman'],
          wikiDescription:
            'Monstera deliciosa, the Swiss cheese plant or split-leaf philodendron, is a species of flowering plant native to tropical forests of southern Mexico, south to Panama. It is extensively cultivated in temperate zones as a popular indoor houseplant.',
          wikiUrl: 'https://en.wikipedia.org/wiki/Monstera_deliciosa',
          similarImageUrls: samplePreviewUrl ? [samplePreviewUrl] : [],
          taxonomy: {
            kingdom: 'Plantae',
            family: 'Araceae',
            genus: 'Monstera',
            species: 'Monstera deliciosa'
          },
          gbifId: '2868241'
        },
        lavandula: {
          plantName: 'English Lavender',
          scientificName: 'Lavandula angustifolia Mill.',
          scientificNameWithoutAuthor: 'Lavandula angustifolia',
          confidence: 0.886,
          commonNames: ['English Lavender', 'True Lavender', 'Common Lavender'],
          wikiDescription:
            'Lavandula angustifolia, formerly Lavandula officinalis, is a flowering plant in the family Lamiaceae, native to the Mediterranean. It is an aromatic evergreen shrub prized for its fragrant blooms and essential oils.',
          wikiUrl: 'https://en.wikipedia.org/wiki/Lavandula_angustifolia',
          similarImageUrls: samplePreviewUrl ? [samplePreviewUrl] : [],
          taxonomy: {
            kingdom: 'Plantae',
            family: 'Lamiaceae',
            genus: 'Lavandula',
            species: 'Lavandula angustifolia'
          },
          gbifId: '2927305'
        }
      }

      const key = sampleId && samples[sampleId] ? sampleId : 'monstera'
      const pick = samples[key]
      const careGuide = buildCareGuide(
        pick.scientificNameWithoutAuthor,
        pick.taxonomy.family,
        pick.taxonomy.genus,
        pick.wikiDescription
      )
      return res.json({
        ...pick,
        careGuide,
        organUsed: organ,
        samplePreviewUrl,
        mock: true,
        liveApi: false,
        candidates: Object.values(samples).map((s, idx) => ({
          rank: idx + 1,
          plantName: s.plantName,
          scientificName: s.scientificName,
          scientificNameWithoutAuthor: s.scientificNameWithoutAuthor,
          confidence: idx === 0 ? pick.confidence : Math.max(0.02, +(0.18 / (idx + 1)).toFixed(3)),
          commonNames: s.commonNames,
          taxonomy: s.taxonomy,
          similarImageUrls: s.similarImageUrls,
          gbifId: s.gbifId,
          careGuide: buildCareGuide(
            s.scientificNameWithoutAuthor,
            s.taxonomy.family,
            s.taxonomy.genus,
            s.wikiDescription
          )
        }))
      })
    }

    // Live Pl@ntNet v2 API request
    const form = new FormData()
    form.append('images', imageBuffer, {
      filename: 'specimen.jpg',
      contentType: 'image/jpeg'
    })
    form.append('organs', organ)

    const plantNetUrl = `https://my-api.plantnet.org/v2/identify/${PLANTNET_PROJECT}`
    const resp = await axios.post(plantNetUrl, form, {
      params: {
        'api-key': plantNetKey,
        'include-related-images': 'true',
        lang: 'en'
      },
      headers: {
        ...form.getHeaders()
      },
      timeout: 25000
    })

    const data = resp.data || {}
    const results = Array.isArray(data.results) ? data.results : []
    if (results.length === 0) {
      return res.json({ candidates: [], liveApi: true })
    }

    // Map top 5 candidate species from Pl@ntNet response
    const candidates = results.slice(0, 5).map((item, idx) => {
      const sp = item.species || {}
      const sciNoAuthor = sp.scientificNameWithoutAuthor || ''
      const fullSci = sp.scientificName || sciNoAuthor || 'Unknown species'
      const commons = Array.isArray(sp.commonNames) ? sp.commonNames : []
      const familyName = sp.family?.scientificNameWithoutAuthor || sp.family?.scientificName || null
      const genusName = sp.genus?.scientificNameWithoutAuthor || sp.genus?.scientificName || null
      const simUrls = (Array.isArray(item.images) ? item.images : [])
        .map(img => img?.url?.m || img?.url?.o || img?.url?.s)
        .filter(u => typeof u === 'string' && u.startsWith('https://'))

      return {
        rank: idx + 1,
        plantName: commons[0] || sciNoAuthor || fullSci,
        scientificName: fullSci,
        scientificNameWithoutAuthor: sciNoAuthor,
        authorship: sp.scientificNameAuthorship || null,
        confidence: typeof item.score === 'number' ? item.score : 0,
        commonNames: commons,
        taxonomy: {
          kingdom: 'Plantae',
          family: familyName,
          genus: genusName,
          species: sciNoAuthor || fullSci
        },
        similarImageUrls: simUrls,
        gbifId: item.gbif?.id ? String(item.gbif.id) : null,
        powoId: item.powo?.id ? String(item.powo.id) : null,
        careGuide: buildCareGuide(sciNoAuthor, familyName, genusName, '')
      }
    })

    const topCandidate = candidates[0]
    const wiki = await fetchWikipediaSummary(topCandidate.scientificNameWithoutAuthor)
    topCandidate.careGuide = buildCareGuide(
      topCandidate.scientificNameWithoutAuthor,
      topCandidate.taxonomy?.family,
      topCandidate.taxonomy?.genus,
      wiki.extract
    )

    const out = {
      ...topCandidate,
      wikiDescription: wiki.extract,
      wikiUrl: wiki.url,
      organUsed: organ,
      samplePreviewUrl,
      remainingIdentificationRequests: data.remainingIdentificationRequests ?? null,
      liveApi: true,
      mock: false,
      candidates
    }

    res.json(out)
  } catch (err) {
    if (err && err.response) {
      const status = err.response.status
      console.error('Upstream Pl@ntNet API error status:', status)
      if (status === 401 || status === 403) {
        return res.status(502).json({
          error: 'Pl@ntNet API key rejected (HTTP ' + status + '). Please check PLANTNET_API_KEY in your environment settings.'
        })
      }
      if (status === 404) {
        return res.status(404).json({
          error: 'Pl@ntNet could not match any plant species in this image. Try a clearer photo of a leaf or flower.'
        })
      }
      return res.status(502).json({
        error: `Pl@ntNet service returned HTTP ${status}. Please try another photo or try again shortly.`
      })
    }
    console.error('Identify handler error:', err ? err.message : 'Unknown error')
    res.status(500).json({ error: 'Failed to process plant identification request.' })
  }
})

app.listen(PORT, HOST, () => {
  console.log(`Pl@ntNet API proxy listening on ${HOST}:${PORT}`)
})
