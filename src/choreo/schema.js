/**
 * Choreography Data Schema & Types
 * Represents timestamped 3D coordinates for both hands in a dance routine.
 * 
 * Coordinate Reference System:
 * - x: Negative is player's Left, Positive is player's Right (e.g., -0.35m to +0.35m)
 * - y: Elevation from floor in meters (e.g., 0.8m is waist, 1.3m is chest, 1.7m is above head)
 * - z: Depth from player torso (Negative is in front, e.g. -0.35m to -0.65m)
 */

export const CHOREO_SCHEMA_VERSION = "1.0.0";

/**
 * Validates whether a raw JSON object satisfies the choreography schema.
 * @param {object} data - Parsed JSON object
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateChoreography(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Choreography data must be an object'] };
  }

  if (!data.title || typeof data.title !== 'string') {
    errors.push('Missing or invalid property: title (string required)');
  }

  if (!data.bpm || typeof data.bpm !== 'number' || data.bpm <= 0) {
    errors.push('Missing or invalid property: bpm (positive number required)');
  }

  if (!Array.isArray(data.keyframes) || data.keyframes.length === 0) {
    errors.push('Missing or invalid property: keyframes (non-empty array required)');
  } else {
    data.keyframes.forEach((kf, idx) => {
      if (typeof kf.time !== 'number' || kf.time < 0) {
        errors.push(`Keyframe #${idx}: missing or invalid "time" (positive number required)`);
      }
      if (!kf.leftHand || typeof kf.leftHand.x !== 'number' || typeof kf.leftHand.y !== 'number' || typeof kf.leftHand.z !== 'number') {
        errors.push(`Keyframe #${idx} (${kf.moveName || 'unnamed'}): invalid leftHand coordinates {x, y, z}`);
      }
      if (!kf.rightHand || typeof kf.rightHand.x !== 'number' || typeof kf.rightHand.y !== 'number' || typeof kf.rightHand.z !== 'number') {
        errors.push(`Keyframe #${idx} (${kf.moveName || 'unnamed'}): invalid rightHand coordinates {x, y, z}`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
