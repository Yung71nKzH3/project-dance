import * as THREE from 'three';

/**
 * Just Dance Style Video Snapshot & Checkpoint Engine
 * 
 * Takes snapshot checkpoints of the dance video at rhythmic intervals,
 * extracts where hands SHOULD be, displays incoming Pictogram/Snapshot cards,
 * triggers camera flash & shutter on the beat, and rewards players with
 * "PERFECT SNAPSHOT!" photos when their hands match the pose.
 */
export class SnapshotEngine {
  constructor(scene, videoManager, audioSynth, handTracker, scoringEngine) {
    this.scene = scene;
    this.videoManager = videoManager;
    this.audioSynth = audioSynth;
    this.handTracker = handTracker;
    this.scoringEngine = scoringEngine;

    // Snapshot Checkpoints
    this.checkpoints = [];
    this.lookahead = 2.0; // Preview snapshot 2 seconds ahead
    this.tolerance = 0.22; // Seconds window around snapshot time

    // 3D Visual Flash & Shutter Effects
    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);

    // Floating 3D Snapshot Camera Apertures
    this.leftReticle = null;
    this.rightReticle = null;
    this.cameraFlashMesh = null;

    // Polaroid / Snapshot Card Visual in 3D
    this.pictogramMesh = null;
    this.pictogramCanvas = document.createElement('canvas');
    this.pictogramCanvas.width = 256;
    this.pictogramCanvas.height = 320;
    this.pictogramCtx = this.pictogramCanvas.getContext('2d');
    this.pictogramTexture = null;

    // Captured Photos Collection
    this.snappedPhotos = [];

    this.initVisuals();
  }

  initVisuals() {
    // 1. Full-screen / Stage Camera Flash Mesh
    const flashGeo = new THREE.PlaneGeometry(12, 8);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false
    });
    this.cameraFlashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.cameraFlashMesh.position.set(0, 1.8, -1.8);
    this.rootGroup.add(this.cameraFlashMesh);

    // 2. Camera Focus Reticles for Hands
    const createReticle = (colorHex) => {
      const group = new THREE.Group();
      // Outer camera bracket corners
      const cornersGeo = new THREE.RingGeometry(0.08, 0.09, 4, 1, 0, Math.PI * 2);
      const cornersMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        wireframe: true,
        transparent: true,
        opacity: 0.85
      });
      const corners = new THREE.Mesh(cornersGeo, cornersMat);
      corners.rotation.z = Math.PI / 4;
      group.add(corners);

      // Center crosshair dot
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.015, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      group.add(dot);

      group.visible = false;
      this.rootGroup.add(group);
      return group;
    };

    this.leftReticle = createReticle(0x00f3ff);
    this.rightReticle = createReticle(0xff007f);

    // 3. Floating 3D Polaroid / Pictogram Card (Like Just Dance pose card)
    this.pictogramTexture = new THREE.CanvasTexture(this.pictogramCanvas);
    this.pictogramTexture.minFilter = THREE.LinearFilter;
    const cardGeo = new THREE.PlaneGeometry(0.5, 0.625);
    const cardMat = new THREE.MeshBasicMaterial({
      map: this.pictogramTexture,
      transparent: true,
      side: THREE.DoubleSide
    });
    this.pictogramMesh = new THREE.Mesh(cardGeo, cardMat);
    // Positioned floating to the lower-right side of stage (x: 1.4, y: 0.8, z: -2.1)
    this.pictogramMesh.position.set(1.4, 0.85, -2.1);
    this.pictogramMesh.rotation.y = -0.25;
    this.pictogramMesh.visible = false;
    this.rootGroup.add(this.pictogramMesh);
  }

  /**
   * Initializes snapshot checkpoints from choreography data or generates them
   * @param {Array} keyframes
   */
  setCheckpointsFromKeyframes(keyframes) {
    this.checkpoints = keyframes.map((kf, idx) => ({
      id: kf.id || `snap_${idx}`,
      time: kf.time,
      moveName: kf.moveName || `Pose #${idx + 1}`,
      leftHand: { ...kf.leftHand },
      rightHand: { ...kf.rightHand },
      evaluated: false,
      result: null,
      thumbnail: null
    }));
    this.snappedPhotos = [];
  }

  /**
   * Automatically extracts snapshots from live video at regular beat intervals!
   * @param {number} bpm
   * @param {number} duration
   * @param {number} beatsPerSnapshot e.g., 4 beats = snapshot on every measure
   */
  generateSnapshotsFromBeat(bpm = 128, duration = 48.0, beatsPerSnapshot = 4) {
    const secondsPerBeat = 60 / bpm;
    const interval = secondsPerBeat * beatsPerSnapshot;
    const generated = [];

    // Predefined dance pose variations
    const poseStyles = [
      { name: "Disco Point High", l: { x: -0.5, y: 1.7, z: -0.45 }, r: { x: 0.2, y: 0.95, z: -0.3 } },
      { name: "Power X-Guard", l: { x: 0.15, y: 1.35, z: -0.4 }, r: { x: -0.15, y: 1.35, z: -0.4 } },
      { name: "Double High Reach", l: { x: -0.35, y: 1.85, z: -0.45 }, r: { x: 0.35, y: 1.85, z: -0.45 } },
      { name: "Side Wave Push", l: { x: -0.6, y: 1.3, z: -0.45 }, r: { x: -0.2, y: 1.3, z: -0.45 } },
      { name: "Wide V-Victory", l: { x: -0.65, y: 1.75, z: -0.45 }, r: { x: 0.65, y: 1.75, z: -0.45 } },
      { name: "Low Bass Drop", l: { x: -0.3, y: 0.85, z: -0.4 }, r: { x: 0.3, y: 0.85, z: -0.4 } },
      { name: "Heart Chest Clasp", l: { x: -0.12, y: 1.4, z: -0.38 }, r: { x: 0.12, y: 1.4, z: -0.38 } }
    ];

    let t = interval;
    let idx = 0;
    while (t < duration - 1.0) {
      const pose = poseStyles[idx % poseStyles.length];
      generated.push({
        id: `auto_snap_${idx}`,
        time: parseFloat(t.toFixed(2)),
        moveName: pose.name,
        leftHand: { ...pose.l },
        rightHand: { ...pose.r },
        evaluated: false,
        result: null
      });
      t += interval;
      idx++;
    }

    this.checkpoints = generated;
    console.log(`Auto-generated ${generated.length} snapshot checkpoints (every ${beatsPerSnapshot} beats).`);
    return generated;
  }

  /**
   * Main per-frame update for snapshot checks and visual cards
   * @param {number} currentTime
   * @param {number} delta
   */
  update(currentTime, delta) {
    if (this.checkpoints.length === 0) return;

    // 1. Find upcoming snapshot within lookahead window
    const upcoming = this.checkpoints.find(cp => !cp.evaluated && cp.time > currentTime && (cp.time - currentTime) <= this.lookahead);

    if (upcoming) {
      const timeRemaining = upcoming.time - currentTime;
      const progress = 1.0 - (timeRemaining / this.lookahead);

      // Show and animate focus reticles
      this.leftReticle.visible = true;
      this.rightReticle.visible = true;
      this.leftReticle.position.set(upcoming.leftHand.x, upcoming.leftHand.y, upcoming.leftHand.z);
      this.rightReticle.position.set(upcoming.rightHand.x, upcoming.rightHand.y, upcoming.rightHand.z);

      // Reticle shrink from scale 2.5 down to 1.0
      const reticleScale = 1.0 + Math.max(0, timeRemaining / this.lookahead) * 1.5;
      this.leftReticle.scale.set(reticleScale, reticleScale, reticleScale);
      this.rightReticle.scale.set(reticleScale, reticleScale, reticleScale);
      this.leftReticle.rotation.z += delta * 4;
      this.rightReticle.rotation.z -= delta * 4;

      // Update Pictogram Card
      this.pictogramMesh.visible = true;
      this.renderPictogramCard(upcoming, timeRemaining);
    } else {
      this.leftReticle.visible = false;
      this.rightReticle.visible = false;
      this.pictogramMesh.visible = false;
    }

    // 2. Check for active snapshot trigger (within tolerance window)
    const active = this.checkpoints.find(cp => !cp.evaluated && Math.abs(currentTime - cp.time) <= this.tolerance);
    if (active) {
      this.evaluateSnapshot(active);
    }

    // 3. Mark missed snapshots
    const missed = this.checkpoints.filter(cp => !cp.evaluated && (currentTime - cp.time) > this.tolerance);
    for (const m of missed) {
      m.evaluated = true;
      m.result = 'MISSED';
    }

    // 4. Fade camera flash if active
    if (this.cameraFlashMesh.material.opacity > 0) {
      this.cameraFlashMesh.material.opacity = Math.max(0, this.cameraFlashMesh.material.opacity - delta * 4);
    }
  }

  /**
   * Evaluates if player's hands match the relative pose geometry at the snapshot moment!
   * @param {object} checkpoint
   */
  evaluateSnapshot(checkpoint) {
    checkpoint.evaluated = true;

    // Real player hand positions
    const userL = this.handTracker.leftHandWorldPos;
    const userR = this.handTracker.rightHandWorldPos;

    const targetL = new THREE.Vector3(checkpoint.leftHand.x, checkpoint.leftHand.y, checkpoint.leftHand.z);
    const targetR = new THREE.Vector3(checkpoint.rightHand.x, checkpoint.rightHand.y, checkpoint.rightHand.z);

    // Relative Direction Vectors (Right hand relative to Left hand)
    const vecTarget = new THREE.Vector3().subVectors(targetR, targetL);
    const vecUser = new THREE.Vector3().subVectors(userR, userL);

    const dirTarget = vecTarget.clone().normalize();
    const dirUser = vecUser.clone().normalize();
    const similarity = dirTarget.dot(dirUser);

    // Relative Height Ordering
    const dY_target = targetR.y - targetL.y;
    const dY_user = userR.y - userL.y;
    const targetIsLevel = Math.abs(dY_target) < 0.16;
    const userIsLevel = Math.abs(dY_user) < 0.18;
    const verticalMatch = (targetIsLevel && userIsLevel) || (Math.sign(dY_target) === Math.sign(dY_user));

    // Elevation Check
    const avgY_target = (targetL.y + targetR.y) / 2;
    const avgY_user = (userL.y + userR.y) / 2;
    const elevationMatch = Math.abs(avgY_target - avgY_user) < 0.45;

    // Trigger Camera Shutter SFX & Visual Flash
    this.triggerCameraFlash();

    // Capture the photo snapshot from the video canvas
    const photoDataUrl = this.capturePhotoSnapshot();
    checkpoint.thumbnail = photoDataUrl;

    const isFlawless = similarity >= 0.70 && verticalMatch && elevationMatch;
    const isGood = similarity >= 0.40 && verticalMatch;

    if (isFlawless || isGood) {
      checkpoint.result = isFlawless ? 'PERFECT' : 'GREAT';

      // Big Snapshot Bonus Points!
      const bonusPts = isFlawless ? 150 : 80;
      this.scoringEngine.score += bonusPts;
      this.scoringEngine.combo += 1;
      if (this.scoringEngine.combo > this.scoringEngine.maxCombo) {
        this.scoringEngine.maxCombo = this.scoringEngine.combo;
      }
      this.scoringEngine.ratingCounts.PERFECT++;

      // Floating 3D Rating Badge positioned above player's hands
      const mid = new THREE.Vector3().addVectors(userL, userR).multiplyScalar(0.5);
      mid.y += 0.3;
      this.scoringEngine.spawn3DPopup(
        isFlawless ? 'PERFECT' : 'GREAT',
        bonusPts,
        mid,
        `📸 ${checkpoint.moveName}`
      );

      // Add to player's gallery
      this.snappedPhotos.push({
        time: checkpoint.time,
        moveName: checkpoint.moveName,
        rating: checkpoint.result,
        image: photoDataUrl
      });

      console.log(`📸 SNAPSHOT CAPTURED: ${checkpoint.moveName} (${checkpoint.result})!`);
    } else {
      checkpoint.result = 'BLURRED';
      this.scoringEngine.combo = 0;
      this.scoringEngine.ratingCounts.MISS++;
      this.audioSynth.playHitSound('MISS');

      const mid = new THREE.Vector3().addVectors(userL, userR).multiplyScalar(0.5);
      mid.y += 0.3;
      this.scoringEngine.spawn3DPopup('MISS', 0, mid, `BLURRED SNAP!`);
    }

    if (this.scoringEngine.onScoreUpdate) {
      this.scoringEngine.onScoreUpdate(this.scoringEngine.getStats());
    }
  }

  /**
   * Triggers visual full-stage camera flash & audio shutter click
   */
  triggerCameraFlash() {
    this.audioSynth.playCameraShutter();
    this.cameraFlashMesh.material.opacity = 0.9;
  }

  /**
   * Captures an image snapshot of the current video dancer
   */
  capturePhotoSnapshot() {
    try {
      const offscreen = document.createElement('canvas');
      offscreen.width = 320;
      offscreen.height = 180;
      const oCtx = offscreen.getContext('2d');

      if (this.videoManager.isProcedural) {
        oCtx.drawImage(this.videoManager.animCanvas, 0, 0, 320, 180);
      } else {
        oCtx.drawImage(this.videoManager.videoElement, 0, 0, 320, 180);
      }

      // Add "JUST DANCE VR SNAPSHOT" stamp
      oCtx.fillStyle = 'rgba(0, 243, 255, 0.9)';
      oCtx.font = 'bold 12px sans-serif';
      oCtx.fillText('📸 VR DANCE SNAPSHOT', 10, 20);

      return offscreen.toDataURL('image/jpeg', 0.85);
    } catch (e) {
      return null;
    }
  }

  /**
   * Renders the upcoming snapshot card / pictogram
   */
  renderPictogramCard(checkpoint, timeRemaining) {
    const ctx = this.pictogramCtx;
    const w = this.pictogramCanvas.width;
    const h = this.pictogramCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Polaroid Card Background
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f3ff';
    ctx.beginPath();
    ctx.roundRect(8, 8, w - 16, h - 16, 12);
    ctx.fill();

    // Inner photo viewport (black background)
    const photoX = 18;
    const photoY = 18;
    const photoW = w - 36;
    const photoH = h - 90;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(photoX, photoY, photoW, photoH);

    // Draw stylized stick-figure dancer pose showing where hands should be
    const cx = photoX + photoW * 0.5;
    const cy = photoY + photoH * 0.55;

    // Hands coordinates mapped to card
    const lx = cx + checkpoint.leftHand.x * 90;
    const ly = cy - (checkpoint.leftHand.y - 1.35) * 80;
    const rx = cx + checkpoint.rightHand.x * 90;
    const ry = cy - (checkpoint.rightHand.y - 1.35) * 80;

    // Body
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy - 35, 12, 0, Math.PI * 2); // Head
    ctx.moveTo(cx, cy - 23);
    ctx.lineTo(cx, cy + 20); // Torso
    ctx.stroke();

    // Left Arm Cyan
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 15);
    ctx.lineTo(lx, ly);
    ctx.stroke();
    ctx.fillStyle = '#00f3ff';
    ctx.beginPath();
    ctx.arc(lx, ly, 7, 0, Math.PI * 2);
    ctx.fill();

    // Right Arm Magenta
    ctx.strokeStyle = '#ff007f';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 15);
    ctx.lineTo(rx, ry);
    ctx.stroke();
    ctx.fillStyle = '#ff007f';
    ctx.beginPath();
    ctx.arc(rx, ry, 7, 0, Math.PI * 2);
    ctx.fill();

    // Camera Aperture Icon & Countdown at top of photo
    ctx.fillStyle = '#ffdd00';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`📸 in ${timeRemaining.toFixed(1)}s`, photoX + photoW - 10, photoY + 22);

    // Label at bottom of polaroid
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(checkpoint.moveName.toUpperCase(), w * 0.5, h - 38);

    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.fillText('STRIKE THE POSE!', w * 0.5, h - 20);

    ctx.restore();
    this.pictogramTexture.needsUpdate = true;
  }

  reset() {
    this.checkpoints.forEach(cp => {
      cp.evaluated = false;
      cp.result = null;
    });
    this.snappedPhotos = [];
    this.leftReticle.visible = false;
    this.rightReticle.visible = false;
    this.pictogramMesh.visible = false;
    this.cameraFlashMesh.material.opacity = 0;
  }
}
