// What the player is asking for: where the mouse is looking, which keys are down, and the presses
// since the last frame. Movement is reported in the player's own frame, so the actors module never
// reads the keyboard itself, and a headless capture can drive the game through the same door.
export function createInput(canvas) {
  const held = new Set();
  const taps = [];
  const look = { dx: 0, dy: 0, locked: false, aiming: false };

  canvas.addEventListener('click', () => {
    if (!look.locked && canvas.requestPointerLock) canvas.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    look.locked = document.pointerLockElement === canvas;
  });
  canvas.addEventListener('mousemove', (event) => {
    // With pointer lock the browser gives movement deltas; without it, a held button turns the view.
    if (look.locked || (event.buttons & 1)) {
      look.dx += event.movementX || 0;
      look.dy += event.movementY || 0;
    }
  });
  window.addEventListener('keydown', (event) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.code)) event.preventDefault();
    if (event.repeat) return;
    held.add(event.code);
    taps.push(event.code);
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => held.clear());
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      held.add('Fire');
      taps.push('Fire');
    }
    if (event.button === 2) {
      held.add('Aim');
      taps.push('Aim');
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) held.delete('Fire');
    if (event.button === 2) held.delete('Aim');
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    look,
    /** Which way the player is pressing: a vector in the player's own frame, plus their stance. */
    movement() {
      return {
        forward: (held.has('KeyW') ? 1 : 0) - (held.has('KeyS') ? 1 : 0),
        strafe: (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0),
        sprint: held.has('ShiftLeft') || held.has('ShiftRight'),
        crouch: held.has('ControlLeft') || held.has('KeyC'),
      };
    },
    /** True while the trigger is down, which is what an automatic weapon reads. */
    get firing() {
      return held.has('Fire');
    },
    /** True while aiming down the sights. */
    get aiming() {
      return held.has('Aim');
    },
    /** Clear the mouse movement once a frame has applied it. */
    consume() {
      look.dx = 0;
      look.dy = 0;
    },
    /** The presses since the last call, for the screens that navigate rather than fight. */
    takeTaps() {
      const out = taps.slice();
      taps.length = 0;
      return out;
    },
    /** Whether a key is down right now, for held menu actions. */
    isHeld(code) {
      return held.has(code);
    },
    /**
     * Turn this frame's presses into the match's own intents: fire, aim, reload, pause and the
     * weapon slots. Called once per frame, before the fixed steps run.
     */
    read(match) {
      for (const code of taps) {
        if (code === 'Fire') match.intent.fire = true;
        else if (code === 'Aim') match.intent.aim = true;
        else if (code === 'KeyR') match.intent.reload = true;
        else if (code === 'KeyP' || code === 'Escape') match.intent.pause = true;
        else if (code === 'Enter' || code === 'Space') match.intent.confirm = true;
        else if (/^Digit[1-7]$/.test(code)) match.intent.weapon = Number(code.slice(5)) - 1;
      }
      match.intent.holdFire = this.firing;
      match.intent.holdAim = this.aiming;
      taps.length = 0;
    },
  };
}
