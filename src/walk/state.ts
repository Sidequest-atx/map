/** Cross-system frame state, written by the camera and lighting rigs and
    read by traffic, people, and effects. Mutable on purpose — per-frame. */
export const walkState = {
  /** world point the camera is focused on */
  focus: { x: 0, z: 340 },
  /** current walk station in meters */
  s: 0,
  /** the same station as a fraction of the whole walk */
  f: 0,
  /** 0 day → 1 full night (drives headlights, lamp glows) */
  night: 0,
  /** finale rise progress 0..1 */
  rise: 0,
  /** drone-prologue progress 0..1 (1 = handed off to the walk) */
  u: 1,
  /** world units across the viewport height — how tight the shot is */
  view: 48,
  /** an ambulance parked on the street: traffic queues behind it */
  incident: { active: false, lane: 1, s: 0 },
};

// A read-only handle for driving the scene from automation: scroll to a beat,
// wait for the damped camera to settle, and know exactly where it landed.
if (typeof window !== "undefined") (window as unknown as { __walk: typeof walkState }).__walk = walkState;
