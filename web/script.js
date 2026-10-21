const fileInput = document.getElementById('file')
const topUploadBtn = document.getElementById('topUploadBtn')
const dropzone = document.getElementById('dropzone')
const preview = document.getElementById('preview')
const sanitizedBadge = document.getElementById('sanitizedBadge')
const identifyBtn = document.getElementById('identify')
const dbgReset = document.getElementById('dbgReset')
const urlForm = document.getElementById('urlForm')
const imageUrlInput = document.getElementById('imageUrlInput')
const urlSubmitBtn = document.getElementById('urlSubmitBtn')
const inlineLoader = document.getElementById('inlineLoader')
const inlineLoaderText = document.getElementById('inlineLoaderText')

const resultSection = document.getElementById('result')
const accessionMeta = document.getElementById('accessionMeta')
const nameEl = document.getElementById('name')
const sciEl = document.getElementById('scientific')
const taxonomyEl = document.getElementById('taxonomy')
const taxonomyList = document.getElementById('taxonomyList')
const confEl = document.getElementById('confidence')
const confidenceBar = document.getElementById('confidenceBar')
const commonEl = document.getElementById('commonNames')
const descEl = document.getElementById('description')
const candidatesBody = document.getElementById('candidatesBody')
const similarEl = document.getElementById('similar')
const mediaArea = document.getElementById('mediaArea')
const figureCaption = document.getElementById('figureCaption')
const statusBanner = document.getElementById('statusBanner')
const saveSpecimenBtn = document.getElementById('saveSpecimenBtn')
const copyCitationBtn = document.getElementById('copyCitationBtn')

// Care Guide elements
const careSunlight = document.getElementById('careSunlight')
const careWatering = document.getElementById('careWatering')
const careToxicity = document.getElementById('careToxicity')
const careEnvironment = document.getElementById('careEnvironment')

// Personal Space & Desktop Folder Sync elements
const connectFolderBtn = document.getElementById('connectFolderBtn')
const syncNowBtn = document.getElementById('syncNowBtn')
const folderStatusText = document.getElementById('folderStatusText')
const vaultCountText = document.getElementById('vaultCountText')
const autoSaveToggleBtn = document.getElementById('autoSaveToggleBtn')
const gardenNameInput = document.getElementById('gardenNameInput')
const environmentSelect = document.getElementById('environmentSelect')
const petPrefSelect = document.getElementById('petPrefSelect')
const collectionGrid = document.getElementById('collectionGrid')
const collectionSearch = document.getElementById('collectionSearch')
const exportCollectionBtn = document.getElementById('exportCollectionBtn')
const importBundleInput = document.getElementById('importBundleInput')
const clearCollectionBtn = document.getElementById('clearCollectionBtn')

let currentBase64 = null
let currentImageUrl = null
let currentSampleId = null
let currentPreviewDataUrl = null
let selectedOrgan = 'auto'
let activeCollectionFilter = 'all'
let lastIdentificationData = null
let activeCandidate = null
let desktopDirectoryHandle = null
let cachedPlants = []
let userPreferences = {
  gardenName: '',
  environment: 'Indoor Apartment',
  petPreference: 'No Pets',
  autoSave: true,
  interests: ['Houseplants', 'Flowers']
}
let _loaderTimeout = null

const DB_NAME = 'VerdantPersonalSpaceDB'
const DB_VERSION = 1
const PLANTS_STORE = 'plants'
const PREFS_KEY = 'verdant_user_prefs_v1'
const LEGACY_STORAGE_KEY = 'verdant_herbarium_collection_v1'

const EMPTY_PLATE_HTML = `
  <div class="empty-plate">
    <svg class="plate-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M32 10C20 16 14 30 18 44C21 51 28 54 32 54C36 54 43 51 46 44C50 30 44 16 32 10Z" stroke="currentColor" stroke-width="1.75"/>
      <path d="M32 10V54M32 24L22 19M32 34L20 29M32 43L23 39M32 24L42 19M32 34L44 29M32 43L41 39" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <p class="empty-title">Drag &amp; drop a photo here, click to browse, or press Ctrl+V to paste</p>
    <p class="empty-sub">Supports JPEG, PNG, and WebP up to 20 MB</p>
  </div>
`

// ============================================================================
// 1. High-Capacity IndexedDB Personal Vault + Desktop Folder Sync Engine
// ============================================================================

function openPersonalVaultDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      return resolve(null)
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(PLANTS_STORE)) {
        db.createObjectStore(PLANTS_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function loadPlantsFromVault() {
  try {
    const db = await openPersonalVaultDB()
    if (!db) {
      const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
      cachedPlants = raw ? JSON.parse(raw) : []
      return cachedPlants
    }
    return new Promise(resolve => {
      const tx = db.transaction(PLANTS_STORE, 'readonly')
      const store = tx.objectStore(PLANTS_STORE)
      const req = store.getAll()
      req.onsuccess = () => {
        const items = Array.isArray(req.result) ? req.result : []
        items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        cachedPlants = items
        resolve(items)
      }
      req.onerror = () => resolve([])
    })
  } catch (_) {
    return []
  }
}

async function savePlantToVault(entry) {
  try {
    const db = await openPersonalVaultDB()
    if (db) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(PLANTS_STORE, 'readwrite')
        const store = tx.objectStore(PLANTS_STORE)
        store.put(entry)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    }
    const existingIdx = cachedPlants.findIndex(p => p.id === entry.id)
    if (existingIdx >= 0) {
      cachedPlants[existingIdx] = entry
    } else {
      cachedPlants.unshift(entry)
    }
    updateVaultStatsUI()
    if (desktopDirectoryHandle) {
      await syncVaultToDesktopFolder()
    }
  } catch (err) {
    console.warn('Vault save error:', err)
  }
}

async function deletePlantFromVault(id) {
  try {
    const db = await openPersonalVaultDB()
    if (db) {
      await new Promise(resolve => {
        const tx = db.transaction(PLANTS_STORE, 'readwrite')
        tx.objectStore(PLANTS_STORE).delete(id)
        tx.oncomplete = () => resolve()
      })
    }
    cachedPlants = cachedPlants.filter(p => p.id !== id)
    updateVaultStatsUI()
    if (desktopDirectoryHandle) {
      await syncVaultToDesktopFolder()
    }
  } catch (_) {}
}

async function clearEntireVault() {
  try {
    const db = await openPersonalVaultDB()
    if (db) {
      await new Promise(resolve => {
        const tx = db.transaction(PLANTS_STORE, 'readwrite')
        tx.objectStore(PLANTS_STORE).clear()
        tx.oncomplete = () => resolve()
      })
    }
    localStorage.removeItem(LEGACY_STORAGE_KEY)
    cachedPlants = []
    updateVaultStatsUI()
  } catch (_) {}
}

function loadUserPreferences() {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      userPreferences = { ...userPreferences, ...parsed }
    }
  } catch (_) {}

  if (gardenNameInput) gardenNameInput.value = userPreferences.gardenName || ''
  if (environmentSelect) environmentSelect.value = userPreferences.environment || 'Indoor Apartment'
  if (petPrefSelect) petPrefSelect.value = userPreferences.petPreference || 'No Pets'
  if (autoSaveToggleBtn) {
    autoSaveToggleBtn.classList.toggle('active', !!userPreferences.autoSave)
    autoSaveToggleBtn.textContent = userPreferences.autoSave ? 'Auto-Save ON' : 'Auto-Save OFF'
    autoSaveToggleBtn.setAttribute('aria-pressed', String(!!userPreferences.autoSave))
  }

  document.querySelectorAll('.interest-btn').forEach(btn => {
    const interest = btn.getAttribute('data-interest')
    btn.classList.toggle('active', userPreferences.interests.includes(interest))
  })
}

async function saveUserPreferences() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(userPreferences))
    if (desktopDirectoryHandle) {
      await syncVaultToDesktopFolder()
    }
  } catch (_) {}
}

function slugify(text) {
  return (text || 'plant')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/**
 * Writes the user's preferences, full plant catalog JSON, Markdown care cards,
 * and uploaded JPEG photos directly into their linked Desktop folder via the File System Access API.
 */
async function syncVaultToDesktopFolder() {
  if (!desktopDirectoryHandle) return
  try {
    // 1. Write garden-space.json (preferences + all plant metadata)
    const spaceSummaryFile = await desktopDirectoryHandle.getFileHandle('garden-space.json', { create: true })
    const writableJson = await spaceSummaryFile.createWritable()
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      preferences: userPreferences,
      totalPlants: cachedPlants.length,
      plants: cachedPlants
    }
    await writableJson.write(JSON.stringify(exportPayload, null, 2))
    await writableJson.close()

    // 2. Create /photos and /care-cards subdirectories inside the user's chosen Desktop folder
    const photosDir = await desktopDirectoryHandle.getDirectoryHandle('photos', { create: true })
    const cardsDir = await desktopDirectoryHandle.getDirectoryHandle('care-cards', { create: true })

    for (const plant of cachedPlants) {
      const slug = `${slugify(plant.plantName || plant.scientificName)}-${plant.id.slice(-6)}`

      // Write Markdown care guide & personal notes card
      const mdHandle = await cardsDir.getFileHandle(`${slug}.md`, { create: true })
      const mdWriter = await mdHandle.createWritable()
      const pct = ((Number(plant.confidence) || 0) * 100).toFixed(1)
      const mdContent = [
        `# ${plant.plantName || 'Plant'} (${plant.scientificName || ''})`,
        ``,
        `- **Saved Date**: ${plant.savedDate || ''}`,
        `- **Match Score**: ${pct}%`,
        `- **Family**: ${plant.taxonomy?.family || 'Plantae'}`,
        `- **Common Names**: ${(plant.commonNames || []).join(', ') || 'None'}`,
        ``,
        `## Care & Safety Guide`,
        `- **Sunlight**: ${plant.careGuide?.sunlight || 'Bright indirect light'}`,
        `- **Watering**: ${plant.careGuide?.watering || 'Water when top soil is dry'}`,
        `- **Pet Safety**: ${plant.careGuide?.toxicity || 'Verify before ingestion'}`,
        `- **Environment**: ${plant.careGuide?.environment || ''}`,
        ``,
        `## Personal Notes`,
        `${plant.personalNote || 'No personal notes added yet.'}`,
        ``,
        `## Overview`,
        `${plant.wikiDescription || ''}`
      ].join('\n')
      await mdWriter.write(mdContent)
      await mdWriter.close()

      // Write actual .jpg image file if data:image/jpeg base64 is present
      if (plant.previewUrl && plant.previewUrl.startsWith('data:image/')) {
        try {
          const b64Data = plant.previewUrl.split(',')[1]
          const byteChars = atob(b64Data)
          const byteArrays = new Uint8Array(byteChars.length)
          for (let i = 0; i < byteChars.length; i++) {
            byteArrays[i] = byteChars.charCodeAt(i)
          }
          const imgHandle = await photosDir.getFileHandle(`${slug}.jpg`, { create: true })
          const imgWriter = await imgHandle.createWritable()
          await imgWriter.write(new Blob([byteArrays], { type: 'image/jpeg' }))
          await imgWriter.close()
        } catch (_) {}
      }
    }

    if (folderStatusText) {
      folderStatusText.textContent = `Synced to desktop folder "${desktopDirectoryHandle.name}" (photos/ + care-cards/ + garden-space.json)`
    }
  } catch (err) {
    console.warn('Desktop folder sync warning:', err)
  }
}

async function connectDesktopFolder() {
  if (typeof window.showDirectoryPicker !== 'function') {
    showStatus(
      'Direct folder linking requires Chrome, Edge, or Brave. You can use "Download Backup File" & "Load Backup File" in any browser to save your space to your desktop.',
      false
    )
    return
  }

  try {
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite'
    })
    desktopDirectoryHandle = handle
    if (connectFolderBtn) {
      connectFolderBtn.textContent = `Linked: ${handle.name}`
    }
    if (syncNowBtn) {
      syncNowBtn.hidden = false
    }

    // Check if the chosen folder already has a garden-space.json to restore from!
    try {
      const existingFileHandle = await handle.getFileHandle('garden-space.json', { create: false })
      const file = await existingFileHandle.getFile()
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (parsed && Array.isArray(parsed.plants) && parsed.plants.length > 0) {
        for (const p of parsed.plants) {
          if (p && p.id) await savePlantToVault(p)
        }
      }
      if (parsed && parsed.preferences) {
        userPreferences = { ...userPreferences, ...parsed.preferences }
        localStorage.setItem(PREFS_KEY, JSON.stringify(userPreferences))
        loadUserPreferences()
      }
    } catch (_) {
      // No existing garden-space.json in folder yet; we will create it now
    }

    await syncVaultToDesktopFolder()
    renderCollection()
    showStatus(
      `Connected to desktop folder "${handle.name}". All uploaded photos, notes, and interests are now synced there.`,
      false
    )
  } catch (err) {
    if (err && err.name === 'AbortError') return
    // If inside a cross-origin preview iframe, browsers block showDirectoryPicker with SecurityError
    if (err && err.name === 'SecurityError') {
      showStatus(
        'Browser security blocks direct folder access inside an embedded preview frame. Open this app in a full browser tab to link a live desktop folder, or click "Download Backup File" to save directly to your desktop.',
        false
      )
      return
    }
    showStatus('Could not link desktop folder: ' + (err.message || 'Permission denied.'), true)
  }
}

function updateVaultStatsUI() {
  if (vaultCountText) {
    const count = cachedPlants.length
    const favCount = cachedPlants.filter(p => p.favorite).length
    vaultCountText.textContent = `${count} ${count === 1 ? 'plant' : 'plants'} stored (${favCount} favorited)`
  }
}

// ============================================================================
// 2. Identification & UI Logic
// ============================================================================

function showStatus(message, isError = true) {
  if (!statusBanner) return
  if (!message) {
    statusBanner.hidden = true
    statusBanner.textContent = ''
    return
  }
  statusBanner.textContent = message
  statusBanner.className = isError ? 'status-banner error' : 'status-banner info'
  statusBanner.hidden = false
}

function showLoader(show, customMessage = 'Analyzing plant features with Pl@ntNet…') {
  if (!inlineLoader) return
  if (_loaderTimeout) {
    clearTimeout(_loaderTimeout)
    _loaderTimeout = null
  }
  if (inlineLoaderText && customMessage) {
    inlineLoaderText.textContent = customMessage
  }
  inlineLoader.hidden = !show
  if (show) {
    _loaderTimeout = setTimeout(() => {
      inlineLoader.hidden = true
      identifyBtn.disabled = !currentBase64 && !currentImageUrl && !currentSampleId
      showStatus('Identification request timed out. Please try again.', true)
    }, 30000)
  }
}

// Organ selector segmented buttons
document.querySelectorAll('.seg-btn[data-organ]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const newOrgan = btn.getAttribute('data-organ') || 'auto'
    if (newOrgan === selectedOrgan) return
    document.querySelectorAll('.seg-btn[data-organ]').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    selectedOrgan = newOrgan

    if (currentBase64) {
      await runIdentification({ image: currentBase64, organ: selectedOrgan })
    } else if (currentImageUrl) {
      await runIdentification({ imageUrl: currentImageUrl, organ: selectedOrgan })
    } else if (currentSampleId) {
      await runIdentification({ sampleId: currentSampleId, organ: selectedOrgan })
    }
  })
})

if (topUploadBtn) {
  topUploadBtn.addEventListener('click', () => fileInput.click())
}

if (dropzone) {
  dropzone.addEventListener('click', e => {
    if (e.target.closest('button')) return
    fileInput.click()
  })
  dropzone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fileInput.click()
    }
  })
  dropzone.addEventListener('dragover', e => {
    e.preventDefault()
    dropzone.classList.add('dragover')
  })
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover')
  })
  dropzone.addEventListener('drop', async e => {
    e.preventDefault()
    dropzone.classList.remove('dragover')
    const file = e.dataTransfer?.files?.[0]
    if (file) await handleSelectedFile(file)
  })
}

window.addEventListener('paste', async e => {
  const activeTag = document.activeElement?.tagName
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
    return
  }
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        await handleSelectedFile(file)
        break
      }
    }
  }
})

function sanitizeAndResizeImage(file, maxDimension = 1400, quality = 0.86) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('Please select a valid image file (JPEG, PNG, or WebP).'))
    }
    if (file.size > 20 * 1024 * 1024) {
      return reject(new Error('Image file exceeds the 20 MB maximum size.'))
    }

    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let width = img.naturalWidth || img.width
      let height = img.naturalHeight || img.height
      if (!width || !height) {
        return reject(new Error('Could not decode image dimensions.'))
      }

      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width)
          width = maxDimension
        } else {
          width = Math.round((width * maxDimension) / height)
          height = maxDimension
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)

      const sanitizedDataUrl = canvas.toDataURL('image/jpeg', quality)
      resolve({ dataUrl: sanitizedDataUrl, width, height })
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to decode the selected image.'))
    }
    img.src = objectUrl
  })
}

function setPreviewImage(srcUrl, metaText = 'GPS & EXIF metadata stripped') {
  preview.classList.remove('empty')
  preview.textContent = ''
  const img = document.createElement('img')
  img.src = srcUrl
  img.alt = 'Selected plant photo'
  img.referrerPolicy = 'no-referrer'
  preview.appendChild(img)
  if (sanitizedBadge) {
    sanitizedBadge.textContent = metaText
  }
}

function clearSampleSelectionHighlight() {
  document.querySelectorAll('.sample-card').forEach(c => c.classList.remove('active-sample'))
}

async function handleSelectedFile(file) {
  showStatus('')
  clearSampleSelectionHighlight()
  try {
    const { dataUrl, width, height } = await sanitizeAndResizeImage(file)
    currentPreviewDataUrl = dataUrl
    currentBase64 = dataUrl.split(',')[1]
    currentImageUrl = null
    currentSampleId = null
    if (imageUrlInput) imageUrlInput.value = ''
    setPreviewImage(dataUrl, `${width}×${height}px · EXIF scrubbed`)
    identifyBtn.disabled = false
  } catch (err) {
    currentBase64 = null
    currentPreviewDataUrl = null
    identifyBtn.disabled = true
    showStatus(err.message || 'Invalid image file.', true)
  }
}

fileInput.addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0]
  if (f) await handleSelectedFile(f)
})

if (urlForm) {
  urlForm.addEventListener('submit', async e => {
    e.preventDefault()
    const rawUrl = (imageUrlInput?.value || '').trim()
    if (!rawUrl) {
      showStatus('Please paste an HTTPS image link first.', true)
      return
    }
    clearSampleSelectionHighlight()
    currentImageUrl = rawUrl
    currentBase64 = null
    currentSampleId = null
    const proxied = '/image-proxy?url=' + encodeURIComponent(rawUrl)
    currentPreviewDataUrl = proxied
    setPreviewImage(proxied, 'Loaded from web image URL')
    await runIdentification({ imageUrl: rawUrl, organ: selectedOrgan })
  })
}

if (dbgReset) {
  dbgReset.addEventListener('click', () => {
    showLoader(false)
    showStatus('')
    clearSampleSelectionHighlight()
    identifyBtn.disabled = true
    fileInput.value = ''
    if (imageUrlInput) imageUrlInput.value = ''
    currentBase64 = null
    currentImageUrl = null
    currentSampleId = null
    currentPreviewDataUrl = null
    preview.classList.add('empty')
    preview.innerHTML = EMPTY_PLATE_HTML
    if (sanitizedBadge) sanitizedBadge.textContent = 'GPS & EXIF metadata stripped automatically'
    resultSection.hidden = true
  })
}

identifyBtn.addEventListener('click', async () => {
  if (currentBase64) {
    await runIdentification({ image: currentBase64, organ: selectedOrgan })
  } else if (currentImageUrl) {
    await runIdentification({ imageUrl: currentImageUrl, organ: selectedOrgan })
  } else if (currentSampleId) {
    await runIdentification({ sampleId: currentSampleId, organ: selectedOrgan })
  }
})

document.querySelectorAll('.sample-card').forEach(card => {
  card.addEventListener('click', async () => {
    const sampleId = card.getAttribute('data-sample')
    if (!sampleId) return
    clearSampleSelectionHighlight()
    card.classList.add('active-sample')
    currentSampleId = sampleId
    currentBase64 = null
    currentImageUrl = null
    if (imageUrlInput) imageUrlInput.value = ''
    const commonLabel = card.querySelector('.sample-common')?.textContent || 'sample plant'
    await runIdentification(
      { sampleId, organ: selectedOrgan },
      `Identifying ${commonLabel} via Pl@ntNet…`
    )
  })
})

async function runIdentification(payload, loaderMsg) {
  identifyBtn.disabled = true
  if (urlSubmitBtn) urlSubmitBtn.disabled = true
  showStatus('')
  showLoader(true, loaderMsg)
  try {
    const res = await fetch('/identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error((json && json.error) ? json.error : `Identification error (HTTP ${res.status})`)
    }
    if (!json || (!json.plantName && (!json.candidates || json.candidates.length === 0))) {
      throw new Error('No matching plant species found. Try selecting a clearer leaf or flower photo.')
    }

    if (json.samplePreviewUrl) {
      const proxiedSample = '/image-proxy?url=' + encodeURIComponent(json.samplePreviewUrl)
      currentPreviewDataUrl = proxiedSample
      setPreviewImage(proxiedSample, `Plant Part Analyzed: ${(json.organUsed || selectedOrgan).toUpperCase()}`)
    }

    lastIdentificationData = json
    renderDossier(json)

    // If Auto-Save is enabled and user uploaded/pasted their own image or URL, save automatically into their Personal Space!
    if (userPreferences.autoSave && (payload.image || payload.imageUrl)) {
      await recordCurrentPlantInPersonalSpace(true)
    }
  } catch (err) {
    showStatus(err.message || 'Identification request failed.', true)
  } finally {
    identifyBtn.disabled = !currentBase64 && !currentImageUrl && !currentSampleId
    if (urlSubmitBtn) urlSubmitBtn.disabled = false
    showLoader(false)
  }
}

function setConfidence(p) {
  const pct = Math.max(0, Math.min(100, (Number(p) || 0) * 100))
  confEl.textContent = `${pct.toFixed(1)}%`
  confidenceBar.style.width = `${pct}%`
}

function renderCareStrip(careGuide) {
  const cg = careGuide || {}
  if (careSunlight) {
    careSunlight.textContent = cg.sunlight || 'Bright indirect light to partial sun'
  }
  if (careWatering) {
    careWatering.textContent = cg.watering || 'Water when top 2–3 cm of soil feels dry'
  }
  if (careToxicity) {
    careToxicity.textContent = cg.toxicity || 'Keep foliage out of reach of pets and small children'
  }
  if (careEnvironment) {
    const env = cg.environment || 'Indoor pots or sheltered garden beds'
    const tip = cg.careTip ? ` — ${cg.careTip}` : ''
    careEnvironment.textContent = env + tip
  }
}

function renderSafeDescription(container, text, wikiUrl) {
  container.textContent = ''
  if (text && typeof text === 'string') {
    const parts = text
      .split(/\n\n+/)
      .map(s => s.trim())
      .filter(Boolean)
    parts.forEach(part => {
      const p = document.createElement('p')
      p.textContent = part
      container.appendChild(p)
    })
  } else {
    const p = document.createElement('p')
    p.textContent = 'No Wikipedia overview is currently indexed for this species.'
    container.appendChild(p)
  }

  if (wikiUrl && typeof wikiUrl === 'string') {
    try {
      const parsed = new URL(wikiUrl)
      if (parsed.protocol === 'https:') {
        const a = document.createElement('a')
        a.href = parsed.toString()
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        a.className = 'wiki-link'
        a.textContent = 'Read full article on Wikipedia →'
        container.appendChild(a)
      }
    } catch (_) {}
  }
}

function renderTaxonomyDefinitionList(tax, gbifId, organUsed) {
  if (!taxonomyList) return
  taxonomyList.textContent = ''
  const entries = [
    ['Family', tax?.family || 'Unassigned'],
    ['Genus', tax?.genus || 'Unassigned'],
    ['Species', tax?.species || 'Unassigned'],
    ['Part Analyzed', (organUsed || selectedOrgan || 'auto').toUpperCase()]
  ]
  if (gbifId) {
    entries.push(['GBIF ID', `#${gbifId}`])
  }

  entries.forEach(([label, val]) => {
    const dt = document.createElement('dt')
    dt.textContent = label
    const dd = document.createElement('dd')
    if (label === 'Species' || label === 'Genus') {
      dd.style.fontFamily = 'var(--font-display)'
      dd.style.fontStyle = 'italic'
    }
    dd.textContent = val
    taxonomyList.appendChild(dt)
    taxonomyList.appendChild(dd)
  })
}

function renderSimilarGallery(urls, speciesLabel) {
  similarEl.textContent = ''
  const validUrls = (Array.isArray(urls) ? urls : []).filter(
    u => typeof u === 'string' && u.startsWith('https://')
  )

  if (validUrls.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-collection-msg'
    empty.textContent = 'No reference photos available for this match.'
    similarEl.appendChild(empty)
    return
  }

  validUrls.slice(0, 8).forEach((url, idx) => {
    const wrapper = document.createElement('div')
    wrapper.className = 'gallery-item'

    const img = document.createElement('img')
    img.src = '/image-proxy?url=' + encodeURIComponent(url)
    img.alt = `${speciesLabel || 'Plant'} reference photo ${idx + 1}`
    img.loading = 'lazy'
    img.referrerPolicy = 'no-referrer'
    img.addEventListener('click', () => openLightbox(url, speciesLabel))
    img.onerror = () => {
      wrapper.textContent = ''
      const fb = document.createElement('div')
      fb.className = 'gallery-fallback'
      fb.textContent = 'Photo unavailable'
      wrapper.appendChild(fb)
    }

    wrapper.appendChild(img)
    similarEl.appendChild(wrapper)
  })
}

function applyCandidateToDossier(candidate, rootData) {
  activeCandidate = candidate
  const sourceBadge = rootData.liveApi
    ? 'Live Pl@ntNet Identification'
    : 'Sample Plant Preview'
  if (accessionMeta) {
    accessionMeta.textContent = `${sourceBadge} · Match #${candidate.rank || 1}`
  }

  nameEl.textContent = candidate.plantName || candidate.scientificNameWithoutAuthor || 'Unknown Plant'
  sciEl.textContent = candidate.scientificName || ''
  setConfidence(candidate.confidence || 0)

  const tax = candidate.taxonomy || rootData.taxonomy || {}
  const metaParts = []
  if (tax.family) metaParts.push(`Family: ${tax.family}`)
  if (tax.genus) metaParts.push(`Genus: ${tax.genus}`)
  if (rootData.organUsed) metaParts.push(`Part: ${rootData.organUsed}`)
  taxonomyEl.textContent = metaParts.join(' · ')

  renderTaxonomyDefinitionList(tax, candidate.gbifId, rootData.organUsed)
  renderCareStrip(candidate.careGuide || rootData.careGuide)

  const commons = Array.isArray(candidate.commonNames) ? candidate.commonNames : []
  commonEl.textContent = commons.length ? commons.join(' · ') : 'No additional common names listed'

  renderSimilarGallery(candidate.similarImageUrls, candidate.scientificNameWithoutAuthor)
}

function renderDossier(data) {
  const candidates =
    Array.isArray(data.candidates) && data.candidates.length
      ? data.candidates
      : [
          {
            rank: 1,
            plantName: data.plantName || 'Unknown Plant',
            scientificName: data.scientificName || '',
            scientificNameWithoutAuthor: data.scientificNameWithoutAuthor || data.plantName || '',
            confidence: data.confidence || 0,
            commonNames: data.commonNames || [],
            taxonomy: data.taxonomy || {},
            similarImageUrls: data.similarImageUrls || [],
            gbifId: data.gbifId || null,
            careGuide: data.careGuide || null
          }
        ]

  resultSection.hidden = false
  applyCandidateToDossier(candidates[0], data)
  renderSafeDescription(descEl, data.wikiDescription, data.wikiUrl)

  mediaArea.textContent = ''
  const previewImg = preview.querySelector('img')
  if (previewImg) {
    mediaArea.appendChild(previewImg.cloneNode(true))
  } else if (candidates[0].similarImageUrls?.[0]) {
    const fallbackImg = document.createElement('img')
    fallbackImg.src = '/image-proxy?url=' + encodeURIComponent(candidates[0].similarImageUrls[0])
    fallbackImg.alt = candidates[0].plantName
    mediaArea.appendChild(fallbackImg)
  }
  if (figureCaption) {
    figureCaption.textContent = `Photo matched as ${candidates[0].plantName} (${candidates[0].scientificName || ''}).`
  }

  if (candidatesBody) {
    candidatesBody.textContent = ''
    candidates.forEach((cand, idx) => {
      const tr = document.createElement('tr')
      if (idx === 0) tr.classList.add('active-row')

      const rankTd = document.createElement('td')
      rankTd.className = 'num-col'
      rankTd.style.textAlign = 'left'
      rankTd.textContent = `#${cand.rank || idx + 1}`

      const commonTd = document.createElement('td')
      commonTd.style.fontWeight = '600'
      commonTd.textContent = (cand.commonNames && cand.commonNames[0]) || cand.plantName || '—'

      const sciTd = document.createElement('td')
      sciTd.className = 'sci-cell'
      sciTd.textContent = cand.scientificName || cand.plantName

      const famTd = document.createElement('td')
      famTd.textContent = cand.taxonomy?.family || '—'

      const probTd = document.createElement('td')
      probTd.className = 'num-col'
      probTd.textContent = `${((Number(cand.confidence) || 0) * 100).toFixed(1)}%`

      tr.appendChild(rankTd)
      tr.appendChild(commonTd)
      tr.appendChild(sciTd)
      tr.appendChild(famTd)
      tr.appendChild(probTd)

      tr.addEventListener('click', async () => {
        candidatesBody.querySelectorAll('tr').forEach(r => r.classList.remove('active-row'))
        tr.classList.add('active-row')
        applyCandidateToDossier(cand, data)

        if (idx === 0 && data.wikiDescription) {
          renderSafeDescription(descEl, data.wikiDescription, data.wikiUrl)
        } else if (cand.scientificNameWithoutAuthor) {
          descEl.textContent = 'Loading plant overview…'
          try {
            const params = new URLSearchParams({
              species: cand.scientificNameWithoutAuthor,
              family: cand.taxonomy?.family || '',
              genus: cand.taxonomy?.genus || ''
            })
            const wRes = await fetch('/wiki-summary?' + params.toString())
            const wJson = await wRes.json()
            if (wJson.careGuide) {
              cand.careGuide = wJson.careGuide
              renderCareStrip(wJson.careGuide)
            }
            renderSafeDescription(descEl, wJson.extract, wJson.url)
          } catch (_) {
            renderSafeDescription(descEl, null, null)
          }
        }
      })

      candidatesBody.appendChild(tr)
    })
  }

  resultSection.scrollIntoView({ behavior: 'smooth' })
}

function openLightbox(url, captionText) {
  if (!url || typeof url !== 'string' || !url.startsWith('https://')) return
  let lb = document.getElementById('lightbox')
  if (!lb) {
    lb = document.getElementById('lightbox')
    lb = document.createElement('div')
    lb.id = 'lightbox'
    lb.style.position = 'fixed'
    lb.style.inset = '0'
    lb.style.background = 'rgba(24, 26, 23, 0.88)'
    lb.style.display = 'flex'
    lb.style.flexDirection = 'column'
    lb.style.alignItems = 'center'
    lb.style.justifyContent = 'center'
    lb.style.padding = '24px'
    lb.style.zIndex = '9999'
    lb.style.cursor = 'zoom-out'
    lb.addEventListener('click', () => lb.remove())
    document.body.appendChild(lb)
  }
  lb.textContent = ''
  const img = document.createElement('img')
  img.src = '/image-proxy?url=' + encodeURIComponent(url)
  img.alt = captionText || 'Plant reference photo'
  img.style.maxWidth = '92%'
  img.style.maxHeight = '84%'
  img.style.borderRadius = '6px'
  img.style.border = '1px solid #C9C1B0'
  lb.appendChild(img)
}

// ============================================================================
// 3. Personal Space Rendering, Notes, Favorites & Backup Import/Export
// ============================================================================

async function recordCurrentPlantInPersonalSpace(silentAutoSave = false) {
  if (!activeCandidate || !lastIdentificationData) return
  const now = Date.now()
  const entry = {
    id: 'plant_' + now,
    timestamp: now,
    plantName: activeCandidate.plantName,
    scientificName: activeCandidate.scientificName,
    scientificNameWithoutAuthor: activeCandidate.scientificNameWithoutAuthor,
    confidence: activeCandidate.confidence,
    commonNames: activeCandidate.commonNames,
    taxonomy: activeCandidate.taxonomy,
    similarImageUrls: activeCandidate.similarImageUrls,
    gbifId: activeCandidate.gbifId,
    careGuide: activeCandidate.careGuide || lastIdentificationData.careGuide,
    wikiDescription: descEl.querySelector('p')?.textContent || lastIdentificationData.wikiDescription,
    wikiUrl: lastIdentificationData.wikiUrl,
    organUsed: lastIdentificationData.organUsed,
    personalNote: '',
    favorite: false,
    previewUrl:
      currentPreviewDataUrl ||
      (activeCandidate.similarImageUrls?.[0]
        ? '/image-proxy?url=' + encodeURIComponent(activeCandidate.similarImageUrls[0])
        : null),
    savedDate: new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }),
    liveApi: lastIdentificationData.liveApi
  }

  await savePlantToVault(entry)
  renderCollection()
  if (!silentAutoSave) {
    showStatus(`Saved "${entry.plantName}" into your Personal Garden Space.`, false)
  }
}

function renderCollection() {
  if (!collectionGrid) return
  updateVaultStatsUI()
  const query = (collectionSearch?.value || '').trim().toLowerCase()

  const list = cachedPlants.filter(item => {
    if (activeCollectionFilter === 'favorites' && !item.favorite) return false
    if (activeCollectionFilter === 'with-notes' && !(item.personalNote && item.personalNote.trim())) {
      return false
    }
    if (!query) return true
    return (
      (item.plantName || '').toLowerCase().includes(query) ||
      (item.scientificName || '').toLowerCase().includes(query) ||
      (item.taxonomy?.family || '').toLowerCase().includes(query) ||
      (item.personalNote || '').toLowerCase().includes(query)
    )
  })

  collectionGrid.textContent = ''
  if (list.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-collection-msg'
    empty.textContent = query
      ? 'No plants in your Personal Space match your filter.'
      : 'Your Personal Garden Space is empty. Upload a photo or click "Save to Personal Space" on any plant result to store it here.'
    collectionGrid.appendChild(empty)
    return
  }

  list.forEach(entry => {
    const card = document.createElement('article')
    card.className = 'collection-card'

    if (entry.previewUrl) {
      const media = document.createElement('div')
      media.className = 'collection-card-media'
      const img = document.createElement('img')
      img.src = entry.previewUrl
      img.alt = entry.plantName || 'Saved plant'
      media.appendChild(img)
      card.appendChild(media)
    }

    const body = document.createElement('div')
    body.className = 'collection-card-body'

    const titleRow = document.createElement('div')
    titleRow.className = 'card-title-row'

    const title = document.createElement('h3')
    title.className = 'collection-card-title'
    title.textContent = entry.plantName || 'Unknown Plant'

    const favBtn = document.createElement('button')
    favBtn.type = 'button'
    favBtn.className = 'fav-btn' + (entry.favorite ? ' is-fav' : '')
    favBtn.textContent = entry.favorite ? 'Favorited' : 'Favorite'
    favBtn.addEventListener('click', async () => {
      entry.favorite = !entry.favorite
      await savePlantToVault(entry)
      renderCollection()
    })

    titleRow.appendChild(title)
    titleRow.appendChild(favBtn)

    const sci = document.createElement('p')
    sci.className = 'collection-card-sci'
    sci.textContent = entry.scientificName || ''

    const pct = ((Number(entry.confidence) || 0) * 100).toFixed(1)
    const meta = document.createElement('p')
    meta.className = 'collection-card-meta'
    meta.textContent = `${entry.taxonomy?.family || 'Plantae'} · ${pct}% match · ${entry.savedDate || ''}`

    // Editable Personal Note field saved straight to IndexedDB + Desktop Folder
    const noteInput = document.createElement('textarea')
    noteInput.className = 'note-textarea'
    noteInput.placeholder = 'Add personal note (e.g., where you found it, room location, watering log)…'
    noteInput.value = entry.personalNote || ''
    noteInput.addEventListener('change', async () => {
      entry.personalNote = noteInput.value.trim()
      await savePlantToVault(entry)
    })

    const actions = document.createElement('div')
    actions.className = 'collection-card-actions'

    const openBtn = document.createElement('button')
    openBtn.type = 'button'
    openBtn.className = 'btn-secondary'
    openBtn.textContent = 'View Care Guide'
    openBtn.addEventListener('click', () => {
      if (entry.previewUrl) {
        setPreviewImage(entry.previewUrl, 'Loaded from Personal Space')
      }
      renderDossier(entry)
    })

    const delBtn = document.createElement('button')
    delBtn.type = 'button'
    delBtn.className = 'btn-ghost'
    delBtn.textContent = 'Remove'
    delBtn.addEventListener('click', async () => {
      await deletePlantFromVault(entry.id)
      renderCollection()
    })

    actions.appendChild(openBtn)
    actions.appendChild(delBtn)

    body.appendChild(titleRow)
    body.appendChild(sci)
    body.appendChild(meta)
    body.appendChild(noteInput)
    body.appendChild(actions)
    card.appendChild(body)
    collectionGrid.appendChild(card)
  })
}

if (saveSpecimenBtn) {
  saveSpecimenBtn.addEventListener('click', () => recordCurrentPlantInPersonalSpace(false))
}

if (connectFolderBtn) {
  connectFolderBtn.addEventListener('click', connectDesktopFolder)
}

if (syncNowBtn) {
  syncNowBtn.addEventListener('click', async () => {
    await syncVaultToDesktopFolder()
    showStatus('Synced all photos, care cards, and preferences to your desktop folder.', false)
  })
}

if (autoSaveToggleBtn) {
  autoSaveToggleBtn.addEventListener('click', async () => {
    userPreferences.autoSave = !userPreferences.autoSave
    autoSaveToggleBtn.classList.toggle('active', userPreferences.autoSave)
    autoSaveToggleBtn.textContent = userPreferences.autoSave ? 'Auto-Save ON' : 'Auto-Save OFF'
    autoSaveToggleBtn.setAttribute('aria-pressed', String(userPreferences.autoSave))
    await saveUserPreferences()
  })
}

if (gardenNameInput) {
  gardenNameInput.addEventListener('change', async () => {
    userPreferences.gardenName = gardenNameInput.value.trim()
    await saveUserPreferences()
  })
}

if (environmentSelect) {
  environmentSelect.addEventListener('change', async () => {
    userPreferences.environment = environmentSelect.value
    await saveUserPreferences()
  })
}

if (petPrefSelect) {
  petPrefSelect.addEventListener('change', async () => {
    userPreferences.petPreference = petPrefSelect.value
    await saveUserPreferences()
  })
}

document.querySelectorAll('.interest-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const interest = btn.getAttribute('data-interest')
    if (!interest) return
    if (userPreferences.interests.includes(interest)) {
      userPreferences.interests = userPreferences.interests.filter(i => i !== interest)
      btn.classList.remove('active')
    } else {
      userPreferences.interests.push(interest)
      btn.classList.add('active')
    }
    await saveUserPreferences()
  })
})

document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')
    activeCollectionFilter = tab.getAttribute('data-filter') || 'all'
    renderCollection()
  })
})

if (copyCitationBtn) {
  copyCitationBtn.addEventListener('click', async () => {
    if (!activeCandidate) return
    const pct = ((Number(activeCandidate.confidence) || 0) * 100).toFixed(1)
    const cg = activeCandidate.careGuide || lastIdentificationData?.careGuide || {}
    const summaryText = `${activeCandidate.plantName} (${activeCandidate.scientificName}) — ${pct}% Match\nSunlight: ${
      cg.sunlight || 'Bright indirect light'
    }\nWatering: ${cg.watering || 'Water when top soil is dry'}\nPet Safety: ${cg.toxicity || 'Check before ingestion'}`
    try {
      await navigator.clipboard.writeText(summaryText)
      showStatus('Plant summary and care guide copied to clipboard.', false)
    } catch (_) {
      showStatus(summaryText, false)
    }
  })
}

if (collectionSearch) {
  collectionSearch.addEventListener('input', renderCollection)
}

// Download Complete Personal Space Backup (Preferences + Interests + Photos + Notes)
if (exportCollectionBtn) {
  exportCollectionBtn.addEventListener('click', () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      preferences: userPreferences,
      plants: cachedPlants
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const folderSlug = slugify(userPreferences.gardenName || 'my-personal-garden-space')
    a.download = `${folderSlug}-backup.json`
    a.click()
    URL.revokeObjectURL(url)
    showStatus('Downloaded your complete Personal Garden Space backup file.', false)
  })
}

// Restore Personal Space Backup File from Desktop
if (importBundleInput) {
  importBundleInput.addEventListener('change', async e => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const plantsList = Array.isArray(parsed) ? parsed : Array.isArray(parsed.plants) ? parsed.plants : []
      if (parsed.preferences) {
        userPreferences = { ...userPreferences, ...parsed.preferences }
        localStorage.setItem(PREFS_KEY, JSON.stringify(userPreferences))
        loadUserPreferences()
      }
      for (const item of plantsList) {
        if (item && item.id) {
          await savePlantToVault(item)
        }
      }
      await loadPlantsFromVault()
      renderCollection()
      showStatus(`Restored ${plantsList.length} plants and your preferences from backup file.`, false)
    } catch (err) {
      showStatus('Invalid backup file format. Please select a valid .json backup file.', true)
    } finally {
      importBundleInput.value = ''
    }
  })
}

if (clearCollectionBtn) {
  clearCollectionBtn.addEventListener('click', async () => {
    await clearEntireVault()
    renderCollection()
    showStatus('Personal Garden Space cleared.', false)
  })
}

// ============================================================================
// 4. Interactive New-User Tip Screen & Feature Walkthrough
// ============================================================================

const TIP_SEEN_KEY = 'verdant_onboarding_dismissed_v1'
const tipScreenModal = document.getElementById('tipScreenModal')
const tipStepIndicator = document.getElementById('tipStepIndicator')
const tipModalBody = document.getElementById('tipModalBody')
const closeTipModalBtn = document.getElementById('closeTipModalBtn')
const prevTipStepBtn = document.getElementById('prevTipStepBtn')
const nextTipStepBtn = document.getElementById('nextTipStepBtn')
const tryFeatureBtn = document.getElementById('tryFeatureBtn')
const dontShowTipsAgain = document.getElementById('dontShowTipsAgain')
const navTipsBtn = document.getElementById('navTipsBtn')
const topTipsBtn = document.getElementById('topTipsBtn')
const sectionTipsBtn = document.getElementById('sectionTipsBtn')

let currentTipStep = 0

const TIP_STEPS = [
  {
    stepNum: 1,
    headline: '01. Four Easy Ways to Add a Plant Photo on Your Laptop',
    lead: 'Designed for laptops and desktop browsers—no camera permissions or phone apps needed. You can feed a plant photo into the identifier in four ways:',
    targetSelector: '.uploader-stage',
    actionLabel: 'Highlight Photo Input Box',
    features: [
      {
        kicker: 'Method 1 · Local File',
        title: 'Drag & Drop or Browse Computer',
        desc: 'Drag any JPEG, PNG, or WebP file from your desktop into the dashed photo box, or click "Browse Computer" to pick a photo.'
      },
      {
        kicker: 'Method 2 · Clipboard Paste',
        title: 'Press Ctrl+V (or Cmd+V) Anywhere',
        desc: 'Right-click and copy any plant image from Google Images, a chat message, or a screenshot, then press Ctrl+V right on the page.'
      },
      {
        kicker: 'Method 3 · Web Image Link',
        title: 'Paste an HTTPS Image URL',
        desc: 'Paste a direct link to a plant photo into the "Or paste a direct image URL" field and click "Identify URL".'
      },
      {
        kicker: 'Method 4 · Instant Test',
        title: 'One-Click Sample Plants',
        desc: 'Don\'t have a photo ready? Click Swiss Cheese Plant, Hibiscus, Rubber Plant, or Lavender on the left to run a live Pl@ntNet check.'
      }
    ],
    callout: 'Tip: Once a photo is loaded in the preview box, click "Identify Plant" (or click any Sample Plant for an immediate 1-click result).'
  },
  {
    stepNum: 2,
    headline: '02. Choosing the Plant Part & Automatic Privacy Stripping',
    lead: 'Telling the identifier which part of the plant is visible boosts Pl@ntNet accuracy, while built-in canvas scrubbing protects your location privacy.',
    targetSelector: '.control-block',
    actionLabel: 'Highlight Plant Part Selector',
    features: [
      {
        kicker: 'Accuracy Booster',
        title: 'Auto-Detect, Leaf, Flower, Fruit, or Bark',
        desc: 'Leave it on "Auto-detect" for whole plants, or pick "Leaf" / "Flower" if your photo is a close-up of a single part.'
      },
      {
        kicker: 'Live Re-Calculation',
        title: 'Switch Parts Without Re-Uploading',
        desc: 'Already uploaded a photo? Clicking a different plant part button automatically re-runs the identification with that new focus.'
      },
      {
        kicker: 'Zero Location Leaks',
        title: 'Automatic GPS & EXIF Scrubbing',
        desc: 'Before any photo leaves your laptop, an HTML5 Canvas strips out embedded GPS coordinates and camera serial metadata.'
      },
      {
        kicker: 'No Camera Prompts',
        title: '100% Laptop-First Workflow',
        desc: 'This website never asks for webcam access—everything works cleanly from files, screenshots, and web links.'
      }
    ],
    callout: 'Tip: Clear photos of a single leaf or flower against a simple background yield the highest match confidence scores.'
  },
  {
    stepNum: 3,
    headline: '03. Understanding Your Results, Care Guide & Top 5 Matches',
    lead: 'When Pl@ntNet identifies your photo, it builds a complete Care & Safety Guide and lets you compare similar-looking species side by side.',
    targetSelector: '#specimens',
    actionLabel: 'Try a Sample Plant Result',
    features: [
      {
        kicker: 'Everyday Care Strip',
        title: 'Sunlight, Watering & Where It Thrives',
        desc: 'Right at the top of your results, see plain-English advice on light levels, when to water, and whether it prefers indoor pots or garden beds.'
      },
      {
        kicker: 'Household & Pet Safety',
        title: 'Cat & Dog Toxicity Warnings',
        desc: 'Immediately flags plant families known to irritate cats, dogs, or small children (such as Araceae calcium oxalate crystals).'
      },
      {
        kicker: 'Compare Close Lookalikes',
        title: 'Interactive Top 5 Possible Matches Table',
        desc: 'Not sure if #1 is exact? Click any row in the "Top 5 Possible Matches" table to load that plant\'s Wikipedia overview, care guide, and photos.'
      },
      {
        kicker: 'Visual Verification',
        title: 'Zoomable Reference Gallery & Copy Summary',
        desc: 'Click any reference photo to inspect it full-screen, or click "Copy Summary" to copy the plant name, match score, and care tips.'
      }
    ],
    callout: 'Tip: Click "Save to Personal Space" at the top-right of any result to store that specific match in your collection.'
  },
  {
    stepNum: 4,
    headline: '04. My Personal Garden Space (Zero-Login Local Vault)',
    lead: 'Your own personal plant collection, interests, and care journal—without ever creating an account, entering an email ID, or installing an app.',
    targetSelector: '#personalSpaceSection',
    actionLabel: 'Jump to My Personal Space',
    features: [
      {
        kicker: 'Hands-Free Saving',
        title: 'Auto-Save Uploads (ON by Default)',
        desc: 'Every photo you upload and identify is automatically saved into your browser\'s high-capacity local database (IndexedDB). Toggle Auto-Save ON/OFF anytime.'
      },
      {
        kicker: 'Custom Profile & Interests',
        title: 'Growing Setup, Pet Alerts & Plant Tags',
        desc: 'Set your Space Name, Growing Setup (Indoor Apartment, Balcony, Backyard, Greenhouse), Pet Safety preference, and click your favorite plant categories.'
      },
      {
        kicker: 'Your Own Plant Journal',
        title: 'Personal Care Notes on Every Plant Card',
        desc: 'Each saved plant has a note box where you can type where you found it, which window it sits by, or when you last watered or fertilized it.'
      },
      {
        kicker: 'Instant Organization',
        title: 'Favorites, Note Filters & Instant Search',
        desc: 'Mark plants as "Favorite", filter by "All Saved Plants", "Favorites", or "With Personal Notes", and search by name, family, or note text.'
      }
    ],
    callout: 'Tip: Because it uses IndexedDB instead of basic cookies, your browser vault can hold dozens of high-resolution plant photos locally.'
  },
  {
    stepNum: 5,
    headline: '05. Saving Directly to a Folder on Your Normal Desktop',
    lead: 'Want your plant photos, notes, and preferences stored as normal files inside a folder on your desktop? You have two built-in ways:',
    targetSelector: '.folder-sync-bar',
    actionLabel: 'Highlight Desktop Folder Controls',
    features: [
      {
        kicker: 'Option A · Live Folder Sync (Chrome, Edge, Brave)',
        title: 'Click "Link Desktop Folder"',
        desc: 'Pick any folder on your computer. The site automatically creates and updates /photos/*.jpg, /care-cards/*.md, and garden-space.json inside that folder.'
      },
      {
        kicker: 'Automatic Two-Way Restore',
        title: 'Re-Link Your Folder Anytime',
        desc: 'If you clear your browser or open the site later, just click "Link Desktop Folder" and pick your existing folder—your plants and preferences load right back.'
      },
      {
        kicker: 'Option B · Works in Every Browser & Tab',
        title: 'Click "Download Backup File"',
        desc: 'Using Firefox, Safari, or an embedded preview window? Click "Download Backup File" to save your entire photo library and notes as a single .json file on your desktop.'
      },
      {
        kicker: 'One-Click Restore',
        title: 'Click "Load Backup File"',
        desc: 'Select any previously downloaded backup file from your computer to restore all your plant photos, personal notes, Favorites, and interests.'
      }
    ],
    callout: 'Note: For live desktop folder linking ("Link Desktop Folder"), make sure the site is open in a full Chrome, Edge, or Brave tab rather than an embedded preview frame.'
  }
]

function renderTipStep(stepIndex) {
  currentTipStep = Math.max(0, Math.min(TIP_STEPS.length - 1, stepIndex))
  const step = TIP_STEPS[currentTipStep]

  if (tipStepIndicator) {
    tipStepIndicator.textContent = String(step.stepNum)
  }

  document.querySelectorAll('.tip-tab').forEach((tab, idx) => {
    const isActive = idx === currentTipStep
    tab.classList.toggle('active', isActive)
    tab.setAttribute('aria-selected', String(isActive))
  })

  if (prevTipStepBtn) {
    prevTipStepBtn.disabled = currentTipStep === 0
  }
  if (nextTipStepBtn) {
    nextTipStepBtn.textContent =
      currentTipStep === TIP_STEPS.length - 1 ? 'Done — Start Using App' : 'Next Tip →'
  }
  if (tryFeatureBtn) {
    tryFeatureBtn.textContent = step.actionLabel || 'Show Me on Page'
  }

  if (!tipModalBody) return
  tipModalBody.textContent = ''

  const layout = document.createElement('div')
  layout.className = 'tip-step-layout'

  const headerDiv = document.createElement('div')
  const h3 = document.createElement('h3')
  h3.className = 'tip-step-headline'
  h3.textContent = step.headline
  const lead = document.createElement('p')
  lead.className = 'tip-step-lead'
  lead.textContent = step.lead
  headerDiv.appendChild(h3)
  headerDiv.appendChild(lead)

  const grid = document.createElement('div')
  grid.className = 'tip-feature-grid'

  step.features.forEach(f => {
    const box = document.createElement('div')
    box.className = 'tip-feature-box'

    const kicker = document.createElement('span')
    kicker.className = 'tip-feature-kicker'
    kicker.textContent = f.kicker

    const title = document.createElement('h4')
    title.className = 'tip-feature-title'
    title.textContent = f.title

    const desc = document.createElement('p')
    desc.className = 'tip-feature-desc'
    desc.textContent = f.desc

    box.appendChild(kicker)
    box.appendChild(title)
    box.appendChild(desc)
    grid.appendChild(box)
  })

  const callout = document.createElement('div')
  callout.className = 'tip-callout'
  callout.textContent = step.callout

  layout.appendChild(headerDiv)
  layout.appendChild(grid)
  layout.appendChild(callout)
  tipModalBody.appendChild(layout)
}

function openTipScreen(stepIndex = 0) {
  if (!tipScreenModal) return
  renderTipStep(stepIndex)
  if (dontShowTipsAgain) {
    dontShowTipsAgain.checked = localStorage.getItem(TIP_SEEN_KEY) === 'true'
  }
  tipScreenModal.hidden = false
}

function closeTipScreen(markDismissed = true) {
  if (!tipScreenModal) return
  tipScreenModal.hidden = true
  if (markDismissed || (dontShowTipsAgain && dontShowTipsAgain.checked)) {
    try {
      localStorage.setItem(TIP_SEEN_KEY, 'true')
    } catch (_) {}
  }
}

function spotlightFeatureOnPage(selector) {
  closeTipScreen(true)
  const target = document.querySelector(selector)
  if (!target) return
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  target.classList.add('feature-spotlight-pulse')
  setTimeout(() => {
    target.classList.remove('feature-spotlight-pulse')
  }, 2600)
}

document.querySelectorAll('.tip-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const idx = Number(tab.getAttribute('data-tip-step') || 0)
    renderTipStep(idx)
  })
})

if (prevTipStepBtn) {
  prevTipStepBtn.addEventListener('click', () => {
    if (currentTipStep > 0) renderTipStep(currentTipStep - 1)
  })
}

if (nextTipStepBtn) {
  nextTipStepBtn.addEventListener('click', () => {
    if (currentTipStep < TIP_STEPS.length - 1) {
      renderTipStep(currentTipStep + 1)
    } else {
      closeTipScreen(true)
    }
  })
}

if (tryFeatureBtn) {
  tryFeatureBtn.addEventListener('click', () => {
    const step = TIP_STEPS[currentTipStep]
    if (step && step.targetSelector) {
      spotlightFeatureOnPage(step.targetSelector)
    }
  })
}

if (closeTipModalBtn) {
  closeTipModalBtn.addEventListener('click', () => closeTipScreen(true))
}

if (tipScreenModal) {
  tipScreenModal.addEventListener('click', e => {
    if (e.target === tipScreenModal) closeTipScreen(true)
  })
}

if (dontShowTipsAgain) {
  dontShowTipsAgain.addEventListener('change', () => {
    try {
      if (dontShowTipsAgain.checked) {
        localStorage.setItem(TIP_SEEN_KEY, 'true')
      } else {
        localStorage.removeItem(TIP_SEEN_KEY)
      }
    } catch (_) {}
  })
}

;[navTipsBtn, topTipsBtn, sectionTipsBtn].forEach(btn => {
  if (btn) {
    btn.addEventListener('click', () => openTipScreen(0))
  }
})

window.addEventListener('keydown', e => {
  if (!tipScreenModal || tipScreenModal.hidden) return
  if (e.key === 'Escape') {
    closeTipScreen(true)
  } else if (e.key === 'ArrowRight' && currentTipStep < TIP_STEPS.length - 1) {
    renderTipStep(currentTipStep + 1)
  } else if (e.key === 'ArrowLeft' && currentTipStep > 0) {
    renderTipStep(currentTipStep - 1)
  }
})

window.addEventListener('DOMContentLoaded', async () => {
  showLoader(false)
  loadUserPreferences()
  await loadPlantsFromVault()
  renderCollection()

  // Automatically open the interactive Feature Guide & Tip Screen for first-time visitors
  const hasDismissedTips = localStorage.getItem(TIP_SEEN_KEY) === 'true'
  if (!hasDismissedTips) {
    openTipScreen(0)
  }
})

