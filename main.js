import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ============================================================
//  OLYMPIC LUGE / BOBSLED MARBLE RUN 3D
//  — Virtually impossible to fall off —
// ============================================================

// --- TEAMS ---
const TEAMS = [
  { name: 'Crimson',  color: 0xff2244 },
  { name: 'Sapphire', color: 0x2266ff },
  { name: 'Emerald',  color: 0x22cc44 },
  { name: 'Gold',     color: 0xffcc00 },
  { name: 'Violet',   color: 0xaa44ff },
  { name: 'Coral',    color: 0xff6644 },
  { name: 'Cyan',     color: 0x00ddee },
  { name: 'Hot Pink', color: 0xff44aa },
];

// --- CONFIG ---
const MARBLE_RADIUS  = 0.28;
const MARBLE_MASS    = 1;
const GRAVITY        = -22;
const FINISH_Y       = -70;
const ELIMINATE_Y    = -120;
const STUCK_TIMEOUT  = 5000;

// --- STATE ---
let marbles = [];
let raceActive = false;
let raceStartTime = 0;
let finishOrder = [];
let followCamera = true;
let nextTeamIndex = 0;
let currentCameraTarget = null;

// ============================================================
//  THREE.JS
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f5); // Clean off-white background
scene.fog = new THREE.FogExp2(0xf0f0f5, 0.001); // Very subtle fog to match white background

const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.1, 800 // Increased far plane
);
camera.position.set(25, 50, 40);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2; // Lowered exposure since background is now white
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxDistance = 300; // Allow zooming out more

// --- LIGHTS ---
scene.add(new THREE.AmbientLight(0xffffff, 1.0)); // Neutral white ambient

const sun = new THREE.DirectionalLight(0xffffff, 1.5); 
sun.position.set(50, 100, 50);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 300;
sun.shadow.camera.left = -100;
sun.shadow.camera.right = 100;
sun.shadow.camera.top = 100;
sun.shadow.camera.bottom = -100;
scene.add(sun);

scene.add(new THREE.DirectionalLight(0xccccff, 0.5).translateX(-40).translateY(20)); // Soft fill

// Accent lights along course (subtler for white background)
const accentCols = [0xff88aa, 0x88ffcc, 0x88ccff, 0xffdd88, 0xff88ff];
for (let i = 0; i < accentCols.length; i++) {
  const pl = new THREE.PointLight(accentCols[i], 0.6, 80); 
  pl.position.set(Math.sin(i * 1.3) * 30, 40 - i * 25, Math.cos(i * 1.3) * 30);
  scene.add(pl);
}

// Add a darker helper grid to contrast against white
const grid = new THREE.GridHelper(500, 50, 0xaaaaaa, 0xcccccc);
grid.position.y = -75;
scene.add(grid);

// --- STARS ---
{
  const g = new THREE.BufferGeometry();
  const N = 2000;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i += 3) {
    const r = 100 + Math.random() * 100;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i] = r * Math.sin(ph) * Math.cos(th);
    pos[i + 1] = r * Math.sin(ph) * Math.sin(th);
    pos[i + 2] = r * Math.cos(ph);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.3, sizeAttenuation: true,
  })));
}

// ============================================================
//  CANNON.JS
// ============================================================
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations = 15;
world.solver.tolerance = 0.0001;

const trackPhysMat  = new CANNON.Material('track');
const marblePhysMat = new CANNON.Material('marble');
world.addContactMaterial(new CANNON.ContactMaterial(trackPhysMat, marblePhysMat, {
  friction: 0.08,       // ICY — luge style
  restitution: 0.05,    // Almost no bounce
  contactEquationStiffness: 1e8,
  contactEquationRelaxation: 3,
}));
world.addContactMaterial(new CANNON.ContactMaterial(marblePhysMat, marblePhysMat, {
  friction: 0.1,
  restitution: 0.15,
}));

// ============================================================
//  TRACK MATERIALS (visual)
// ============================================================
const matFloor = new THREE.MeshStandardMaterial({
  color: 0x8899bb, metalness: 0.4, roughness: 0.1, // Lighter, more reflective floor
  emissive: 0x112244, emissiveIntensity: 0.2,     // Subtle floor glow
});
const matWall = new THREE.MeshStandardMaterial({
  color: 0xccddff, metalness: 0.2, roughness: 0.1,
  transparent: true, opacity: 0.6, side: THREE.DoubleSide, // Increased opacity from 0.35
});
const matRail = new THREE.MeshStandardMaterial({
  color: 0x00ffff, metalness: 0.9, roughness: 0.1, // Neon cyan rails
  emissive: 0x00ffff, emissiveIntensity: 0.8,
});
const matStart = new THREE.MeshStandardMaterial({
  color: 0x445566, metalness: 0.5, roughness: 0.3,
});
const matFinish = new THREE.MeshStandardMaterial({
  color: 0x338855, metalness: 0.5, roughness: 0.3,
});

// ============================================================
//  TRACK PATH (CatmullRom Spline)
// ============================================================
// A long winding Olympic bobsled-style course.
// Y drops from 40 → ~ -68 over many sections.
// Includes: initial drop, wide sweepers, tight hairpins, a helix,
// whoops/undulations, chicanes, and a final straight to the bowl.

const controlPoints = [
  // --- START GATE ---
  new THREE.Vector3(  0,   42,   0),
  new THREE.Vector3(  0,   40,  -5),

  // --- INITIAL GENTLE DROP ---
  new THREE.Vector3(  2,   37, -14),
  new THREE.Vector3(  5,   34, -22),

  // --- FIRST SWEEPING RIGHT ---
  new THREE.Vector3( 14,   30, -28),
  new THREE.Vector3( 22,   26, -22),
  new THREE.Vector3( 24,   22, -10),

  // --- LONG LEFT SWEEPER ---
  new THREE.Vector3( 18,   18,   0),
  new THREE.Vector3(  8,   15,   8),
  new THREE.Vector3( -4,   12,  10),

  // --- WHOOPS (undulations via Y) ---
  new THREE.Vector3(-14,   10.5,   6),
  new THREE.Vector3(-20,    9,  -2),
  new THREE.Vector3(-22,   10, -10),  // bump up
  new THREE.Vector3(-20,    8, -18),
  new THREE.Vector3(-16,    9, -24),  // bump up
  new THREE.Vector3(-10,    6, -30),

  // --- TIGHT HAIRPIN RIGHT ---
  new THREE.Vector3(  0,    3, -34),
  new THREE.Vector3( 10,    0, -30),
  new THREE.Vector3( 14,   -3, -22),

  // --- DESCENDING HELIX (270°) ---
  new THREE.Vector3( 18,   -7, -14),
  new THREE.Vector3( 14,  -11,  -6),
  new THREE.Vector3(  6,  -15, -10),
  new THREE.Vector3(  2,  -19, -18),

  // --- SECOND WHOOPS ---
  new THREE.Vector3( -4,  -21, -24),
  new THREE.Vector3(-10,  -20, -28),  // bump up
  new THREE.Vector3(-16,  -23, -30),
  new THREE.Vector3(-20,  -22, -34),  // bump up
  new THREE.Vector3(-22,  -25, -38),

  // --- S-CURVE / CHICANE ---
  new THREE.Vector3(-18,  -28, -44),
  new THREE.Vector3(-10,  -31, -48),
  new THREE.Vector3(  0,  -34, -46),
  new THREE.Vector3(  8,  -37, -42),
  new THREE.Vector3( 12,  -40, -36),

  // --- LONG SWEEPING LEFT ---
  new THREE.Vector3( 10,  -43, -28),
  new THREE.Vector3(  4,  -46, -20),
  new THREE.Vector3( -4,  -49, -16),

  // --- THIRD WHOOPS ---
  new THREE.Vector3(-12,  -51, -12),
  new THREE.Vector3(-18,  -50, -8),   // bump up
  new THREE.Vector3(-22,  -53, -2),
  new THREE.Vector3(-18,  -52,  4),   // bump up
  new THREE.Vector3(-12,  -55,  8),

  // --- FINAL CURVES ---
  new THREE.Vector3( -4,  -58,  12),
  new THREE.Vector3(  4,  -61,  14),
  new THREE.Vector3( 10,  -64,  10),

  // --- FINISH STRAIGHT ---
  new THREE.Vector3( 10,  -66,   2),
  new THREE.Vector3(  8,  -68,  -6),
  new THREE.Vector3(  5,  -69, -12),
];

const trackCurve = new THREE.CatmullRomCurve3(controlPoints, false, 'catmullrom', 0.4);
const TRACK_LENGTH = trackCurve.getLength();

// ============================================================
//  BUILD THE TRACK
// ============================================================

const trackBodies = [];
const trackMeshes = [];

function addPhysBox(w, h, d, pos, quat) {
  const body = new CANNON.Body({ mass: 0, material: trackPhysMat });
  body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
  body.position.copy(pos);
  body.quaternion.copy(quat);
  world.addBody(body);
  trackBodies.push(body);
  return body;
}

function addVisBox(w, h, d, pos, quat, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.copy(pos);
  mesh.quaternion.copy(quat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  trackMeshes.push(mesh);
  return mesh;
}

function addTrackPiece(w, h, d, pos, quat, visMat, isWall) {
  addPhysBox(w, h, d, pos, quat);
  const m = addVisBox(w, h, d, pos, quat, isWall ? matWall : (visMat || matFloor));
  if (isWall) { m.castShadow = false; }
}

// ---- Generate the Luge Channel ----
// Cross-section (looking from behind):
//
//   |  ╲_________╱  |
//   |   (floor)     |   
//   RAIL  WALL  WALL  RAIL
//
// 5 parts per rib:
//   1. Floor (flat, width=TRACK_W)
//   2. Left banked wall (tilted inward ~55°)
//   3. Right banked wall (tilted inward ~55°)
//   4. Left vertical safety rail
//   5. Right vertical safety rail

const TRACK_W       = 3.0;   // Floor width
const FLOOR_THICK   = 0.18;
const WALL_H        = 2.0;   // Banked wall panel height
const WALL_THICK    = 0.14;
const WALL_ANGLE    = Math.PI * 0.32; // ~58° bank angle
const RAIL_H        = 1.2;   // Vertical top rail
const RAIL_THICK    = 0.14;
const NUM_SEGMENTS  = 200;   // Number of ribs

function buildLugeTrack() {
  // Pre-compute a smoothed set of Frenet frames along the curve.
  // We use a "parallel transport" approach to avoid flips.

  const frames = [];
  const up0 = new THREE.Vector3(0, 1, 0);
  let prevNormal = up0.clone();

  for (let i = 0; i <= NUM_SEGMENTS; i++) {
    const t = i / NUM_SEGMENTS;
    const pos = trackCurve.getPointAt(t);
    const tan = trackCurve.getTangentAt(t).normalize();

    // Parallel transport: project previous normal onto plane perpendicular to tangent
    let normal = prevNormal.clone().sub(
      tan.clone().multiplyScalar(prevNormal.dot(tan))
    ).normalize();

    // If degenerate, fall back to world up
    if (normal.lengthSq() < 0.01) {
      normal = new THREE.Vector3(0, 1, 0);
      normal.sub(tan.clone().multiplyScalar(normal.dot(tan))).normalize();
    }

    const binormal = new THREE.Vector3().crossVectors(tan, normal).normalize();

    // --- BANKING ---
    // Compute curvature in the XZ plane (horizontal turning).
    // Bank the normal towards the inside of the turn.
    const dt = 0.002;
    const t0 = Math.max(0, t - dt);
    const t1 = Math.min(1, t + dt);
    const tan0 = trackCurve.getTangentAt(t0);
    const tan1 = trackCurve.getTangentAt(t1);
    const curvatureVec = tan1.clone().sub(tan0);
    // Project curvature onto binormal to get banking amount
    const bankAmount = curvatureVec.dot(binormal) * 12; // Amplify
    const clampedBank = Math.max(-0.6, Math.min(0.6, bankAmount));

    // Rotate normal around tangent by bank angle
    if (Math.abs(clampedBank) > 0.01) {
      const bankQuat = new THREE.Quaternion().setFromAxisAngle(tan, clampedBank);
      normal.applyQuaternion(bankQuat);
      binormal.crossVectors(tan, normal).normalize();
    }

    prevNormal = normal.clone();
    frames.push({ pos, tan, normal, binormal });
  }

  // Now build each rib segment
  for (let i = 0; i < NUM_SEGMENTS; i++) {
    const f0 = frames[i];
    const f1 = frames[i + 1];

    // Midpoint & averaged frame
    const midPos = f0.pos.clone().add(f1.pos).multiplyScalar(0.5);
    const midTan = f0.tan.clone().add(f1.tan).normalize();
    const midNorm = f0.normal.clone().add(f1.normal).normalize();
    const midBin = f0.binormal.clone().add(f1.binormal).normalize();

    // Segment length (distance between consecutive points, with slight overlap)
    const segLen = f0.pos.distanceTo(f1.pos) * 1.08;

    // Build rotation matrix from frame (binormal=X, normal=Y, tangent=Z)
    const rotMat = new THREE.Matrix4().makeBasis(midBin, midNorm, midTan);
    const baseQuat = new THREE.Quaternion().setFromRotationMatrix(rotMat);

    // 1. FLOOR
    addTrackPiece(
      TRACK_W, FLOOR_THICK, segLen,
      midPos.clone(),
      baseQuat.clone(),
      matFloor, false
    );

    // 2. LEFT BANKED WALL
    // Position: offset left by W/2, up by wallH/2 projected, tilted inward
    {
      const wallCenter = midPos.clone()
        .add(midBin.clone().multiplyScalar(-TRACK_W / 2 - WALL_H * 0.35))
        .add(midNorm.clone().multiplyScalar(WALL_H * 0.35));
      // Rotate baseQuat by WALL_ANGLE around the local Z axis (tangent)
      const tiltQ = new THREE.Quaternion().setFromAxisAngle(midTan, WALL_ANGLE);
      const wallQuat = tiltQ.clone().multiply(baseQuat);
      addTrackPiece(
        WALL_H, WALL_THICK, segLen,
        wallCenter, wallQuat, matWall, true
      );
    }

    // 3. RIGHT BANKED WALL
    {
      const wallCenter = midPos.clone()
        .add(midBin.clone().multiplyScalar(TRACK_W / 2 + WALL_H * 0.35))
        .add(midNorm.clone().multiplyScalar(WALL_H * 0.35));
      const tiltQ = new THREE.Quaternion().setFromAxisAngle(midTan, -WALL_ANGLE);
      const wallQuat = tiltQ.clone().multiply(baseQuat);
      addTrackPiece(
        WALL_H, WALL_THICK, segLen,
        wallCenter, wallQuat, matWall, true
      );
    }

    // 4. LEFT VERTICAL SAFETY RAIL
    {
      const railCenter = midPos.clone()
        .add(midBin.clone().multiplyScalar(-TRACK_W / 2 - WALL_H * 0.7))
        .add(midNorm.clone().multiplyScalar(WALL_H * 0.7 + RAIL_H * 0.4));
      addTrackPiece(
        RAIL_THICK, RAIL_H, segLen,
        railCenter, baseQuat.clone(), matRail, true
      );
    }

    // 5. RIGHT VERTICAL SAFETY RAIL
    {
      const railCenter = midPos.clone()
        .add(midBin.clone().multiplyScalar(TRACK_W / 2 + WALL_H * 0.7))
        .add(midNorm.clone().multiplyScalar(WALL_H * 0.7 + RAIL_H * 0.4));
      addTrackPiece(
        RAIL_THICK, RAIL_H, segLen,
        railCenter, baseQuat.clone(), matRail, true
      );
    }
  }

  // --- START PLATFORM ---
  {
    const sp = controlPoints[0];
    const q = new THREE.Quaternion();
    // Wide platform at the top
    addTrackPiece(6, 0.5, 8, new THREE.Vector3(sp.x, sp.y - 0.25, sp.z + 2), q, matStart, false);
    // Walls around start
    addTrackPiece(0.3, 3, 8, new THREE.Vector3(sp.x - 3.15, sp.y + 1.2, sp.z + 2), q, matWall, true);
    addTrackPiece(0.3, 3, 8, new THREE.Vector3(sp.x + 3.15, sp.y + 1.2, sp.z + 2), q, matWall, true);
    addTrackPiece(6.6, 3, 0.3, new THREE.Vector3(sp.x, sp.y + 1.2, sp.z + 6.15), q, matWall, true);
  }

  // --- FINISH COLLECTION BOWL ---
  {
    const ep = controlPoints[controlPoints.length - 1];
    const q = new THREE.Quaternion();
    const bx = ep.x, by = ep.y - 2, bz = ep.z - 2;
    // Floor
    addTrackPiece(10, 0.5, 10, new THREE.Vector3(bx, by, bz), q, matFinish, false);
    // 4 walls
    addTrackPiece(0.4, 4, 10, new THREE.Vector3(bx - 5, by + 2, bz), q, matWall, true);
    addTrackPiece(0.4, 4, 10, new THREE.Vector3(bx + 5, by + 2, bz), q, matWall, true);
    addTrackPiece(10.8, 4, 0.4, new THREE.Vector3(bx, by + 2, bz + 5), q, matWall, true);
    addTrackPiece(10.8, 4, 0.4, new THREE.Vector3(bx, by + 2, bz - 5), q, matWall, true);
  }

  // --- FINISH LINE MARKERS ---
  {
    const ep = controlPoints[controlPoints.length - 1];
    // Get the frame at the end to orient finish decorations
    const fEnd = frames[frames.length - 3];
    const finishMat = new THREE.MeshStandardMaterial({
      color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.5,
    });
    // Checkerboard strip across track at ~95% point
    const t95 = 0.96;
    const finPos = trackCurve.getPointAt(t95);
    for (let c = 0; c < 6; c++) {
      const checkerMat = new THREE.MeshStandardMaterial({
        color: c % 2 === 0 ? 0x111111 : 0xffffff,
        emissive: c % 2 === 0 ? 0x000000 : 0xffd700,
        emissiveIntensity: 0.2,
      });
      // Place across the track width
      const frameAt = frames[Math.floor(t95 * NUM_SEGMENTS)];
      const cp = finPos.clone()
        .add(frameAt.binormal.clone().multiplyScalar((c - 2.5) * 0.5));
      const mesh = addVisBox(0.5, 0.05, 0.3, cp, baseQuatAt(frameAt), checkerMat);
      mesh.castShadow = false;
    }
  }

  // --- SUPPORT COLUMNS (every ~20 segments) ---
  for (let i = 10; i < NUM_SEGMENTS; i += 20) {
    const f = frames[i];
    const groundY = -75; // Way below
    const colH = f.pos.y - groundY;
    if (colH < 2) continue;
    const colMat = new THREE.MeshStandardMaterial({
      color: 0x445566, metalness: 0.6, roughness: 0.3,
    });
    const colPos = new THREE.Vector3(f.pos.x, f.pos.y - colH / 2, f.pos.z);
    addVisBox(0.5, colH, 0.5, colPos, new THREE.Quaternion(), colMat);
  }
}

function baseQuatAt(frame) {
  const m = new THREE.Matrix4().makeBasis(frame.binormal, frame.normal, frame.tan);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

// Build it!
buildLugeTrack();

// ============================================================
//  MARBLES
// ============================================================

function createMarbleMesh(teamColor) {
  const geom = new THREE.SphereGeometry(MARBLE_RADIUS, 32, 32);
  const mat = new THREE.MeshStandardMaterial({
    color: teamColor,
    metalness: 0.85,
    roughness: 0.1,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;

  // Glass highlight ring
  const ringGeom = new THREE.TorusGeometry(MARBLE_RADIUS * 0.7, MARBLE_RADIUS * 0.08, 8, 16);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, transparent: true, opacity: 0.3, metalness: 1, roughness: 0,
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.rotation.x = Math.PI / 3;
  mesh.add(ring);
  return mesh;
}

function spawnMarble(teamIndex, xOff, zOff, applyImpulse) {
  const team = TEAMS[teamIndex % TEAMS.length];
  const mesh = createMarbleMesh(team.color);
  scene.add(mesh);

  const body = new CANNON.Body({
    mass: MARBLE_MASS,
    shape: new CANNON.Sphere(MARBLE_RADIUS),
    material: marblePhysMat,
    linearDamping: 0.05,
    angularDamping: 0.1,
  });

  const sp = controlPoints[0];
  // Staggered starting positions on the platform
  body.position.set(
    sp.x + (xOff || 0),
    sp.y + 0.5,
    sp.z + 4 + (zOff || 0)
  );
  world.addBody(body);

  if (applyImpulse) {
    // Apply a forward physical impulse to clear the platform
    // Direction is towards the first section of the track (negative Z)
    const impulse = new CANNON.Vec3(0, 0, -12);
    body.applyImpulse(impulse, new CANNON.Vec3(0, 0, 0));
  }

  const marble = {
    body, mesh, team,
    status: 'racing',
    finishTime: null,
    lastPos: body.position.clone(),
    stuckSince: null,
    teamIndex,
  };
  marbles.push(marble);
  return marble;
}

// ============================================================
//  RACE MANAGEMENT
// ============================================================

function startRace() {
  resetScene();
  raceActive = true;
  raceStartTime = performance.now();
  finishOrder = [];

  // Spawn all 8 marbles with an initial pusher impulse
  for (let i = 0; i < 8; i++) {
    const row = Math.floor(i / 2);
    const col = (i % 2) - 0.5;
    spawnMarble(i, col * 1.2, row * 1.2, true);
  }
  nextTeamIndex = 8;

  showAnnouncement('🏁 GO! GO! GO!', 2000);
  updateLeaderboard();
}

function dropSingleMarble() {
  spawnMarble(nextTeamIndex % TEAMS.length, 0, 0, true);
  nextTeamIndex++;
  if (!raceActive) {
    raceActive = true;
    raceStartTime = performance.now();
    finishOrder = [];
  }
  updateLeaderboard();
}

function resetScene() {
  marbles.forEach(m => {
    world.removeBody(m.body);
    scene.remove(m.mesh);
  });
  marbles = [];
  finishOrder = [];
  raceActive = false;
  raceStartTime = 0;
  nextTeamIndex = 0;
  currentCameraTarget = null;
  document.getElementById('timer-display').textContent = '0.00s';
  document.getElementById('marble-list').innerHTML =
    '<div style="color:rgba(255,255,255,0.3);font-size:12px;text-align:center;padding:8px">Press Start Race!</div>';
}

// ============================================================
//  RACE LOGIC
// ============================================================

function checkFinishAndEliminate() {
  const now = performance.now();
  const elapsed = (now - raceStartTime) / 1000;

  marbles.forEach(m => {
    if (m.status !== 'racing') return;
    const pos = m.body.position;

    // Finish
    const ep = controlPoints[controlPoints.length - 1];
    if (pos.y < ep.y + 3 && pos.y > ep.y - 10 &&
        Math.abs(pos.x - ep.x) < 8 && Math.abs(pos.z - ep.z) < 8) {
      m.status = 'finished';
      m.finishTime = elapsed;
      finishOrder.push(m);
      if (finishOrder.length === 1) {
        showAnnouncement(`🏆 ${m.team.name} WINS!`, 4000);
      }
    }

    // Elimination
    if (pos.y < ELIMINATE_Y) {
      m.status = 'eliminated';
      m.finishTime = elapsed;
      world.removeBody(m.body);
      m.mesh.visible = false;
    }

    // Stuck detection
    const dist = pos.distanceTo(m.lastPos);
    if (dist < 0.04) {
      if (!m.stuckSince) m.stuckSince = now;
      if (now - m.stuckSince > STUCK_TIMEOUT) {
        // Give it a nudge instead of eliminating
        m.body.applyImpulse(
          new CANNON.Vec3((Math.random()-0.5)*3, -2, (Math.random()-0.5)*3),
          new CANNON.Vec3(0, 0, 0)
        );
        m.stuckSince = now; // Reset timer
      }
    } else {
      m.stuckSince = null;
      m.lastPos = pos.clone();
    }
  });
}

function getLeadingMarble() {
  let leader = null;
  let lowestY = Infinity;
  marbles.forEach(m => {
    if (m.status === 'racing' && m.body.position.y < lowestY && m.body.position.y > ELIMINATE_Y + 5) {
      lowestY = m.body.position.y;
      leader = m;
    }
  });
  if (!leader) {
    const racing = marbles.filter(m => m.status === 'racing');
    if (racing.length > 0) leader = racing[0];
  }
  return leader;
}

// ============================================================
//  UI
// ============================================================

function updateTimer() {
  if (!raceActive) return;
  const elapsed = (performance.now() - raceStartTime) / 1000;
  document.getElementById('timer-display').textContent = elapsed.toFixed(2) + 's';
}

function updateLeaderboard() {
  const list = document.getElementById('marble-list');
  if (marbles.length === 0) return;

  const sorted = [...marbles].sort((a, b) => {
    if (a.status === 'finished' && b.status === 'finished') return a.finishTime - b.finishTime;
    if (a.status === 'finished') return -1;
    if (b.status === 'finished') return 1;
    if (a.status === 'racing' && b.status === 'racing') return a.body.position.y - b.body.position.y;
    if (a.status === 'racing') return -1;
    if (b.status === 'racing') return 1;
    return 0;
  });

  let html = '';
  sorted.forEach((m, idx) => {
    const color = '#' + new THREE.Color(m.team.color).getHexString();
    let statusText = '', statusClass = m.status, positionBadge = '';

    if (m.status === 'finished') {
      const place = finishOrder.indexOf(m) + 1;
      const pc = place <= 3 ? ` p${place}` : '';
      positionBadge = `<span class="position-badge${pc}">#${place}</span>`;
      statusText = m.finishTime.toFixed(2) + 's';
    } else if (m.status === 'eliminated') {
      statusText = '💀 OUT';
    } else {
      statusText = '🏃 Racing';
    }

    html += `<div class="marble-entry">
      ${positionBadge}
      <span class="marble-dot" style="background:${color}"></span>
      <span class="marble-name">${m.team.name}</span>
      <span class="marble-status ${statusClass}">${statusText}</span>
    </div>`;
  });
  list.innerHTML = html;
}

let announcementTimeout = null;
function showAnnouncement(text, duration) {
  const el = document.getElementById('announcement');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  if (announcementTimeout) clearTimeout(announcementTimeout);
  announcementTimeout = setTimeout(() => el.classList.remove('show'), duration);
}

// ============================================================
//  CAMERA
// ============================================================

function updateCamera() {
  if (!followCamera) return;
  const leader = getLeadingMarble();
  if (leader) {
    const pos = leader.body.position;
    if (pos.y > ELIMINATE_Y) {
      if (!currentCameraTarget) {
        currentCameraTarget = new THREE.Vector3(pos.x, pos.y, pos.z);
      }
      currentCameraTarget.lerp(new THREE.Vector3(pos.x, pos.y, pos.z), 0.08);
    }
  }
  if (currentCameraTarget) {
    const offset = new THREE.Vector3(18, 14, 18);
    const desiredPos = currentCameraTarget.clone().add(offset);
    camera.position.lerp(desiredPos, 0.04);
    controls.target.lerp(currentCameraTarget, 0.06);
  }
}

function toggleCamera() {
  followCamera = !followCamera;
  document.getElementById('btn-camera').textContent =
    followCamera ? '📷 Free Camera' : '📷 Follow Leader';
}

// ============================================================
//  BUTTON HANDLERS
// ============================================================

document.getElementById('btn-race').addEventListener('click', startRace);
document.getElementById('btn-drop').addEventListener('click', dropSingleMarble);
document.getElementById('btn-reset').addEventListener('click', resetScene);
document.getElementById('btn-camera').addEventListener('click', toggleCamera);

// ============================================================
//  ANIMATION LOOP
// ============================================================

const clock = new THREE.Clock();
let leaderboardTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);

  // Physics: multiple sub-steps for stability at high speed
  const subSteps = 3;
  for (let s = 0; s < subSteps; s++) {
    world.step(1 / 180, delta / subSteps);
  }

  // Sync
  marbles.forEach(m => {
    if (m.status === 'racing') {
      m.mesh.position.copy(m.body.position);
      m.mesh.quaternion.copy(m.body.quaternion);
    }
  });

  if (raceActive) {
    checkFinishAndEliminate();
    updateTimer();
    leaderboardTimer += delta;
    if (leaderboardTimer > 0.3) {
      updateLeaderboard();
      leaderboardTimer = 0;
    }

    const stillRacing = marbles.filter(m => m.status === 'racing').length;
    if (stillRacing === 0 && marbles.length > 0) {
      raceActive = false;
      if (finishOrder.length > 0) {
        showAnnouncement(`🏆 ${finishOrder[0].team.name} is the Champion!`, 5000);
      } else {
        showAnnouncement('💀 Everyone eliminated!', 3000);
      }
      updateLeaderboard();
    }
  }

  updateCamera();
  controls.update();

  // Rotate stars subtly
  scene.children.forEach(c => {
    if (c instanceof THREE.Points) c.rotation.y += 0.00005;
  });

  renderer.render(scene, camera);
}

animate();

// ============================================================
//  RESIZE
// ============================================================

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
