# Plant Identifier (Web + Android + Pl@ntNet Secure Proxy)

A privacy-first Plant Identifier web application and Android (Kotlin + Jetpack Compose) client backed by a hardened Node.js/Express proxy server for the **Pl@ntNet API (`my.plantnet.org`)**.

## Security & Privacy Architecture

- **Zero Client-Side API Keys**: Both the Web frontend and Android app communicate exclusively with the backend proxy (`POST /identify`). Your `PLANTNET_API_KEY` stays strictly in server-side environment variables (`.env`) and is never bundled into browser code or Android APKs.
- **Automatic Client-Side EXIF & GPS Stripping**: Before any photo leaves the browser or Android device, it is re-encoded to strip all embedded camera EXIF metadata (including GPS coordinates, timestamps, and device serial numbers).
- **SSRF-Protected Image Proxy**: Reference images from `bs.plantnet.org` and Wikimedia are served via `/image-proxy` with HTTPS enforcement, DNS/private-IP blocking, MIME verification, and a strict domain allowlist.

## Quick Start (Web & Proxy Server)

1. Get a free API key from [my.plantnet.org](https://my.plantnet.org/).
2. Copy `.env.example` to `.env` and set `PLANTNET_API_KEY`:
   ```bash
   cp .env.example .env
   ```
3. Install dependencies and start the server:
   ```bash
   npm install
   npm run dev
   ```
4. Open `http://localhost:3000` in your browser.

## Android App Setup

1. Copy `local.properties.template` to `local.properties` (never commit `local.properties` to git).
2. Set `API_BASE_URL` in `local.properties` to point to your running proxy server (`http://10.0.2.2:3000` for Android Emulator).
3. Open the project in Android Studio and run on a device or emulator.
