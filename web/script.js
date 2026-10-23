const fileInput = document.getElementById('file')
const cameraInput = document.getElementById('cameraInput')
const takePhotoBtn = document.getElementById('takePhotoBtn')
const mobileCameraNavBtn = document.getElementById('mobileCameraNavBtn')
const mobileTipsNavBtn = document.getElementById('mobileTipsNavBtn')
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

// Care Guide & Agricultural Insights elements
const careSunlight = document.getElementById('careSunlight')
const careWatering = document.getElementById('careWatering')
const careToxicity = document.getElementById('careToxicity')
const careEnvironment = document.getElementById('careEnvironment')
const agriPests = document.getElementById('agriPests')
const agriPrevention = document.getElementById('agriPrevention')
const agriSoil = document.getElementById('agriSoil')
const agriPropagation = document.getElementById('agriPropagation')

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
let currentThumbDataUrl = null
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
    <p class="empty-title">Tap to upload a photo, or drag &amp; drop here</p>
    <p class="empty-sub">Works with phone camera, photo gallery, or Ctrl+V paste</p>
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
        `## Agricultural & Pest Management Guide`,
        `- **Common Pests & Symptoms**: ${plant.careGuide?.pests || 'Aphids, spider mites, and mealybugs; watch for stippled leaves or sticky honeydew.'}`,
        `- **Prevention & Organic Treatment**: ${plant.careGuide?.prevention || 'Maintain airflow, inspect leaf undersides weekly, and treat early with cold-pressed neem oil or insecticidal soap.'}`,
        `- **Soil, pH & Fertilizer (NPK)**: ${plant.careGuide?.soilAndNutrients || 'Well-draining loamy soil (pH 6.0–7.0); feed with balanced NPK fertilizer during active growth.'}`,
        `- **Propagation & Climate**: ${plant.careGuide?.propagationAndClimate || 'Propagate via stem cuttings, division, or seed in warm, frost-free conditions.'}`,
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
    vaultCountText.textContent = `${count} ${count === 1 ? 'plant' : 'plants'} saved`
  }
}

// ============================================================================
// 2. Identification & UI Logic
// ============================================================================

const identifierSection = document.getElementById('identifier')
const navResultLink = document.getElementById('navResultLink')
const backToIdentifyBtn = document.getElementById('backToIdentifyBtn')
const resultUploadNewBtn = document.getElementById('resultUploadNewBtn')

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
  if (identifierSection && identifierSection.hidden) {
    if (show) {
      showStatus(customMessage || 'Analyzing plant features with Pl@ntNet…', false)
    } else if (statusBanner && statusBanner.classList.contains('info')) {
      showStatus('')
    }
  }
  if (show) {
    _loaderTimeout = setTimeout(() => {
      inlineLoader.hidden = true
      identifyBtn.disabled = !currentBase64 && !currentImageUrl && !currentSampleId
      showStatus('Identification request timed out. Please try again.', true)
    }, 30000)
  }
}

function setActiveNavLink(targetHash) {
  document.querySelectorAll('.topnav .nav-link[data-nav]').forEach(link => {
    link.classList.toggle('active-nav', link.getAttribute('data-nav') === targetHash)
  })
}

function showIdentifierView(scrollToTargetId = 'identifier') {
  if (identifierSection) {
    identifierSection.hidden = false
  }
  if (resultSection) {
    resultSection.hidden = true
  }
  setActiveNavLink(scrollToTargetId === 'specimens' ? '#specimens' : '#identifier')

  requestAnimationFrame(() => {
    if (scrollToTargetId === 'specimens') {
      const specEl = document.getElementById('specimens')
      if (specEl) {
        specEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (_) {
      window.scrollTo(0, 0)
    }
  })
}

function navigateToResultsView() {
  if (!resultSection) return
  if (identifierSection) {
    identifierSection.hidden = true
  }
  resultSection.hidden = false
  if (navResultLink) {
    navResultLink.hidden = false
  }
  setActiveNavLink('#result')

  resultSection.classList.remove('dossier-focus-flash')
  void resultSection.offsetWidth
  resultSection.classList.add('dossier-focus-flash')
  setTimeout(() => {
    resultSection.classList.remove('dossier-focus-flash')
  }, 1200)

  const scrollToResultsTop = () => {
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (_) {
      window.scrollTo(0, 0)
    }
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollToResultsTop()
      try {
        resultSection.focus({ preventScroll: true })
      } catch (_) {}
    })
  })

  setTimeout(scrollToResultsTop, 120)
}

document.querySelectorAll('.topnav .nav-link[data-nav]').forEach(link => {
  link.addEventListener('click', e => {
    const targetHash = link.getAttribute('data-nav')
    if (targetHash === '#identifier') {
      e.preventDefault()
      showIdentifierView('identifier')
    } else if (targetHash === '#specimens') {
      e.preventDefault()
      showIdentifierView('specimens')
    } else if (targetHash === '#result') {
      e.preventDefault()
      navigateToResultsView()
    } else if (targetHash) {
      setActiveNavLink(targetHash)
    }
  })
})

document.querySelectorAll('a.brand-wordmark, .mobile-bottom-nav a[href="#identifier"]').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault()
    showIdentifierView('identifier')
  })
})

function syncOrganButtonsUI(organValue) {
  document.querySelectorAll('.seg-btn[data-organ]').forEach(b => {
    b.classList.toggle('active', (b.getAttribute('data-organ') || 'auto') === organValue)
  })
}

if (backToIdentifyBtn) {
  backToIdentifyBtn.addEventListener('click', () => {
    showIdentifierView('identifier')
  })
}

if (resultUploadNewBtn) {
  resultUploadNewBtn.addEventListener('click', () => {
    fileInput.click()
  })
}

// Organ selector segmented buttons (both in Identifier and in Results quickbar)
document.querySelectorAll('.seg-btn[data-organ]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const newOrgan = btn.getAttribute('data-organ') || 'auto'
    if (newOrgan === selectedOrgan) return
    selectedOrgan = newOrgan
    syncOrganButtonsUI(selectedOrgan)

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

if (takePhotoBtn) {
  takePhotoBtn.addEventListener('click', () => {
    if (cameraInput) cameraInput.click()
    else fileInput.click()
  })
}

if (mobileCameraNavBtn) {
  mobileCameraNavBtn.addEventListener('click', () => {
    if (cameraInput) cameraInput.click()
    else fileInput.click()
  })
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

/**
 * Low-RAM (6GB Device) & Mobile-Optimized Image Sanitizer.
 * Uses adaptive resolution (960px on mobile/low-memory devices, 1200px on desktop),
 * creates a lightweight 320px thumbnail for garden cards so the DOM never decodes
 * dozens of large bitmaps, and immediately frees canvas memory.
 */
function sanitizeAndResizeImage(file) {
  const isLowRamOrMobile =
    (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 6) ||
    window.innerWidth <= 768
  const maxDimension = isLowRamOrMobile ? 960 : 1200
  const quality = isLowRamOrMobile ? 0.78 : 0.84

  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('Please select a valid image file (JPEG, PNG, or WebP).'))
    }
    if (file.size > 20 * 1024 * 1024) {
      return reject(new Error('Image file exceeds the 20 MB maximum size.'))
    }

    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.decoding = 'async'
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
      const ctx = canvas.getContext('2d', { alpha: false })
      ctx.drawImage(img, 0, 0, width, height)
      const sanitizedDataUrl = canvas.toDataURL('image/jpeg', quality)

      // Generate a lightweight ~15KB thumbnail (320px) for smooth scrolling in "My Garden" on 6GB RAM devices
      const thumbMax = 320
      let thumbW = width
      let thumbH = height
      if (thumbW > thumbMax || thumbH > thumbMax) {
        if (thumbW >= thumbH) {
          thumbH = Math.round((thumbH * thumbMax) / thumbW)
          thumbW = thumbMax
        } else {
          thumbW = Math.round((thumbW * thumbMax) / thumbH)
          thumbH = thumbMax
        }
      }
      canvas.width = thumbW
      canvas.height = thumbH
      ctx.drawImage(img, 0, 0, thumbW, thumbH)
      const thumbDataUrl = canvas.toDataURL('image/jpeg', 0.7)

      // Free canvas backing store immediately to release RAM
      canvas.width = 0
      canvas.height = 0

      resolve({ dataUrl: sanitizedDataUrl, thumbDataUrl, width, height })
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to decode the selected image.'))
    }
    img.src = objectUrl
  })
}

function setPreviewImage(srcUrl, metaText = 'Private · Location stripped') {
  preview.classList.remove('empty')
  preview.textContent = ''
  const img = document.createElement('img')
  img.src = srcUrl
  img.alt = 'Selected plant photo'
  img.decoding = 'async'
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
    const { dataUrl, thumbDataUrl, width, height } = await sanitizeAndResizeImage(file)
    currentPreviewDataUrl = dataUrl
    currentThumbDataUrl = thumbDataUrl
    currentBase64 = dataUrl.split(',')[1]
    currentImageUrl = null
    currentSampleId = null
    if (imageUrlInput) imageUrlInput.value = ''
    setPreviewImage(dataUrl, `${width}×${height}px · Ready`)
    identifyBtn.disabled = false
    await runIdentification({ image: currentBase64, organ: selectedOrgan })
  } catch (err) {
    currentBase64 = null
    currentPreviewDataUrl = null
    currentThumbDataUrl = null
    identifyBtn.disabled = true
    showStatus(err.message || 'Invalid image file.', true)
  }
}

fileInput.addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0]
  if (f) {
    await handleSelectedFile(f)
    fileInput.value = ''
  }
})

if (cameraInput) {
  cameraInput.addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0]
    if (f) {
      await handleSelectedFile(f)
      cameraInput.value = ''
    }
  })
}

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
    currentThumbDataUrl = proxied
    setPreviewImage(proxied, 'Loaded from image link')
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
    if (cameraInput) cameraInput.value = ''
    if (imageUrlInput) imageUrlInput.value = ''
    currentBase64 = null
    currentImageUrl = null
    currentSampleId = null
    currentPreviewDataUrl = null
    currentThumbDataUrl = null
    preview.classList.add('empty')
    preview.innerHTML = EMPTY_PLATE_HTML
    if (sanitizedBadge) sanitizedBadge.textContent = 'Private · Location stripped'
    if (navResultLink) navResultLink.hidden = true
    showIdentifierView('identifier')
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
    let res = await fetch('/identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (res.status === 404 || res.status === 405) {
      res = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    }
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

    // Hide the inline loader before rendering and scrolling so layout above #result doesn't shift mid-scroll
    showLoader(false)

    lastIdentificationData = json
    renderDossier(json, false)

    // If Auto-Save is enabled and user uploaded/pasted their own image or URL, save automatically into their Personal Space!
    if (userPreferences.autoSave && (payload.image || payload.imageUrl)) {
      await recordCurrentPlantInPersonalSpace(true)
    }

    // Automatically navigate & scroll to the Details / Results section once DOM updates are complete
    navigateToResultsView()
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

// Plant Geek Suite DOM Elements & State
const estIntervalValue = document.getElementById('estIntervalValue')
const estDryBackValue = document.getElementById('estDryBackValue')
const estVolumeValue = document.getElementById('estVolumeValue')
const estWaterQualityValue = document.getElementById('estWaterQualityValue')
const estNpkValue = document.getElementById('estNpkValue')
const estDilutionValue = document.getElementById('estDilutionValue')
const seasonalCalendarGrid = document.getElementById('seasonalCalendarGrid')
const telePpfd = document.getElementById('telePpfd')
const teleLux = document.getElementById('teleLux')
const teleHumidity = document.getElementById('teleHumidity')
const teleVpd = document.getElementById('teleVpd')
const teleTemp = document.getElementById('teleTemp')
const teleUsda = document.getElementById('teleUsda')
const telePh = document.getElementById('telePh')
const teleHabit = document.getElementById('teleHabit')
const teleBiome = document.getElementById('teleBiome')
const substrateBar = document.getElementById('substrateBar')
const substrateLegend = document.getElementById('substrateLegend')
const fnDiagnostic = document.getElementById('fnDiagnostic')
const fnLookalike = document.getElementById('fnLookalike')
const fnEtymology = document.getElementById('fnEtymology')
const researchLinksBar = document.getElementById('researchLinksBar')

let estimatorState = {
  potSize: 'medium', // 'small' | 'medium' | 'large'
  potMat: 'plastic', // 'terracotta' | 'plastic' | 'fabric'
  env: 'indoor'      // 'indoor' | 'humid' | 'outdoor'
}
let activeGeekProfile = null

function buildClientFallbackGeekProfile(scientificName, family, genus) {
  const fam = (family || '').toLowerCase()
  const gen = (genus || '').toLowerCase()
  const cleanSpecies = (scientificName || 'Plantae').replace(/\s+[A-Z(].*$/, '').trim() || 'Plantae'

  const isAroid =
    fam === 'araceae' ||
    ['monstera', 'philodendron', 'epipremnum', 'zamioculcas', 'spathiphyllum', 'aglaonema', 'colocasia', 'alocasia'].includes(gen)
  const isFicus = gen === 'ficus' || fam === 'moraceae'
  const isHibiscus = gen === 'hibiscus' || fam === 'malvaceae'
  const isHerb = fam === 'lamiaceae' || ['lavandula', 'rosmarinus', 'salvia', 'mentha', 'ocimum', 'thymus'].includes(gen)
  const isSucculent = fam === 'cactaceae' || fam === 'crassulaceae' || ['aloe', 'echeveria', 'sedum', 'haworthia', 'opuntia'].includes(gen)

  if (isAroid) {
    return {
      telemetry: {
        ppfdRange: '120–280 μmol/m²/s',
        luxRange: '2,500–6,500 Lux (230–600 FC)',
        humidityRange: '60–80% RH',
        vpdRange: '0.7–1.0 kPa',
        tempRange: '19–29°C (66–85°F)',
        usdaZones: 'USDA Zones 10b–12',
        soilPh: '5.5–6.5 (Acidic Aroid Range)',
        growthHabit: 'Hemiepiphytic climbing liana / aroid',
        nativeBiome: 'Neotropical humid rainforest understory'
      },
      substrateMix: [
        { label: 'Chunky Pine / Orchid Bark', percent: 35 },
        { label: 'Coarse Perlite / Pumice', percent: 25 },
        { label: 'Coco Coir / Chips', percent: 25 },
        { label: 'Worm Castings & Charcoal', percent: 15 }
      ],
      wateringBase: {
        baseIntervalDays: 8,
        dryBackPercent: '50–70% airy matrix dry',
        baseVolumeMl: 360,
        npkRatio: '3-1-2 Foliage Ratio + Cal-Mag',
        fertilizerDilution: 'Weakly-weekly at 1/4–1/2 strength (EC 0.9–1.3 mS/cm)',
        waterQualityNote: 'Low-mineral water (<120 ppm TDS) prevents leaf-tip guttation burn'
      },
      seasonalCalendar: {
        spring: {
          season: 'Spring (Mar–May)',
          phase: 'Cataphyll Unfurling & Root Surge',
          waterNote: 'Hydrate thoroughly when top 5 cm of chunky bark mix dries.',
          feedNote: 'Start 3-1-2 liquid foliage feed + silica for cell wall strength.',
          actionTip: 'Anchor aerial roots into a damp sphagnum moss pole to trigger larger fenestrations.'
        },
        summer: {
          season: 'Summer (Jun–Aug)',
          phase: 'Maximum Fenestration & Canopy Jump',
          waterNote: 'Keep moss pole evenly damp and drench substrate every 6–8 days.',
          feedNote: 'Feed every other watering; flush substrate with plain water monthly.',
          actionTip: 'Wipe broad lamina every 2 weeks and keep RH >60% so new leaves unfurl cleanly.'
        },
        autumn: {
          season: 'Autumn (Sep–Nov)',
          phase: 'Internode Slowdown',
          waterNote: 'Allow top 60% of pot volume to dry before re-saturating.',
          feedNote: 'Reduce feed to once a month at 1/4 dilution.',
          actionTip: 'Inspect petiole crevices and abaxial leaf surfaces for thrips before winter.'
        },
        winter: {
          season: 'Winter (Dec–Feb)',
          phase: 'Tropical Understory Rest',
          waterNote: 'Extend interval to 10–14 days; never let pot sit in cold runoff water.',
          feedNote: 'Withhold NPK unless under >150 μmol/m²/s supplemental grow lights.',
          actionTip: 'Run a humidifier nearby if indoor heating drops RH below 40%.'
        }
      },
      fieldNotes: {
        diagnosticTraits: 'Spadix inflorescence with spathe bract; calcium oxalate raphides; mature blades often exhibit pinnatifid lobes, fenestrations, or swollen petiole geniculum.',
        lookalikeNote: 'Distinguish from Epipremnum pinnatum or Rhaphidophora tetrasperma ("Mini Monstera") by petiole geniculum morphology and lamina thickness.',
        botanicalEtymology: 'Family Araceae; adapted to dappled rainforest understory light flecks and vertical trunk climbing.'
      },
      researchLinks: {
        powo: `https://powo.science.kew.org/results?q=${encodeURIComponent(cleanSpecies)}`,
        gbif: `https://www.gbif.org/species/search?q=${encodeURIComponent(cleanSpecies)}`,
        inaturalist: `https://www.inaturalist.org/taxa/search?q=${encodeURIComponent(cleanSpecies)}`
      }
    }
  }

  return {
    telemetry: {
      ppfdRange: isHerb || isHibiscus || isSucculent ? '450–900+ μmol/m²/s' : '180–400 μmol/m²/s',
      luxRange: isHerb || isHibiscus || isSucculent ? '18,000–50,000 Lux (Full Sun)' : '3,500–12,000 Lux',
      humidityRange: isHerb || isSucculent ? '30–50% RH' : '50–70% RH',
      vpdRange: isHerb || isSucculent ? '1.1–1.6 kPa' : '0.8–1.2 kPa',
      tempRange: '18–28°C (65–82°F)',
      usdaZones: isHerb ? 'USDA Zones 5–9' : 'USDA Zones 9–11',
      soilPh: isHerb ? '6.5–7.5 (Neutral / Calcareous)' : '6.0–6.8 (Slightly Acidic)',
      growthHabit: isFicus ? 'Evergreen lactiferous woody tree' : isHerb ? 'Aromatic perennial subshrub' : 'Vascular botanical specimen',
      nativeBiome: isHerb ? 'Mediterranean rocky slopes' : 'Subtropical & tropical woodland margins'
    },
    substrateMix: isSucculent || isHerb
      ? [
          { label: 'Pumice / Coarse Silica Grit', percent: 45 },
          { label: 'Perlite / Crushed Stone', percent: 25 },
          { label: 'Screened Garden Loam', percent: 20 },
          { label: 'Aged Compost', percent: 10 }
        ]
      : [
          { label: 'Screened Loam / Compost', percent: 40 },
          { label: 'Coco Coir / Peat Moss', percent: 25 },
          { label: 'Perlite / Pumice', percent: 25 },
          { label: 'Pine Bark & Biochar', percent: 10 }
        ],
    wateringBase: {
      baseIntervalDays: isSucculent ? 15 : isHerb ? 11 : isHibiscus ? 4 : 7,
      dryBackPercent: isSucculent || isHerb ? '85–100% bone dry between soaks' : '45–60% top volume dry',
      baseVolumeMl: isSucculent || isHerb ? 260 : 380,
      npkRatio: isHibiscus ? '10-4-12 High-K Bloom' : isHerb || isSucculent ? 'Low-N 2-6-6' : 'Balanced 10-10-10 or 3-1-2',
      fertilizerDilution: '1/2 strength (EC 1.0–1.3 mS/cm) every 2–3 weeks in active growth',
      waterQualityNote: 'Dechlorinated tap or rainwater at room temperature; ensure rapid drainage'
    },
    seasonalCalendar: {
      spring: {
        season: 'Spring (Mar–May)',
        phase: 'Meristem Flush & Repotting',
        waterNote: 'Increase hydration by ~25% as new root tips and shoots emerge.',
        feedNote: 'Begin half-strength NPK feeding every 2–3 weeks.',
        actionTip: 'Optimal window to repot into fresh substrate, prune leggy stems, and take cuttings.'
      },
      summer: {
        season: 'Summer (Jun–Aug)',
        phase: 'Peak Photosynthesis & Growth',
        waterNote: 'Peak transpiration—check soil moisture every 4–6 days and flush salts mid-season.',
        feedNote: 'Regular bi-weekly feeding + trace micronutrients.',
        actionTip: 'Maintain strong air circulation and shield tender foliage from afternoon glass heat.'
      },
      autumn: {
        season: 'Autumn (Sep–Nov)',
        phase: 'Hardening Off & Metabolic Taper',
        waterNote: 'Lengthen watering interval by 25–35% as daylight hours shorten.',
        feedNote: 'Taper off nitrogen; final light potassium boost in early autumn.',
        actionTip: 'Inspect thoroughly for pests before bringing outdoor containers inside.'
      },
      winter: {
        season: 'Winter (Dec–Feb)',
        phase: 'Quiescence / Winter Rest',
        waterNote: 'Allow 65–80% soil dry-back; cold wet roots rapidly invite root rot.',
        feedNote: 'Pause fertilizer unless growing under 12+ hrs of full-spectrum LED grow lights.',
        actionTip: 'Keep clear of dry heating vents and freezing window panes.'
      }
    },
    fieldNotes: {
      diagnosticTraits: 'Examine leaf arrangement (phyllotaxy), venation geometry, petiole attachment, and floral bract structure for species confirmation.',
      lookalikeNote: `Compare leaf margin serration and stem pubescence against closely related species in ${family || 'this family'}.`,
      botanicalEtymology: `Classified under genus ${genus || 'Plantae'} (${family || 'Angiosperms'}); morphology reflects native habitat light and moisture availability.`
    },
    researchLinks: {
      powo: `https://powo.science.kew.org/results?q=${encodeURIComponent(cleanSpecies)}`,
      gbif: `https://www.gbif.org/species/search?q=${encodeURIComponent(cleanSpecies)}`,
      inaturalist: `https://www.inaturalist.org/taxa/search?q=${encodeURIComponent(cleanSpecies)}`
    }
  }
}

function updateWateringEstimatorUI() {
  if (!activeGeekProfile || !activeGeekProfile.wateringBase) return
  const wb = activeGeekProfile.wateringBase
  const baseDays = Number(wb.baseIntervalDays) || 7
  const baseVol = Number(wb.baseVolumeMl) || 350

  const sizeDaysMult = estimatorState.potSize === 'small' ? 0.72 : estimatorState.potSize === 'large' ? 1.35 : 1.0
  const matDaysMult = estimatorState.potMat === 'terracotta' ? 0.78 : estimatorState.potMat === 'fabric' ? 0.72 : 1.0
  const envDaysMult = estimatorState.env === 'humid' ? 1.28 : estimatorState.env === 'outdoor' ? 0.74 : 1.0

  const calcDays = Math.max(2, Math.round(baseDays * sizeDaysMult * matDaysMult * envDaysMult))
  const minDays = Math.max(2, calcDays - 1)
  const maxDays = calcDays + 1

  const sizeVolMult = estimatorState.potSize === 'small' ? 0.45 : estimatorState.potSize === 'large' ? 2.15 : 1.0
  const matVolMult = estimatorState.potMat === 'terracotta' ? 1.1 : estimatorState.potMat === 'fabric' ? 1.15 : 1.0
  const calcVolMl = Math.round((baseVol * sizeVolMult * matVolMult) / 10) * 10
  const cups = (calcVolMl / 240).toFixed(1)

  if (estIntervalValue) {
    estIntervalValue.textContent = `Every ${minDays}–${maxDays} days`
  }
  if (estDryBackValue) {
    const matNote =
      estimatorState.potMat === 'terracotta'
        ? 'porous clay breathes fast'
        : estimatorState.potMat === 'fabric'
        ? 'high side-wall aeration'
        : 'retains moisture longer'
    estDryBackValue.textContent = `Target: ${wb.dryBackPercent} (${matNote})`
  }
  if (estVolumeValue) {
    estVolumeValue.textContent = `${calcVolMl} mL (~${cups} cups)`
  }
  if (estWaterQualityValue) {
    estWaterQualityValue.textContent = wb.waterQualityNote || 'Water until 10–15% runoff drains from bottom'
  }
  if (estNpkValue) {
    estNpkValue.textContent = wb.npkRatio || 'Balanced 10-10-10'
  }
  if (estDilutionValue) {
    estDilutionValue.textContent = wb.fertilizerDilution || '1/2 strength every 2–3 weeks in active growth'
  }
}

document.querySelectorAll('.est-pot-size').forEach(btn => {
  btn.addEventListener('click', () => {
    estimatorState.potSize = btn.getAttribute('data-pot-size') || 'medium'
    document.querySelectorAll('.est-pot-size').forEach(b => b.classList.toggle('active', b === btn))
    updateWateringEstimatorUI()
  })
})

document.querySelectorAll('.est-pot-mat').forEach(btn => {
  btn.addEventListener('click', () => {
    estimatorState.potMat = btn.getAttribute('data-pot-mat') || 'plastic'
    document.querySelectorAll('.est-pot-mat').forEach(b => b.classList.toggle('active', b === btn))
    updateWateringEstimatorUI()
  })
})

document.querySelectorAll('.est-env').forEach(btn => {
  btn.addEventListener('click', () => {
    estimatorState.env = btn.getAttribute('data-est-env') || 'indoor'
    document.querySelectorAll('.est-env').forEach(b => b.classList.toggle('active', b === btn))
    updateWateringEstimatorUI()
  })
})

function renderPlantGeekDossier(careGuide, scientificName, family, genus) {
  const gp =
    (careGuide && careGuide.geekProfile) ||
    buildClientFallbackGeekProfile(scientificName, family, genus)
  activeGeekProfile = gp

  // 1. Update Interactive Watering Estimator
  updateWateringEstimatorUI()

  // 2. Render 12-Month Seasonal Care & Phenology Calendar
  if (seasonalCalendarGrid && gp.seasonalCalendar) {
    seasonalCalendarGrid.textContent = ''
    const order = [
      ['spring', gp.seasonalCalendar.spring],
      ['summer', gp.seasonalCalendar.summer],
      ['autumn', gp.seasonalCalendar.autumn],
      ['winter', gp.seasonalCalendar.winter]
    ]
    order.forEach(([key, item]) => {
      if (!item) return
      const card = document.createElement('div')
      card.className = `season-card season-${key}`

      const titleRow = document.createElement('div')
      titleRow.className = 'season-title-row'
      const sName = document.createElement('span')
      sName.className = 'season-name'
      sName.textContent = item.season || key.toUpperCase()
      const sPhase = document.createElement('span')
      sPhase.className = 'season-phase'
      sPhase.textContent = item.phase || ''
      titleRow.appendChild(sName)
      titleRow.appendChild(sPhase)

      const wP = document.createElement('p')
      wP.className = 'season-detail-item'
      const wStrong = document.createElement('strong')
      wStrong.textContent = 'Water: '
      wP.appendChild(wStrong)
      wP.appendChild(document.createTextNode(item.waterNote || ''))

      const fP = document.createElement('p')
      fP.className = 'season-detail-item'
      const fStrong = document.createElement('strong')
      fStrong.textContent = 'Feed: '
      fP.appendChild(fStrong)
      fP.appendChild(document.createTextNode(item.feedNote || ''))

      const aP = document.createElement('p')
      aP.className = 'season-detail-item'
      const aStrong = document.createElement('strong')
      aStrong.textContent = 'Focus: '
      aP.appendChild(aStrong)
      aP.appendChild(document.createTextNode(item.actionTip || ''))

      card.appendChild(titleRow)
      card.appendChild(wP)
      card.appendChild(fP)
      card.appendChild(aP)
      seasonalCalendarGrid.appendChild(card)
    })
  }

  // 3. Render Precision Telemetry & Substrate Formula Bar
  const tele = gp.telemetry || {}
  if (telePpfd) telePpfd.textContent = tele.ppfdRange || '150–350 μmol/m²/s'
  if (teleLux) teleLux.textContent = tele.luxRange || '3,000–10,000 Lux'
  if (teleHumidity) teleHumidity.textContent = tele.humidityRange || '50–70% RH'
  if (teleVpd) teleVpd.textContent = `VPD Target: ${tele.vpdRange || '0.8–1.2 kPa'}`
  if (teleTemp) teleTemp.textContent = tele.tempRange || '18–28°C (65–82°F)'
  if (teleUsda) teleUsda.textContent = tele.usdaZones || 'USDA Zones 9–11'
  if (telePh) telePh.textContent = `pH ${tele.soilPh || '6.0–6.8'}`
  if (teleHabit) teleHabit.textContent = tele.growthHabit || 'Perennial vascular specimen'
  if (teleBiome) teleBiome.textContent = `Native Biome: ${tele.nativeBiome || 'Subtropical woodland'}`

  const mix = Array.isArray(gp.substrateMix) ? gp.substrateMix : []
  if (substrateBar && substrateLegend) {
    substrateBar.textContent = ''
    substrateLegend.textContent = ''
    const colors = ['#15472E', '#107C41', '#D97706', '#6B8E78']
    mix.forEach((comp, idx) => {
      const pct = Number(comp.percent) || 25
      const seg = document.createElement('div')
      seg.className = `substrate-seg substrate-seg-${idx % 4}`
      seg.style.width = `${pct}%`
      seg.title = `${comp.label}: ${pct}%`
      substrateBar.appendChild(seg)

      const leg = document.createElement('span')
      leg.className = 'substrate-legend-item'
      const dot = document.createElement('span')
      dot.className = 'substrate-dot'
      dot.style.backgroundColor = colors[idx % colors.length]
      const pctSpan = document.createElement('span')
      pctSpan.className = 'substrate-pct'
      pctSpan.textContent = `${pct}%`
      const lblSpan = document.createElement('span')
      lblSpan.textContent = comp.label || 'Media'
      leg.appendChild(dot)
      leg.appendChild(pctSpan)
      leg.appendChild(lblSpan)
      substrateLegend.appendChild(leg)
    })
  }

  // 4. Render Botanical Field Notes & External Research Links
  const fn = gp.fieldNotes || {}
  if (fnDiagnostic) fnDiagnostic.textContent = fn.diagnosticTraits || ''
  if (fnLookalike) fnLookalike.textContent = fn.lookalikeNote || ''
  if (fnEtymology) fnEtymology.textContent = fn.botanicalEtymology || ''

  if (researchLinksBar && gp.researchLinks) {
    researchLinksBar.textContent = ''
    const links = [
      ['Kew POWO ↗', gp.researchLinks.powo],
      ['GBIF Taxonomy ↗', gp.researchLinks.gbif],
      ['iNaturalist ↗', gp.researchLinks.inaturalist]
    ]
    links.forEach(([label, href]) => {
      if (!href || !href.startsWith('https://')) return
      const a = document.createElement('a')
      a.href = href
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.className = 'research-ext-link'
      a.textContent = label
      researchLinksBar.appendChild(a)
    })
  }
}

function renderCareStrip(careGuide, scientificName, family, genus) {
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
  if (agriPests) {
    agriPests.textContent =
      cg.pests ||
      'Aphids, spider mites, whiteflies, and mealybugs; look for yellow stippling, curling new shoots, or sticky honeydew on leaves.'
  }
  if (agriPrevention) {
    agriPrevention.textContent =
      cg.prevention ||
      'Ensure good spacing and airflow, avoid wetting foliage at night, and spray leaf undersides with neem oil (3 ml/L) or insecticidal soap at first sign of pests.'
  }
  if (agriSoil) {
    agriSoil.textContent =
      cg.soilAndNutrients ||
      'Well-draining loamy soil (pH 6.0–7.0) enriched with organic compost; apply balanced NPK (10-10-10) monthly during active growth.'
  }
  if (agriPropagation) {
    agriPropagation.textContent =
      cg.propagationAndClimate ||
      'Propagate by stem cuttings, root division, or seed in spring; thrives best at 18–28 °C (65–82 °F) protected from frost.'
  }

  renderPlantGeekDossier(cg, scientificName, family, genus)
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
  renderCareStrip(
    candidate.careGuide || rootData.careGuide,
    candidate.scientificNameWithoutAuthor || candidate.scientificName || rootData.scientificName,
    tax.family,
    tax.genus
  )

  const commons = Array.isArray(candidate.commonNames) ? candidate.commonNames : []
  commonEl.textContent = commons.length ? commons.join(' · ') : 'No additional common names listed'

  renderSimilarGallery(candidate.similarImageUrls, candidate.scientificNameWithoutAuthor)
}

function renderDossier(data, autoScroll = true) {
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
  if (navResultLink) navResultLink.hidden = false
  syncOrganButtonsUI(selectedOrgan)
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
            let wRes = await fetch('/wiki-summary?' + params.toString())
            if (wRes.status === 404 || wRes.status === 405) {
              wRes = await fetch('/api/wiki-summary?' + params.toString())
            }
            const wJson = await wRes.json()
            if (wJson.careGuide) {
              cand.careGuide = wJson.careGuide
              renderCareStrip(
                wJson.careGuide,
                cand.scientificNameWithoutAuthor || cand.scientificName,
                cand.taxonomy?.family,
                cand.taxonomy?.genus
              )
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

  if (autoScroll) {
    navigateToResultsView()
  }
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
  const fallbackImgUrl = activeCandidate.similarImageUrls?.[0]
    ? '/image-proxy?url=' + encodeURIComponent(activeCandidate.similarImageUrls[0])
    : null
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
    previewUrl: currentPreviewDataUrl || fallbackImgUrl,
    thumbUrl: currentThumbDataUrl || currentPreviewDataUrl || fallbackImgUrl,
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
    showStatus(`Saved "${entry.plantName}" to My Garden.`, false)
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
      ? 'No saved plants match your search.'
      : 'No plants saved yet. Identify a photo above to start your garden.'
    collectionGrid.appendChild(empty)
    return
  }

  // Build all cards in a single DocumentFragment so the browser performs only 1 layout pass
  const fragment = document.createDocumentFragment()

  list.forEach(entry => {
    const card = document.createElement('article')
    card.className = 'collection-card'

    const cardImgSrc = entry.thumbUrl || entry.previewUrl
    if (cardImgSrc) {
      const media = document.createElement('div')
      media.className = 'collection-card-media'
      const img = document.createElement('img')
      img.src = cardImgSrc
      img.alt = entry.plantName || 'Saved plant'
      img.loading = 'lazy'
      img.decoding = 'async'
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

    const noteInput = document.createElement('textarea')
    noteInput.className = 'note-textarea'
    noteInput.placeholder = 'Add personal note (e.g., room location, watering log)…'
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
        setPreviewImage(entry.previewUrl, 'Loaded from My Garden')
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
    fragment.appendChild(card)
  })

  collectionGrid.appendChild(fragment)
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
    const summaryText = [
      `${activeCandidate.plantName} (${activeCandidate.scientificName}) — ${pct}% Match`,
      `Sunlight: ${cg.sunlight || 'Bright indirect light'}`,
      `Watering: ${cg.watering || 'Water when top soil is dry'}`,
      `Pet Safety: ${cg.toxicity || 'Check before ingestion'}`,
      `Pests & Symptoms: ${cg.pests || 'Inspect for aphids, mites, and mealybugs'}`,
      `Prevention & Treatment: ${cg.prevention || 'Maintain airflow and treat with neem oil or insecticidal soap'}`,
      `Soil, pH & NPK: ${cg.soilAndNutrients || 'Well-draining loamy soil (pH 6.0–7.0) with balanced NPK'}`
    ].join('\n')

    if (typeof navigator.share === 'function' && window.innerWidth <= 768) {
      try {
        await navigator.share({
          title: `${activeCandidate.plantName} Care Guide — VxPlants`,
          text: summaryText
        })
        return
      } catch (_) {}
    }

    try {
      await navigator.clipboard.writeText(summaryText)
      showStatus('Plant summary and care guide copied to clipboard.', false)
    } catch (_) {
      showStatus(summaryText, false)
    }
  })
}

let _searchDebounce = null
if (collectionSearch) {
  collectionSearch.addEventListener('input', () => {
    if (_searchDebounce) clearTimeout(_searchDebounce)
    _searchDebounce = setTimeout(renderCollection, 120)
  })
}

// Download Complete Personal Space Backup (Works on both Mobile & Desktop)
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
    const folderSlug = slugify(userPreferences.gardenName || 'vxplants-garden')
    a.download = `${folderSlug}-backup.json`
    a.click()
    URL.revokeObjectURL(url)
    showStatus('Saved your garden backup file to your device.', false)
  })
}

// Restore Personal Space Backup File
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
      showStatus(`Restored ${plantsList.length} plants from backup file.`, false)
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
    showStatus('My Garden cleared.', false)
  })
}

// ============================================================================
// 4. Simple Welcome Tip Screen (Shown Every Time Website Opens)
// ============================================================================

const tipScreenModal = document.getElementById('tipScreenModal')
const closeTipModalBtn = document.getElementById('closeTipModalBtn')
const nextTipStepBtn = document.getElementById('nextTipStepBtn')
const tryFeatureBtn = document.getElementById('tryFeatureBtn')
const navTipsBtn = document.getElementById('navTipsBtn')
const topTipsBtn = document.getElementById('topTipsBtn')
const sectionTipsBtn = document.getElementById('sectionTipsBtn')

function openTipScreen() {
  if (!tipScreenModal) return
  tipScreenModal.hidden = false
}

function closeTipScreen() {
  if (!tipScreenModal) return
  tipScreenModal.hidden = true
}

if (nextTipStepBtn) {
  nextTipStepBtn.addEventListener('click', closeTipScreen)
}

if (closeTipModalBtn) {
  closeTipModalBtn.addEventListener('click', closeTipScreen)
}

if (tryFeatureBtn) {
  tryFeatureBtn.addEventListener('click', () => {
    closeTipScreen()
    const firstSampleCard = document.querySelector('.sample-card[data-sample="monstera"]')
    if (firstSampleCard) {
      firstSampleCard.click()
    }
  })
}

if (tipScreenModal) {
  tipScreenModal.addEventListener('click', e => {
    if (e.target === tipScreenModal) closeTipScreen()
  })
}

;[navTipsBtn, topTipsBtn, sectionTipsBtn, mobileTipsNavBtn].forEach(btn => {
  if (btn) {
    btn.addEventListener('click', openTipScreen)
  }
})

window.addEventListener('keydown', e => {
  if (!tipScreenModal || tipScreenModal.hidden) return
  if (e.key === 'Escape') {
    closeTipScreen()
  }
})

window.addEventListener('DOMContentLoaded', async () => {
  showLoader(false)
  loadUserPreferences()
  await loadPlantsFromVault()
  renderCollection()
  openTipScreen()
})

// ============================================================================
// 5. Progressive Web App (PWA) Android & Mobile Installability + Offline Mode
// ============================================================================
const installAppBtn = document.getElementById('installAppBtn')
let deferredInstallPrompt = null

const isStandaloneMode =
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true

const isIOSDevice = /iphone|ipad|ipod/i.test(window.navigator.userAgent || '')

if (!isStandaloneMode && isIOSDevice && installAppBtn) {
  installAppBtn.hidden = false
  installAppBtn.textContent = 'Install App'
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  deferredInstallPrompt = e
  if (!isStandaloneMode && installAppBtn) {
    installAppBtn.hidden = false
  }
})

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null
  if (installAppBtn) {
    installAppBtn.hidden = true
  }
  showStatus('VxPlants installed! You can now launch it from your phone home screen.', false)
})

if (installAppBtn) {
  installAppBtn.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt()
      const choice = await deferredInstallPrompt.userChoice.catch(() => null)
      if (choice && choice.outcome === 'accepted') {
        installAppBtn.hidden = true
      }
      deferredInstallPrompt = null
    } else if (isIOSDevice) {
      showStatus('To install VxPlants: tap the Share button in Safari, then tap "Add to Home Screen".', false)
    } else {
      showStatus('To install on Android: open your browser menu (⋮) and tap "Add to Home screen" or "Install app".', false)
    }
  })
}

window.addEventListener('offline', () => {
  showStatus('Offline Mode — Your saved plants and notes in My Garden remain available.', false)
})

window.addEventListener('online', () => {
  showStatus('')
})

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}



