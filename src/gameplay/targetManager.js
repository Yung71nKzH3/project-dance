import * as THREE from 'three';

/**
 * Manages 3D Speed Camera Checkpoints and Visual Rhythm Cues.
 * Synchronized with video/audio playback timeline.
 * 
 * In Speed Camera Mode:
 * - No lingering static spheres in the air.
 * - Focus is 100% on following the real dancer on the video screen.
 * - Quick, crisp beat gates flash right on the beat and vanish immediately.
 */
export class TargetManager {
  constructor(scene) {
    this.scene = scene;
    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);

    // Speed Camera mode: crisp, punchy, zero lingering clutter
    this.speedCameraMode = true;
    this.showCollectionDots = false; // Hidden so player can flow freely without collection dots in their face!
    this.lookahead = 0.45; // Only show 450ms before the beat

    // Active marker visual pool
    this.markerPool = [];
    this.maxMarkers = 8;

    // Ghost Hand Visuals (disabled in speed camera mode to focus on the video)
    this.ghostLeft = null;
    this.ghostRight = null;
    this.ghostGuideLine = null;

    this.initPool();
    this.initBurstPool();
    this.createGhostGuides();
  }

  initBurstPool() {
    this.burstPoolSize = 6;
    this.burstPool = [];
    this.burstParticleCount = 8;
    this.sharedParticleGeo = new THREE.SphereGeometry(0.016, 6, 6);

    for (let b = 0; b < this.burstPoolSize; b++) {
      const group = new THREE.Group();
      group.visible = false;
      const particles = [];

      for (let p = 0; p < this.burstParticleCount; p++) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0x00f3ff,
          transparent: true,
          opacity: 1.0
        });
        const mesh = new THREE.Mesh(this.sharedParticleGeo, mat);
        mesh.userData = { vx: 0, vy: 0, vz: 0 };
        group.add(mesh);
        particles.push(mesh);
      }

      group.userData = {
        active: false,
        startTime: 0,
        duration: 0.3,
        particles
      };

      this.rootGroup.add(group);
      this.burstPool.push(group);
    }
  }

  initPool() {
    for (let i = 0; i < this.maxMarkers; i++) {
      const marker = this.createMarkerInstance();
      marker.visible = false;
      this.rootGroup.add(marker);
      this.markerPool.push(marker);
    }
  }

  createMarkerInstance() {
    const group = new THREE.Group();

    // Central Speed Camera Target Ring
    const ringGeo = new THREE.RingGeometry(0.065, 0.08, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f3ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    // Quick converging beat radar ring
    const approachGeo = new THREE.RingGeometry(0.06, 0.075, 32);
    const approachMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    const approachRing = new THREE.Mesh(approachGeo, approachMat);
    group.add(approachRing);

    group.userData = {
      ring,
      ringMat,
      approachRing,
      approachMat,
      targetData: null,
      handSide: 'left'
    };

    return group;
  }

  createGhostGuides() {
    const createGhostHand = (colorHex) => {
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.04, 1),
        new THREE.MeshBasicMaterial({
          color: colorHex,
          wireframe: true,
          transparent: true,
          opacity: 0.4
        })
      );
      this.rootGroup.add(mesh);
      return mesh;
    };

    this.ghostLeft = createGhostHand(0x00f3ff);
    this.ghostRight = createGhostHand(0xff007f);

    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(), new THREE.Vector3()
    ]);
    const lineMat = new THREE.LineDashedMaterial({
      color: 0xffffff,
      dashSize: 0.05,
      gapSize: 0.03,
      transparent: true,
      opacity: 0.25
    });
    this.ghostGuideLine = new THREE.Line(lineGeo, lineMat);
    this.rootGroup.add(this.ghostGuideLine);
  }

  /**
   * Update visual target markers matching playback time
   */
  update(currentTime, upcomingKeyframes, interpolatedPose, delta = 0.016) {
    // 1. Update any active pooled hit burst particles
    this.updateBursts(delta);

    // In speed camera mode, ghost guides are kept hidden so the dancer on screen is the hero
    if (!this.speedCameraMode && interpolatedPose) {
      this.ghostLeft.visible = true;
      this.ghostRight.visible = true;
      this.ghostGuideLine.visible = true;

      this.ghostLeft.position.set(interpolatedPose.left.x, interpolatedPose.left.y, interpolatedPose.left.z);
      this.ghostRight.position.set(interpolatedPose.right.x, interpolatedPose.right.y, interpolatedPose.right.z);

      const pos = this.ghostGuideLine.geometry.attributes.position.array;
      pos[0] = interpolatedPose.left.x; pos[1] = interpolatedPose.left.y; pos[2] = interpolatedPose.left.z;
      pos[3] = interpolatedPose.right.x; pos[4] = interpolatedPose.right.y; pos[5] = interpolatedPose.right.z;
      this.ghostGuideLine.geometry.attributes.position.needsUpdate = true;
    } else {
      this.ghostLeft.visible = false;
      this.ghostRight.visible = false;
      this.ghostGuideLine.visible = false;
    }

    // Hide all pooled markers
    for (const marker of this.markerPool) {
      marker.visible = false;
    }

    if (!this.showCollectionDots) {
      return; // No lingering collection dots in the player's face!
    }

    // Only render markers within the immediate speed camera window (no lingering!)
    let poolIndex = 0;
    const windowAhead = this.speedCameraMode ? 0.45 : 1.5;

    for (const kf of upcomingKeyframes) {
      if (kf.evaluated) continue;

      const timeDelta = kf.time - currentTime;
      // Disappear IMMEDIATELY on the beat (zero lingering balls)
      if (timeDelta < 0.02 || timeDelta > windowAhead) continue;

      const progress = 1.0 - (timeDelta / windowAhead);

      // Left Hand Speed Gate
      if (poolIndex < this.maxMarkers) {
        this.renderSingleTarget(this.markerPool[poolIndex++], kf, 'left', timeDelta, progress, windowAhead);
      }

      // Right Hand Speed Gate
      if (poolIndex < this.maxMarkers) {
        this.renderSingleTarget(this.markerPool[poolIndex++], kf, 'right', timeDelta, progress, windowAhead);
      }
    }
  }

  renderSingleTarget(marker, keyframe, handSide, timeDelta, progress, windowAhead) {
    marker.visible = true;
    const handCoords = handSide === 'left' ? keyframe.leftHand : keyframe.rightHand;
    const colorHex = handSide === 'left' ? 0x00f3ff : 0xff007f;

    marker.position.set(handCoords.x, handCoords.y, handCoords.z);

    marker.userData.ringMat.color.setHex(colorHex);
    marker.userData.approachMat.color.setHex(colorHex);

    // Fast converge: scales down to 1.0 right as the beat strikes
    const approachScale = 1.0 + (timeDelta / windowAhead) * 1.8;
    marker.userData.approachRing.scale.set(approachScale, approachScale, 1.0);

    const opacity = Math.min(1.0, progress * 2.0);
    marker.userData.ringMat.opacity = opacity * 0.9;
    marker.userData.approachMat.opacity = opacity * 0.7;

    marker.lookAt(0, handCoords.y, 0.5);
  }

  /**
   * Explodes a speed-camera checkpoint pass with a pooled particle ring (Zero-leak, 100% reused)
   */
  triggerHitBurst(position, colorHex) {
    if (!this.burstPool || this.burstPool.length === 0) return;

    // Find first inactive burst group or reuse oldest
    const burst = this.burstPool.find(b => !b.userData.active) || this.burstPool[0];
    burst.userData.active = true;
    burst.userData.startTime = performance.now();
    burst.position.copy(position);
    burst.visible = true;

    const count = this.burstParticleCount;
    for (let i = 0; i < count; i++) {
      const p = burst.userData.particles[i];
      p.position.set(0, 0, 0);
      p.material.color.setHex(colorHex);
      p.material.opacity = 1.0;

      const angle = (i / count) * Math.PI * 2;
      const speed = 0.5 + Math.random() * 0.3;
      p.userData.vx = Math.cos(angle) * speed;
      p.userData.vy = Math.sin(angle) * speed;
      p.userData.vz = (Math.random() - 0.5) * 0.3;
    }
  }

  updateBursts(delta = 0.016) {
    if (!this.burstPool) return;
    const now = performance.now();
    for (const burst of this.burstPool) {
      if (!burst.userData.active) continue;
      const elapsed = (now - burst.userData.startTime) / 1000;
      if (elapsed > burst.userData.duration) {
        burst.userData.active = false;
        burst.visible = false;
        continue;
      }

      const fade = 1.0 - (elapsed / burst.userData.duration);
      for (const p of burst.userData.particles) {
        p.position.x += p.userData.vx * delta;
        p.position.y += p.userData.vy * delta;
        p.position.z += p.userData.vz * delta;
        p.material.opacity = Math.max(0, fade);
      }
    }
  }

  reset() {
    for (const marker of this.markerPool) {
      marker.visible = false;
    }
    if (this.burstPool) {
      for (const burst of this.burstPool) {
        burst.userData.active = false;
        burst.visible = false;
      }
    }
    this.ghostLeft.visible = false;
    this.ghostRight.visible = false;
    this.ghostGuideLine.visible = false;
  }
}
