import * as THREE from 'three';

/**
 * Evaluates hand positions against target keyframes frame-by-frame,
 * assigns accuracy ratings (PERFECT / GREAT / GOOD / MISS),
 * updates score, combo, streak, and triggers audio/visual celebrations.
 */
export class ScoringEngine {
  constructor(scene, audioSynth, targetManager, handTracker) {
    this.scene = scene;
    this.audioSynth = audioSynth;
    this.targetManager = targetManager;
    this.handTracker = handTracker;

    // Thresholds (in meters)
    this.thresholds = {
      PERFECT: 0.14,  // within 14cm
      GREAT: 0.24,    // within 24cm
      GOOD: 0.35      // within 35cm
    };

    // Points
    this.points = {
      PERFECT: 100,
      GREAT: 75,
      GOOD: 45,
      MISS: 0
    };

    // Game Stats
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.totalMoves = 0;
    this.ratingCounts = {
      PERFECT: 0,
      GREAT: 0,
      GOOD: 0,
      MISS: 0
    };

    // 3D Floating Rating Feedback Popups
    this.feedbackGroup = new THREE.Group();
    this.scene.add(this.feedbackGroup);

    // Reusable popup billboard canvas & sprite
    this.popupSprites = [];
    this.initPopupSprites();

    // Callbacks for HUD updates
    this.onScoreUpdate = null;
  }

  initPopupSprites() {
    for (let i = 0; i < 8; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 256;
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        depthTest: false
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(0.65, 0.325, 1);
      sprite.visible = false;
      this.feedbackGroup.add(sprite);

      this.popupSprites.push({
        sprite,
        canvas,
        ctx: canvas.getContext('2d'),
        texture,
        active: false,
        startTime: 0,
        startY: 0
      });
    }
  }

  reset() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.totalMoves = 0;
    this.ratingCounts = { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 };
    for (const p of this.popupSprites) {
      p.active = false;
      p.sprite.visible = false;
    }
    if (this.onScoreUpdate) {
      this.onScoreUpdate(this.getStats());
    }
  }

  getMultiplier() {
    if (this.combo >= 20) return 4;
    if (this.combo >= 10) return 3;
    if (this.combo >= 5) return 2;
    return 1;
  }

  getStats() {
    const hits = this.ratingCounts.PERFECT + this.ratingCounts.GREAT + this.ratingCounts.GOOD;
    const accuracy = this.totalMoves > 0 ? Math.round((hits / this.totalMoves) * 100) : 100;
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      multiplier: this.getMultiplier(),
      accuracy,
      totalMoves: this.totalMoves,
      counts: { ...this.ratingCounts }
    };
  }

  /**
   * Main per-frame scoring evaluation
   * @param {number} currentTime
   * @param {ChoreographyLoader} choreoLoader
   */
  update(currentTime, choreoLoader) {
    if (!choreoLoader) return;

    // 1. Check for Active Keyframe to Evaluate
    const activeKf = choreoLoader.getActiveKeyframe(currentTime, 0.20);
    if (activeKf) {
      this.evaluateKeyframe(activeKf);
    }

    // 2. Check for Missed Keyframes (time window passed without hitting)
    const missedKfs = choreoLoader.getMissedKeyframes(currentTime, 0.22);
    for (const missed of missedKfs) {
      this.registerMiss(missed);
    }

    // 3. Update floating 3D popup animations
    this.updatePopups();
  }

  /**
   * Evaluates player's relative hand geometry against the target pose
   * (Direction of one hand relative to the other, height ordering, crossing, and spread)
   * Allows the player to flow in their own space without being trapped by rigid world dots!
   * @param {object} keyframe
   */
  evaluateKeyframe(keyframe) {
    const userLeft = this.handTracker.leftHandWorldPos;
    const userRight = this.handTracker.rightHandWorldPos;

    const targetLeft = new THREE.Vector3(keyframe.leftHand.x, keyframe.leftHand.y, keyframe.leftHand.z);
    const targetRight = new THREE.Vector3(keyframe.rightHand.x, keyframe.rightHand.y, keyframe.rightHand.z);

    // 1. Relative Direction Vectors (Right Hand relative to Left Hand)
    const vecTarget = new THREE.Vector3().subVectors(targetRight, targetLeft);
    const vecUser = new THREE.Vector3().subVectors(userRight, userLeft);

    const lenTarget = Math.max(0.01, vecTarget.length());
    const lenUser = Math.max(0.01, vecUser.length());

    // 2. 3D Direction Cosine Similarity (-1.0 to +1.0)
    const dirTarget = vecTarget.clone().normalize();
    const dirUser = vecUser.clone().normalize();
    const similarity = dirTarget.dot(dirUser);

    // 3. Vertical Height Ordering (Is Right Hand above Left, below, or level?)
    const dY_target = targetRight.y - targetLeft.y;
    const dY_user = userRight.y - userLeft.y;
    const targetIsLevel = Math.abs(dY_target) < 0.16;
    const userIsLevel = Math.abs(dY_user) < 0.18;
    const verticalMatch = (targetIsLevel && userIsLevel) || (Math.sign(dY_target) === Math.sign(dY_user));

    // 4. Lateral Crossing (Are arms crossed in front of chest?)
    const targetCrossed = (targetRight.x - targetLeft.x) < 0;
    const userCrossed = (userRight.x - userLeft.x) < 0;
    const crossingMatch = targetCrossed === userCrossed;

    // 5. Elevation Zone (Are hands High above head, Mid-chest, or Low-hips?)
    const avgY_target = (targetLeft.y + targetRight.y) / 2;
    const avgY_user = (userLeft.y + userRight.y) / 2;
    const elevationDiff = Math.abs(avgY_target - avgY_user);
    const elevationMatch = elevationDiff < 0.45; // Forgiving for standing or sitting players

    // Relative Pose Rating:
    let overallRating = 'MISS';
    if (similarity >= 0.70 && verticalMatch && crossingMatch && elevationMatch) {
      overallRating = 'PERFECT';
    } else if (similarity >= 0.40 && verticalMatch && crossingMatch) {
      overallRating = 'GREAT';
    } else if (verticalMatch && (elevationMatch || crossingMatch)) {
      overallRating = 'GOOD';
    }

    // Only mark evaluated if at least GOOD or better
    if (overallRating !== 'MISS') {
      keyframe.evaluated = true;
      keyframe.scoreResult = overallRating;

      // Spawn rating feedback right above the player's own hands!
      this.recordHit(overallRating, keyframe, userLeft, userRight);
    }
  }

  getRatingFromDistance(dist) {
    if (dist <= this.thresholds.PERFECT) return 'PERFECT';
    if (dist <= this.thresholds.GREAT) return 'GREAT';
    if (dist <= this.thresholds.GOOD) return 'GOOD';
    return 'MISS';
  }

  recordHit(rating, keyframe, targetLeft, targetRight) {
    this.totalMoves++;
    this.combo++;
    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo;
    }

    const mult = this.getMultiplier();
    const pts = this.points[rating] * mult;
    this.score += pts;
    this.ratingCounts[rating]++;

    // Play SFX
    this.audioSynth.playHitSound(rating);
    if (this.combo > 0 && this.combo % 5 === 0) {
      this.audioSynth.playComboMilestone();
    }

    // Trigger visual particle bursts on targets
    const colL = 0x00f3ff;
    const colR = 0xff007f;
    this.targetManager.triggerHitBurst(targetLeft, colL);
    this.targetManager.triggerHitBurst(targetRight, colR);

    // Hand pulse feedback
    this.handTracker.triggerHitFeedback('left', rating);
    this.handTracker.triggerHitFeedback('right', rating);

    // Spawn 3D floating rating popup in front of player
    const midPoint = new THREE.Vector3().addVectors(targetLeft, targetRight).multiplyScalar(0.5);
    midPoint.y += 0.25; // float above hands
    this.spawn3DPopup(rating, pts, midPoint, keyframe.moveName);

    if (this.onScoreUpdate) {
      this.onScoreUpdate(this.getStats());
    }
  }

  registerMiss(keyframe) {
    keyframe.evaluated = true;
    keyframe.scoreResult = 'MISS';

    this.totalMoves++;
    this.combo = 0;
    this.ratingCounts.MISS++;

    this.audioSynth.playHitSound('MISS');

    const midPoint = new THREE.Vector3(
      (keyframe.leftHand.x + keyframe.rightHand.x) * 0.5,
      (keyframe.leftHand.y + keyframe.rightHand.y) * 0.5 + 0.2,
      (keyframe.leftHand.z + keyframe.rightHand.z) * 0.5
    );
    this.spawn3DPopup('MISS', 0, midPoint, keyframe.moveName);

    if (this.onScoreUpdate) {
      this.onScoreUpdate(this.getStats());
    }
  }

  /**
   * Spawns an animated 3D sprite with custom canvas typography
   */
  spawn3DPopup(rating, pts, worldPos, moveName) {
    const popup = this.popupSprites.find(p => !p.active) || this.popupSprites[0];
    popup.active = true;
    popup.startTime = performance.now();
    popup.startY = worldPos.y;

    popup.sprite.position.copy(worldPos);
    popup.sprite.visible = true;

    // Render Canvas graphic for rating badge
    const ctx = popup.ctx;
    const w = popup.canvas.width;
    const h = popup.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Glow and Colors
    let color = '#00f3ff';
    let label = 'PERFECT!';
    if (rating === 'GREAT') {
      color = '#ffdd00';
      label = 'GREAT!';
    } else if (rating === 'GOOD') {
      color = '#00ff88';
      label = 'GOOD';
    } else if (rating === 'MISS') {
      color = '#ff0055';
      label = 'MISS';
    }

    // Badge styling
    ctx.shadowBlur = 20;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.font = '900 68px "Impact", "Arial Black", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w * 0.5, h * 0.42);

    // Points label
    if (pts > 0) {
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px system-ui, sans-serif';
      ctx.fillText(`+${pts}`, w * 0.5, h * 0.78);
    }

    popup.texture.needsUpdate = true;
  }

  updatePopups() {
    const now = performance.now();
    const duration = 750; // ms

    for (const popup of this.popupSprites) {
      if (!popup.active) continue;

      const elapsed = now - popup.startTime;
      if (elapsed >= duration) {
        popup.active = false;
        popup.sprite.visible = false;
        continue;
      }

      const t = elapsed / duration;
      // Float upwards gently
      popup.sprite.position.y = popup.startY + (t * 0.35);

      // Pop scale: quick pop up then settle
      const scale = t < 0.2 ? (t / 0.2) * 1.2 : 1.2 - ((t - 0.2) / 0.8) * 0.2;
      popup.sprite.scale.set(0.65 * scale, 0.325 * scale, 1);

      // Fade out near end
      popup.sprite.material.opacity = t > 0.6 ? 1.0 - ((t - 0.6) / 0.4) : 1.0;
    }
  }
}
