/**
 * Just Dance Video Snapshot Studio & Auto-Pose Extractor
 * 
 * Allows users to:
 * 1. Automatically extract snapshot checkpoints from dance videos (every 2, 4, or 8 beats).
 * 2. Scrub video frames and take custom snapshots of dance poses.
 * 3. Export the extracted choreography to standard JSON.
 * 4. Browse captured dance photos/polaroids.
 */
export class SnapshotStudio {
  constructor(videoManager, choreoLoader, snapshotEngine, onStartRoutine) {
    this.videoManager = videoManager;
    this.choreoLoader = choreoLoader;
    this.snapshotEngine = snapshotEngine;
    this.onStartRoutine = onStartRoutine;

    this.modal = document.getElementById('snapshot-studio-modal');
    this.openBtn = document.getElementById('btn-open-studio');
    this.closeBtn = document.getElementById('btn-close-studio');
    this.autoExtractBtn = document.getElementById('btn-auto-extract');
    this.scrubSlider = document.getElementById('studio-scrub-slider');
    this.scrubTimeLabel = document.getElementById('studio-scrub-time');
    this.snapCurrentBtn = document.getElementById('btn-snap-current');
    this.exportJsonBtn = document.getElementById('btn-export-json');
    this.playExtractedBtn = document.getElementById('btn-play-extracted');
    this.previewCanvas = document.getElementById('studio-preview-canvas');
    this.previewCtx = this.previewCanvas.getContext('2d');
    this.snapshotsListContainer = document.getElementById('studio-snapshots-list');
    this.beatsPerSnapSelect = document.getElementById('beats-per-snap');

    // Extracted checkpoints in this studio session
    this.studioCheckpoints = [];
    this.selectedPoseStyle = 'reach';

    this.setupListeners();
  }

  setupListeners() {
    if (this.openBtn) {
      this.openBtn.addEventListener('click', () => this.open());
    }
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    // Auto-Extract Button
    if (this.autoExtractBtn) {
      this.autoExtractBtn.addEventListener('click', () => {
        const beats = parseInt(this.beatsPerSnapSelect.value, 10) || 4;
        const bpm = this.choreoLoader.currentTrack?.bpm || 128;
        const duration = this.choreoLoader.currentTrack?.duration || 48.0;

        const generated = this.snapshotEngine.generateSnapshotsFromBeat(bpm, duration, beats);
        this.studioCheckpoints = [...generated];
        this.renderSnapshotsList();
        console.log(`Successfully extracted ${generated.length} snapshots across ${duration}s video!`);
      });
    }

    // Scrub Timeline
    if (this.scrubSlider) {
      this.scrubSlider.addEventListener('input', (e) => {
        const time = parseFloat(e.target.value);
        this.scrubTimeLabel.textContent = `${time.toFixed(1)}s`;
        this.updatePreviewAtTime(time);
      });
    }

    // Snap Current Frame Button
    if (this.snapCurrentBtn) {
      this.snapCurrentBtn.addEventListener('click', () => {
        const time = parseFloat(this.scrubSlider.value);
        this.snapFrameAtTime(time);
      });
    }

    // Export JSON Button
    if (this.exportJsonBtn) {
      this.exportJsonBtn.addEventListener('click', () => this.exportJson());
    }

    // Play Extracted Routine Now Button
    if (this.playExtractedBtn) {
      this.playExtractedBtn.addEventListener('click', () => {
        if (this.studioCheckpoints.length === 0) {
          console.warn('Please extract or add at least one snapshot first!');
          return;
        }

        // Convert snapshots to choreography keyframes
        const newTrack = {
          id: `custom_snapshot_${Date.now()}`,
          title: 'Custom Video Snapshot Routine',
          artist: 'Player Auto-Choreography',
          bpm: this.choreoLoader.currentTrack?.bpm || 128,
          duration: this.choreoLoader.currentTrack?.duration || 48.0,
          videoSrc: 'procedural',
          keyframes: this.studioCheckpoints.map(cp => ({
            time: cp.time,
            duration: 0.5,
            moveName: cp.moveName,
            color: '#00f3ff',
            leftHand: { ...cp.leftHand },
            rightHand: { ...cp.rightHand }
          }))
        };

        this.choreoLoader.loadFromJson(newTrack);
        this.snapshotEngine.setCheckpointsFromKeyframes(newTrack.keyframes);
        this.close();
        if (this.onStartRoutine) {
          this.onStartRoutine();
        }
      });
    }
  }

  open() {
    this.modal.classList.remove('hidden');
    const dur = this.choreoLoader.currentTrack?.duration || 48.0;
    this.scrubSlider.max = dur;
    this.scrubSlider.value = 0;
    this.scrubTimeLabel.textContent = '0.0s';

    // Populate with current checkpoints if any
    if (this.snapshotEngine.checkpoints.length > 0) {
      this.studioCheckpoints = [...this.snapshotEngine.checkpoints];
      this.renderSnapshotsList();
    }

    this.updatePreviewAtTime(0);
  }

  close() {
    this.modal.classList.add('hidden');
  }

  updatePreviewAtTime(time) {
    const ctx = this.previewCtx;
    const w = this.previewCanvas.width;
    const h = this.previewCanvas.height;

    // Draw video or procedural animation frame
    if (this.videoManager.isProcedural) {
      this.videoManager.renderProceduralStage(time, this.choreoLoader.currentTrack?.bpm || 128);
      ctx.drawImage(this.videoManager.animCanvas, 0, 0, w, h);
    } else {
      this.videoManager.setCurrentTime(time);
      ctx.drawImage(this.videoManager.videoElement, 0, 0, w, h);
    }

    // Overlay snapshot reticles
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(10, 10, 160, 30);
    ctx.fillStyle = '#00f3ff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`Time: ${time.toFixed(2)}s`, 18, 30);
  }

  snapFrameAtTime(time) {
    const moveName = prompt('Enter a name for this dance move pose:', `Pose @ ${time.toFixed(1)}s`) || `Pose @ ${time.toFixed(1)}s`;

    // Estimate hand positions from pose interpolation or template
    const pose = this.choreoLoader.interpolatePose(time) || {
      left: { x: -0.35, y: 1.4, z: -0.45 },
      right: { x: 0.35, y: 1.4, z: -0.45 }
    };

    const newSnap = {
      id: `snap_${Date.now()}`,
      time: parseFloat(time.toFixed(2)),
      moveName,
      leftHand: { ...pose.left },
      rightHand: { ...pose.right },
      evaluated: false,
      result: null
    };

    this.studioCheckpoints.push(newSnap);
    this.studioCheckpoints.sort((a, b) => a.time - b.time);
    this.renderSnapshotsList();
  }

  renderSnapshotsList() {
    this.snapshotsListContainer.innerHTML = '';

    if (this.studioCheckpoints.length === 0) {
      this.snapshotsListContainer.innerHTML = '<div class="empty-hint">No snapshots extracted yet. Click "Auto-Extract" or scrub video to add one!</div>';
      return;
    }

    this.studioCheckpoints.forEach((cp, idx) => {
      const card = document.createElement('div');
      card.className = 'snapshot-item-card';
      card.innerHTML = `
        <div class="snap-badge">#${idx + 1} &bull; ${cp.time.toFixed(1)}s</div>
        <div class="snap-title">${cp.moveName}</div>
        <div class="snap-coords">
          <span style="color: #00f3ff">L: [${cp.leftHand.x.toFixed(2)}, ${cp.leftHand.y.toFixed(2)}]</span>
          <span style="color: #ff007f">R: [${cp.rightHand.x.toFixed(2)}, ${cp.rightHand.y.toFixed(2)}]</span>
        </div>
        <button class="btn-remove-snap" data-idx="${idx}">✕</button>
      `;

      card.querySelector('.btn-remove-snap').addEventListener('click', (e) => {
        e.stopPropagation();
        this.studioCheckpoints.splice(idx, 1);
        this.renderSnapshotsList();
      });

      card.addEventListener('click', () => {
        this.scrubSlider.value = cp.time;
        this.scrubTimeLabel.textContent = `${cp.time.toFixed(1)}s`;
        this.updatePreviewAtTime(cp.time);
      });

      this.snapshotsListContainer.appendChild(card);
    });
  }

  exportJson() {
    if (this.studioCheckpoints.length === 0) {
      console.warn('No snapshots to export.');
      return;
    }

    const choreoData = {
      id: `dance_snapshots_${Date.now()}`,
      title: 'Extracted Video Snapshots Routine',
      artist: 'Video Snapshot Studio',
      bpm: this.choreoLoader.currentTrack?.bpm || 128,
      duration: this.choreoLoader.currentTrack?.duration || 48.0,
      difficulty: 'Medium',
      videoSrc: 'procedural',
      keyframes: this.studioCheckpoints.map(cp => ({
        time: cp.time,
        duration: 0.5,
        moveName: cp.moveName,
        color: '#00f3ff',
        leftHand: { ...cp.leftHand },
        rightHand: { ...cp.rightHand }
      }))
    };

    const jsonStr = JSON.stringify(choreoData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'extracted_choreography.json';
    a.click();
    URL.revokeObjectURL(url);
  }
}
