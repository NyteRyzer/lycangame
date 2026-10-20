// Lightweight geometry accumulator: lets us batch thousands of boxes into a
// handful of draw calls while giving each box its own UV scale / color.
import * as THREE from 'three';

export class GeoBuilder {
  constructor({ colors = false } = {}) {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = colors ? [] : null;
    this.idx = [];
  }

  _quad(p0, p1, p2, p3, n, uvs, color) {
    const base = this.pos.length / 3;
    for (const p of [p0, p1, p2, p3]) this.pos.push(p[0], p[1], p[2]);
    for (let i = 0; i < 4; i++) this.nor.push(n[0], n[1], n[2]);
    for (const t of uvs) this.uv.push(t[0], t[1]);
    if (this.col) for (let i = 0; i < 4; i++) this.col.push(color.r, color.g, color.b);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // Axis-aligned box. uvScale maps world units → texture repeats on the walls.
  // faces: which faces to emit ({top, bottom, sides}).
  box(cx, y0, cz, w, h, d, { uvScaleX = 1, uvScaleY = 1, color = null, top = true, sides = true, bottom = false, uvOffset = 0 } = {}) {
    const x0 = cx - w / 2, x1 = cx + w / 2;
    const z0 = cz - d / 2, z1 = cz + d / 2;
    const y1 = y0 + h;
    const c = color || { r: 1, g: 1, b: 1 };
    const uw = w * uvScaleX, ud = d * uvScaleX, uh = h * uvScaleY;
    const o = uvOffset;
    if (sides) {
      // +z face
      this._quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [[o, 0], [o + uw, 0], [o + uw, uh], [o, uh]], c);
      // -z face
      this._quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [[o, 0], [o + uw, 0], [o + uw, uh], [o, uh]], c);
      // +x face
      this._quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [[o, 0], [o + ud, 0], [o + ud, uh], [o, uh]], c);
      // -x face
      this._quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [[o, 0], [o + ud, 0], [o + ud, uh], [o, uh]], c);
    }
    if (top) this._quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[0, 0], [w * 0.1, 0], [w * 0.1, d * 0.1], [0, d * 0.1]], c);
    if (bottom) this._quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], c);
  }

  // Four-sided pyramid roof (suburban houses, tents).
  pyramid(cx, y0, cz, w, h, d, color) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const apex = [cx, y0 + h, cz];
    const tri = (a, b) => {
      const base = this.pos.length / 3;
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = apex[0] - a[0], vy = apex[1] - a[1], vz = apex[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      for (const p of [a, b, apex]) {
        this.pos.push(p[0], p[1], p[2]);
        this.nor.push(nx, ny, nz);
        if (this.col) this.col.push(color.r, color.g, color.b);
      }
      this.uv.push(0, 0, 1, 0, 0.5, 1);
      this.idx.push(base, base + 1, base + 2);
    };
    tri([x0, y0, z1], [x1, y0, z1]);
    tri([x1, y0, z1], [x1, y0, z0]);
    tri([x1, y0, z0], [x0, y0, z0]);
    tri([x0, y0, z0], [x0, y0, z1]);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
