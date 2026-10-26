import * as THREE from 'three';

/**
 * Manages the HTML5 Video Element, 3D Video Screen in Three.js,
 * and dynamic background dance animations.
 */
export class VideoManager {
  constructor(scene, audioSynth) {
    this.scene = scene;
    this.audioSynth = audioSynth;

    // HTML5 Video Element
    this.videoElement = document.createElement('video');
    this.videoElement.id = 'xr-dance-video';
    this.videoElement.playsInline = true;
    this.videoElement.crossOrigin = 'anonymous';
    this.videoElement.loop = false;
    this.videoElement.preload = 'auto';
    this.videoElement.muted = false; // Player audio

    // Hide the actual DOM element off-screen (we render it in 3D WebXR)
    this.videoElement.style.position = 'fixed';
    this.videoElement.style.top = '-9999px';
    this.videoElement.style.left = '-9999px';
    this.videoElement.style.width = '1px';
    this.videoElement.style.height = '1px';
    this.videoElement.style.opacity = '0.001';
    document.body.appendChild(this.videoElement);

    // Procedural Dance Animator Canvas (used when no external MP4 is loaded)
    this.animCanvas = document.createElement('canvas');
    this.animCanvas.width = 1280;
    this.animCanvas.height = 720;
    this.animCtx = this.animCanvas.getContext('2d');
    this.isProcedural = true;

    // Three.js Video Mesh Setup
    this.meshGroup = new THREE.Group();
    this.videoTexture = null;
    this.screenMesh = null;
    this.frameMesh = null;

    this.create3DScreen();

    // Setup animation loop for procedural backdrop
    this.currentTrackInfo = null;
    this.choreographyPose = null;
  }

  create3DScreen() {
    // Screen geometry: 3.6m wide, 2.025m tall (16:9)
    const screenWidth = 3.6;
    const screenHeight = 2.025;
    const screenGeo = new THREE.PlaneGeometry(screenWidth, screenHeight);

    // Use CanvasTexture or VideoTexture
    this.videoTexture = new THREE.CanvasTexture(this.animCanvas);
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;

    const screenMat = new THREE.MeshBasicMaterial({
      map: this.videoTexture,
      side: THREE.FrontSide
    });

    this.screenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.meshGroup.add(this.screenMesh);

    // Glowing Neon Frame around the video screen
    const frameGeo = new THREE.BoxGeometry(screenWidth + 0.12, screenHeight + 0.12, 0.04);
    const frameEdges = new THREE.EdgesGeometry(frameGeo);
    const frameMat = new THREE.LineBasicMaterial({
      color: 0x00f3ff,
      linewidth: 3
    });
    this.frameMesh = new THREE.LineSegments(frameEdges, frameMat);
    this.frameMesh.position.z = -0.01;
    this.meshGroup.add(this.frameMesh);

    // Backing panel for solid aesthetic
    const backPanelGeo = new THREE.BoxGeometry(screenWidth + 0.08, screenHeight + 0.08, 0.02);
    const backPanelMat = new THREE.MeshStandardMaterial({
      color: 0x0a0c16,
      roughness: 0.8,
      metalness: 0.2
    });
    const backPanel = new THREE.Mesh(backPanelGeo, backPanelMat);
    backPanel.position.z = -0.02;
    this.meshGroup.add(backPanel);

    // Position screen at center stage
    this.meshGroup.position.set(0, 1.85, -2.6);
    this.scene.add(this.meshGroup);
  }

  /**
   * Set video source to an external URL or file object
   * @param {string|File} source
   */
  async loadVideo(source) {
    if (!source || source === 'procedural') {
      this.isProcedural = true;
      // Procedural canvas stream into video element
      if (this.animCanvas.captureStream) {
        const stream = this.animCanvas.captureStream(60);
        this.videoElement.srcObject = stream;
      }
      return;
    }

    this.isProcedural = false;
    if (source instanceof File) {
      this.videoElement.srcObject = null;
      this.videoElement.src = URL.createObjectURL(source);
    } else {
      this.videoElement.srcObject = null;
      this.videoElement.src = source;
    }

    // Replace texture with Three.js VideoTexture
    this.videoTexture.dispose();
    this.videoTexture = new THREE.VideoTexture(this.videoElement);
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;
    this.screenMesh.material.map = this.videoTexture;
    this.screenMesh.material.needsUpdate = true;

    // Await metadata to obtain exact full song duration
    await new Promise((resolve) => {
      if (this.videoElement.readyState >= 1) {
        resolve();
      } else {
        this.videoElement.addEventListener('loadedmetadata', resolve, { once: true });
        setTimeout(resolve, 3000);
      }
    });

    const dur = this.videoElement.duration || 180.0;
    console.log(`Video loaded successfully. Full duration: ${dur.toFixed(1)}s`);
    return dur;
  }

  setTrackInfo(track) {
    this.currentTrackInfo = track;
  }

  setChoreographyPose(pose) {
    this.choreographyPose = pose;
  }

  async play() {
    try {
      if (this.videoElement.src || this.videoElement.srcObject) {
        await this.videoElement.play();
      }
    } catch (e) {
      console.warn('Video play prevented or pending user click:', e);
    }
  }

  pause() {
    if (!this.videoElement.paused) {
      this.videoElement.pause();
    }
  }

  getCurrentTime() {
    if (this.isProcedural && this.audioSynth) {
      return this.audioSynth.getCurrentTime();
    }
    return this.videoElement.currentTime;
  }

  setCurrentTime(time) {
    if (!this.isProcedural) {
      this.videoElement.currentTime = time;
    }
  }

  /**
   * Per-frame update for the video screen and procedural dynamic dance backdrop
   */
  update(timeSeconds, bpm = 128) {
    if (this.isProcedural) {
      this.renderProceduralStage(timeSeconds, bpm);
      this.videoTexture.needsUpdate = true;
    }

    // Pulse neon frame border with the music beat
    const beatFraction = (timeSeconds * (bpm / 60)) % 1;
    const pulse = 0.5 + 0.5 * Math.sin(beatFraction * Math.PI * 2);
    if (this.frameMesh && this.frameMesh.material) {
      const col = (Math.floor(timeSeconds / 4) % 2 === 0) ? 0x00f3ff : 0xff007f;
      this.frameMesh.material.color.setHex(col);
    }
  }

  /**
   * Renders high-energy cyberpunk dance silhouette and visualizer
   * directly onto the video canvas texture
   */
  renderProceduralStage(t, bpm) {
    const ctx = this.animCtx;
    const w = this.animCanvas.width;
    const h = this.animCanvas.height;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#040714');
    grad.addColorStop(0.6, '#0f172a');
    grad.addColorStop(1, '#1e1136');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Audio frequency visualizer bars in background
    const barCount = 48;
    const barW = w / barCount;
    for (let i = 0; i < barCount; i++) {
      const wave = Math.sin(t * 8 + i * 0.4) * 0.5 + 0.5;
      const beatPop = (t * (bpm / 60) * 2) % 1;
      const barH = 50 + wave * 180 + (1 - beatPop) * 60;

      const hue = (i / barCount * 280 + t * 40) % 360;
      ctx.fillStyle = `hsla(${hue}, 90%, 60%, 0.45)`;
      ctx.fillRect(i * barW + 2, h - barH - 80, barW - 4, barH);
    }

    // Perspective Neon Dance Floor Grid
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.35)';
    ctx.lineWidth = 1.5;
    const horizon = h * 0.65;
    for (let x = -w * 0.5; x <= w * 1.5; x += 80) {
      ctx.beginPath();
      ctx.moveTo(w * 0.5, horizon);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    const gridOffset = (t * 80) % 60;
    for (let y = horizon; y <= h; y += 30) {
      const actualY = y + gridOffset;
      if (actualY <= h) {
        ctx.beginPath();
        ctx.moveTo(0, actualY);
        ctx.lineTo(w, actualY);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Render Animated Cyber Dancer Silhouette
    this.drawDancerFigure(ctx, w * 0.5, h * 0.68, t, bpm);

    // Track Title and Current Move Banner
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(20, 20, 480, 80);
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, 480, 80);

    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this.currentTrackInfo?.title || 'VR DANCE EXPERIENCE', 38, 55);

    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = '#00f3ff';
    const moveText = this.choreographyPose?.nextMove ? `NEXT MOVE: ${this.choreographyPose.nextMove.toUpperCase()}` : 'FOLLOW THE BEAT';
    ctx.fillText(moveText, 38, 82);
    ctx.restore();
  }

  /**
   * Draws dynamic stylized dancer mannequin mirroring the choreography pose
   */
  drawDancerFigure(ctx, cx, cy, t, bpm) {
    ctx.save();

    const beatPhase = (t * (bpm / 60) * Math.PI * 2);
    const bounce = Math.abs(Math.sin(beatPhase)) * 16;
    const rootY = cy - bounce;

    // Use current choreography target positions if available, otherwise synthetic groove
    let leftHandX = cx - 110 + Math.sin(t * 3) * 40;
    let leftHandY = rootY - 140 + Math.cos(t * 4) * 50;
    let rightHandX = cx + 110 + Math.cos(t * 3) * 40;
    let rightHandY = rootY - 140 + Math.sin(t * 4) * 50;

    if (this.choreographyPose) {
      const p = this.choreographyPose;
      // Convert 3D choreo coordinates (meters) to 2D canvas coordinates
      leftHandX = cx + (p.left.x * 240);
      leftHandY = rootY - (p.left.y * 130) + 120;
      rightHandX = cx + (p.right.x * 240);
      rightHandY = rootY - (p.right.y * 130) + 120;
    }

    const headX = cx;
    const headY = rootY - 190;
    const chestX = cx;
    const chestY = rootY - 120;
    const hipsX = cx;
    const hipsY = rootY - 50;

    // Outer Neon Glow
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#00f3ff';

    // Body Skeleton Lines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Spine
    ctx.beginPath();
    ctx.moveTo(headX, headY);
    ctx.lineTo(chestX, chestY);
    ctx.lineTo(hipsX, hipsY);
    ctx.stroke();

    // Arms
    ctx.strokeStyle = '#00f3ff'; // Left Arm Cyan
    ctx.beginPath();
    ctx.moveTo(chestX, chestY - 10);
    ctx.lineTo(cx - 50, chestY - 10);
    ctx.lineTo(leftHandX, leftHandY);
    ctx.stroke();

    ctx.strokeStyle = '#ff007f'; // Right Arm Magenta
    ctx.beginPath();
    ctx.moveTo(chestX, chestY - 10);
    ctx.lineTo(cx + 50, chestY - 10);
    ctx.lineTo(rightHandX, rightHandY);
    ctx.stroke();

    // Legs
    ctx.strokeStyle = '#a855f7';
    ctx.beginPath();
    ctx.moveTo(hipsX, hipsY);
    ctx.lineTo(cx - 50, cy + 40);
    ctx.lineTo(cx - 70, cy + 90);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(hipsX, hipsY);
    ctx.lineTo(cx + 50, cy + 40);
    ctx.lineTo(cx + 70, cy + 90);
    ctx.stroke();

    // Head
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(headX, headY, 22, 0, Math.PI * 2);
    ctx.fill();

    // Glowing Hands
    ctx.fillStyle = '#00f3ff';
    ctx.beginPath();
    ctx.arc(leftHandX, leftHandY, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ff007f';
    ctx.beginPath();
    ctx.arc(rightHandX, rightHandY, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  dispose() {
    if (this.videoElement && this.videoElement.parentNode) {
      this.videoElement.parentNode.removeChild(this.videoElement);
    }
  }
}
