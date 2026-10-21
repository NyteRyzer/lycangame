// Keyboard + mouse (pointer lock) + gamepad, merged into one action map.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered this frame
    this.released = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseButtons = new Set();
    this.mousePressed = new Set();
    this.mouseReleased = new Set();
    this.locked = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.gamepad = null;
    this._padPrev = [];
    this.padPressed = new Set();
    this.padReleased = new Set();
    this.padButtons = new Set();

    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code === 'AltLeft' || (e.ctrlKey && e.code !== 'KeyC')) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    });
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouseButtons.clear();
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1) e.preventDefault(); // no autoscroll on middle-click lock-on
      if (!this.locked && this.wantLock) canvas.requestPointerLock?.();
      this.mouseButtons.add(e.button);
      this.mousePressed.add(e.button);
    });
    addEventListener('mouseup', (e) => {
      this.mouseButtons.delete(e.button);
      this.mouseReleased.add(e.button);
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    this.wantLock = true;
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    this.gamepad = null;
    for (const p of pads) if (p && p.connected) { this.gamepad = p; break; }
    this.padPressed.clear();
    this.padReleased.clear();
    this.padButtons.clear();
    if (!this.gamepad) return;
    this.gamepad.buttons.forEach((b, i) => {
      const down = b.pressed || b.value > 0.5;
      if (down) this.padButtons.add(i);
      if (down && !this._padPrev[i]) this.padPressed.add(i);
      if (!down && this._padPrev[i]) this.padReleased.add(i);
      this._padPrev[i] = down;
    });
  }

  _axis(i) {
    if (!this.gamepad) return 0;
    const v = this.gamepad.axes[i] || 0;
    return Math.abs(v) < 0.15 ? 0 : v;
  }

  // movement vector in local space: x = strafe, y = forward
  move() {
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    x += this._axis(0);
    y -= this._axis(1);
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  look() {
    const k = 0.0022 * this.sensitivity;
    let dx = this.mouseDX * k, dy = this.mouseDY * k;
    dx += this._axis(2) * 0.045 * this.sensitivity;
    dy += this._axis(3) * 0.035 * this.sensitivity;
    if (this.invertY) dy = -dy;
    return { dx, dy };
  }

  // Named actions. Gamepad layout follows the standard mapping (Xbox labels):
  // A jump · B dash/slide · X claw · Y heavy · LB block · RB howl · LT sprint
  // RT Moonfire · LS senses · RS lock-on · D-pad: up transform, down
  // interact, left grab, right frenzy · Back skills · Start pause.
  down(action) {
    const k = this.keys, m = this.mouseButtons, p = this.padButtons;
    switch (action) {
      case 'sprint': return k.has('ShiftLeft') || k.has('ShiftRight') || p.has(6);
      case 'jump': return k.has('Space') || p.has(0);
      case 'light': return m.has(0) || p.has(2);
      case 'heavy': return m.has(2) || p.has(3);
      case 'block': return k.has('KeyX') || m.has(3) || p.has(4);
      default: return false;
    }
  }

  hit(action) {
    const k = this.pressed, m = this.mousePressed, p = this.padPressed;
    switch (action) {
      case 'jump': return k.has('Space') || p.has(0);
      case 'light': return m.has(0) || p.has(2);
      case 'heavy': return m.has(2) || p.has(3);
      case 'transform': return k.has('KeyF') || p.has(12);
      case 'form1': return k.has('Digit1');
      case 'form2': return k.has('Digit2');
      case 'form3': return k.has('Digit3');
      case 'howl': return k.has('KeyQ') || p.has(5);
      case 'dash': return k.has('KeyC') || k.has('AltLeft') || k.has('ControlLeft') || p.has(1);
      case 'interact': return k.has('KeyE') || p.has(13);
      case 'grab': return k.has('KeyG') || p.has(14);
      case 'frenzy': return k.has('KeyZ') || p.has(15);
      case 'senses': return k.has('KeyV') || p.has(10);
      case 'lock': return k.has('KeyT') || m.has(1) || p.has(11);
      case 'spell': return k.has('KeyR') || p.has(7);
      case 'pause': return k.has('Escape') || p.has(9);
      case 'photo': return k.has('KeyP');
      case 'skills': return k.has('Tab') || k.has('KeyK') || p.has(8);
      case 'map': return k.has('KeyM');
      case 'accept': return k.has('KeyY');
      case 'decline': return k.has('KeyN');
      default: return false;
    }
  }

  released_(action) {
    const k = this.released, m = this.mouseReleased, p = this.padReleased;
    if (action === 'jump') return k.has('Space') || p.has(0);
    if (action === 'heavy') return m.has(2) || p.has(3);
    return false;
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mousePressed.clear();
    this.mouseReleased.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
