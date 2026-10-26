import * as THREE from 'three';

/**
 * Handles WebXR Hand Tracking (bare hands), Controller Fallback,
 * and Desktop Preview Simulation.
 */
export class HandTracker {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;

    // Tracked player hands in world space
    this.leftHandWorldPos = new THREE.Vector3(-0.25, 1.25, -0.45);
    this.rightHandWorldPos = new THREE.Vector3(0.25, 1.25, -0.45);

    this.isLeftTracked = false;
    this.isRightTracked = false;

    // Simulation / Desktop Mode
    this.isDesktopSimulated = true;
    this.autoBotMode = false;
    this.mouseTarget = new THREE.Vector3(0.25, 1.25, -0.45);

    // Three.js XR Hand & Controller instances
    this.xrHands = [];
    this.xrControllers = [];

    // Visual avatars for player's hands
    this.leftHandVisual = null;
    this.rightHandVisual = null;

    this.initXRHandlers();
    this.createHandVisuals();
    this.setupDesktopControls();
  }

  initXRHandlers() {
    if (!this.renderer.xr) return;

    // Setup both hand slots (0 and 1)
    for (let i = 0; i < 2; i++) {
      const hand = this.renderer.xr.getHand(i);
      hand.userData = { index: i, handedness: 'unknown' };

      hand.addEventListener('connected', (event) => {
        const xrInputSource = event.data;
        hand.userData.inputSource = xrInputSource;
        if (xrInputSource.handedness) {
          hand.userData.handedness = xrInputSource.handedness;
        }
        console.log(`XR Hand ${i} connected (${xrInputSource.handedness})`);
        this.isDesktopSimulated = false;
      });

      hand.addEventListener('disconnected', () => {
        hand.userData.inputSource = null;
        console.log(`XR Hand ${i} disconnected`);
      });

      this.scene.add(hand);
      this.xrHands.push(hand);

      // Setup controller fallback
      const controller = this.renderer.xr.getController(i);
      controller.userData = { index: i, handedness: 'unknown', inputSource: null };
      controller.addEventListener('connected', (event) => {
        const xrInputSource = event.data;
        controller.userData.inputSource = xrInputSource;
        if (xrInputSource.handedness) {
          controller.userData.handedness = xrInputSource.handedness;
        }
        console.log(`XR Controller ${i} connected (${xrInputSource.handedness})`);
        this.isDesktopSimulated = false;
      });
      controller.addEventListener('disconnected', () => {
        controller.userData.inputSource = null;
      });
      this.scene.add(controller);
      this.xrControllers.push(controller);
    }
  }

  createHandVisuals() {
    // Stylized glowing orbs / palms for Left and Right player hands
    const createVisual = (colorHex) => {
      const group = new THREE.Group();

      // Core Palm Sphere
      const coreGeo = new THREE.SphereGeometry(0.045, 16, 16);
      const coreMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.8,
        roughness: 0.2,
        metalness: 0.8
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      group.add(coreMesh);

      // Outer Halo Ring
      const ringGeo = new THREE.TorusGeometry(0.065, 0.006, 12, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      group.add(ringMesh);

      // Point Light for dramatic hands-on-stage lighting
      const light = new THREE.PointLight(colorHex, 1.2, 1.5);
      group.add(light);

      group.userData = { coreMesh, ringMesh, light };
      this.scene.add(group);
      return group;
    };

    this.leftHandVisual = createVisual(0x00f3ff); // Cyan
    this.rightHandVisual = createVisual(0xff007f); // Magenta
  }

  setupDesktopControls() {
    let isMouseDown = false;
    let shiftDown = false;

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') shiftDown = true;
      if (e.key === 'b' || e.key === 'B') {
        this.autoBotMode = !this.autoBotMode;
        console.log(`Auto-Dancer Bot Mode: ${this.autoBotMode ? 'ON' : 'OFF'}`);
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') shiftDown = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDesktopSimulated) return;
      // Map normalized mouse to 3D space: x [-0.6, 0.6], y [0.8, 1.8], z -0.45
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = -(e.clientY / window.innerHeight) * 2 + 1;

      const targetX = nx * 0.7;
      const targetY = 1.35 + ny * 0.5;
      const targetZ = -0.45;

      if (shiftDown) {
        // Control Left Hand
        this.leftHandWorldPos.set(targetX, targetY, targetZ);
      } else {
        // Control Right Hand
        this.rightHandWorldPos.set(targetX, targetY, targetZ);
      }
    });
  }

  /**
   * Called each frame in the render loop to extract hand coordinates
   * @param {number} delta
   * @param {object} currentChoreoPose Optional choreo pose for Auto-Bot simulation
   */
  update(delta, currentChoreoPose = null) {
    const isPresenting = this.renderer.xr.isPresenting;

    if (isPresenting) {
      this.isDesktopSimulated = false;
      this.updateVRHands();
    } else {
      // Desktop Preview / Simulation Mode
      this.updateDesktopHands(delta, currentChoreoPose);
    }

    // Update 3D hand visual meshes
    if (this.leftHandVisual) {
      this.leftHandVisual.position.copy(this.leftHandWorldPos);
      this.leftHandVisual.visible = this.isLeftTracked || this.isDesktopSimulated;
      this.leftHandVisual.userData.ringMesh.rotation.z += delta * 2;
    }
    if (this.rightHandVisual) {
      this.rightHandVisual.position.copy(this.rightHandWorldPos);
      this.rightHandVisual.visible = this.isRightTracked || this.isDesktopSimulated;
      this.rightHandVisual.userData.ringMesh.rotation.z -= delta * 2;
    }
  }

  /**
   * Reads raw WebXR Hand Joints or XR Controllers
   */
  updateVRHands() {
    this.isLeftTracked = false;
    this.isRightTracked = false;

    // 1. Check Hand Tracking joints
    for (const hand of this.xrHands) {
      const handedness = hand.userData.handedness;
      let handPos = null;

      // Check if WebXR joints are available
      if (hand.joints) {
        // Use wrist, middle-finger-metacarpal, or index-finger-tip
        const joint = hand.joints['middle-finger-metacarpal'] || hand.joints['wrist'] || hand.joints['index-finger-tip'];
        if (joint) {
          handPos = new THREE.Vector3();
          joint.getWorldPosition(handPos);
        }
      }

      // If no joints yet, check hand group position
      if (!handPos && hand.visible) {
        handPos = new THREE.Vector3();
        hand.getWorldPosition(handPos);
      }

      if (handPos && handPos.lengthSq() > 0.001) {
        if (handedness === 'left') {
          this.leftHandWorldPos.copy(handPos);
          this.isLeftTracked = true;
        } else if (handedness === 'right') {
          this.rightHandWorldPos.copy(handPos);
          this.isRightTracked = true;
        }
      }
    }

    // 2. Fallback to XR Controllers if bare hands aren't reporting
    if (!this.isLeftTracked || !this.isRightTracked) {
      for (const controller of this.xrControllers) {
        const handedness = controller.userData.handedness;
        const ctrlPos = new THREE.Vector3();
        controller.getWorldPosition(ctrlPos);

        if (ctrlPos.lengthSq() > 0.001) {
          if (handedness === 'left' && !this.isLeftTracked) {
            this.leftHandWorldPos.copy(ctrlPos);
            this.isLeftTracked = true;
          } else if (handedness === 'right' && !this.isRightTracked) {
            this.rightHandWorldPos.copy(ctrlPos);
            this.isRightTracked = true;
          }
        }
      }
    }
  }

  /**
   * Simulation mode for desktop testing
   */
  updateDesktopHands(delta, choreoPose) {
    if (this.autoBotMode && choreoPose) {
      // Auto-dancer bot mirrors the choreography smoothly with small human jitter
      const humanNoiseL = (Math.sin(Date.now() * 0.005) * 0.02);
      const humanNoiseR = (Math.cos(Date.now() * 0.005) * 0.02);

      this.leftHandWorldPos.set(
        choreoPose.left.x + humanNoiseL,
        choreoPose.left.y,
        choreoPose.left.z
      );
      this.rightHandWorldPos.set(
        choreoPose.right.x + humanNoiseR,
        choreoPose.right.y,
        choreoPose.right.z
      );
      this.isLeftTracked = true;
      this.isRightTracked = true;
      return;
    }

    this.isLeftTracked = true;
    this.isRightTracked = true;
  }

  /**
   * Pulse visual hand feedback and trigger Quest controller haptic vibration
   */
  triggerHitFeedback(handSide, rating) {
    // 1. Visual pulse
    const visual = handSide === 'left' ? this.leftHandVisual : this.rightHandVisual;
    if (visual) {
      const scaleFactor = rating === 'PERFECT' ? 1.6 : 1.3;
      visual.scale.set(scaleFactor, scaleFactor, scaleFactor);

      setTimeout(() => {
        visual.scale.set(1.0, 1.0, 1.0);
      }, 120);
    }

    // 2. Physical Quest controller haptics
    this.triggerHapticFeedback(handSide, rating);
  }

  /**
   * Triggers physical haptic vibration pulse on WebXR controllers
   * @param {'left'|'right'} handSide
   * @param {'PERFECT'|'GREAT'|'GOOD'|'MISS'} rating
   */
  triggerHapticFeedback(handSide, rating) {
    let inputSource = null;

    // Check controllers first
    for (const ctrl of this.xrControllers) {
      if (ctrl.userData && ctrl.userData.handedness === handSide && ctrl.userData.inputSource) {
        inputSource = ctrl.userData.inputSource;
        break;
      }
    }

    // Check hands if not found
    if (!inputSource) {
      for (const hand of this.xrHands) {
        if (hand.userData && hand.userData.handedness === handSide && hand.userData.inputSource) {
          inputSource = hand.userData.inputSource;
          break;
        }
      }
    }

    // Check active session inputSources fallback
    if (!inputSource && this.renderer?.xr?.getSession) {
      const session = this.renderer.xr.getSession();
      if (session && session.inputSources) {
        for (const src of session.inputSources) {
          if (src.handedness === handSide) {
            inputSource = src;
            break;
          }
        }
      }
    }

    if (!inputSource || !inputSource.gamepad) return;

    const gamepad = inputSource.gamepad;

    // Map rating to intensity & duration
    let intensity = 0.5;
    let durationMs = 50;

    if (rating === 'PERFECT') {
      intensity = 1.0;
      durationMs = 80;
    } else if (rating === 'GREAT') {
      intensity = 0.7;
      durationMs = 60;
    } else if (rating === 'GOOD') {
      intensity = 0.4;
      durationMs = 40;
    } else if (rating === 'MISS') {
      intensity = 0.25;
      durationMs = 100;
    }

    try {
      if (gamepad.hapticActuators && gamepad.hapticActuators.length > 0) {
        gamepad.hapticActuators[0].pulse(intensity, durationMs);
      } else if (gamepad.vibrationActuator && typeof gamepad.vibrationActuator.playEffectWithParameters === 'function') {
        gamepad.vibrationActuator.playEffectWithParameters('dual-rumble', {
          startDelay: 0,
          duration: durationMs,
          weakMagnitude: intensity * 0.7,
          strongMagnitude: intensity
        });
      }
    } catch (e) {
      // Haptics not allowed or unsupported in current context
    }
  }
}
