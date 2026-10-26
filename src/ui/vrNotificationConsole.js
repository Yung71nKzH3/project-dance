import * as THREE from 'three';

/**
 * 3D Holographic In-VR Notification & Error Console
 * 
 * Placed behind the user (z = +2.2m) in virtual space.
 * Eliminates intrusive 2D pop-up alerts that break VR immersion,
 * allowing the player to simply turn around to view system notices,
 * AI scan statuses, and diagnostic logs.
 */
export class VRNotificationConsole {
  constructor(scene) {
    this.scene = scene;

    this.width = 1.4;
    this.height = 0.8;
    this.canvasWidth = 700;
    this.canvasHeight = 400;

    // Off-screen canvas for dynamic text rendering
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvasWidth;
    this.canvas.height = this.canvasHeight;
    this.ctx = this.canvas.getContext('2d');

    // Canvas texture & material
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;

    // 3D Panel Mesh
    const geometry = new THREE.PlaneGeometry(this.width, this.height);
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    // Positioned behind the player (z = +2.2m), at eye level (y = 1.65m), rotated to face user
    this.mesh.position.set(0, 1.65, 2.2);
    this.mesh.rotation.y = Math.PI;

    // Glowing wireframe border
    const borderGeo = new THREE.EdgesGeometry(geometry);
    this.borderMaterial = new THREE.LineBasicMaterial({
      color: 0x00f3ff,
      linewidth: 2,
      transparent: true,
      opacity: 0.6
    });
    this.borderLine = new THREE.LineSegments(borderGeo, this.borderMaterial);
    this.mesh.add(this.borderLine);

    this.scene.add(this.mesh);

    this.history = [];
    this.currentNotice = {
      title: 'SYSTEM READY',
      message: 'Cyber Groove VR initialized. Drop dance videos to generate routines.',
      type: 'info',
      time: '00:00'
    };

    this.render();
  }

  /**
   * Display a new notification or diagnostic message
   * @param {string} title
   * @param {string} message
   * @param {'info'|'success'|'warning'|'error'} type
   */
  show(title, message, type = 'info') {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    this.currentNotice = { title, message, type, time: timeStr };
    this.history.unshift(this.currentNotice);
    if (this.history.length > 5) {
      this.history.pop();
    }

    const typeColors = {
      info: 0x00f3ff,
      success: 0x10b981,
      warning: 0xf59e0b,
      error: 0xef4444
    };
    if (this.borderMaterial) {
      this.borderMaterial.color.setHex(typeColors[type] || 0x00f3ff);
    }

    this.render();
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    ctx.clearRect(0, 0, w, h);

    // Background Cyber Panel
    ctx.fillStyle = 'rgba(7, 11, 25, 0.92)';
    ctx.beginPath();
    ctx.roundRect(10, 10, w - 20, h - 20, 16);
    ctx.fill();

    // Top Title Bar
    ctx.fillStyle = 'rgba(0, 243, 255, 0.12)';
    ctx.fillRect(10, 10, w - 20, 56);

    const typeColors = {
      info: '#00f3ff',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444'
    };
    const activeColor = typeColors[this.currentNotice.type] || '#00f3ff';

    // Top bar text
    ctx.fillStyle = activeColor;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('📡 SYSTEM CONSOLE & DIAGNOSTICS', 30, 38);

    ctx.textAlign = 'right';
    ctx.font = '16px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(this.currentNotice.time, w - 30, 38);

    // Active Message Box
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(30, 84, w - 60, 160, 12);
    ctx.fill();

    ctx.strokeStyle = activeColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Message Title
    ctx.textAlign = 'left';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillStyle = activeColor;
    ctx.fillText(this.currentNotice.title, 50, 122);

    // Message Body (Wrap text)
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillStyle = '#f8fafc';
    this.wrapText(ctx, this.currentNotice.message, 50, 165, w - 100, 28);

    // Recent Log Section
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('RECENT LOGS', 30, 275);

    let logY = 305;
    for (let i = 1; i < Math.min(this.history.length, 4); i++) {
      const entry = this.history[i];
      const col = typeColors[entry.type] || '#94a3b8';
      ctx.fillStyle = col;
      ctx.font = '15px monospace';
      const snippet = entry.message.length > 55 ? entry.message.slice(0, 55) + '...' : entry.message;
      ctx.fillText(`[${entry.time}] ${entry.title}: ${snippet}`, 30, logY);
      logY += 26;
    }

    this.texture.needsUpdate = true;
  }

  wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = (text || '').split(' ');
    let line = '';

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
  }
}
