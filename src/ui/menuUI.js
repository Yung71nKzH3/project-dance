/**
 * Start Menu, Video Upload & AI Pipeline Hub,
 * VR Mode Management, and Non-Intrusive Notification System.
 */
export class MenuUI {
  constructor(callbacks) {
    this.callbacks = callbacks || {}; // { onStartSong, onSelectTrack, onCustomFile, onCalibrateHeight, onToggleBot, onNotification }

    this.container = document.getElementById('menu-overlay');
    this.vrBtn = document.getElementById('btn-enter-vr');
    this.playBtn = document.getElementById('btn-play-song');
    this.trackSelect = document.getElementById('track-select');
    this.videoInput = document.getElementById('custom-video-input');
    this.videoUrlInput = document.getElementById('custom-video-url');
    this.dropzone = document.getElementById('upload-dropzone');
    this.dropzonePrompt = document.getElementById('dropzone-prompt');
    this.dropzoneLoaded = document.getElementById('dropzone-loaded');
    this.selectedVideoName = document.getElementById('selected-video-name');
    this.changeVideoBtn = document.getElementById('btn-change-video');
    this.heightSlider = document.getElementById('height-slider');
    this.heightVal = document.getElementById('height-val');
    this.botBtn = document.getElementById('btn-toggle-bot');
    this.hudOverlay = document.getElementById('desktop-hud');
    this.scanAiBtn = document.getElementById('btn-scan-ai');
    this.aiProgressContainer = document.getElementById('ai-scan-progress');
    this.aiFill = document.getElementById('ai-scan-fill');
    this.aiStatus = document.getElementById('ai-scan-status');

    // 2D Cyber Toast elements
    this.toastElem = document.getElementById('cyber-toast');
    this.toastIcon = document.getElementById('toast-icon');
    this.toastTitle = document.getElementById('toast-title');
    this.toastMessage = document.getElementById('toast-message');
    this.toastTimer = null;
    this.pcVideos = [];

    this.setupListeners();
    this.checkVRSupport();
    this.loadPCVideoLibrary();
  }

  /**
   * Discovers videos in the PC's `videos/` folder via Vite backend API
   */
  async loadPCVideoLibrary() {
    try {
      const res = await fetch('/api/videos');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !Array.isArray(data.videos)) return;

      this.pcVideos = data.videos;
      this.populateTrackSelect(data.videos);
    } catch (e) {
      console.log('PC Video Library API not active in this environment:', e.message);
    }
  }

  /**
   * Populates routine select with discovered PC videos and sample tracks
   */
  populateTrackSelect(pcVideos) {
    if (!this.trackSelect) return;

    const previousVal = this.trackSelect.value;
    this.trackSelect.innerHTML = '';

    // Group 1: PC Video Library
    const pcGroup = document.createElement('optgroup');
    pcGroup.label = `📁 PC Video Library (${pcVideos.length} in videos/ folder)`;

    if (pcVideos.length === 0) {
      const emptyOpt = document.createElement('option');
      emptyOpt.disabled = true;
      emptyOpt.textContent = '— Drop MP4s into videos/ folder on PC —';
      pcGroup.appendChild(emptyOpt);
    } else {
      for (const item of pcVideos) {
        const opt = document.createElement('option');
        opt.value = `pc:${item.filename}`;
        const choreoBadge = item.hasChoreo ? ' [Ready ✅]' : ' [Needs AI Scan 🤖]';
        opt.textContent = `${item.title} (${item.sizeMb}MB)${choreoBadge}`;
        pcGroup.appendChild(opt);
      }
    }
    this.trackSelect.appendChild(pcGroup);

    // Group 2: Built-in Sample Tracks
    const demoGroup = document.createElement('optgroup');
    demoGroup.label = '🎵 Built-in Sample Tracks';

    const track1Opt = document.createElement('option');
    track1Opt.value = 'track1';
    track1Opt.textContent = 'Cosmic Groove - 128 BPM (Medium)';
    demoGroup.appendChild(track1Opt);

    const track2Opt = document.createElement('option');
    track2Opt.value = 'track2';
    track2Opt.textContent = 'Electro Funk Step - 110 BPM (Beginner)';
    demoGroup.appendChild(track2Opt);

    this.trackSelect.appendChild(demoGroup);

    // Restore previous selection or pick first available PC video
    if (pcVideos.length > 0) {
      const match = pcVideos.find(v => `pc:${v.filename}` === previousVal);
      this.trackSelect.value = match ? previousVal : `pc:${pcVideos[0].filename}`;
      if (this.callbacks.onSelectTrack) {
        this.callbacks.onSelectTrack(this.trackSelect.value);
      }
      this.showNotification(
        'PC Video Library Ready',
        `Discovered ${pcVideos.length} video(s) in videos/ folder. Ready to stream to VR!`,
        'success',
        4000
      );
    } else {
      this.trackSelect.value = previousVal || 'track1';
    }
  }

  /**
   * Displays non-blocking, user-friendly cyber notification
   * @param {string} title
   * @param {string} message
   * @param {'info'|'success'|'warning'|'error'} type
   * @param {number} duration
   */
  showNotification(title, message, type = 'info', duration = 4000) {
    console.log(`[Notification - ${type.toUpperCase()}] ${title}: ${message}`);

    // Update 2D toast if present in DOM
    if (this.toastElem) {
      if (this.toastTimer) {
        clearTimeout(this.toastTimer);
      }

      this.toastElem.className = `cyber-toast toast-${type}`;
      if (this.toastTitle) this.toastTitle.textContent = title;
      if (this.toastMessage) this.toastMessage.textContent = message;

      const icons = {
        info: 'ℹ️',
        success: '✅',
        warning: '⚠️',
        error: '🛑'
      };
      if (this.toastIcon) this.toastIcon.textContent = icons[type] || 'ℹ️';

      this.toastElem.classList.remove('hidden');

      this.toastTimer = setTimeout(() => {
        this.toastElem.classList.add('hidden');
      }, duration);
    }

    // Forward to 3D in-VR notification board behind/beside the user
    if (this.callbacks.onNotification) {
      this.callbacks.onNotification(title, message, type);
    }
  }

  setupListeners() {
    // Play Song / Unlock Audio
    if (this.playBtn) {
      this.playBtn.addEventListener('click', () => {
        this.hide();
        if (this.callbacks.onStartSong) {
          this.callbacks.onStartSong();
        }
      });
    }

    // Enter VR
    if (this.vrBtn) {
      this.vrBtn.addEventListener('click', async () => {
        if (this.callbacks.onEnterVR) {
          await this.callbacks.onEnterVR();
        }
      });
    }

    // Sample Track Selector
    if (this.trackSelect) {
      this.trackSelect.addEventListener('change', (e) => {
        if (this.callbacks.onSelectTrack) {
          this.callbacks.onSelectTrack(e.target.value);
        }
      });
    }

    // Dropzone Drag & Drop
    if (this.dropzone && this.videoInput) {
      ['dragenter', 'dragover'].forEach(evtName => {
        this.dropzone.addEventListener(evtName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.dropzone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(evtName => {
        this.dropzone.addEventListener(evtName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.dropzone.classList.remove('dragover');
        });
      });

      this.dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          this.handleVideoFile(files[0]);
        }
      });

      this.videoInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) {
          this.handleVideoFile(file);
        }
      });
    }

    if (this.changeVideoBtn && this.videoInput) {
      this.changeVideoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.videoInput.click();
      });
    }

    // Custom Video URL
    if (this.videoUrlInput) {
      this.videoUrlInput.addEventListener('change', (e) => {
        const url = e.target.value.trim();
        if (url && this.callbacks.onCustomVideo) {
          this.callbacks.onCustomVideo(url);
          this.showNotification('Video URL Loaded', 'Custom video loaded. Ready for AI scanning!', 'success');
        }
      });
    }

    // Height Calibration
    if (this.heightSlider && this.heightVal) {
      this.heightSlider.addEventListener('input', (e) => {
        const offset = parseFloat(e.target.value);
        this.heightVal.textContent = `${offset >= 0 ? '+' : ''}${offset.toFixed(2)}m`;
        if (this.callbacks.onCalibrateHeight) {
          this.callbacks.onCalibrateHeight(offset);
        }
      });
    }

    // Auto-bot mode
    if (this.botBtn) {
      this.botBtn.addEventListener('click', () => {
        if (this.callbacks.onToggleBot) {
          const isBot = this.callbacks.onToggleBot();
          this.botBtn.textContent = `Auto-Bot Dancer: ${isBot ? 'ON' : 'OFF'}`;
          this.botBtn.classList.toggle('active', isBot);
        }
      });
    }

    // AI Video Scan with MediaPipe
    if (this.scanAiBtn) {
      this.scanAiBtn.addEventListener('click', async () => {
        if (!this.callbacks.onScanVideoAI) return;
        this.scanAiBtn.disabled = true;
        if (this.aiProgressContainer) this.aiProgressContainer.classList.remove('hidden');
        if (this.aiFill) this.aiFill.style.width = '0%';
        if (this.aiStatus) this.aiStatus.textContent = 'Initializing MediaPipe AI...';

        try {
          const keyframes = await this.callbacks.onScanVideoAI((current, total, percent, movesCount) => {
            if (this.aiFill) this.aiFill.style.width = `${percent}%`;
            if (this.aiStatus) this.aiStatus.textContent = `Scanning dancer poses... ${percent}% (Detected ${movesCount} moves)`;
          });

          if (keyframes) {
            if (this.aiStatus) this.aiStatus.textContent = `✅ Complete! Extracted ${keyframes.length} real dancer moves.`;
            this.showNotification(
              'AI Scan Complete!',
              `Extracted ${keyframes.length} real dance moves directly from your video. Ready to play!`,
              'success',
              5000
            );
          }
        } catch (err) {
          this.showNotification('AI Video Scan Error', err.message || 'Scan failed or cancelled', 'error', 6000);
          if (this.aiStatus) this.aiStatus.textContent = 'Scan failed or cancelled.';
        } finally {
          this.scanAiBtn.disabled = false;
        }
      });
    }
  }

  handleVideoFile(file) {
    if (!file) return;
    if (this.selectedVideoName) {
      this.selectedVideoName.textContent = file.name;
    }
    if (this.dropzonePrompt) this.dropzonePrompt.classList.add('hidden');
    if (this.dropzoneLoaded) this.dropzoneLoaded.classList.remove('hidden');

    this.showNotification('Video Loaded', `"${file.name}" loaded! Click Generate to create routine.`, 'info');

    if (this.callbacks.onCustomVideo) {
      this.callbacks.onCustomVideo(file);
    }
  }

  async checkVRSupport() {
    const isSecure = window.isSecureContext;

    if (!isSecure) {
      this.vrBtn.disabled = false;
      this.vrBtn.textContent = '⚠️ INSECURE SSL (USE REMOTE LINK)';
      this.vrBtn.classList.remove('vr-ready');
      return;
    }

    if ('xr' in navigator) {
      try {
        const supported = await navigator.xr.isSessionSupported('immersive-vr');
        if (supported) {
          this.vrBtn.disabled = false;
          this.vrBtn.textContent = '🥽 ENTER VR (QUEST READY)';
          this.vrBtn.classList.add('vr-ready');
        } else {
          this.vrBtn.disabled = false;
          this.vrBtn.textContent = 'VR Not Detected (Click for Help)';
        }
      } catch (e) {
        this.vrBtn.disabled = false;
        this.vrBtn.textContent = 'VR Check Failed (Click for Help)';
      }
    } else {
      this.vrBtn.disabled = false;
      this.vrBtn.textContent = 'WebXR Not Available (Click for Help)';
    }
  }

  show() {
    this.container.classList.remove('hidden');
    if (this.hudOverlay) this.hudOverlay.classList.add('hidden');
  }

  hide() {
    this.container.classList.add('hidden');
    if (this.hudOverlay) this.hudOverlay.classList.remove('hidden');
  }
}
