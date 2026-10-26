# Cyber Groove VR — WebXR Hand-Tracking Dance Game

[![WebXR](https://img.shields.io/badge/WebXR-Immersive--VR-00f3ff.svg)](https://immersiveweb.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-r186-black.svg)](https://threejs.org/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Pose%20AI-10b981.svg)](https://developers.google.com/mediapipe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A WebXR "Just Dance" style rhythm game and AI video choreography engine engineered specifically for VR browsers (Meta Quest 2, 3, 3S, and Pro).

Drop any dance video onto your PC, let MediaPipe AI extract the dancer's routine, and stream the video directly to your Quest headset over Wi-Fi with **0 MB storage used on your headset**!

---

## 🚀 Key Features

### 📁 1. PC Video Library & Direct VR Streaming (0 MB Headset Storage!)
- **Zero Headset Storage**: Keep your entire dance video library on your PC hard drive. Videos stream over local Wi-Fi or secure Cloudflare tunnels directly into the Meta Quest Browser with full HTTP 206 range buffering.
- **Dedicated `videos/` Folder**: Simply drop any `.mp4`, `.webm`, or `.mov` dance video into the `videos/` folder on your PC.
- **Auto-Discovery**: The game automatically discovers all videos on your PC and adds them to the in-game playlist.

### 🤖 2. MediaPipe AI Vision Pipeline (Auto-Choreography)
- **One-Click Routine Generator**: Runs MediaPipe Pose on your dance video to detect real dancer joints and rhythm keyframes.
- **Auto-Caching on PC**: Scanned dance routines are saved automatically to your PC as `<video-name>.json`. Next time you play, it loads in milliseconds without re-scanning.

### 🥽 3. WebXR Hands-Only Tracking & Controller Haptics
- **Bare-Hand Tracking**: Uses WebXR `XRHand` joints to track player hands in real 3D space with glowing cyan and magenta avatars.
- **Tactile Controller Haptics**: Full fallback for 6DoF Touch controllers with rhythm-synchronized haptic vibration pulses (`PERFECT`, `GREAT`, `GOOD`, `MISS`).
- **Steady 90/120 FPS**: Zero-allocation particle burst pooling ensures silky-smooth framerates even on 5-minute continuous tracks.

### 📡 4. Behind-the-User In-VR Diagnostic Console
- **No Disruptive Pop-up Alerts**: Intrusive browser alerts are completely eliminated.
- **3D Floating Console**: Placed directly behind the player in virtual space (`z = +2.2m`). When in VR, you can simply glance behind you to view system status, AI scan progress, or error diagnostics without breaking immersion.

### 🎮 5. Frame-by-Frame Player Evaluation & Scoring
- Real-time Euclidean distance evaluation against choreography keyframes:
  - **PERFECT**: Distance $\le 14\text{ cm}$ $\rightarrow$ $+100 \times \text{Multiplier}$
  - **GREAT**: Distance $\le 24\text{ cm}$ $\rightarrow$ $+75 \times \text{Multiplier}$
  - **GOOD**: Distance $\le 35\text{ cm}$ $\rightarrow$ $+45 \times \text{Multiplier}$
- Synthesized Web Audio sound effects, multiplier surges, and combo milestones.

---

## 🏃 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- A Meta Quest headset (Quest 2, 3, 3S, Pro) or any desktop browser for preview mode.

### 1. Install Dependencies
```bash
git clone https://github.com/<your-username>/cyber-groove-vr.git
cd cyber-groove-vr
npm install
```

### 2. Stream to Meta Quest Headset (Recommended)
To launch with a trusted HTTPS SSL certificate that connects instantly to Quest Browser without certificate warnings:
```bash
npm run remote
```
1. Run `npm run remote` in your PC terminal.
2. Note the printed Cloudflare URL (e.g. `https://xxxx.trycloudflare.com`).
3. Open the **Meta Quest Browser** in your headset and enter that URL.
4. Tap **🥽 ENTER VR (QUEST)** to start dancing!

*(Alternatively, run `npm run dev` for local network access via `https://<your-pc-ip>:5173`)*.

---

## 📂 Adding Your Own Dance Videos

1. Copy any dance video (`.mp4`, `.webm`, `.mov`) into the **`videos/`** folder:
   ```
   cyber-groove-vr/
   ├── videos/
   │   ├── my_favorite_dance.mp4
   │   └── electro_shuffle.mp4
   ```
2. Open Cyber Groove VR on your PC or Quest.
3. Select your video from the **📁 PC Video Library** dropdown.
4. Click **`🤖 AUTO-GENERATE VR ROUTINE WITH MEDIAPIPE AI`**.
5. The extracted choreography is saved to `videos/<name>.json` on your PC.
6. Put on your Quest and enjoy dancing!

---

## 🖥️ Desktop Preview Mode (No Headset Required)

You can develop, test, and preview all features directly in your desktop browser:
- Open `https://localhost:5173` in Chrome / Edge / Brave.
- Click **▶ PLAY ROUTINE (BROWSER / VR)**.
- **Controls**:
  - **Move Mouse**: Controls Right Hand ($X/Y$ world coordinates)
  - **Hold `Shift` + Move Mouse**: Controls Left Hand
  - **Press `B`**: Toggle **Auto-Bot Dancer** (mirrors choreography to test scoring & effects automatically)
  - **Press `Space`**: Pause / Resume
  - **Press `R`**: Restart song
  - **Press `Esc`**: Open Start Menu

---

## 📁 Project Architecture

```
cyber-groove-vr/
├── videos/                  # Local PC video library (streams to VR)
├── public/
│   └── tracks/              # Built-in sample choreography JSON files
├── src/
│   ├── audio/
│   │   └── synthesizer.js   # Web Audio procedural SFX & synth
│   ├── choreo/
│   │   ├── loader.js        # Cosine pose interpolation & timeline lookahead
│   │   └── schema.js        # Formal choreography keyframe schema
│   ├── gameplay/
│   │   ├── scoringEngine.js # Frame-by-frame Euclidean rating & combo multipliers
│   │   ├── snapshotEngine.js# Snapshot hit checkpoint & polaroid cards
│   │   └── targetManager.js # Zero-allocation particle burst pool & hit cues
│   ├── tracking/
│   │   ├── handTracker.js   # WebXR Hand joints & Quest controller haptics
│   │   └── videoPoseScanner.js # MediaPipe AI video pose extraction
│   ├── ui/
│   │   ├── hud3D.js         # 3D holographic in-VR curved display
│   │   ├── menuUI.js        # Video-first hub, dropzone & 2D cyber toast
│   │   ├── vrGameOverPanel.js # 3D in-VR victory & retry touch panel
│   │   └── vrNotificationConsole.js # 3D console placed behind user in VR
│   ├── video/
│   │   └── videoManager.js  # 3D video screen, canvas mannequin & sync
│   └── main.js              # Core game loop & WebXR session manager
├── scripts/
│   └── remote.js            # Cloudflare tunnel launcher for Quest access
├── index.html               # Main HTML entry
├── style.css                # Futuristic Cyberpunk styles & toast animations
└── vite.config.js           # Vite dev server + PC Video Library streaming API
```

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
