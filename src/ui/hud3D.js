import * as THREE from 'three';

/**
 * 3D Holographic HUD placed directly inside the VR space.
 * Displays Score, Streak/Combo, Multiplier, Accuracy, Song Progress, and Move Info.
 */
export class HUD3D {
  constructor(scene) {
    this.scene = scene;

    // HUD Canvas for dynamic UI rendering
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 256;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    // Curved or flat billboard plane floating above the main screen
    const geo = new THREE.PlaneGeometry(2.4, 0.6);
    const mat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      side: THREE.FrontSide
    });

    this.mesh = new THREE.Mesh(geo, mat);
    // Position floating above video screen (x: 0, y: 3.05, z: -2.55) tilted slightly downward
    this.mesh.position.set(0, 3.05, -2.55);
    this.mesh.rotation.x = 0.15;
    this.scene.add(this.mesh);

    // Initial state
    this.stats = {
      score: 0,
      combo: 0,
      multiplier: 1,
      accuracy: 100,
      totalMoves: 0
    };
    this.songProgress = 0;
    this.currentMoveName = 'GET READY';

    this.render();
  }

  updateStats(stats) {
    this.stats = { ...this.stats, ...stats };
    this.render();
  }

  setProgress(progress, moveName) {
    this.songProgress = Math.max(0, Math.min(1, progress));
    if (moveName) this.currentMoveName = moveName;
    this.render();
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Cyber HUD Panel Background
    ctx.save();
    ctx.fillStyle = 'rgba(10, 15, 30, 0.75)';
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 3;

    // Chamfered / futuristic rounded box
    this.drawFuturisticBox(ctx, 10, 10, w - 20, h - 20, 20);
    ctx.fill();
    ctx.stroke();

    // Glow effect
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#00f3ff';

    // 1. SCORE SECTION (Left)
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 20px "Segoe UI", sans-serif';
    ctx.fillText('SCORE', 40, 50);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 52px "Impact", "Arial Black", sans-serif';
    ctx.fillText(this.stats.score.toLocaleString(), 40, 105);

    // 2. COMBO & MULTIPLIER (Center)
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 20px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('COMBO STREAK', w * 0.5, 50);

    // Multiplier Badge
    const mult = this.stats.multiplier;
    const multColor = mult >= 4 ? '#ff007f' : mult >= 3 ? '#ffaa00' : mult >= 2 ? '#00f3ff' : '#64748b';
    ctx.fillStyle = multColor;
    ctx.shadowColor = multColor;
    ctx.font = '900 48px "Impact", sans-serif';
    ctx.fillText(`${this.stats.combo}  [${mult}X]`, w * 0.5, 105);

    // 3. ACCURACY (Right)
    ctx.textAlign = 'right';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 20px "Segoe UI", sans-serif';
    ctx.fillText('ACCURACY', w - 40, 50);

    ctx.fillStyle = '#00ffaa';
    ctx.shadowColor = '#00ffaa';
    ctx.font = '900 52px "Impact", sans-serif';
    ctx.fillText(`${this.stats.accuracy}%`, w - 40, 105);

    // 4. PROGRESS BAR & CURRENT MOVE (Bottom)
    ctx.textAlign = 'left';
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.shadowBlur = 0;
    ctx.fillText(`MOVE: ${this.currentMoveName.toUpperCase()}`, 40, 175);

    // Progress Bar Track
    const barX = 40;
    const barY = 195;
    const barW = w - 80;
    const barH = 18;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(barX, barY, barW, barH);

    // Progress Fill
    const fillW = barW * this.songProgress;
    const grad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
    grad.addColorStop(0, '#00f3ff');
    grad.addColorStop(1, '#ff007f');
    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, fillW, barH);

    // Progress Border
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.restore();
    this.texture.needsUpdate = true;
  }

  drawFuturisticBox(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.lineTo(x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.lineTo(x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.lineTo(x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.closePath();
  }

  reset() {
    this.stats = { score: 0, combo: 0, multiplier: 1, accuracy: 100, totalMoves: 0 };
    this.songProgress = 0;
    this.currentMoveName = 'GET READY';
    this.render();
  }
}
