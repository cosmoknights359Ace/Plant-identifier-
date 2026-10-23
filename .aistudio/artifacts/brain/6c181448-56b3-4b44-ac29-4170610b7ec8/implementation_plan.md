# Implementation Plan: Plant Geek Results & Details Upgrade (`/web` & `/app`)

## 1. Overview & Plant Geek Experience
When an avid plant collector, botanist, or serious grower identifies a specimen, generic advice like *"bright indirect light and moderate water"* isn't enough. We will upgrade the dedicated **Plant Results & Details Page** in both the **Web App (`/web`)** and **Android App (`/app`)** with a clean, scannable layout featuring:

1. **Interactive Watering & Feeding Estimator (Centerpiece)**
   - **Interactive Controls**: Users can select their **Pot Size** (`Small 4" / 10cm`, `Medium 6–8" / 15–20cm`, `Large 10"+ / 25cm+`), **Pot Material** (`Terracotta / Clay`, `Plastic / Ceramic`, `Fabric / Grow Bag`), and **Growing Environment** (`Indoor AC / Heated`, `Humid Greenhouse / Terrarium`, `Outdoor Patio / Garden`).
   - **Live Calculated Output**: Dynamically calculates and displays the estimated **Watering Interval (in days)**, **Target Soil Dry-Back %** before the next watering, **Estimated Water Volume (`mL` / `cups`)**, and **Fertilizer Dilution & NPK Ratio** tailored to that specific plant genus/family and the user's selected setup.

2. **12-Month Seasonal Care & Phenology Calendar**
   - A scannable 4-season timeline (**Spring**, **Summer**, **Autumn**, **Winter**) showing the plant's biological cycle at a glance:
     - **Spring (Flush & Repot)**: Active root & foliage emergence, ideal repotting window, and base fertilizer ramp-up.
     - **Summer (Peak Photosynthesis)**: Peak watering frequency, foliage misting/airflow needs, and flowering/canopy management.
     - **Autumn (Hardening & Slowdown)**: Tapering irrigation, reducing nitrogen, and preparing outdoor pots to overwinter indoors.
     - **Winter (Dormancy / Rest)**: Minimal root moisture to prevent rot, supplemental grow-light hours, and cold-draft protection thresholds.

3. **Precision Grower Telemetry & Aroid/Botanical Substrate Recipe**
   - **Measurable Metrics**: Light in **PPFD ($\mu\text{mol/m}^2\text{/s}$)** and **Foot-Candles / Lux**, Relative Humidity (**% RH**) & **VPD ($\text{kPa}$)** targets, **Temperature Range (°C / °F)** & **USDA Hardiness Zones**, and **Target Soil pH**.
   - **Visual Substrate Formula Bar**: Exact percentage breakdown of the ideal soil mix for the identified plant (e.g., *40% Pine Bark, 25% Perlite/Pumice, 25% Coco Coir/Peat, 10% Worm Castings & Biochar*).

4. **Botanical Field Notes, Diagnostic Morphology & Research Links**
   - **Ecological & Morphological Dossier**: Native biome, growth habit (e.g., *hemiepiphyte, lithophyte, perennial herb, woody shrub*), diagnostic leaf/flower traits, and a **Lookalike Guide** explaining how to tell it apart from commonly confused species.
   - **One-Click Botanical Research Links**: Direct deep links for the identified binomial species to **Kew Plants of the World Online (POWO)**, **GBIF**, **iNaturalist**, and **Wikipedia**.

---

## 2. Backend & Botanical Engine Updates (`/server.js` & `/web/api/server.js`)
- Extend `buildCareGuide(species, family, commonName)` to include a structured `geekProfile` object on every identification response:
  - `telemetry`: `{ ppfdRange, luxRange, humidityRange, vpdRange, tempRange, usdaZones, soilPh, growthHabit, nativeBiome }`
  - `substrateMix`: Array of components with `{ label, percent, note }` summing to `100%`
  - `wateringBase`: `{ baseIntervalDays, dryBackPercent, baseVolumeMl, npkRatio, fertilizerFreq }` used by the Interactive Watering Estimator
  - `seasonalCalendar`: Structured 4-season cards (`spring`, `summer`, `autumn`, `winter`) with `{ phase, waterAdjustment, feedNote, actionTip }`
  - `fieldNotes`: `{ diagnosticTraits, lookalikeNote, propagationMethod, toxicityDetail }`
  - `researchLinks`: Pre-formatted URLs for Kew POWO, GBIF, and iNaturalist searches.

---

## 3. Web App Implementation (`/web/`)
- **`/web/index.html`**:
  - Inside the dedicated `#result` view (below the core Care Guide grid and above the Alternate Candidates section), add a clean, scannable **Plant Geek Botanical Dossier** section containing:
    1. **Precision Grower Telemetry & Substrate Mix Bar**
    2. **Interactive Watering & Feeding Estimator** (with live selector buttons for Pot Size, Pot Material, and Environment)
    3. **Seasonal Care & Phenology Calendar** (4-season scannable grid)
    4. **Botanical Field Notes & Research Database Links**
- **`/web/style.css`**:
  - Style the new sections using the Botanical Parchment (`#F3EFE6`), Deep Forest (`#0E2F1E`), and Warm Amber (`#D97706`) palette with `JetBrains Mono` (`tabular-nums`) for all PPFD, VPD, pH, mL, and day-interval readouts.
- **`/web/script.js` & `/web/sw.js`**:
  - Populate all sections from `data.careGuide.geekProfile` (with automatic client-side fallback calculation so even cached or custom responses render rich data).
  - Bind live click handlers to the Interactive Watering Estimator selectors so changing pot size, pot material, or environment immediately recalculates and updates the watering interval, volume in `mL`/`cups`, soil dry-back target, and feeding schedule.
  - Bump the Service Worker cache version in `/web/sw.js`.

---

## 4. Android App Implementation (`/app/`)
- **`/app/src/main/java/com/example/plantidentifier/MainActivity.kt`**:
  - Extend `CareGuide` and JSON parser (`parseIdentifyJson`) with `GeekProfile`, `SubstrateComponent`, `SeasonEntry`, and `WateringBase` data models.
  - Inside `PlantResultDossierCard` on the dedicated `screen == "result"` view, render all sections in a clean, scannable vertical layout:
    - **Precision Telemetry Grid & Substrate Mix Bar**
    - **Interactive Watering & Feeding Estimator** with interactive Compose chips for Pot Size (`4"`, `6–8"`, `10"+`), Pot Material (`Terracotta`, `Plastic/Ceramic`, `Grow Bag`), and Environment (`Indoor`, `Humid`, `Outdoor`) that dynamically recalculate days between watering and water volume (`mL`).
    - **4-Season Care & Phenology Calendar** cards.
    - **Botanical Field Notes & External Database Link Buttons** (opening Kew POWO, GBIF, and iNaturalist via `CustomTabsIntent` / `Intent.ACTION_VIEW`).
