import * as THREE from 'three';
import { AudioSynthesizer } from './audio/synthesizer.js';
import { VideoManager } from './video/videoManager.js';
import { ChoreographyLoader } from './choreo/loader.js';
import { HandTracker } from './tracking/handTracker.js';
import { TargetManager } from './gameplay/targetManager.js';
import { ScoringEngine } from './gameplay/scoringEngine.js';
import { HUD3D } from './ui/hud3D.js';
import { MenuUI } from './ui/menuUI.js';
import { SnapshotEngine } from './gameplay/snapshotEngine.js';
import { SnapshotStudio } from './ui/snapshotStudio.js';
import { VideoPoseScanner } from './tracking/videoPoseScanner.js';
import { VRGameOverPanel } from './ui/vrGameOverPanel.js';
import { VRNotificationConsole } from './ui/vrNotificationConsole.js';

class JustDanceVRGame {
  constructor() {
    this.canvasContainer = document.getElementById('canvas-container');
    this.clock = new THREE.Clock();

    // Core Components
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    // Game Modules
    this.audioSynth = new AudioSynthesizer();
    this.videoManager = null;
    this.choreoLoader = new ChoreographyLoader();
    this.handTracker = null;
    this.targetManager = null;
    this.scoringEngine = null;
    this.snapshotEngine = null;
    this.poseScanner = new VideoPoseScanner();
    this.hud3D = null;
    this.menuUI = null;

    // State
    this.isPlaying = false;
    this.currentTrackId = 'track1';
    this.currentVideoFilename = null;
    this.trackDuration = 48.0;
    this.spotlights = [];

    this.initThree();
    this.createEnvironment();
    this.initModules();
    this.setupUI();
    this.loadDefaultTrack();

    // Start render loop
    this.renderer.setAnimationLoop((time, frame) => this.render(time, frame));
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060814);
    this.scene.fog = new THREE.FogExp2(0x060814, 0.08);

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      50
    );
    this.camera.position.set(0, 1.6, 0); // Standard eye level

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.xr.enabled = true;

    this.canvasContainer.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  createEnvironment() {
    // 1. Ambient & Hemisphere Light
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 0.6);
    this.scene.add(hemiLight);

    // 2. Stage Dance Floor (Reflective Cyber Grid)
    const floorGeo = new THREE.PlaneGeometry(16, 16, 32, 32);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x070b19,
      roughness: 0.15,
      metalness: 0.8
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    this.scene.add(floor);

    // Glowing Grid Overlay on the floor
    const grid = new THREE.GridHelper(16, 32, 0x00f3ff, 0x1e293b);
    grid.position.y = 0.005;
    this.scene.add(grid);

    // 3. Stage Platform Ring
    const stageRingGeo = new THREE.RingGeometry(1.2, 1.25, 48);
    const stageRingMat = new THREE.MeshBasicMaterial({
      color: 0x00f3ff,
      side: THREE.DoubleSide
    });
    const stageRing = new THREE.Mesh(stageRingGeo, stageRingMat);
    stageRing.rotation.x = -Math.PI / 2;
    stageRing.position.set(0, 0.01, 0);
    this.scene.add(stageRing);

    // 4. Moving Stage Spotlights
    const colors = [0x00f3ff, 0xff007f, 0xa855f7, 0x3b82f6];
    colors.forEach((col, idx) => {
      const spot = new THREE.SpotLight(col, 4, 12, Math.PI / 6, 0.4, 1);
      const angle = (idx / colors.length) * Math.PI * 2;
      spot.position.set(Math.cos(angle) * 3.5, 4.2, Math.sin(angle) * 3.5 - 1.0);
      spot.target.position.set(0, 0.5, -1.0);
      this.scene.add(spot);
      this.scene.add(spot.target);
      this.spotlights.push(spot);
    });

    // 5. Floating Dust / Cyber Particles
    const particleCount = 200;
    const pGeo = new THREE.BufferGeometry();
    const posArr = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      posArr[i] = (Math.random() - 0.5) * 10;
      posArr[i + 1] = Math.random() * 4;
      posArr[i + 2] = (Math.random() - 0.5) * 10;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.025,
      transparent: true,
      opacity: 0.6
    });
    this.particles = new THREE.Points(pGeo, pMat);
    this.scene.add(this.particles);
  }

  initModules() {
    this.videoManager = new VideoManager(this.scene, this.audioSynth);
    this.handTracker = new HandTracker(this.renderer, this.scene);
    this.targetManager = new TargetManager(this.scene);
    this.scoringEngine = new ScoringEngine(
      this.scene,
      this.audioSynth,
      this.targetManager,
      this.handTracker
    );
    this.snapshotEngine = new SnapshotEngine(
      this.scene,
      this.videoManager,
      this.audioSynth,
      this.handTracker,
      this.scoringEngine
    );
    this.hud3D = new HUD3D(this.scene);
    this.vrConsole = new VRNotificationConsole(this.scene);
    this.vrGameOverPanel = new VRGameOverPanel(
      this.scene,
      () => this.restartSong(),
      () => {
        this.pauseSong();
        this.menuUI.show();
      }
    );

    // Connect scoring events to 3D HUD & 2D DOM HUD
    this.scoringEngine.onScoreUpdate = (stats) => {
      this.hud3D.updateStats(stats);
      this.updateDesktopHUD(stats);
    };
  }

  showNotification(title, message, type = 'info', duration = 4000) {
    if (this.menuUI) {
      this.menuUI.showNotification(title, message, type, duration);
    }
    if (this.vrConsole) {
      this.vrConsole.show(title, message, type);
    }
  }

  setupUI() {
    this.menuUI = new MenuUI({
      onStartSong: () => this.startSong(),
      onEnterVR: () => this.enterVR(),
      onSelectTrack: (trackKey) => this.switchTrack(trackKey),
      onCustomChoreo: (data) => this.loadCustomChoreo(data),
      onNotification: (title, msg, type) => {
        if (this.vrConsole) this.vrConsole.show(title, msg, type);
      },
      onCustomVideo: async (fileOrUrl) => {
        const dur = await this.videoManager.loadVideo(fileOrUrl);
        if (dur && Number.isFinite(dur)) {
          this.trackDuration = dur;
          this.showNotification('Video Loaded', `Full track duration set to ${dur.toFixed(1)}s`, 'success');
        }
      },
      onCalibrateHeight: (offset) => this.choreoLoader.setHeightOffset(offset),
      onScanVideoAI: (onProgress) => this.scanVideoWithAI(onProgress),
      onToggleBot: () => {
        this.handTracker.autoBotMode = !this.handTracker.autoBotMode;
        return this.handTracker.autoBotMode;
      }
    });

    this.snapshotStudio = new SnapshotStudio(
      this.videoManager,
      this.choreoLoader,
      this.snapshotEngine,
      () => this.startSong()
    );

    // Keyboard controls for easy testing: Space to pause/resume, R to restart, Escape for menu
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        if (this.isPlaying) this.pauseSong();
        else this.startSong();
      } else if (e.code === 'KeyR') {
        this.restartSong();
      } else if (e.code === 'Escape') {
        this.pauseSong();
        this.menuUI.show();
      }
    });
  }

  async scanVideoWithAI(onProgress) {
    if (!this.videoManager || !this.videoManager.videoElement) {
      this.showNotification('Missing Video', 'Please drop an MP4 video or paste a video URL first!', 'warning');
      return null;
    }

    const videoEl = this.videoManager.videoElement;
    const bpm = this.choreoLoader.currentTrack?.bpm || 128;

    try {
      const keyframes = await this.poseScanner.scanVideo(videoEl, {
        bpm,
        mirror: true,
        onProgress
      });

      if (keyframes && keyframes.length > 0) {
        const fullDur = (videoEl.duration && Number.isFinite(videoEl.duration) && videoEl.duration > 2) ? videoEl.duration : 180.0;
        this.trackDuration = fullDur;
        console.log(`AI Scan complete! Routine duration set to full ${fullDur.toFixed(1)}s`);

        const scannedTrack = {
          id: `ai_track_${Date.now()}`,
          title: this.videoManager.currentTrackInfo?.title || 'AI Scanned Choreography',
          artist: 'MediaPipe AI Vision',
          bpm,
          duration: fullDur,
          difficulty: 'Medium',
          videoSrc: 'custom',
          keyframes
        };

        this.choreoLoader.loadFromJson(scannedTrack);
        this.snapshotEngine.setCheckpointsFromKeyframes(keyframes);
        this.restartSong();

        // Automatically cache choreography to PC videos/ folder if streaming from PC
        if (this.currentVideoFilename) {
          try {
            await fetch('/api/save-choreo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filename: this.currentVideoFilename,
                choreoData: scannedTrack
              })
            });
            this.showNotification(
              'Choreography Cached on PC',
              `Saved ${keyframes.length} dance moves to videos/ on PC. Future plays are instant!`,
              'success',
              5000
            );
            if (this.menuUI) {
              this.menuUI.loadPCVideoLibrary();
            }
          } catch (saveErr) {
            console.warn('Failed to auto-save choreo to PC:', saveErr);
          }
        }

        return keyframes;
      }
    } catch (err) {
      console.error('Error scanning video with AI:', err);
      throw err;
    }
  }

  async loadDefaultTrack() {
    try {
      const trackData = await this.choreoLoader.loadFromUrl('/tracks/track1.json');
      this.trackDuration = trackData.duration || 48.0;
      this.audioSynth.setBpm(trackData.bpm || 128);
      this.videoManager.setTrackInfo(trackData);
      this.snapshotEngine.setCheckpointsFromKeyframes(trackData.keyframes);
      console.log('Default track ready:', trackData.title);
    } catch (e) {
      console.error('Failed to load default track:', e);
    }
  }

  async switchTrack(key) {
    if (key.startsWith('pc:')) {
      const filename = key.slice(3);
      this.currentVideoFilename = filename;
      const pcItem = this.menuUI?.pcVideos?.find((v) => v.filename === filename);

      const videoUrl = `/videos/${encodeURIComponent(filename)}`;
      const dur = await this.videoManager.loadVideo(videoUrl);
      if (dur && Number.isFinite(dur)) {
        this.trackDuration = dur;
      }

      if (pcItem && pcItem.hasChoreo && pcItem.choreoUrl) {
        try {
          const choreoRes = await fetch(pcItem.choreoUrl);
          const choreoData = await choreoRes.json();
          this.choreoLoader.loadFromJson(choreoData);
          this.snapshotEngine.setCheckpointsFromKeyframes(choreoData.keyframes || []);
          this.showNotification('PC Routine Ready', `Loaded "${pcItem.title}" with pre-scanned AI routine!`, 'success');
          this.restartSong();
          return;
        } catch (e) {
          console.warn('Failed to load pre-scanned choreo:', e);
        }
      }

      // If no pre-scanned choreo yet
      this.showNotification(
        'PC Video Streaming',
        `Streaming "${pcItem?.title || filename}". Click Auto-Generate to create routine!`,
        'info'
      );
      return;
    }

    this.currentVideoFilename = null;
    const url = key === 'track2' ? '/tracks/track2.json' : '/tracks/track1.json';
    try {
      const trackData = await this.choreoLoader.loadFromUrl(url);
      this.trackDuration = trackData.duration || 48.0;
      this.audioSynth.setBpm(trackData.bpm || 128);
      this.videoManager.setTrackInfo(trackData);
      this.snapshotEngine.setCheckpointsFromKeyframes(trackData.keyframes);
      this.restartSong();
    } catch (e) {
      console.error('Error switching track:', e);
    }
  }

  loadCustomChoreo(jsonData) {
    try {
      const trackData = this.choreoLoader.loadFromJson(jsonData);
      this.trackDuration = trackData.duration || 48.0;
      this.audioSynth.setBpm(trackData.bpm || 128);
      this.videoManager.setTrackInfo(trackData);
      this.snapshotEngine.setCheckpointsFromKeyframes(trackData.keyframes);
      this.showNotification('Track Loaded', `"${trackData.title}" (${trackData.keyframes.length} moves) ready!`, 'success');
      this.restartSong();
    } catch (e) {
      this.showNotification('Choreography Error', 'Failed to load choreo: ' + e.message, 'error');
    }
  }

  async enterVR() {
    // Diagnostic 1: Check Secure Context
    if (!window.isSecureContext) {
      this.showNotification(
        'Insecure SSL Context',
        "Meta Quest blocks WebXR on insecure HTTP. Run 'npm run remote' on your PC for trusted HTTPS.",
        'warning',
        7000
      );
      return;
    }

    // Diagnostic 2: Check WebXR availability
    if (!('xr' in navigator)) {
      this.showNotification(
        'WebXR Unsupported',
        'WebXR is not exposed in this browser. Please open this URL inside the Meta Quest Browser on your headset.',
        'warning',
        7000
      );
      return;
    }

    try {
      console.log('Requesting WebXR immersive-vr session...');
      let session = null;

      // Tier 1: Hand Tracking + Local Floor
      try {
        session = await navigator.xr.requestSession('immersive-vr', {
          optionalFeatures: ['hand-tracking', 'local-floor', 'bounded-floor']
        });
        console.log('Connected with Hand-Tracking + Local-Floor!');
      } catch (tier1Err) {
        console.warn('Tier 1 session request failed, retrying with standard VR...', tier1Err);
        // Tier 2: Standard VR controllers + Local Floor
        try {
          session = await navigator.xr.requestSession('immersive-vr', {
            optionalFeatures: ['local-floor']
          });
          console.log('Connected with Local-Floor fallback!');
        } catch (tier2Err) {
          console.warn('Tier 2 failed, retrying basic immersive-vr...', tier2Err);
          // Tier 3: Basic immersive VR
          session = await navigator.xr.requestSession('immersive-vr');
          console.log('Connected with basic VR!');
        }
      }

      if (!session) {
        throw new Error('Failed to create an XR session.');
      }

      // Configure reference space safely
      try {
        await this.renderer.xr.setReferenceSpaceType('local-floor');
      } catch (refErr) {
        console.warn('local-floor unavailable, falling back to local:', refErr);
        try {
          await this.renderer.xr.setReferenceSpaceType('local');
        } catch (e) {
          console.warn('local unavailable, falling back to viewer');
          try {
            await this.renderer.xr.setReferenceSpaceType('viewer');
          } catch (ev) {}
        }
      }

      await this.renderer.xr.setSession(session);

      session.addEventListener('end', () => {
        console.log('WebXR Session Ended');
        this.pauseSong();
        this.menuUI.show();
      });

      // Automatically start audio and video once safely inside VR
      try {
        await this.startSong();
      } catch (songErr) {
        console.warn('Audio/video startup error inside VR:', songErr);
      }
    } catch (err) {
      console.error('Failed to enter VR session:', err);
      this.showNotification(
        'VR Session Error',
        `Could not start VR: ${err.message}. Accessing via 'npm run remote' provides trusted SSL on Quest.`,
        'error',
        8000
      );
    }
  }

  async startSong() {
    try {
      await this.audioSynth.init();
      this.isPlaying = true;
      this.audioSynth.play();
      await this.videoManager.play();
      this.menuUI.hide();
    } catch (e) {
      console.warn('Playback start error:', e);
    }
  }

  pauseSong() {
    this.isPlaying = false;
    this.audioSynth.pause();
    this.videoManager.pause();
  }

  restartSong() {
    if (this.vrGameOverPanel) this.vrGameOverPanel.hide();
    this.audioSynth.stop();
    this.choreoLoader.resetKeyframes();
    this.scoringEngine.reset();
    this.snapshotEngine.reset();
    this.hud3D.reset();
    this.targetManager.reset();
    this.videoManager.setCurrentTime(0);

    if (this.isPlaying) {
      this.startSong();
    }
  }

  updateDesktopHUD(stats) {
    const scoreElem = document.getElementById('hud-score');
    const comboElem = document.getElementById('hud-combo');
    const accElem = document.getElementById('hud-accuracy');
    if (scoreElem) scoreElem.textContent = stats.score.toLocaleString();
    if (comboElem) comboElem.textContent = `${stats.combo} (${stats.multiplier}X)`;
    if (accElem) accElem.textContent = `${stats.accuracy}%`;
  }

  /**
   * Main WebXR / Game Loop
   */
  render(timestamp, frame) {
    const delta = this.clock.getDelta();
    const currentTime = this.videoManager.getCurrentTime();
    const bpm = this.choreoLoader.currentTrack?.bpm || 128;

    // 1. Interpolate Smooth Choreography Poses
    const interpolatedPose = this.choreoLoader.interpolatePose(currentTime);
    this.videoManager.setChoreographyPose(interpolatedPose);

    // 2. Hand Tracking Update (VR hands or Desktop mouse/auto-bot)
    this.handTracker.update(delta, interpolatedPose);

    if (this.isPlaying) {
      // 3. Upcoming Keyframes & 3D Targets Update
      const upcomingKeyframes = this.choreoLoader.getUpcomingKeyframes(currentTime, 2.0);
      this.targetManager.update(currentTime, upcomingKeyframes, interpolatedPose);

      // 4. Scoring Engine Update (Frame-by-frame distance evaluation)
      this.scoringEngine.update(currentTime, this.choreoLoader);

      // 5. Snapshot Engine Update (Just Dance style snapshot checkpoints, camera flash & photo stamps)
      this.snapshotEngine.update(currentTime, delta);

      // 6. Update 3D HUD Progress
      const progress = this.trackDuration > 0 ? (currentTime / this.trackDuration) : 0;
      this.hud3D.setProgress(progress, interpolatedPose?.nextMove);

      // 7. Check for Song Finish (Full video duration reached)
      if (currentTime >= this.trackDuration && this.trackDuration > 0) {
        this.pauseSong();
        // Show in-VR 3D Victory & Retry panel (NO 2D alerts to exit VR!)
        if (this.vrGameOverPanel) {
          this.vrGameOverPanel.show(this.scoringEngine.getStats());
        }
      }
    }

    // 8. Update In-VR Victory / Retry button touch interaction
    if (this.vrGameOverPanel) {
      this.vrGameOverPanel.update(
        this.handTracker.leftHandWorldPos,
        this.handTracker.rightHandWorldPos,
        delta
      );
    }

    // 9. Update Video Screen and procedural cyber backdrop
    this.videoManager.update(currentTime, bpm);

    // 10. Animate Stage Lights & Atmospheric Particles
    this.animateAtmosphere(currentTime, delta);

    // 11. Render 3D Scene
    this.renderer.render(this.scene, this.camera);
  }

  animateAtmosphere(t, delta) {
    // Spotlights sweeping gently
    this.spotlights.forEach((spot, idx) => {
      const speed = 1.2 + idx * 0.3;
      spot.position.x = Math.sin(t * speed) * 3.5;
      spot.position.z = Math.cos(t * speed) * 3.5 - 1.0;
    });

    // Particle drift
    if (this.particles) {
      const positions = this.particles.geometry.attributes.position.array;
      for (let i = 1; i < positions.length; i += 3) {
        positions[i] -= delta * 0.2;
        if (positions[i] < 0) positions[i] = 4;
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }
  }
}

// Instantiate game on page load
window.addEventListener('DOMContentLoaded', () => {
  new JustDanceVRGame();
});
