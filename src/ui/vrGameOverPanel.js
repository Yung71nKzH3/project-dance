import * as THREE from 'three';

/**
 * In-VR 3D End-Screen & Victory Panel
 * Floats in 3D space when a song finishes or is paused.
 * Allows instant Replay/Retry inside VR without popping 2D alerts or leaving immersive mode.
 */
export class VRGameOverPanel {
  constructor(scene, onRetry, onMenu) {
    this.scene = scene;
    this.onRetry = onRetry;
    this.onMenu = onMenu;

    this.rootGroup = new THREE.Group();
    this.rootGroup.position.set(0, 1.65, -1.6); // Comfortable eye-level floating distance
    this.rootGroup.visible = false;
    this.scene.add(this.rootGroup);

    // Canvas texture for HUD display
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 768;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    // Main billboard mesh
    const panelGeo = new THREE.PlaneGeometry(1.8, 1.35);
    const panelMat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      side: THREE.FrontSide
    });
    this.panelMesh = new THREE.Mesh(panelGeo, panelMat);
    this.rootGroup.add(this.panelMesh);

    // 3D Interactive "RETRY" Button Hitbox
    const retryBoxGeo = new THREE.BoxGeometry(0.7, 0.22, 0.08);
    const retryBoxMat = new THREE.MeshStandardMaterial({
      color: 0x00f3ff,
      emissive: 0x00f3ff,
      emissiveIntensity: 0.4,
      roughness: 0.3
    });
    this.retryButtonMesh = new THREE.Mesh(retryBoxGeo, retryBoxMat);
    this.retryButtonMesh.position.set(0, -0.42, 0.06);
    this.rootGroup.add(this.retryButtonMesh);

    this.isHovered = false;
    this.cooldown = 0;
  }

  show(stats) {
    this.rootGroup.visible = true;
    this.render(stats);
  }

  hide() {
    this.rootGroup.visible = false;
  }

  render(stats = {}) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Panel Background
    ctx.save();
    ctx.fillStyle = 'rgba(10, 15, 30, 0.94)';
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#00f3ff';

    // Rounded Box
    this.roundRect(ctx, 20, 20, w - 40, h - 40, 28);
    ctx.fill();
    ctx.stroke();

    // 🏆 Title
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 64px "Impact", "Segoe UI", sans-serif';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f3ff';
    ctx.fillText('ROUTINE COMPLETED!', w * 0.5, 120);

    // Star Rating based on accuracy & score
    const accuracy = stats.accuracy || 100;
    let stars = '⭐⭐⭐⭐⭐';
    if (accuracy < 60) stars = '⭐⭐';
    else if (accuracy < 75) stars = '⭐⭐⭐';
    else if (accuracy < 90) stars = '⭐⭐⭐⭐';

    ctx.font = '48px sans-serif';
    ctx.fillText(stars, w * 0.5, 190);

    // Score Label & Value
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 28px sans-serif';
    ctx.fillText('FINAL SCORE', w * 0.5, 260);

    ctx.fillStyle = '#00ffc4';
    ctx.font = '900 84px "Impact", sans-serif';
    ctx.fillText((stats.score || 0).toLocaleString(), w * 0.5, 345);

    // Stats Grid (Accuracy, Max Combo, Perfects)
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(`Accuracy: ${accuracy}%`, w * 0.32, 430);
    ctx.fillText(`Max Streak: ${stats.maxCombo || 0}x`, w * 0.68, 430);

    // Retry Prompt on the 2D texture (matches 3D button location)
    ctx.fillStyle = '#020617';
    ctx.fillRect(w * 0.25, h - 180, w * 0.5, 90);
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 3;
    ctx.strokeRect(w * 0.25, h - 180, w * 0.5, 90);

    ctx.fillStyle = '#00f3ff';
    ctx.font = '900 38px "Impact", sans-serif';
    ctx.fillText('🔄 TOUCH TO RETRY SONG', w * 0.5, h - 125);

    ctx.restore();
    this.texture.needsUpdate = true;
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /**
   * Called each frame in render loop to detect hand touch on RETRY button
   * @param {THREE.Vector3} leftHandPos
   * @param {THREE.Vector3} rightHandPos
   */
  update(leftHandPos, rightHandPos, delta) {
    if (!this.rootGroup.visible) return;

    if (this.cooldown > 0) {
      this.cooldown -= delta;
      return;
    }

    // World position of retry button
    const btnWorldPos = new THREE.Vector3();
    this.retryButtonMesh.getWorldPosition(btnWorldPos);

    const distL = leftHandPos.distanceTo(btnWorldPos);
    const distR = rightHandPos.distanceTo(btnWorldPos);

    // If either hand touches the button (within 18cm)
    if (distL < 0.18 || distR < 0.18) {
      this.retryButtonMesh.scale.set(1.15, 1.15, 1.15);
      this.retryButtonMesh.material.emissiveIntensity = 0.9;
      this.triggerRetry();
    } else {
      this.retryButtonMesh.scale.set(1.0, 1.0, 1.0);
      this.retryButtonMesh.material.emissiveIntensity = 0.4;
    }
  }

  triggerRetry() {
    this.cooldown = 1.0;
    this.hide();
    if (this.onRetry) {
      this.onRetry();
    }
  }
}
