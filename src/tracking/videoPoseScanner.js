/**
 * MediaPipe AI Video Pose Scanner
 * 
 * Scans uploaded MP4 dance videos frame-by-frame using MediaPipe Pose AI.
 * Extracts real dancer wrist and hand landmarks, normalizes them relative to the
 * dancer's torso, and produces exact 3D choreography checkpoints.
 */

export class VideoPoseScanner {
  constructor() {
    this.poseDetector = null;
    this.isInitialized = false;
    this.isScanning = false;
  }

  /**
   * Loads MediaPipe Pose from CDN or local bundle
   */
  async init() {
    if (this.isInitialized) return;

    if (!window.Pose) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js';
        script.crossOrigin = 'anonymous';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load MediaPipe Pose script.'));
        document.head.appendChild(script);
      });
    }

    this.poseDetector = new window.Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });

    this.poseDetector.setOptions({
      modelComplexity: 1, // 0 = Lite, 1 = Full, 2 = Heavy
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    await this.poseDetector.initialize();
    this.isInitialized = true;
    console.log('✅ MediaPipe Pose AI initialized successfully!');
  }

  /**
   * Scans a video element across its duration and extracts dancer hand coordinates
   * @param {HTMLVideoElement} videoElement
   * @param {object} options { bpm, intervalSeconds, mirror, onProgress }
   * @returns {Promise<Array>} List of generated keyframes with real 3D coordinates
   */
  async scanVideo(videoElement, options = {}) {
    await this.init();

    this.isScanning = true;

    // Ensure full metadata is loaded so we scan the whole song!
    if (!Number.isFinite(videoElement.duration) || videoElement.duration < 2) {
      await new Promise(r => {
        videoElement.addEventListener('loadedmetadata', r, { once: true });
        setTimeout(r, 2000);
      });
    }

    const duration = (Number.isFinite(videoElement.duration) && videoElement.duration > 2)
      ? videoElement.duration
      : 180.0;

    const bpm = options.bpm || 128;
    // Sample interval: every 2 beats
    const interval = options.intervalSeconds || (60 / bpm) * 2;
    const mirror = options.mirror !== false; // Mirror video by default like Just Dance coach

    const keyframes = [];
    let currentTime = 1.0; // Start 1s into the song
    let frameIndex = 0;

    // Create an offscreen canvas to feed frames cleanly
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');

    console.log(`Starting MediaPipe scan on ${duration.toFixed(1)}s video at ${interval.toFixed(2)}s intervals...`);

    while (currentTime < duration - 0.5 && this.isScanning) {
      // Seek video to exact timestamp
      await this.seekVideo(videoElement, currentTime);

      // Draw current video frame to canvas
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

      // Run MediaPipe Pose detection
      const landmarks = await this.detectFrame(canvas);

      if (landmarks) {
        // Landmark IDs:
        // 11: left_shoulder, 12: right_shoulder
        // 15: left_wrist, 16: right_wrist
        // 19: left_index, 20: right_index
        const ls = landmarks[11];
        const rs = landmarks[12];
        const lw = landmarks[15] || landmarks[19];
        const rw = landmarks[16] || landmarks[20];

        if (ls && rs && lw && rw) {
          const chestX = (ls.x + rs.x) / 2;
          const chestY = (ls.y + rs.y) / 2;
          const shoulderSpan = Math.max(0.12, Math.abs(rs.x - ls.x));
          const scale = 0.5 / shoulderSpan; // Normalize dancer scale to standard human reach

          // Map normalized coords to player 3D space:
          // In mirror mode: dancer's left side corresponds to player's right side
          let leftHandTarget, rightHandTarget;

          if (mirror) {
            // Mirroring: Player's left matches dancer's right
            leftHandTarget = {
              x: parseFloat((-(rw.x - chestX) * scale).toFixed(3)),
              y: parseFloat((1.35 - (rw.y - chestY) * scale).toFixed(3)),
              z: -0.45
            };
            rightHandTarget = {
              x: parseFloat((-(lw.x - chestX) * scale).toFixed(3)),
              y: parseFloat((1.35 - (lw.y - chestY) * scale).toFixed(3)),
              z: -0.45
            };
          } else {
            leftHandTarget = {
              x: parseFloat(((lw.x - chestX) * scale).toFixed(3)),
              y: parseFloat((1.35 - (lw.y - chestY) * scale).toFixed(3)),
              z: -0.45
            };
            rightHandTarget = {
              x: parseFloat(((rw.x - chestX) * scale).toFixed(3)),
              y: parseFloat((1.35 - (rw.y - chestY) * scale).toFixed(3)),
              z: -0.45
            };
          }

          // Clamp coordinates to natural human reach
          leftHandTarget.x = Math.max(-0.85, Math.min(0.85, leftHandTarget.x));
          leftHandTarget.y = Math.max(0.75, Math.min(1.95, leftHandTarget.y));
          rightHandTarget.x = Math.max(-0.85, Math.min(0.85, rightHandTarget.x));
          rightHandTarget.y = Math.max(0.75, Math.min(1.95, rightHandTarget.y));

          // Classify move name based on vertical elevation
          const moveName = this.classifyPoseName(leftHandTarget, rightHandTarget);

          keyframes.push({
            id: `ai_pose_${frameIndex}`,
            time: parseFloat(currentTime.toFixed(2)),
            duration: 0.45,
            moveName,
            color: frameIndex % 2 === 0 ? '#00f3ff' : '#ff007f',
            leftHand: leftHandTarget,
            rightHand: rightHandTarget,
            evaluated: false,
            scoreResult: null
          });
          frameIndex++;
        }
      }

      // Notify progress
      const percent = Math.min(100, Math.round((currentTime / duration) * 100));
      if (options.onProgress) {
        options.onProgress(currentTime, duration, percent, keyframes.length);
      }

      currentTime += interval;
    }

    this.isScanning = false;
    console.log(`Scan completed! Extracted ${keyframes.length} real dancer poses.`);
    return keyframes;
  }

  detectFrame(imageSource) {
    return new Promise((resolve) => {
      let resolved = false;

      const onResults = (results) => {
        if (resolved) return;
        resolved = true;
        resolve(results.poseLandmarks || null);
      };

      this.poseDetector.onResults(onResults);
      this.poseDetector.send({ image: imageSource }).catch(() => resolve(null));

      // Timeout safety
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      }, 500);
    });
  }

  seekVideo(video, time) {
    return new Promise((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked, { once: true });
      video.currentTime = time;

      // Timeout fallback
      setTimeout(resolve, 350);
    });
  }

  classifyPoseName(left, right) {
    const avgY = (left.y + right.y) / 2;
    if (left.y > 1.65 && right.y > 1.65) return 'Double Sky Reach';
    if (left.y > 1.60 && right.y < 1.15) return 'Disco High Left';
    if (right.y > 1.60 && left.y < 1.15) return 'Disco High Right';
    if (Math.abs(left.x - right.x) < 0.25 && avgY > 1.25) return 'Chest Cross X';
    if (Math.abs(left.x - right.x) > 1.1) return 'Wide Wings Open';
    if (avgY < 0.95) return 'Low Bass Drop';
    if (left.x < -0.45 && right.x < -0.2) return 'Left Groove Push';
    if (right.x > 0.45 && left.x > 0.2) return 'Right Groove Push';
    return 'Rhythm Strike';
  }

  cancel() {
    this.isScanning = false;
  }
}
