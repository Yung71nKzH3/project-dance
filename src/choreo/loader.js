import { validateChoreography } from './schema.js';

export class ChoreographyLoader {
  constructor() {
    this.currentTrack = null;
    this.keyframes = [];
    this.heightOffset = 0; // Calibration offset for user height
  }

  /**
   * Load choreography JSON from a given URL or path
   * @param {string} url
   */
  async loadFromUrl(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch choreo file: ${response.statusText} (${response.status})`);
      }
      const data = await response.json();
      return this.loadFromJson(data);
    } catch (err) {
      console.error('Error loading choreography file:', err);
      throw err;
    }
  }

  /**
   * Parses and validates raw JSON object
   * @param {object} data
   */
  loadFromJson(data) {
    const validation = validateChoreography(data);
    if (!validation.valid) {
      throw new Error(`Invalid choreography data:\n${validation.errors.join('\n')}`);
    }

    // Clone and sort keyframes by ascending time
    this.currentTrack = { ...data };
    this.keyframes = [...data.keyframes]
      .sort((a, b) => a.time - b.time)
      .map((kf, index) => ({
        id: kf.id || `kf_${index}`,
        time: kf.time,
        duration: kf.duration || 0.45,
        moveName: kf.moveName || `Move ${index + 1}`,
        color: kf.color || (index % 2 === 0 ? '#00f3ff' : '#ff0077'),
        leftHand: { ...kf.leftHand },
        rightHand: { ...kf.rightHand },
        evaluated: false,
        scoreResult: null
      }));

    console.log(`Loaded track "${this.currentTrack.title}" with ${this.keyframes.length} keyframes.`);
    return this.currentTrack;
  }

  /**
   * Reset evaluation status of all keyframes (e.g. for song replay)
   */
  resetKeyframes() {
    this.keyframes.forEach(kf => {
      kf.evaluated = false;
      kf.scoreResult = null;
    });
  }

  /**
   * Sets player height calibration offset (in meters)
   * e.g., user is taller by +0.15m or seated by -0.30m
   */
  setHeightOffset(offset) {
    this.heightOffset = offset;
  }

  /**
   * Get upcoming keyframes within the lookahead window
   * @param {number} currentTime Current audio/video playback time in seconds
   * @param {number} lookahead Time window ahead in seconds (e.g. 2.0s)
   */
  getUpcomingKeyframes(currentTime, lookahead = 2.0) {
    return this.keyframes.filter(kf => {
      return kf.time >= (currentTime - 0.2) && kf.time <= (currentTime + lookahead);
    });
  }

  /**
   * Get the active keyframe that should be evaluated right now
   * @param {number} currentTime
   * @param {number} hitWindow Tolerance window around target time (seconds)
   */
  getActiveKeyframe(currentTime, hitWindow = 0.25) {
    return this.keyframes.find(kf => {
      return !kf.evaluated && Math.abs(currentTime - kf.time) <= hitWindow;
    });
  }

  /**
   * Check for any keyframe whose hit window has elapsed without being evaluated (a miss)
   * @param {number} currentTime
   * @param {number} hitWindow
   */
  getMissedKeyframes(currentTime, hitWindow = 0.25) {
    return this.keyframes.filter(kf => {
      return !kf.evaluated && (currentTime - kf.time) > hitWindow;
    });
  }

  /**
   * Interpolate 3D target coordinates for left and right hands smoothly at any given playback time
   * @param {number} currentTime
   * @returns {{ left: {x,y,z}, right: {x,y,z}, nextMove: string, progress: number } | null}
   */
  interpolatePose(currentTime) {
    if (this.keyframes.length === 0) return null;

    // Before first keyframe
    if (currentTime <= this.keyframes[0].time) {
      const kf = this.keyframes[0];
      return {
        left: { x: kf.leftHand.x, y: kf.leftHand.y + this.heightOffset, z: kf.leftHand.z },
        right: { x: kf.rightHand.x, y: kf.rightHand.y + this.heightOffset, z: kf.rightHand.z },
        nextMove: kf.moveName,
        progress: 0
      };
    }

    // After last keyframe
    const last = this.keyframes[this.keyframes.length - 1];
    if (currentTime >= last.time) {
      return {
        left: { x: last.leftHand.x, y: last.leftHand.y + this.heightOffset, z: last.leftHand.z },
        right: { x: last.rightHand.x, y: last.rightHand.y + this.heightOffset, z: last.rightHand.z },
        nextMove: 'Routine Complete',
        progress: 1
      };
    }

    // Find bounding keyframes
    let prev = this.keyframes[0];
    let next = this.keyframes[1];

    for (let i = 0; i < this.keyframes.length - 1; i++) {
      if (currentTime >= this.keyframes[i].time && currentTime <= this.keyframes[i + 1].time) {
        prev = this.keyframes[i];
        next = this.keyframes[i + 1];
        break;
      }
    }

    const tTotal = next.time - prev.time;
    const alpha = tTotal > 0 ? (currentTime - prev.time) / tTotal : 0;
    // Smooth cosine interpolation (ease in / ease out)
    const smoothAlpha = 0.5 * (1 - Math.cos(alpha * Math.PI));

    return {
      left: {
        x: prev.leftHand.x + (next.leftHand.x - prev.leftHand.x) * smoothAlpha,
        y: prev.leftHand.y + (next.leftHand.y - prev.leftHand.y) * smoothAlpha + this.heightOffset,
        z: prev.leftHand.z + (next.leftHand.z - prev.leftHand.z) * smoothAlpha
      },
      right: {
        x: prev.rightHand.x + (next.rightHand.x - prev.rightHand.x) * smoothAlpha,
        y: prev.rightHand.y + (next.rightHand.y - prev.rightHand.y) * smoothAlpha + this.heightOffset,
        z: prev.rightHand.z + (next.rightHand.z - prev.rightHand.z) * smoothAlpha
      },
      nextMove: next.moveName,
      progress: alpha
    };
  }
}
