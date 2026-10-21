package com.example.plantidentifier

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Bundle
import android.util.Base64
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class PlantInfo(
    val plantName: String,
    val scientificName: String?,
    val confidence: Double,
    val commonNames: List<String>,
    val wikiDescription: String?,
    val similarImageUrls: List<String> = emptyList()
)

class MainActivity : ComponentActivity() {

    private val httpClient = OkHttpClient()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            val context = LocalContext.current
            var bitmap by remember { mutableStateOf<Bitmap?>(null) }
            var identifying by remember { mutableStateOf(false) }
            var lastResult by remember { mutableStateOf<PlantInfo?>(null) }
            var currentImageBase64 by remember { mutableStateOf<String?>(null) }
            var screen by remember { mutableStateOf("home") } // "home" | "history"

            val pickImage = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
                uri?.let {
                    context.contentResolver.openInputStream(it)?.use { stream ->
                        val decoded = BitmapFactory.decodeStream(stream)
                        bitmap = decoded?.let { bmp -> scaleBitmapDown(bmp, 1280) }
                    }
                }
            }

            val takePicture = registerForActivityResult(ActivityResultContracts.TakePicturePreview()) { bmp ->
                bmp?.let { bitmap = scaleBitmapDown(it, 1280) }
            }

            MaterialTheme {
                Scaffold(
                    topBar = {
                        TopAppBar(
                            title = { Text("Plant Identifier") },
                            actions = {
                                TextButton(
                                    onClick = {
                                        screen = if (screen == "home") "history" else "home"
                                    }
                                ) {
                                    Text(
                                        text = if (screen == "home") "History" else "Home",
                                        color = MaterialTheme.colors.onPrimary
                                    )
                                }
                            }
                        )
                    }
                ) { padding ->
                    Column(
                        modifier = Modifier
                            .padding(padding)
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Top
                    ) {
                        if (screen == "home") {
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Button(onClick = { pickImage.launch("image/*") }) { Text("Pick image") }
                                Button(onClick = { takePicture.launch(null) }) { Text("Take photo") }
                            }

                            Spacer(modifier = Modifier.height(16.dp))

                            bitmap?.let { bmp ->
                                Card(elevation = 6.dp, modifier = Modifier.fillMaxWidth()) {
                                    Image(
                                        bitmap = bmp.asImageBitmap(),
                                        contentDescription = "Selected plant photo",
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(260.dp)
                                    )
                                }

                                Spacer(modifier = Modifier.height(12.dp))

                                Button(
                                    enabled = !identifying,
                                    onClick = {
                                        identifying = true
                                        // Re-encoding via Bitmap.compress strips all original file EXIF/GPS metadata
                                        val b64 = bitmapToBase64(bmp, quality = 85)
                                        currentImageBase64 = b64
                                        identifyPlantViaProxy(
                                            base64Image = b64,
                                            onSuccess = { info ->
                                                lastResult = info
                                                identifying = false
                                            },
                                            onError = { err ->
                                                Toast.makeText(context, "Error: $err", Toast.LENGTH_LONG).show()
                                                identifying = false
                                            }
                                        )
                                    }
                                ) {
                                    Text(if (identifying) "Identifying..." else "Identify")
                                }
                            }

                            Spacer(modifier = Modifier.height(16.dp))

                            lastResult?.let { info ->
                                Card(modifier = Modifier.fillMaxWidth(), elevation = 4.dp) {
                                    Column(modifier = Modifier.padding(16.dp)) {
                                        Text(text = info.plantName, style = MaterialTheme.typography.h6)
                                        info.scientificName?.let {
                                            Text(text = it, style = MaterialTheme.typography.subtitle2)
                                        }
                                        Spacer(modifier = Modifier.height(8.dp))
                                        Text(text = "Confidence: ${"%.1f".format(info.confidence * 100)}%")
                                        if (info.commonNames.isNotEmpty()) {
                                            Spacer(modifier = Modifier.height(8.dp))
                                            Text(text = "Common names: ${info.commonNames.joinToString(", ")}")
                                        }
                                        Spacer(modifier = Modifier.height(12.dp))
                                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Button(onClick = {
                                                bitmap?.let { bmp ->
                                                    // Store a small thumbnail in local preferences to prevent storage bloat
                                                    val thumbBmp = scaleBitmapDown(bmp, 240)
                                                    val thumbB64 = bitmapToBase64(thumbBmp, quality = 70)
                                                    saveHistoryEntry(this@MainActivity, info, thumbB64)
                                                    Toast.makeText(context, "Saved to history", Toast.LENGTH_SHORT).show()
                                                }
                                            }) { Text("Save") }
                                        }
                                    }
                                }

                                Spacer(modifier = Modifier.height(12.dp))

                                info.wikiDescription?.let { desc ->
                                    Card(modifier = Modifier.fillMaxWidth(), elevation = 2.dp) {
                                        Column(modifier = Modifier.padding(12.dp)) {
                                            Text(text = "Description", style = MaterialTheme.typography.subtitle1)
                                            Divider(modifier = Modifier.padding(vertical = 8.dp))
                                            Text(text = desc)
                                        }
                                    }
                                }

                                if (info.similarImageUrls.isNotEmpty()) {
                                    Spacer(modifier = Modifier.height(12.dp))
                                    Text(text = "Similar images", style = MaterialTheme.typography.subtitle1)
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        for (url in info.similarImageUrls.take(4)) {
                                            AsyncImageCard(url)
                                        }
                                    }
                                }
                            }
                        } else if (screen == "history") {
                            HistoryScreen(onOpen = { entryJson ->
                                try {
                                    val obj = JSONObject(entryJson)
                                    val name = obj.optString("plantName", "Unknown")
                                    val sci = obj.optString("scientificName").takeIf { it.isNotEmpty() }
                                    val conf = obj.optDouble("confidence", 0.0)
                                    val commonsArr = obj.optJSONArray("commonNames") ?: JSONArray()
                                    val commons = mutableListOf<String>()
                                    for (i in 0 until commonsArr.length()) {
                                        commons.add(commonsArr.optString(i))
                                    }
                                    val wiki = obj.optString("wikiDescription").takeIf { it.isNotEmpty() }
                                    lastResult = PlantInfo(name, sci, conf, commons, wiki)
                                    screen = "home"
                                } catch (_: Exception) {
                                }
                            })
                        }
                    }
                }
            }
        }
    }

    /**
     * Calls the backend proxy instead of embedding the third-party Pl@ntNet secret key in the APK.
     */
    private fun identifyPlantViaProxy(
        base64Image: String,
        onSuccess: (PlantInfo) -> Unit,
        onError: (String) -> Unit
    ) {
        val baseUrl = BuildConfig.API_BASE_URL.trimEnd('/')
        if (baseUrl.isEmpty()) {
            onError("API_BASE_URL is not configured in local.properties.")
            return
        }

        val json = JSONObject().apply {
            put("image", base64Image)
        }

        val mediaType = "application/json; charset=utf-8".toMediaType()
        val body = json.toString().toRequestBody(mediaType)
        val request = Request.Builder()
            .url("$baseUrl/identify")
            .post(body)
            .build()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                runOnUiThread { onError("Network error contacting identification server.") }
            }

            override fun onResponse(call: Call, response: Response) {
                response.use { resp ->
                    if (!resp.isSuccessful) {
                        runOnUiThread { onError("Server error (HTTP ${resp.code})") }
                        return
                    }
                    val text = resp.body?.string() ?: ""
                    try {
                        val root = JSONObject(text)
                        val plantName = root.optString("plantName", "").ifEmpty {
                            root.optString("plant_name", "Unknown")
                        }
                        if (plantName.isEmpty()) {
                            runOnUiThread { onError("No plant match found.") }
                            return
                        }
                        val scientific = root.optString("scientificName", "").ifEmpty { null }
                        val confidence = root.optDouble("confidence", 0.0)

                        val commonNamesArr = root.optJSONArray("commonNames") ?: JSONArray()
                        val commonNames = mutableListOf<String>()
                        for (i in 0 until commonNamesArr.length()) {
                            commonNames.add(commonNamesArr.optString(i))
                        }

                        val wikiDesc = root.optString("wikiDescription", "").ifEmpty { null }

                        val similarUrls = mutableListOf<String>()
                        val simArr = root.optJSONArray("similarImageUrls") ?: JSONArray()
                        for (i in 0 until simArr.length()) {
                            val url = simArr.optString(i, "")
                            if (url.startsWith("https://")) similarUrls.add(url)
                        }

                        val info = PlantInfo(
                            plantName = plantName,
                            scientificName = scientific,
                            confidence = confidence,
                            commonNames = commonNames,
                            wikiDescription = wikiDesc,
                            similarImageUrls = similarUrls
                        )
                        runOnUiThread { onSuccess(info) }
                    } catch (e: Exception) {
                        runOnUiThread { onError("Failed to parse identification response.") }
                    }
                }
            }
        })
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

    private fun bitmapToBase64(bitmap: Bitmap, quality: Int = 85): String {
        val baos = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, baos)
        val bytes = baos.toByteArray()
        return Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    private fun saveHistoryEntry(context: Context, info: PlantInfo, thumbnailBase64: String) {
        try {
            val prefs = context.getSharedPreferences("plant_prefs", Context.MODE_PRIVATE)
            val existing = prefs.getString("history", null)
            val oldArr = if (existing == null) JSONArray() else JSONArray(existing)

            val newObj = JSONObject().apply {
                put("plantName", info.plantName)
                put("scientificName", info.scientificName)
                put("confidence", info.confidence)
                val commons = JSONArray()
                for (c in info.commonNames) commons.put(c)
                put("commonNames", commons)
                put("wikiDescription", info.wikiDescription)
                put("imageBase64", thumbnailBase64)
                val ts = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).format(Date())
                put("timestamp", ts)
            }

            // Cap history to latest 25 items to prevent SharedPreferences bloat
            val cappedArr = JSONArray()
            cappedArr.put(newObj)
            for (i in 0 until minOf(oldArr.length(), 24)) {
                cappedArr.put(oldArr.getJSONObject(i))
            }
            prefs.edit().putString("history", cappedArr.toString()).apply()
        } catch (_: Exception) {
        }
    }

    @Composable
    fun AsyncImageCard(url: String) {
        var bmp by remember(url) { mutableStateOf<Bitmap?>(null) }
        LaunchedEffect(url) {
            if (!url.startsWith("https://")) return@LaunchedEffect
            withContext(Dispatchers.IO) {
                try {
                    val req = Request.Builder().url(url).build()
                    httpClient.newCall(req).execute().use { resp ->
                        val bytes = resp.body?.bytes()
                        if (bytes != null) {
                            bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        }
                    }
                } catch (_: Exception) {
                }
            }
        }
        Card(modifier = Modifier.size(100.dp), elevation = 4.dp) {
            bmp?.let {
                Image(
                    bitmap = it.asImageBitmap(),
                    contentDescription = "Similar plant image",
                    modifier = Modifier.fillMaxSize()
                )
            }
        }
    }

    @Composable
    fun HistoryScreen(onOpen: (String) -> Unit) {
        val prefs = remember { getSharedPreferences("plant_prefs", Context.MODE_PRIVATE) }
        val raw = remember { prefs.getString("history", "[]") ?: "[]" }
        val arr = remember(raw) { JSONArray(raw) }
        Column(modifier = Modifier.fillMaxSize().padding(12.dp)) {
            Text(text = "Saved History", style = MaterialTheme.typography.h6)
            Spacer(modifier = Modifier.height(8.dp))
            if (arr.length() == 0) {
                Text(text = "No saved plants yet.", style = MaterialTheme.typography.body2)
            }
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val name = obj.optString("plantName", "Unknown")
                val ts = obj.optString("timestamp", "")
                val b64 = obj.optString("imageBase64", "")
                val thumbBitmap = remember(b64) {
                    if (b64.isNotEmpty()) {
                        try {
                            val bytes = Base64.decode(b64, Base64.DEFAULT)
                            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        } catch (_: Exception) {
                            null
                        }
                    } else null
                }

                Row(modifier = Modifier.fillMaxWidth().padding(8.dp)) {
                    thumbBitmap?.let {
                        Image(
                            bitmap = it.asImageBitmap(),
                            contentDescription = name,
                            modifier = Modifier.size(64.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                    }
                    Column {
                        Text(text = name)
                        Text(text = ts, style = MaterialTheme.typography.caption)
                        Spacer(modifier = Modifier.height(4.dp))
                        Button(onClick = { onOpen(obj.toString()) }) { Text("Open") }
                    }
                }
                Divider()
            }
        }
    }
}
