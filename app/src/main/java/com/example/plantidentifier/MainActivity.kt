package com.example.plantidentifier

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt

data class SubstratePart(
    val label: String,
    val percent: Int
)

data class SeasonPhaseInfo(
    val key: String,
    val season: String,
    val phase: String,
    val waterNote: String,
    val feedNote: String,
    val actionTip: String
)

data class GeekProfileInfo(
    val ppfdRange: String = "150–350 μmol/m²/s",
    val luxRange: String = "3,000–10,000 Lux (280–930 FC)",
    val humidityRange: String = "50–70% RH",
    val vpdRange: String = "0.8–1.2 kPa",
    val tempRange: String = "18–28°C (65–82°F)",
    val usdaZones: String = "USDA Zones 9–11",
    val soilPh: String = "6.0–6.8 (Slightly Acidic)",
    val growthHabit: String = "Perennial vascular specimen",
    val nativeBiome: String = "Subtropical & tropical woodland margins",
    val baseIntervalDays: Int = 7,
    val dryBackPercent: String = "45–60% top volume dry",
    val baseVolumeMl: Int = 350,
    val npkRatio: String = "Balanced 10-10-10 or 3-1-2",
    val fertilizerDilution: String = "1/2 strength (EC 1.0–1.3 mS/cm) every 2–3 weeks",
    val waterQualityNote: String = "Dechlorinated tap or rainwater at room temperature",
    val substrateMix: List<SubstratePart> = listOf(
        SubstratePart("Screened Loam / Compost", 40),
        SubstratePart("Coco Coir / Peat Moss", 25),
        SubstratePart("Perlite / Pumice", 25),
        SubstratePart("Pine Bark & Biochar", 10)
    ),
    val seasons: List<SeasonPhaseInfo> = listOf(
        SeasonPhaseInfo(
            "spring",
            "Spring (Mar–May)",
            "Meristem Flush & Repotting",
            "Increase hydration by ~25% as new root tips and shoots emerge.",
            "Begin half-strength NPK feeding every 2–3 weeks.",
            "Optimal window to repot into fresh substrate, prune leggy stems, and take cuttings."
        ),
        SeasonPhaseInfo(
            "summer",
            "Summer (Jun–Aug)",
            "Peak Photosynthesis & Growth",
            "Peak transpiration—check soil moisture every 4–6 days and flush salts mid-season.",
            "Regular bi-weekly feeding + trace micronutrients.",
            "Maintain strong air circulation and shield tender foliage from harsh afternoon heat."
        ),
        SeasonPhaseInfo(
            "autumn",
            "Autumn (Sep–Nov)",
            "Hardening Off & Metabolic Taper",
            "Lengthen watering interval by 25–35% as daylight hours shorten.",
            "Taper off nitrogen; final light potassium boost in early autumn.",
            "Inspect thoroughly for pests before bringing outdoor containers inside."
        ),
        SeasonPhaseInfo(
            "winter",
            "Winter (Dec–Feb)",
            "Quiescence / Winter Rest",
            "Allow 65–80% soil dry-back; cold wet roots rapidly invite root rot.",
            "Pause fertilizer unless growing under 12+ hrs of full-spectrum grow lights.",
            "Keep clear of dry heating vents and freezing window panes."
        )
    ),
    val diagnosticTraits: String = "Examine leaf arrangement (phyllotaxy), venation geometry, petiole attachment, and floral bract structure for species confirmation.",
    val lookalikeNote: String = "Compare leaf margin serration and stem pubescence against closely related species in this family.",
    val botanicalEtymology: String = "Adaptive morphology reflects native light and moisture regimes."
)

data class CareGuideInfo(
    val sunlight: String = "Bright indirect light to partial sun (4–6 hrs daily)",
    val watering: String = "Water when top 2–3 cm of soil feels dry",
    val toxicity: String = "Keep foliage away from pets and small children",
    val environment: String = "Adaptable to indoor pots or sheltered garden beds",
    val careTip: String = "Ensure well-draining potting mix and avoid waterlogged roots.",
    val pests: String = "Aphids, spider mites, mealybugs, and whiteflies — check leaf undersides for yellow stippling or sticky honeydew.",
    val prevention: String = "Inspect new growth weekly, maintain airflow, and treat early with diluted cold-pressed neem oil or insecticidal soap.",
    val soilAndNutrients: String = "Well-draining loamy soil (pH 6.0–7.0); feed monthly in active growth with balanced NPK (10-10-10).",
    val propagationAndClimate: String = "Propagate via stem cuttings or seed in spring; thrives at 18–27°C (65–80°F).",
    val geekProfile: GeekProfileInfo = GeekProfileInfo()
)

data class PlantInfo(
    val id: String = System.currentTimeMillis().toString(),
    val plantName: String,
    val scientificName: String?,
    val family: String? = null,
    val genus: String? = null,
    val organUsed: String = "auto",
    val confidence: Double,
    val commonNames: List<String>,
    val wikiDescription: String?,
    val similarImageUrls: List<String> = emptyList(),
    val careGuide: CareGuideInfo = CareGuideInfo(),
    val personalNote: String = "",
    val favorite: Boolean = false,
    val savedDate: String = SimpleDateFormat("MMM d, yyyy", Locale.US).format(Date()),
    val thumbnailBase64: String? = null
)

// Classic VxPlants Botanical Color Palette
private val HeaderForest = Color(0xFF0E2F1E)
private val AccentForest = Color(0xFF15472E)
private val AccentEmerald = Color(0xFF107C41)
private val AccentAmber = Color(0xFFD97706)
private val AccentKicker = Color(0xFFC85A17)
private val BgParchment = Color(0xFFF3EFE6)
private val BgMintBlock = Color(0xFFF2F8F4)
private val BgCreamBlock = Color(0xFFFDF9F1)
private val InkPrimary = Color(0xFF102419)
private val InkSecondary = Color(0xFF34493C)
private val InkMuted = Color(0xFF5C6F63)
private val BorderSage = Color(0xFFC4D2C8)

class MainActivity : ComponentActivity() {

    private val httpClient = OkHttpClient()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            val context = LocalContext.current
            var bitmap by remember { mutableStateOf<Bitmap?>(null) }
            var currentSampleId by remember { mutableStateOf<String?>(null) }
            var identifying by remember { mutableStateOf(false) }
            var selectedOrgan by remember { mutableStateOf("auto") }
            var lastResult by remember { mutableStateOf<PlantInfo?>(null) }
            var screen by remember { mutableStateOf("identify") } // "identify" | "result" | "garden"
            var showTipsModal by remember { mutableStateOf(true) }
            var gardenItems by remember { mutableStateOf(loadGardenEntries(this@MainActivity)) }
            val scrollState = rememberScrollState()

            // Scroll to top automatically whenever screen changes (e.g., landing on Results page)
            LaunchedEffect(screen, lastResult?.id) {
                scrollState.scrollTo(0)
            }

            fun triggerAutoIdentificationForBitmap(bmp: Bitmap, organToUse: String) {
                bitmap = bmp
                currentSampleId = null
                identifying = true
                val b64 = bitmapToBase64(bmp, quality = 82)
                identifyPlantViaProxy(
                    base64Image = b64,
                    sampleId = null,
                    organ = organToUse,
                    onSuccess = { info ->
                        val thumb = bitmapToBase64(scaleBitmapDown(bmp, 240), quality = 70)
                        val enriched = info.copy(thumbnailBase64 = thumb)
                        lastResult = enriched
                        saveGardenEntry(this@MainActivity, enriched)
                        gardenItems = loadGardenEntries(this@MainActivity)
                        identifying = false
                        // Immediately navigate to the dedicated Results & Details page
                        screen = "result"
                    },
                    onError = { err ->
                        Toast.makeText(context, err, Toast.LENGTH_LONG).show()
                        identifying = false
                    }
                )
            }

            fun triggerSampleIdentification(sampleId: String, organToUse: String) {
                currentSampleId = sampleId
                bitmap = null
                identifying = true
                identifyPlantViaProxy(
                    base64Image = null,
                    sampleId = sampleId,
                    organ = organToUse,
                    onSuccess = { info ->
                        lastResult = info
                        identifying = false
                        // Immediately navigate to the dedicated Results & Details page
                        screen = "result"
                    },
                    onError = { err ->
                        Toast.makeText(context, err, Toast.LENGTH_LONG).show()
                        identifying = false
                    }
                )
            }

            val pickImage = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
                uri?.let {
                    context.contentResolver.openInputStream(it)?.use { stream ->
                        val decoded = BitmapFactory.decodeStream(stream)
                        decoded?.let { rawBmp ->
                            val scaled = scaleBitmapDown(rawBmp, 1024)
                            triggerAutoIdentificationForBitmap(scaled, selectedOrgan)
                        }
                    }
                }
            }

            val takePicture = registerForActivityResult(ActivityResultContracts.TakePicturePreview()) { bmp ->
                bmp?.let { rawBmp ->
                    val scaled = scaleBitmapDown(rawBmp, 1024)
                    triggerAutoIdentificationForBitmap(scaled, selectedOrgan)
                }
            }

            MaterialTheme(
                colors = lightColors(
                    primary = AccentForest,
                    primaryVariant = HeaderForest,
                    secondary = AccentAmber,
                    background = BgParchment,
                    surface = Color.White,
                    onPrimary = Color.White,
                    onSecondary = Color.White,
                    onBackground = InkPrimary,
                    onSurface = InkPrimary
                )
            ) {
                Scaffold(
                    backgroundColor = BgParchment,
                    topBar = {
                        Column {
                            TopAppBar(
                                backgroundColor = HeaderForest,
                                contentColor = Color.White,
                                elevation = 4.dp,
                                title = {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.clickable { screen = "identify" }
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(10.dp)
                                                .clip(CircleShape)
                                                .background(Color(0xFF10B981))
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(
                                            text = "VxPlants",
                                            fontFamily = FontFamily.Serif,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 20.sp
                                        )
                                    }
                                },
                                actions = {
                                    TextButton(onClick = { showTipsModal = true }) {
                                        Text("Quick Tips", color = Color(0xFFFDE047), fontWeight = FontWeight.SemiBold)
                                    }
                                    Button(
                                        onClick = { takePicture.launch(null) },
                                        colors = ButtonDefaults.buttonColors(
                                            backgroundColor = AccentAmber,
                                            contentColor = Color.White
                                        ),
                                        modifier = Modifier.padding(end = 8.dp)
                                    ) {
                                        Text("Take Photo", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            )
                            Divider(color = AccentAmber, thickness = 2.dp)
                        }
                    },
                    bottomBar = {
                        BottomNavigation(
                            backgroundColor = Color.White,
                            contentColor = AccentForest,
                            elevation = 8.dp
                        ) {
                            BottomNavigationItem(
                                selected = screen == "identify",
                                onClick = { screen = "identify" },
                                label = { Text("Identify", fontWeight = FontWeight.SemiBold, fontSize = 11.sp) },
                                icon = { Text("🌿", fontSize = 16.sp) }
                            )
                            if (lastResult != null) {
                                BottomNavigationItem(
                                    selected = screen == "result",
                                    onClick = { screen = "result" },
                                    label = { Text("Results", fontWeight = FontWeight.SemiBold, fontSize = 11.sp) },
                                    icon = { Text("📋", fontSize = 16.sp) }
                                )
                            }
                            BottomNavigationItem(
                                selected = false,
                                onClick = { takePicture.launch(null) },
                                label = { Text("Camera", fontWeight = FontWeight.SemiBold, fontSize = 11.sp) },
                                icon = { Text("📷", fontSize = 16.sp) }
                            )
                            BottomNavigationItem(
                                selected = screen == "garden",
                                onClick = {
                                    gardenItems = loadGardenEntries(this@MainActivity)
                                    screen = "garden"
                                },
                                label = { Text("Garden (${gardenItems.size})", fontWeight = FontWeight.SemiBold, fontSize = 11.sp) },
                                icon = { Text("🪴", fontSize = 16.sp) }
                            )
                            BottomNavigationItem(
                                selected = showTipsModal,
                                onClick = { showTipsModal = true },
                                label = { Text("Tips", fontWeight = FontWeight.SemiBold, fontSize = 11.sp) },
                                icon = { Text("💡", fontSize = 16.sp) }
                            )
                        }
                    }
                ) { padding ->
                    if (showTipsModal) {
                        WelcomeTipsDialog(
                            onDismiss = { showTipsModal = false },
                            onTrySample = {
                                showTipsModal = false
                                triggerSampleIdentification("monstera", selectedOrgan)
                            }
                        )
                    }

                    Column(
                        modifier = Modifier
                            .padding(padding)
                            .fillMaxSize()
                            .verticalScroll(scrollState)
                            .padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        if (identifying) {
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = Color(0xFFEAF4EE),
                                border = BorderStroke(1.dp, AccentForest),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(14.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(22.dp),
                                        strokeWidth = 2.5.dp,
                                        color = AccentForest
                                    )
                                    Text(
                                        text = "Identifying plant & opening Results page...",
                                        fontSize = 13.5.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = AccentForest
                                    )
                                }
                            }
                        }

                        when (screen) {
                            "identify" -> {
                                // Hero & Controls Card
                                Card(
                                    shape = RoundedCornerShape(14.dp),
                                    border = BorderStroke(1.dp, BorderSage),
                                    elevation = 2.dp,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Column(modifier = Modifier.padding(16.dp)) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(
                                                    text = "INSTANT PLANT IDENTIFIER",
                                                    color = AccentKicker,
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.Bold
                                                )
                                                Spacer(modifier = Modifier.height(4.dp))
                                                Text(
                                                    text = "Identify any plant in seconds.",
                                                    fontFamily = FontFamily.Serif,
                                                    fontSize = 24.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = InkPrimary
                                                )
                                                Spacer(modifier = Modifier.height(4.dp))
                                                Text(
                                                    text = "Snap a photo, pick from your gallery, or tap a sample plant below for instant care & pest guides.",
                                                    fontSize = 13.5.sp,
                                                    color = InkSecondary
                                                )
                                            }
                                            Spacer(modifier = Modifier.width(12.dp))
                                            // Baby Groot Mascot Badge
                                            Surface(
                                                shape = CircleShape,
                                                color = Color(0xFFE6F0EA),
                                                border = BorderStroke(2.dp, AccentForest),
                                                modifier = Modifier.size(64.dp)
                                            ) {
                                                Box(contentAlignment = Alignment.Center) {
                                                    Text("🪴", fontSize = 28.sp)
                                                }
                                            }
                                        }

                                        Spacer(modifier = Modifier.height(14.dp))

                                        // 1. Plant Part Selector (Mint Block)
                                        Column(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clip(RoundedCornerShape(10.dp))
                                                .background(BgMintBlock)
                                                .border(1.dp, Color(0xFFCBE0D2), RoundedCornerShape(10.dp))
                                                .padding(12.dp)
                                        ) {
                                            Text(
                                                text = "What part of the plant is shown?",
                                                fontSize = 13.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = InkPrimary
                                            )
                                            Spacer(modifier = Modifier.height(8.dp))
                                            Row(
                                                modifier = Modifier.horizontalScroll(rememberScrollState()),
                                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                                            ) {
                                                val organs = listOf(
                                                    "auto" to "Auto-detect",
                                                    "leaf" to "Leaf",
                                                    "flower" to "Flower",
                                                    "fruit" to "Fruit",
                                                    "bark" to "Bark"
                                                )
                                                for ((code, label) in organs) {
                                                    val isSelected = selectedOrgan == code
                                                    Button(
                                                        onClick = {
                                                            selectedOrgan = code
                                                            bitmap?.let { triggerAutoIdentificationForBitmap(it, code) }
                                                                ?: currentSampleId?.let { triggerSampleIdentification(it, code) }
                                                        },
                                                        elevation = ButtonDefaults.elevation(0.dp),
                                                        colors = ButtonDefaults.buttonColors(
                                                            backgroundColor = if (isSelected) AccentForest else Color(0xFFE2EFE6),
                                                            contentColor = if (isSelected) Color.White else InkSecondary
                                                        ),
                                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                                                    ) {
                                                        Text(label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                                    }
                                                }
                                            }
                                        }

                                        Spacer(modifier = Modifier.height(12.dp))

                                        // 2. Sample Plants Strip (Warm Cream Block)
                                        Column(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clip(RoundedCornerShape(10.dp))
                                                .background(BgCreamBlock)
                                                .border(1.dp, Color(0xFFF2DEC0), RoundedCornerShape(10.dp))
                                                .padding(12.dp)
                                        ) {
                                            Text(
                                                text = "Don't have a photo handy? Try a sample plant:",
                                                fontSize = 13.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = InkPrimary
                                            )
                                            Spacer(modifier = Modifier.height(8.dp))
                                            val samples = listOf(
                                                Triple("monstera", "Swiss Cheese Plant", "Monstera deliciosa · Leaf"),
                                                Triple("hibiscus", "China Rose Hibiscus", "Hibiscus rosa-sinensis · Flower"),
                                                Triple("ficus", "Rubber Plant", "Ficus elastica · Leaf"),
                                                Triple("lavandula", "English Lavender", "Lavandula angustifolia · Flower")
                                            )
                                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                for ((sampleId, title, subtitle) in samples) {
                                                    Surface(
                                                        shape = RoundedCornerShape(8.dp),
                                                        color = Color.White,
                                                        border = BorderStroke(1.dp, Color(0xFFE5DEC9)),
                                                        modifier = Modifier
                                                            .fillMaxWidth()
                                                            .clickable(enabled = !identifying) {
                                                                triggerSampleIdentification(sampleId, selectedOrgan)
                                                            }
                                                    ) {
                                                        Row(
                                                            modifier = Modifier.padding(10.dp),
                                                            verticalAlignment = Alignment.CenterVertically,
                                                            horizontalArrangement = Arrangement.SpaceBetween
                                                        ) {
                                                            Column {
                                                                Text(title, fontWeight = FontWeight.Bold, fontSize = 13.5.sp)
                                                                Text(
                                                                    subtitle,
                                                                    fontStyle = FontStyle.Italic,
                                                                    fontSize = 12.sp,
                                                                    color = InkMuted
                                                                )
                                                            }
                                                            Text("Identify →", color = AccentForest, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                                        }
                                                    }
                                                }
                                            }
                                        }

                                        Spacer(modifier = Modifier.height(14.dp))

                                        // 3. Camera & Photo Library Uploader Stage
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text("Add Your Plant Photo", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                            Surface(
                                                color = Color(0xFFDCFCE7),
                                                shape = RoundedCornerShape(6.dp),
                                                border = BorderStroke(1.dp, Color(0xFF86EFAC))
                                            ) {
                                                Text(
                                                    text = "Auto-identifies on select",
                                                    color = Color(0xFF047857),
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.SemiBold,
                                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                                )
                                            }
                                        }

                                        Spacer(modifier = Modifier.height(10.dp))

                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                                        ) {
                                            Button(
                                                onClick = { takePicture.launch(null) },
                                                modifier = Modifier.weight(1f),
                                                colors = ButtonDefaults.buttonColors(backgroundColor = AccentForest, contentColor = Color.White)
                                            ) {
                                                Text("Take Photo")
                                            }
                                            OutlinedButton(
                                                onClick = { pickImage.launch("image/*") },
                                                modifier = Modifier.weight(1f),
                                                border = BorderStroke(1.dp, AccentForest)
                                            ) {
                                                Text("Photo Library", color = AccentForest)
                                            }
                                        }

                                        bitmap?.let { bmp ->
                                            Spacer(modifier = Modifier.height(12.dp))
                                            Card(
                                                elevation = 2.dp,
                                                shape = RoundedCornerShape(10.dp),
                                                border = BorderStroke(1.5.dp, AccentForest),
                                                modifier = Modifier.fillMaxWidth()
                                            ) {
                                                Image(
                                                    bitmap = bmp.asImageBitmap(),
                                                    contentDescription = "Selected plant photo",
                                                    contentScale = ContentScale.Crop,
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .height(220.dp)
                                                )
                                            }

                                            Spacer(modifier = Modifier.height(10.dp))

                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                                            ) {
                                                Button(
                                                    enabled = !identifying,
                                                    modifier = Modifier.weight(1f),
                                                    colors = ButtonDefaults.buttonColors(
                                                        backgroundColor = AccentAmber,
                                                        contentColor = Color.White
                                                    ),
                                                    onClick = {
                                                        triggerAutoIdentificationForBitmap(bmp, selectedOrgan)
                                                    }
                                                ) {
                                                    Text(
                                                        if (identifying) "Identifying..." else "Re-Identify Photo",
                                                        fontWeight = FontWeight.Bold
                                                    )
                                                }
                                                if (lastResult != null) {
                                                    OutlinedButton(
                                                        onClick = { screen = "result" },
                                                        border = BorderStroke(1.dp, AccentForest)
                                                    ) {
                                                        Text("View Results →", color = AccentForest)
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            "result" -> {
                                // Dedicated Plant Results & Care Guide Page View
                                val info = lastResult
                                if (info == null) {
                                    screen = "identify"
                                } else {
                                    PlantResultDossierCard(
                                        info = info,
                                        selectedOrgan = selectedOrgan,
                                        identifying = identifying,
                                        previewBitmap = bitmap,
                                        onBackToIdentify = { screen = "identify" },
                                        onTakeNewPhoto = { takePicture.launch(null) },
                                        onPickNewPhoto = { pickImage.launch("image/*") },
                                        onChangeOrgan = { newOrgan ->
                                            selectedOrgan = newOrgan
                                            bitmap?.let { triggerAutoIdentificationForBitmap(it, newOrgan) }
                                                ?: currentSampleId?.let { triggerSampleIdentification(it, newOrgan) }
                                        },
                                        onSaveToGarden = {
                                            val thumb = bitmap?.let { bitmapToBase64(scaleBitmapDown(it, 240), quality = 70) } ?: info.thumbnailBase64
                                            val toSave = info.copy(thumbnailBase64 = thumb)
                                            saveGardenEntry(this@MainActivity, toSave)
                                            gardenItems = loadGardenEntries(this@MainActivity)
                                            Toast.makeText(context, "Saved ${info.plantName} to My Garden", Toast.LENGTH_SHORT).show()
                                        }
                                    )
                                }
                            }

                            else -> {
                                // My Garden Screen
                                MyGardenScreen(
                                    entries = gardenItems,
                                    onOpenPlant = { entry ->
                                        lastResult = entry
                                        screen = "result"
                                    },
                                    onToggleFavorite = { entry ->
                                        val updated = entry.copy(favorite = !entry.favorite)
                                        updateGardenEntry(this@MainActivity, updated)
                                        gardenItems = loadGardenEntries(this@MainActivity)
                                    },
                                    onUpdateNote = { entry, newNote ->
                                        val updated = entry.copy(personalNote = newNote)
                                        updateGardenEntry(this@MainActivity, updated)
                                        gardenItems = loadGardenEntries(this@MainActivity)
                                    },
                                    onDeletePlant = { entry ->
                                        deleteGardenEntry(this@MainActivity, entry.id)
                                        gardenItems = loadGardenEntries(this@MainActivity)
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    @Composable
    fun WelcomeTipsDialog(onDismiss: () -> Unit, onTrySample: () -> Unit) {
        Dialog(onDismissRequest = onDismiss) {
            Card(
                shape = RoundedCornerShape(16.dp),
                border = BorderStroke(1.dp, BorderSage),
                elevation = 8.dp
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text(
                        text = "WELCOME TO VXPLANTS",
                        color = AccentKicker,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "3 Quick Tips Before You Start",
                        fontFamily = FontFamily.Serif,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = InkPrimary
                    )
                    Spacer(modifier = Modifier.height(14.dp))

                    TipItemRow(
                        num = "1",
                        title = "Snap a Photo or Pick a Sample",
                        desc = "Tap Take Photo, choose from your Photo Library, or tap any sample plant for instant identification."
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    TipItemRow(
                        num = "2",
                        title = "Automatic Results & Details Page",
                        desc = "As soon as your photo is analyzed, VxPlants automatically opens the full Plant Details & Care Guide page."
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    TipItemRow(
                        num = "3",
                        title = "Saved Privately on Your Phone",
                        desc = "Your identified plants and notes stay saved locally in My Garden—no login required."
                    )

                    Spacer(modifier = Modifier.height(18.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = onTrySample,
                            modifier = Modifier.weight(1f),
                            border = BorderStroke(1.dp, AccentForest)
                        ) {
                            Text("Try Sample", color = AccentForest, fontSize = 12.sp)
                        }
                        Button(
                            onClick = onDismiss,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(backgroundColor = AccentForest, contentColor = Color.White)
                        ) {
                            Text("Let's Start", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }

    @Composable
    fun TipItemRow(num: String, title: String, desc: String) {
        Row(verticalAlignment = Alignment.Top) {
            Surface(
                shape = CircleShape,
                color = Color(0xFFEAF4EE),
                modifier = Modifier.size(26.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(num, color = AccentForest, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
            }
            Spacer(modifier = Modifier.width(10.dp))
            Column {
                Text(title, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, color = InkPrimary)
                Text(desc, fontSize = 12.5.sp, color = InkSecondary)
            }
        }
    }

    @Composable
    fun PlantResultDossierCard(
        info: PlantInfo,
        selectedOrgan: String,
        identifying: Boolean,
        previewBitmap: Bitmap?,
        onBackToIdentify: () -> Unit,
        onTakeNewPhoto: () -> Unit,
        onPickNewPhoto: () -> Unit,
        onChangeOrgan: (String) -> Unit,
        onSaveToGarden: () -> Unit
    ) {
        Card(
            shape = RoundedCornerShape(14.dp),
            border = BorderStroke(1.dp, BorderSage),
            elevation = 2.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                // Dedicated Results Page Top Navigation Bar
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedButton(
                        onClick = onBackToIdentify,
                        border = BorderStroke(1.dp, AccentForest),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        Text("← Identify Another", color = AccentForest, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedButton(
                            onClick = onPickNewPhoto,
                            border = BorderStroke(1.dp, BorderSage),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                        ) {
                            Text("Upload New", color = InkPrimary, fontSize = 12.sp)
                        }
                        Button(
                            onClick = onTakeNewPhoto,
                            colors = ButtonDefaults.buttonColors(backgroundColor = AccentAmber, contentColor = Color.White),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                        ) {
                            Text("Camera", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Quick Plant Part Switcher inside the Results Page
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Part:", fontSize = 12.sp, color = InkMuted, fontWeight = FontWeight.SemiBold)
                    val organs = listOf(
                        "auto" to "Auto",
                        "leaf" to "Leaf",
                        "flower" to "Flower",
                        "fruit" to "Fruit",
                        "bark" to "Bark"
                    )
                    for ((code, label) in organs) {
                        val isSelected = selectedOrgan == code
                        Button(
                            enabled = !identifying,
                            onClick = { onChangeOrgan(code) },
                            elevation = ButtonDefaults.elevation(0.dp),
                            colors = ButtonDefaults.buttonColors(
                                backgroundColor = if (isSelected) AccentForest else Color(0xFFE2EFE6),
                                contentColor = if (isSelected) Color.White else InkSecondary
                            ),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                        ) {
                            Text(label, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))
                Divider(color = BorderSage)
                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "BEST MATCH · PART: ${info.organUsed.uppercase(Locale.US)}",
                            color = AccentKicker,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = info.plantName,
                            fontFamily = FontFamily.Serif,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold,
                            color = InkPrimary
                        )
                        info.scientificName?.let {
                            Text(
                                text = it,
                                fontFamily = FontFamily.Serif,
                                fontStyle = FontStyle.Italic,
                                fontSize = 15.sp,
                                color = InkSecondary
                            )
                        }
                        if (!info.family.isNullOrEmpty() || !info.genus.isNullOrEmpty()) {
                            Text(
                                text = listOfNotNull(
                                    info.family?.let { "Family: $it" },
                                    info.genus?.let { "Genus: $it" }
                                ).joinToString(" · "),
                                fontSize = 12.sp,
                                color = InkMuted
                            )
                        }
                    }

                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            text = "${"%.1f".format(info.confidence * 100)}%",
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold,
                            fontSize = 20.sp,
                            color = AccentForest
                        )
                        Text("Match Score", fontSize = 11.sp, color = InkMuted)
                    }
                }

                previewBitmap?.let { bmp ->
                    Spacer(modifier = Modifier.height(12.dp))
                    Card(
                        elevation = 1.dp,
                        shape = RoundedCornerShape(10.dp),
                        border = BorderStroke(1.dp, BorderSage),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Image(
                            bitmap = bmp.asImageBitmap(),
                            contentDescription = info.plantName,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(200.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                Button(
                    onClick = onSaveToGarden,
                    colors = ButtonDefaults.buttonColors(backgroundColor = AccentForest, contentColor = Color.White),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Save to My Garden", fontWeight = FontWeight.Bold)
                }

                Spacer(modifier = Modifier.height(14.dp))
                Divider(color = BorderSage)
                Spacer(modifier = Modifier.height(12.dp))

                // Care & Safety Guide
                Text(
                    text = "Essential Care & Safety Guide",
                    fontFamily = FontFamily.Serif,
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                    color = InkPrimary
                )
                Spacer(modifier = Modifier.height(8.dp))
                CareInfoBlock("Sunlight", info.careGuide.sunlight)
                CareInfoBlock("Watering", info.careGuide.watering)
                CareInfoBlock("Pet Safety", info.careGuide.toxicity)
                CareInfoBlock("Best Spot & Tip", "${info.careGuide.environment} — ${info.careGuide.careTip}")

                Spacer(modifier = Modifier.height(12.dp))
                Divider(color = BorderSage)
                Spacer(modifier = Modifier.height(12.dp))

                // Agricultural & Pest Management Guide
                Text(
                    text = "Plant Health, Pests & Grower Guide",
                    fontFamily = FontFamily.Serif,
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                    color = InkPrimary
                )
                Text(
                    text = "Pest symptoms, organic prevention, soil pH/NPK & propagation",
                    fontSize = 12.sp,
                    color = InkMuted
                )
                Spacer(modifier = Modifier.height(8.dp))
                CareInfoBlock("Common Pests & Symptoms", info.careGuide.pests, isAgri = true)
                CareInfoBlock("Prevention & Organic Treatment", info.careGuide.prevention, isAgri = true)
                CareInfoBlock("Soil, pH & Fertilizer (NPK)", info.careGuide.soilAndNutrients, isAgri = true)
                CareInfoBlock("Propagation & Climate", info.careGuide.propagationAndClimate, isAgri = true)

                Spacer(modifier = Modifier.height(14.dp))
                Divider(color = BorderSage)
                Spacer(modifier = Modifier.height(12.dp))

                // Plant Geek Suite 1: Interactive Custom Watering & Feeding Estimator
                val gp = info.careGuide.geekProfile
                var potSize by remember(info.id) { mutableStateOf("medium") }
                var potMat by remember(info.id) { mutableStateOf("plastic") }
                var estEnv by remember(info.id) { mutableStateOf("indoor") }

                val sizeDaysMult = when (potSize) {
                    "small" -> 0.72
                    "large" -> 1.35
                    else -> 1.0
                }
                val matDaysMult = when (potMat) {
                    "terracotta" -> 0.78
                    "fabric" -> 0.72
                    else -> 1.0
                }
                val envDaysMult = when (estEnv) {
                    "humid" -> 1.28
                    "outdoor" -> 0.74
                    else -> 1.0
                }
                val calcDays = max(2, (gp.baseIntervalDays * sizeDaysMult * matDaysMult * envDaysMult).roundToInt())
                val minDays = max(2, calcDays - 1)
                val maxDays = calcDays + 1

                val sizeVolMult = when (potSize) {
                    "small" -> 0.45
                    "large" -> 2.15
                    else -> 1.0
                }
                val matVolMult = when (potMat) {
                    "terracotta" -> 1.1
                    "fabric" -> 1.15
                    else -> 1.0
                }
                val calcVolMl = ((gp.baseVolumeMl * sizeVolMult * matVolMult) / 10.0).roundToInt() * 10
                val cupsStr = "%.1f".format(Locale.US, calcVolMl / 240.0)
                val matNote = when (potMat) {
                    "terracotta" -> "porous clay breathes fast"
                    "fabric" -> "high side-wall aeration"
                    else -> "retains moisture longer"
                }

                Text(
                    text = "INTERACTIVE CALCULATOR",
                    color = AccentKicker,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Custom Watering & Feeding Estimator",
                    fontFamily = FontFamily.Serif,
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                    color = InkPrimary
                )
                Text(
                    text = "Tap your pot diameter, container material & microclimate to calculate hydration",
                    fontSize = 12.sp,
                    color = InkMuted
                )
                Spacer(modifier = Modifier.height(8.dp))

                EstimatorSelectorRow(
                    label = "1. Pot Diameter:",
                    options = listOf("small" to "Small 4\"", "medium" to "Med 6–8\"", "large" to "Large 10\"+"),
                    selected = potSize,
                    onSelect = { potSize = it }
                )
                Spacer(modifier = Modifier.height(6.dp))
                EstimatorSelectorRow(
                    label = "2. Material:",
                    options = listOf("terracotta" to "Terracotta", "plastic" to "Plastic/Ceramic", "fabric" to "Grow Bag"),
                    selected = potMat,
                    onSelect = { potMat = it }
                )
                Spacer(modifier = Modifier.height(6.dp))
                EstimatorSelectorRow(
                    label = "3. Setup:",
                    options = listOf("indoor" to "Indoor Room", "humid" to "Humid/Cabinet", "outdoor" to "Patio/Outdoor"),
                    selected = estEnv,
                    onSelect = { estEnv = it }
                )

                Spacer(modifier = Modifier.height(10.dp))
                EstimatorOutputCard(
                    title = "EST. WATERING CADENCE",
                    primaryMono = "Every $minDays–$maxDays days",
                    subText = "Target: ${gp.dryBackPercent} ($matNote)"
                )
                EstimatorOutputCard(
                    title = "TARGET DRENCH VOLUME",
                    primaryMono = "$calcVolMl mL (~$cupsStr cups)",
                    subText = gp.waterQualityNote
                )
                EstimatorOutputCard(
                    title = "NPK RATIO & FEED SCHEDULE",
                    primaryMono = gp.npkRatio,
                    subText = gp.fertilizerDilution
                )

                Spacer(modifier = Modifier.height(14.dp))
                Divider(color = BorderSage)
                Spacer(modifier = Modifier.height(12.dp))

                // Plant Geek Suite 2: 12-Month Seasonal Care & Phenology Calendar
                Text(
                    text = "ANNUAL BIOLOGICAL CYCLE",
                    color = AccentKicker,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "12-Month Seasonal Care Calendar",
                    fontFamily = FontFamily.Serif,
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                    color = InkPrimary
                )
                Spacer(modifier = Modifier.height(8.dp))
                for (seasonItem in gp.seasons) {
                    SeasonCalendarCard(seasonItem)
                }

                Spacer(modifier = Modifier.height(14.dp))
                Divider(color = BorderSage)
                Spacer(modifier = Modifier.height(12.dp))

                // Plant Geek Suite 3: Precision Grower Telemetry & 100% Substrate Mix
                Text(
                    text = "COLLECTOR & BOTANIST METRICS",
                    color = AccentKicker,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Precision Grower Telemetry & Substrate Recipe",
                    fontFamily = FontFamily.Serif,
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                    color = InkPrimary
                )
                Spacer(modifier = Modifier.height(8.dp))

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TelemetryMiniCard(
                        modifier = Modifier.weight(1f),
                        kicker = "Light (PPFD / Lux)",
                        mono = gp.ppfdRange,
                        sub = gp.luxRange
                    )
                    TelemetryMiniCard(
                        modifier = Modifier.weight(1f),
                        kicker = "Humidity & VPD",
                        mono = gp.humidityRange,
                        sub = "VPD: ${gp.vpdRange}"
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TelemetryMiniCard(
                        modifier = Modifier.weight(1f),
                        kicker = "Temp & Hardiness",
                        mono = gp.tempRange,
                        sub = gp.usdaZones
                    )
                    TelemetryMiniCard(
                        modifier = Modifier.weight(1f),
                        kicker = "Target pH & Habit",
                        mono = "pH ${gp.soilPh}",
                        sub = gp.growthHabit
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = BgCreamBlock,
                    border = BorderStroke(1.dp, Color(0xFFDFD5C0)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(
                            text = "Ideal Potting Substrate Formula (100% Mix)",
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp,
                            color = InkPrimary
                        )
                        Text(
                            text = "Native Biome: ${gp.nativeBiome}",
                            fontSize = 11.5.sp,
                            color = AccentForest,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        val barColors = listOf(AccentForest, AccentEmerald, AccentAmber, Color(0xFF6B8E78))
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(12.dp)
                                .clip(RoundedCornerShape(6.dp))
                                .background(Color(0xFFE2DDD2))
                        ) {
                            gp.substrateMix.forEachIndexed { idx, part ->
                                Box(
                                    modifier = Modifier
                                        .weight(part.percent.coerceAtLeast(1).toFloat())
                                        .fillMaxHeight()
                                        .background(barColors[idx % barColors.size])
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            gp.substrateMix.forEachIndexed { idx, part ->
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        modifier = Modifier
                                            .size(10.dp)
                                            .clip(RoundedCornerShape(2.dp))
                                            .background(barColors[idx % barColors.size])
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = "${part.percent}%",
                                        fontFamily = FontFamily.Monospace,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp,
                                        color = InkPrimary
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(text = part.label, fontSize = 12.sp, color = InkSecondary)
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))
                Divider(color = BorderSage)
                Spacer(modifier = Modifier.height(12.dp))

                // Plant Geek Suite 4: Botanical Field Notes, Lookalike Guide & Research Databases
                val ctx = LocalContext.current
                val cleanSci = (info.scientificName ?: info.plantName).replace(Regex("\\s+[A-Z(].*$"), "").trim()
                val encodedSci = try {
                    URLEncoder.encode(cleanSci, "UTF-8")
                } catch (_: Exception) {
                    cleanSci
                }

                Text(
                    text = "MORPHOLOGY & TAXONOMY",
                    color = AccentKicker,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Botanical Field Notes & Lookalike Guide",
                    fontFamily = FontFamily.Serif,
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                    color = InkPrimary
                )
                Spacer(modifier = Modifier.height(8.dp))
                CareInfoBlock("Diagnostic Morphological Traits", gp.diagnosticTraits)
                CareInfoBlock("How to Distinguish from Lookalikes", gp.lookalikeNote)
                CareInfoBlock("Taxonomic & Ecological Notes", gp.botanicalEtymology)

                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    val links = listOf(
                        "Kew POWO ↗" to "https://powo.science.kew.org/results?q=$encodedSci",
                        "GBIF Taxonomy ↗" to "https://www.gbif.org/species/search?q=$encodedSci",
                        "iNaturalist ↗" to "https://www.inaturalist.org/taxa/search?q=$encodedSci"
                    )
                    for ((lbl, url) in links) {
                        OutlinedButton(
                            onClick = {
                                try {
                                    ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                                } catch (_: Exception) {
                                }
                            },
                            border = BorderStroke(1.dp, AccentForest),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                        ) {
                            Text(lbl, color = AccentForest, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }

                if (info.commonNames.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(10.dp))
                    Text("Other Common Names", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = InkMuted)
                    Text(info.commonNames.joinToString(" · "), fontSize = 13.sp, color = InkSecondary)
                }

                info.wikiDescription?.let { desc ->
                    Spacer(modifier = Modifier.height(12.dp))
                    Divider(color = BorderSage)
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = "About This Plant",
                        fontFamily = FontFamily.Serif,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(text = desc, fontSize = 13.5.sp, color = InkSecondary, lineHeight = 19.sp)
                }
            }
        }
    }

    @Composable
    fun EstimatorSelectorRow(
        label: String,
        options: List<Pair<String, String>>,
        selected: String,
        onSelect: (String) -> Unit
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(BgParchment)
                .border(1.dp, BorderSage, RoundedCornerShape(8.dp))
                .padding(8.dp)
        ) {
            Text(text = label, fontSize = 11.5.sp, fontWeight = FontWeight.Bold, color = InkSecondary)
            Spacer(modifier = Modifier.height(6.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                for ((code, text) in options) {
                    val active = selected == code
                    Button(
                        onClick = { onSelect(code) },
                        modifier = Modifier.weight(1f),
                        elevation = ButtonDefaults.elevation(0.dp),
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = if (active) AccentForest else Color(0xFFE2EFE6),
                            contentColor = if (active) Color.White else InkSecondary
                        ),
                        contentPadding = PaddingValues(horizontal = 6.dp, vertical = 6.dp)
                    ) {
                        Text(text, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    }
                }
            }
        }
    }

    @Composable
    fun EstimatorOutputCard(title: String, primaryMono: String, subText: String) {
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = Color(0xFFEDF6F0),
            border = BorderStroke(1.dp, Color(0xFFBCD8C6)),
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 3.dp)
        ) {
            Column(modifier = Modifier.padding(10.dp)) {
                Text(text = title, color = AccentEmerald, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = primaryMono,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    color = InkPrimary
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(text = subText, fontSize = 12.sp, color = InkSecondary)
            }
        }
    }

    @Composable
    fun SeasonCalendarCard(item: SeasonPhaseInfo) {
        val bg = if (item.key == "summer") BgCreamBlock else BgParchment
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = bg,
            border = BorderStroke(1.dp, BorderSage),
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp)
        ) {
            Column(modifier = Modifier.padding(10.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(text = item.season.uppercase(Locale.US), color = AccentForest, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    Text(text = item.phase, fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, color = InkPrimary)
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(text = "Water: ${item.waterNote}", fontSize = 12.sp, color = InkSecondary)
                Text(text = "Feed: ${item.feedNote}", fontSize = 12.sp, color = InkSecondary)
                Text(text = "Focus: ${item.actionTip}", fontSize = 12.sp, color = InkPrimary, fontWeight = FontWeight.Medium)
            }
        }
    }

    @Composable
    fun TelemetryMiniCard(modifier: Modifier = Modifier, kicker: String, mono: String, sub: String) {
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = BgParchment,
            border = BorderStroke(1.dp, BorderSage),
            modifier = modifier
        ) {
            Column(modifier = Modifier.padding(10.dp)) {
                Text(text = kicker, color = AccentEmerald, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(2.dp))
                Text(text = mono, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 13.5.sp, color = InkPrimary)
                Text(text = sub, fontSize = 11.5.sp, color = InkSecondary)
            }
        }
    }

    @Composable
    fun CareInfoBlock(label: String, value: String, isAgri: Boolean = false) {
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = if (isAgri) BgMintBlock else BgParchment,
            border = BorderStroke(1.dp, if (isAgri) Color(0xFFCBE0D2) else BorderSage),
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp)
        ) {
            Column(modifier = Modifier.padding(10.dp)) {
                Text(
                    text = label,
                    color = AccentEmerald,
                    fontSize = 11.5.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = value,
                    color = InkPrimary,
                    fontSize = 13.sp,
                    lineHeight = 18.sp
                )
            }
        }
    }

    @Composable
    fun MyGardenScreen(
        entries: List<PlantInfo>,
        onOpenPlant: (PlantInfo) -> Unit,
        onToggleFavorite: (PlantInfo) -> Unit,
        onUpdateNote: (PlantInfo, String) -> Unit,
        onDeletePlant: (PlantInfo) -> Unit
    ) {
        var filter by remember { mutableStateOf("all") }

        Card(
            shape = RoundedCornerShape(14.dp),
            border = BorderStroke(1.dp, BorderSage),
            elevation = 2.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "SAVED ON YOUR DEVICE",
                    color = AccentKicker,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "My Garden",
                    fontFamily = FontFamily.Serif,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Your identified plants and personal care notes stay saved on your phone.",
                    fontSize = 13.sp,
                    color = InkSecondary
                )

                Spacer(modifier = Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { filter = "all" },
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = if (filter == "all") AccentForest else Color(0xFFE2EFE6),
                            contentColor = if (filter == "all") Color.White else InkSecondary
                        )
                    ) {
                        Text("All Plants (${entries.size})", fontSize = 12.sp)
                    }
                    Button(
                        onClick = { filter = "favorites" },
                        colors = ButtonDefaults.buttonColors(
                            backgroundColor = if (filter == "favorites") AccentForest else Color(0xFFE2EFE6),
                            contentColor = if (filter == "favorites") Color.White else InkSecondary
                        )
                    ) {
                        Text("Favorites", fontSize = 12.sp)
                    }
                }
            }
        }

        val filtered = if (filter == "favorites") entries.filter { it.favorite } else entries
        if (filtered.isEmpty()) {
            Card(
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, BorderSage),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = "No plants in this view yet. Identify a plant or tap a sample plant to start your garden.",
                    modifier = Modifier.padding(20.dp),
                    color = InkSecondary,
                    fontSize = 13.5.sp
                )
            }
        } else {
            for (entry in filtered) {
                var noteText by remember(entry.id, entry.personalNote) { mutableStateOf(entry.personalNote) }
                Card(
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, BorderSage),
                    elevation = 2.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                                val thumbBmp = remember(entry.thumbnailBase64) {
                                    entry.thumbnailBase64?.takeIf { it.isNotEmpty() }?.let { b64 ->
                                        try {
                                            val bytes = Base64.decode(b64, Base64.DEFAULT)
                                            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                                        } catch (_: Exception) {
                                            null
                                        }
                                    }
                                }
                                thumbBmp?.let {
                                    Image(
                                        bitmap = it.asImageBitmap(),
                                        contentDescription = entry.plantName,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier
                                            .size(54.dp)
                                            .clip(RoundedCornerShape(8.dp))
                                    )
                                    Spacer(modifier = Modifier.width(10.dp))
                                }
                                Column {
                                    Text(entry.plantName, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                                    entry.scientificName?.let {
                                        Text(it, fontStyle = FontStyle.Italic, fontSize = 12.5.sp, color = InkSecondary)
                                    }
                                    Text(
                                        text = "${entry.savedDate} · ${"%.0f".format(entry.confidence * 100)}% match",
                                        fontSize = 11.5.sp,
                                        color = InkMuted
                                    )
                                }
                            }
                            TextButton(onClick = { onToggleFavorite(entry) }) {
                                Text(
                                    text = if (entry.favorite) "★ Favorited" else "☆ Favorite",
                                    color = if (entry.favorite) AccentAmber else InkSecondary,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = noteText,
                            onValueChange = {
                                noteText = it
                                onUpdateNote(entry, it)
                            },
                            label = { Text("Personal care or pest notes...") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = false,
                            maxLines = 3
                        )

                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Button(
                                onClick = { onOpenPlant(entry) },
                                colors = ButtonDefaults.buttonColors(backgroundColor = AccentForest, contentColor = Color.White)
                            ) {
                                Text("Open Care & Pest Guide", fontSize = 12.sp)
                            }
                            TextButton(onClick = { onDeletePlant(entry) }) {
                                Text("Remove", color = Color(0xFF991B1B), fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
        }
    }

    private fun identifyPlantViaProxy(
        base64Image: String?,
        sampleId: String?,
        organ: String,
        onSuccess: (PlantInfo) -> Unit,
        onError: (String) -> Unit
    ) {
        val baseUrl = BuildConfig.API_BASE_URL.trimEnd('/')
        if (baseUrl.isEmpty()) {
            onError("API_BASE_URL is not configured in local.properties.")
            return
        }

        val json = JSONObject().apply {
            put("organ", organ)
            if (sampleId != null) {
                put("sampleId", sampleId)
            } else if (base64Image != null) {
                put("image", base64Image)
            }
        }

        val mediaType = "application/json; charset=utf-8".toMediaType()
        val payloadBytes = json.toString()

        fun executeRequest(endpointPath: String, isRetry: Boolean) {
            val request = Request.Builder()
                .url("$baseUrl$endpointPath")
                .post(payloadBytes.toRequestBody(mediaType))
                .build()

            httpClient.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    runOnUiThread { onError("Could not reach VxPlants server ($baseUrl). Check API_BASE_URL.") }
                }

                override fun onResponse(call: Call, response: Response) {
                    response.use { resp ->
                        if ((resp.code == 404 || resp.code == 405) && !isRetry) {
                            executeRequest("/api/identify", true)
                            return
                        }
                        if (!resp.isSuccessful) {
                            runOnUiThread { onError("Identification error (HTTP ${resp.code})") }
                            return
                        }
                        val text = resp.body?.string() ?: ""
                        try {
                            val root = JSONObject(text)
                            val plantName = root.optString("plantName", "").ifEmpty {
                                root.optString("plant_name", "Unknown")
                            }
                            if (plantName.isEmpty()) {
                                runOnUiThread { onError("No matching plant species found.") }
                                return
                            }
                            val scientific = root.optString("scientificName", "").ifEmpty { null }
                            val confidence = root.optDouble("confidence", 0.0)
                            val organUsed = root.optString("organUsed", organ)

                            val taxObj = root.optJSONObject("taxonomy")
                            val family = taxObj?.optString("family", "")?.ifEmpty { null }
                            val genus = taxObj?.optString("genus", "")?.ifEmpty { null }

                            val commonNamesArr = root.optJSONArray("commonNames") ?: JSONArray()
                            val commonNames = mutableListOf<String>()
                            for (i in 0 until commonNamesArr.length()) {
                                commonNames.add(commonNamesArr.optString(i))
                            }

                            val wikiDesc = root.optString("wikiDescription", "").ifEmpty { null }

                            val cgObj = root.optJSONObject("careGuide")
                            val careGuide = parseCareGuideJson(cgObj, scientific, family, genus)

                            val info = PlantInfo(
                                plantName = plantName,
                                scientificName = scientific,
                                family = family,
                                genus = genus,
                                organUsed = organUsed,
                                confidence = confidence,
                                commonNames = commonNames,
                                wikiDescription = wikiDesc,
                                careGuide = careGuide
                            )
                            runOnUiThread { onSuccess(info) }
                        } catch (e: Exception) {
                            runOnUiThread { onError("Failed to parse identification response.") }
                        }
                    }
                }
            })
        }

        executeRequest("/identify", false)
    }

    private fun scaleBitmapDown(bitmap: Bitmap, maxDimension: Int): Bitmap {
        val width = bitmap.width
        val height = bitmap.height
        if (width <= maxDimension && height <= maxDimension) return bitmap
        val ratio = width.toFloat() / height.toFloat()
        val (newW, newH) = if (ratio > 1f) {
            maxDimension to (maxDimension / ratio).toInt()
        } else {
            (maxDimension * ratio).toInt() to maxDimension
        }
        return Bitmap.createScaledBitmap(bitmap, newW.coerceAtLeast(1), newH.coerceAtLeast(1), true)
    }

    private fun bitmapToBase64(bitmap: Bitmap, quality: Int = 82): String {
        val baos = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, baos)
        val bytes = baos.toByteArray()
        return Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    private fun plantInfoToJson(info: PlantInfo): JSONObject {
        return JSONObject().apply {
            put("id", info.id)
            put("plantName", info.plantName)
            put("scientificName", info.scientificName ?: "")
            put("family", info.family ?: "")
            put("genus", info.genus ?: "")
            put("organUsed", info.organUsed)
            put("confidence", info.confidence)
            val commons = JSONArray()
            for (c in info.commonNames) commons.put(c)
            put("commonNames", commons)
            put("wikiDescription", info.wikiDescription ?: "")
            put("personalNote", info.personalNote)
            put("favorite", info.favorite)
            put("savedDate", info.savedDate)
            put("imageBase64", info.thumbnailBase64 ?: "")
            put("careGuide", JSONObject().apply {
                put("sunlight", info.careGuide.sunlight)
                put("watering", info.careGuide.watering)
                put("toxicity", info.careGuide.toxicity)
                put("environment", info.careGuide.environment)
                put("careTip", info.careGuide.careTip)
                put("pests", info.careGuide.pests)
                put("prevention", info.careGuide.prevention)
                put("soilAndNutrients", info.careGuide.soilAndNutrients)
                put("propagationAndClimate", info.careGuide.propagationAndClimate)
            })
        }
    }

    private fun jsonToPlantInfo(obj: JSONObject): PlantInfo {
        val commonsArr = obj.optJSONArray("commonNames") ?: JSONArray()
        val commons = mutableListOf<String>()
        for (i in 0 until commonsArr.length()) {
            commons.add(commonsArr.optString(i))
        }
        val scientific = obj.optString("scientificName", "").ifEmpty { null }
        val family = obj.optString("family", "").ifEmpty { null }
        val genus = obj.optString("genus", "").ifEmpty { null }
        val cg = obj.optJSONObject("careGuide")
        val careGuide = parseCareGuideJson(cg, scientific, family, genus)

        return PlantInfo(
            id = obj.optString("id", System.currentTimeMillis().toString()),
            plantName = obj.optString("plantName", "Unknown Plant"),
            scientificName = scientific,
            family = family,
            genus = genus,
            organUsed = obj.optString("organUsed", "auto"),
            confidence = obj.optDouble("confidence", 0.0),
            commonNames = commons,
            wikiDescription = obj.optString("wikiDescription", "").ifEmpty { null },
            careGuide = careGuide,
            personalNote = obj.optString("personalNote", ""),
            favorite = obj.optBoolean("favorite", false),
            savedDate = obj.optString("savedDate", ""),
            thumbnailBase64 = obj.optString("imageBase64", "").ifEmpty { null }
        )
    }

    private fun parseCareGuideJson(
        cg: JSONObject?,
        scientificName: String?,
        family: String?,
        genus: String?
    ): CareGuideInfo {
        val defaultFallbackGeek = buildAndroidFallbackGeekProfile(scientificName, family, genus)
        if (cg == null) return CareGuideInfo(geekProfile = defaultFallbackGeek)

        val gpObj = cg.optJSONObject("geekProfile")
        val parsedGeek = if (gpObj != null) {
            val tele = gpObj.optJSONObject("telemetry")
            val wb = gpObj.optJSONObject("wateringBase")
            val fn = gpObj.optJSONObject("fieldNotes")
            val cal = gpObj.optJSONObject("seasonalCalendar")
            val mixArr = gpObj.optJSONArray("substrateMix")

            val mixList = mutableListOf<SubstratePart>()
            if (mixArr != null) {
                for (i in 0 until mixArr.length()) {
                    val m = mixArr.optJSONObject(i)
                    if (m != null) {
                        mixList.add(
                            SubstratePart(
                                label = m.optString("label", "Media"),
                                percent = m.optInt("percent", 25)
                            )
                        )
                    }
                }
            }

            val seasonsList = mutableListOf<SeasonPhaseInfo>()
            if (cal != null) {
                val keys = listOf("spring", "summer", "autumn", "winter")
                for (k in keys) {
                    val sObj = cal.optJSONObject(k)
                    if (sObj != null) {
                        seasonsList.add(
                            SeasonPhaseInfo(
                                key = k,
                                season = sObj.optString("season", k.uppercase(Locale.US)),
                                phase = sObj.optString("phase", ""),
                                waterNote = sObj.optString("waterNote", ""),
                                feedNote = sObj.optString("feedNote", ""),
                                actionTip = sObj.optString("actionTip", "")
                            )
                        )
                    }
                }
            }

            GeekProfileInfo(
                ppfdRange = tele?.optString("ppfdRange", defaultFallbackGeek.ppfdRange) ?: defaultFallbackGeek.ppfdRange,
                luxRange = tele?.optString("luxRange", defaultFallbackGeek.luxRange) ?: defaultFallbackGeek.luxRange,
                humidityRange = tele?.optString("humidityRange", defaultFallbackGeek.humidityRange) ?: defaultFallbackGeek.humidityRange,
                vpdRange = tele?.optString("vpdRange", defaultFallbackGeek.vpdRange) ?: defaultFallbackGeek.vpdRange,
                tempRange = tele?.optString("tempRange", defaultFallbackGeek.tempRange) ?: defaultFallbackGeek.tempRange,
                usdaZones = tele?.optString("usdaZones", defaultFallbackGeek.usdaZones) ?: defaultFallbackGeek.usdaZones,
                soilPh = tele?.optString("soilPh", defaultFallbackGeek.soilPh) ?: defaultFallbackGeek.soilPh,
                growthHabit = tele?.optString("growthHabit", defaultFallbackGeek.growthHabit) ?: defaultFallbackGeek.growthHabit,
                nativeBiome = tele?.optString("nativeBiome", defaultFallbackGeek.nativeBiome) ?: defaultFallbackGeek.nativeBiome,
                baseIntervalDays = wb?.optInt("baseIntervalDays", defaultFallbackGeek.baseIntervalDays) ?: defaultFallbackGeek.baseIntervalDays,
                dryBackPercent = wb?.optString("dryBackPercent", defaultFallbackGeek.dryBackPercent) ?: defaultFallbackGeek.dryBackPercent,
                baseVolumeMl = wb?.optInt("baseVolumeMl", defaultFallbackGeek.baseVolumeMl) ?: defaultFallbackGeek.baseVolumeMl,
                npkRatio = wb?.optString("npkRatio", defaultFallbackGeek.npkRatio) ?: defaultFallbackGeek.npkRatio,
                fertilizerDilution = wb?.optString("fertilizerDilution", defaultFallbackGeek.fertilizerDilution) ?: defaultFallbackGeek.fertilizerDilution,
                waterQualityNote = wb?.optString("waterQualityNote", defaultFallbackGeek.waterQualityNote) ?: defaultFallbackGeek.waterQualityNote,
                substrateMix = if (mixList.isNotEmpty()) mixList else defaultFallbackGeek.substrateMix,
                seasons = if (seasonsList.isNotEmpty()) seasonsList else defaultFallbackGeek.seasons,
                diagnosticTraits = fn?.optString("diagnosticTraits", defaultFallbackGeek.diagnosticTraits) ?: defaultFallbackGeek.diagnosticTraits,
                lookalikeNote = fn?.optString("lookalikeNote", defaultFallbackGeek.lookalikeNote) ?: defaultFallbackGeek.lookalikeNote,
                botanicalEtymology = fn?.optString("botanicalEtymology", defaultFallbackGeek.botanicalEtymology) ?: defaultFallbackGeek.botanicalEtymology
            )
        } else {
            defaultFallbackGeek
        }

        return CareGuideInfo(
            sunlight = cg.optString("sunlight", CareGuideInfo().sunlight),
            watering = cg.optString("watering", CareGuideInfo().watering),
            toxicity = cg.optString("toxicity", CareGuideInfo().toxicity),
            environment = cg.optString("environment", CareGuideInfo().environment),
            careTip = cg.optString("careTip", CareGuideInfo().careTip),
            pests = cg.optString("pests", CareGuideInfo().pests),
            prevention = cg.optString("prevention", CareGuideInfo().prevention),
            soilAndNutrients = cg.optString("soilAndNutrients", CareGuideInfo().soilAndNutrients),
            propagationAndClimate = cg.optString("propagationAndClimate", CareGuideInfo().propagationAndClimate),
            geekProfile = parsedGeek
        )
    }

    private fun buildAndroidFallbackGeekProfile(
        scientificName: String?,
        family: String?,
        genus: String?
    ): GeekProfileInfo {
        val fam = (family ?: "").lowercase(Locale.US)
        val gen = (genus ?: "").lowercase(Locale.US)
        val isAroid = fam == "araceae" || gen in listOf("monstera", "philodendron", "epipremnum", "zamioculcas", "spathiphyllum", "alocasia")
        val isHerb = fam == "lamiaceae" || gen in listOf("lavandula", "rosmarinus", "salvia", "mentha", "ocimum")
        val isHibiscus = fam == "malvaceae" || gen == "hibiscus"

        if (isAroid) {
            return GeekProfileInfo(
                ppfdRange = "120–280 μmol/m²/s",
                luxRange = "2,500–6,500 Lux (230–600 FC)",
                humidityRange = "60–80% RH",
                vpdRange = "0.7–1.0 kPa",
                tempRange = "19–29°C (66–85°F)",
                usdaZones = "USDA Zones 10b–12",
                soilPh = "5.5–6.5 (Acidic Aroid)",
                growthHabit = "Hemiepiphytic climbing aroid",
                nativeBiome = "Neotropical humid rainforest understory",
                baseIntervalDays = 8,
                dryBackPercent = "50–70% airy matrix dry",
                baseVolumeMl = 360,
                npkRatio = "3-1-2 Foliage Ratio + Cal-Mag",
                fertilizerDilution = "Weakly-weekly at 1/4–1/2 strength in spring/summer",
                waterQualityNote = "Low-mineral water (<120 ppm TDS) prevents leaf-tip burn",
                substrateMix = listOf(
                    SubstratePart("Chunky Pine / Orchid Bark", 35),
                    SubstratePart("Coarse Perlite / Pumice", 25),
                    SubstratePart("Coco Coir / Chips", 25),
                    SubstratePart("Worm Castings & Charcoal", 15)
                ),
                diagnosticTraits = "Spadix inflorescence with spathe bract; calcium oxalate raphides; mature blades often exhibit fenestrations and swollen petiole geniculum.",
                lookalikeNote = "Distinguish from Epipremnum pinnatum or Rhaphidophora tetrasperma by petiole geniculum morphology and blade thickness.",
                botanicalEtymology = "Family Araceae; adapted to dappled rainforest understory light flecks and vertical trunk climbing."
            )
        }
        if (isHerb) {
            return GeekProfileInfo(
                ppfdRange = "500–1,000+ μmol/m²/s",
                luxRange = "20,000–60,000 Lux (Full Sun)",
                humidityRange = "30–50% RH",
                vpdRange = "1.1–1.6 kPa",
                tempRange = "15–30°C (60–86°F)",
                usdaZones = "USDA Zones 5–9",
                soilPh = "6.5–7.5 (Neutral / Calcareous)",
                growthHabit = "Aromatic evergreen subshrub",
                nativeBiome = "Mediterranean rocky limestone slopes",
                baseIntervalDays = 11,
                dryBackPercent = "80–95% bone dry between soaks",
                baseVolumeMl = 280,
                npkRatio = "Low-Nitrogen 2-6-6 or Bone Meal",
                fertilizerDilution = "Light spring feeding only; excess nitrogen reduces essential oils",
                substrateMix = listOf(
                    SubstratePart("Coarse Horticultural Sand / Grit", 40),
                    SubstratePart("Pumice / Perlite / Limestone", 30),
                    SubstratePart("Light Garden Loam", 20),
                    SubstratePart("Aged Compost", 10)
                )
            )
        }
        if (isHibiscus) {
            return GeekProfileInfo(
                ppfdRange = "450–900+ μmol/m²/s",
                luxRange = "15,000–45,000 Lux",
                humidityRange = "50–75% RH",
                vpdRange = "0.9–1.3 kPa",
                tempRange = "18–32°C (65–90°F)",
                usdaZones = "USDA Zones 9–11",
                soilPh = "6.0–6.8 (Rich Slightly Acidic)",
                growthHabit = "Woody flowering shrub",
                nativeBiome = "Tropical & subtropical forest margins",
                baseIntervalDays = 4,
                dryBackPercent = "25–40% surface dry (keep evenly moist)",
                baseVolumeMl = 480,
                npkRatio = "High-K Bloom (10-4-12 / 9-3-13)",
                fertilizerDilution = "Half-strength weekly during active bud set"
            )
        }
        return GeekProfileInfo()
    }

    private fun loadGardenEntries(context: Context): List<PlantInfo> {
        return try {
            val prefs = context.getSharedPreferences("vxplants_garden", Context.MODE_PRIVATE)
            val raw = prefs.getString("history", "[]") ?: "[]"
            val arr = JSONArray(raw)
            val list = mutableListOf<PlantInfo>()
            for (i in 0 until arr.length()) {
                list.add(jsonToPlantInfo(arr.getJSONObject(i)))
            }
            list
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun saveGardenEntry(context: Context, info: PlantInfo) {
        try {
            val current = loadGardenEntries(context).toMutableList()
            current.removeAll { it.id == info.id }
            current.add(0, info)
            val capped = current.take(30)
            val arr = JSONArray()
            for (item in capped) arr.put(plantInfoToJson(item))
            context.getSharedPreferences("vxplants_garden", Context.MODE_PRIVATE)
                .edit()
                .putString("history", arr.toString())
                .apply()
        } catch (_: Exception) {
        }
    }

    private fun updateGardenEntry(context: Context, updated: PlantInfo) {
        try {
            val current = loadGardenEntries(context).map { if (it.id == updated.id) updated else it }
            val arr = JSONArray()
            for (item in current) arr.put(plantInfoToJson(item))
            context.getSharedPreferences("vxplants_garden", Context.MODE_PRIVATE)
                .edit()
                .putString("history", arr.toString())
                .apply()
        } catch (_: Exception) {
        }
    }

    private fun deleteGardenEntry(context: Context, id: String) {
        try {
            val current = loadGardenEntries(context).filterNot { it.id == id }
            val arr = JSONArray()
            for (item in current) arr.put(plantInfoToJson(item))
            context.getSharedPreferences("vxplants_garden", Context.MODE_PRIVATE)
                .edit()
                .putString("history", arr.toString())
                .apply()
        } catch (_: Exception) {
        }
    }
}
