# Plant Identifier (Android)

This is a starter scaffold for an Android app (Kotlin + Jetpack Compose) that calls the Plant.id API directly from the app to identify plants from images.

Quick steps:

1. Create a new Android Studio project (Empty Compose Activity) with Kotlin.
2. Add the dependency `okhttp` and Compose libs to `app/build.gradle` (see `app-build.gradle-snippet` file).
3. Add your Plant.id API key to `local.properties` in the project root:

```
PLANT_ID_API_KEY=your_plant_id_api_key_here
```

4. Add the `buildConfigField` shown in the gradle snippet so you can access `BuildConfig.PLANT_ID_API_KEY`.
5. Replace `MainActivity.kt` with the provided `app/src/main/java/com/example/plantidentifier/MainActivity.kt` file.
6. Run the app on an Android device or emulator with camera/storage access.

Notes and security:
- Storing API keys in `local.properties` and loading into `buildConfigField` keeps them out of VCS. Do not commit your key.
- Calling the API directly from the app exposes network traffic; consider a small proxy backend later to secure keys and handle rate limits.

Files added:
- `app/src/main/java/com/example/plantidentifier/MainActivity.kt`
- `app/app-build.gradle-snippet` (example Gradle config)
- `app/src/main/AndroidManifest.xml`

If you want, I can: scaffold a small Node/Express proxy to hide the key, or extend the app with saved identification history and detail pages.
