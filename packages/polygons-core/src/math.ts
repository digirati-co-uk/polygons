import { Point } from './polygon';

export function proximity(pointer: Point, points: Array<[number, number]>, threshold: number, scale: number) {
  const distances = points.map((point) => {
    const dx = pointer[0] - point[0];
    const dy = pointer[1] - point[1];
    return Math.sqrt(dx * dx + dy * dy);
  });

  const min = Math.min(...distances);

  if (min * scale < threshold) {
    return distances.indexOf(min);
  }

  return undefined;
}

export function distance1D(a: number, b: number) {
  return Math.abs(a - b);
}

export function distance(a: Point, b: Point) {
  const xDelta = distance1D(a[0], b[0]);
  const yDelta = distance1D(a[1], b[1]);
  return Math.sqrt(Math.pow(xDelta, 2) + Math.pow(yDelta, 2));
}

function sum(u: Point, v: Point): Point {
  return [u[0] + v[0], u[1] + v[1]];
}

function diff(u: Point, v: Point): Point {
  return [u[0] - v[0], u[1] - v[1]];
}

function prod(u: Point, v: Point): Point {
  return [u[0] * v[0], u[1] * v[1]];
}

function dot(u: Point, v: Point) {
  return u[0] * v[0] + u[1] * v[1];
}

function norm2(v: Point) {
  return v[0] * v[0] + v[1] * v[1];
}

function norm(v: Point) {
  return Math.sqrt(norm2(v));
}

function d2(u: Point, v: Point) {
  return norm2(diff(u, v));
}

function d(u: Point, v: Point) {
  return norm(diff(u, v));
}

// Source: https://gist.github.com/adammiller/826148?permalink_comment_id=317898#gistcomment-317898
export function simplifyPolygon(V: Point[], tol: number): Point[] {
  // V ... [[x1,y1],[x2,y2],...] polyline
  // tol  ... approximation tolerance
  // ==============================================
  // Copyright 2002, softSurfer (www.softsurfer.com)
  // This code may be freely used and modified for any purpose
  // providing that this copyright notice is included with it.
  // SoftSurfer makes no warranty for this code, and cannot be held
  // liable for any real or imagined damage resulting from its use.
  // Users of this code must verify correctness for their application.
  // http://softsurfer.com/Archive/algorithm_0205/algorithm_0205.htm

  let S: Point[]; // polyline stack
  let u; // polyline offset vector
  let vt; // vertex buffer
  let mk; // marker buffer

  var simplifyDP = function (tol: number, v: Point[], j: number, k: number, mk: number[]) {
    //  This is the Douglas-Peucker recursive simplification routine
    //  It just marks vertices that are part of the simplified polyline
    //  for approximating the polyline subchain v[j] to v[k].
    //  mk[] ... array of markers matching vertex array v[]
    if (k <= j + 1) {
      // there is nothing to simplify
      return;
    }
    // check for adequate approximation by segment S from v[j] to v[k]
    let maxi = j; // index of vertex farthest from S
    let maxd2 = 0; // distance squared of farthest vertex
    let tol2 = tol * tol; // tolerance squared
    S = [v[j], v[k]]; // segment from v[j] to v[k]
    u = diff(S[1], S[0]); // segment direction vector
    let cu = norm2(u); // segment length squared
    // test each vertex v[i] for max distance from S
    // compute using the Feb 2001 Algorithm's dist_Point_to_Segment()
    // Note: this works in any dimension (2D, 3D, ...)
    let w: Point; // vector
    let Pb: Point; // point, base of perpendicular from v[i] to S
    let b, cw, dv2; // dv2 = distance v[i] to S squared
    for (let i = j + 1; i < k; i++) {
      // compute distance squared
      w = diff(v[i], S[0]);
      cw = dot(w, u);
      if (cw <= 0) {
        dv2 = d2(v[i], S[0]);
      } else if (cu <= cw) {
        dv2 = d2(v[i], S[1]);
      } else {
        b = cw / cu;
        Pb = [S[0][0] + b * u[0], S[0][1] + b * u[1]];
        dv2 = d2(v[i], Pb);
      }
      // test with current max distance squared
      if (dv2 <= maxd2) {
        continue;
      }
      // v[i] is a new max vertex
      maxi = i;
      maxd2 = dv2;
    }
    if (maxd2 > tol2) {
      // error is worse than the tolerance
      // split the polyline at the farthest vertex from S
      mk[maxi] = 1; // mark v[maxi] for the simplified polyline
      // recursively simplify the two subpolylines at v[maxi]
      simplifyDP(tol, v, j, maxi, mk); // polyline v[j] to v[maxi]
      simplifyDP(tol, v, maxi, k, mk); // polyline v[maxi] to v[k]
    }
    // else the approximation is OK, so ignore intermediate vertices
    return;
  };

  let n = V.length;
  let sV: any[] = [];
  let i, k, m, pv; // misc counters
  let tol2 = tol * tol; // tolerance squared
  vt = []; // vertex buffer, points
  mk = []; // marker buffer, ints

  // STAGE 1.  Vertex Reduction within tolerance of prior vertex cluster
  vt[0] = V[0]; // start at the beginning
  for (i = k = 1, pv = 0; i < n; i++) {
    if (d2(V[i], V[pv]) < tol2) {
      continue;
    }
    vt[k++] = V[i];
    pv = i;
  }
  if (pv < n - 1) {
    vt[k++] = V[n - 1]; // finish at the end
  }

  // STAGE 2.  Douglas-Peucker polyline simplification
  mk[0] = mk[k - 1] = 1; // mark the first and last vertices
  simplifyDP(tol, vt, 0, k - 1, mk);

  // copy marked vertices to the output simplified polyline
  for (i = m = 0; i < k; i++) {
    if (mk[i]) {
      sV[m++] = vt[i];
    }
  }
  return sV;
}
