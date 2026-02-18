import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ============================================================
//  EPIC MARBLE RUN 3D — For Danny's Kids!
// ============================================================

// --- TEAM COLORS & NAMES ---
const TEAMS = [
  { name: 'Crimson',   color: 0xff2244 },
  { name: 'Sapphire',  color: 0x2266ff },
  { name: 'Emerald',   color: 0x22cc44 },
  { name: 'Gold',      color: 0xffcc00 },
  { name: 'Violet',    color: 0xaa44ff },
  { name: 'Coral',     color: 0xff6644 },
  { name: 'Cyan',      color: 0x00ddee },
  { name: 'Hot Pink',  color: 0xff44aa },
  { name: 'Lime',      color: 0x88ff22 },
  { name: 'Silver',    color: 0xccccdd },
];

// --- CONFIG ---
const MARBLE_RADIUS = 0.3;
const GRAVITY = -18; // Increased gravity for snappier movement
const TRACK_FRICTION = 0.3; // Reduced friction
const TRACK_RESTITUTION = 0.1; // Reduced bounce
const MARBLE_FRICTION = 0.3;
const MARBLE_RESTITUTION = 0.2; // Reduced bounce
const MARBLE_MASS = 1;
const MARBLE_LINEAR_DAMPING = 0.1;
const MARBLE_ANGULAR_DAMPING = 0.2;
const FINISH_Y = -32;
const ELIMINATE_Y = -50; // Lower elimination threshold
const STUCK_TIMEOUT = 5000; // Shorter timeout

// --- STATE ---
let marbles = [];
let raceActive = false;
let raceStartTime = 0;
let finishOrder = [];
let followCamera = true;
let nextTeamIndex = 0;
let currentCameraTarget = null; // Track the current target to prevent jitter

// --- THREE.JS SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);
scene.fog = new THREE.FogExp2(0x050510, 0.006);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(25, 20, 30);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxDistance = 80;
controls.minDistance = 3;
controls.target.set(0, 0, 0);

// --- LIGHTING ---
const ambientLight = new THREE.AmbientLight(0x334466, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffeedd, 1.5);
sunLight.position.set(20, 40, 15);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 100;
sunLight.shadow.camera.left = -30;
sunLight.shadow.camera.right = 30;
sunLight.shadow.camera.top = 40;
sunLight.shadow.camera.bottom = -40;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x6688cc, 0.4);
fillLight.position.set(-15, 10, -10);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0xff4488, 0.6, 60);
rimLight.position.set(-10, 15, 0);
scene.add(rimLight);

// Colored accent lights along the track
const accentColors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff];
for (let i = 0; i < 5; i++) {
  const light = new THREE.PointLight(accentColors[i], 0.3, 20);
  light.position.set(Math.sin(i * 1.3) * 8, 30 - i * 12, Math.cos(i * 1.3) * 8);
  scene.add(light);
}

// --- STARS ---
const starGeom = new THREE.BufferGeometry();
const starCount = 2000;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i += 3) {
  const r = 80 + Math.random() * 120;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  starPositions[i] = r * Math.sin(phi) * Math.cos(theta);
  starPositions[i+1] = r * Math.sin(phi) * Math.sin(theta);
  starPositions[i+2] = r * Math.cos(phi);
}
starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, sizeAttenuation: true });
scene.add(new THREE.Points(starGeom, starMat));

// --- CANNON.JS SETUP ---
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true; // Allow sleep for performance
world.solver.iterations = 20; // Increased precision
world.solver.tolerance = 0.0001;
const defaultContactMaterial = new CANNON.ContactMaterial(trackPhysMaterial, marblePhysMaterial, {
  friction: TRACK_FRICTION,
  restitution: TRACK_RESTITUTION,
  contactEquationStiffness: 1e8,
  contactEquationRelaxation: 3,
});
world.addContactMaterial(defaultContactMaterial);

// --- TRACK MATERIALS (visual) ---
const trackMaterials = {
  ramp:    new THREE.MeshStandardMaterial({ color: 0x556677, metalness: 0.6, roughness: 0.3 }),
  funnel:  new THREE.MeshStandardMaterial({ color: 0x886644, metalness: 0.5, roughness: 0.4 }),
  zigzag:  new THREE.MeshStandardMaterial({ color: 0x448866, metalness: 0.5, roughness: 0.3 }),
  helix:   new THREE.MeshStandardMaterial({ color: 0x664488, metalness: 0.6, roughness: 0.3 }),
  wave:    new THREE.MeshStandardMaterial({ color: 0x446688, metalness: 0.5, roughness: 0.3 }),
  channel: new THREE.MeshStandardMaterial({ color: 0x886655, metalness: 0.5, roughness: 0.4 }),
  funnel2: new THREE.MeshStandardMaterial({ color: 0x885544, metalness: 0.5, roughness: 0.4 }),
  banked:  new THREE.MeshStandardMaterial({ color: 0x556688, metalness: 0.6, roughness: 0.3 }),
  jump:    new THREE.MeshStandardMaterial({ color: 0xaa5533, metalness: 0.7, roughness: 0.2 }),
  finish:  new THREE.MeshStandardMaterial({ color: 0x338855, metalness: 0.5, roughness: 0.3 }),
  wall:    new THREE.MeshStandardMaterial({ color: 0xaabbcc, transparent: true, opacity: 0.25, metalness: 0.8, roughness: 0.1, side: THREE.DoubleSide }),
  rail:    new THREE.MeshStandardMaterial({ color: 0x889999, metalness: 0.8, roughness: 0.2 }),
  column:  new THREE.MeshStandardMaterial({ color: 0x554466, metalness: 0.7, roughness: 0.3 }),
};

// --- TRACK BUILDER HELPERS ---
const trackMeshes = [];

function addBox(w, h, d, x, y, z, rx, ry, rz, material, isWall) {
  const geom = new THREE.BoxGeometry(w, h, d);
  const mat = material || trackMaterials.ramp;
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx || 0, ry || 0, rz || 0);
  mesh.castShadow = !isWall;
  mesh.receiveShadow = true;
  scene.add(mesh);
  trackMeshes.push(mesh);

  const body = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2)),
    material: trackPhysMaterial,
  });
  body.position.set(x, y, z);
  body.quaternion.setFromEuler(rx || 0, ry || 0, rz || 0);
  world.addBody(body);
  return { mesh, body };
}

function addCylinder(rTop, rBot, height, x, y, z, rx, ry, rz, material, segments) {
  const seg = segments || 24;
  const geom = new THREE.CylinderGeometry(rTop, rBot, height, seg);
  const mat = material || trackMaterials.funnel;
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx || 0, ry || 0, rz || 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  trackMeshes.push(mesh);

  // Approximate cylinder physics with cannon — use multiple boxes for funnel shapes
  // For simple cylinders, use Cylinder shape
  const body = new CANNON.Body({
    mass: 0,
    material: trackPhysMaterial,
  });
  body.addShape(new CANNON.Cylinder(rTop, rBot, height, seg));
  body.position.set(x, y, z);
  body.quaternion.setFromEuler(rx || 0, ry || 0, rz || 0);
  world.addBody(body);
  return { mesh, body };
}

// ============================================================
//  BUILD THE EPIC TRACK
// ============================================================
// Track flows from top (y≈30) to bottom (y≈-32)
// Centered around x≈0, z≈0

const TRACK_WIDTH = 3.0;
const WALL_HEIGHT = 0.8;
const WALL_THICKNESS = 0.15;
const FLOOR_THICKNESS = 0.2;

function buildWalls(x, y, z, w, d, rx, ry, rz, mat) {
  const wm = mat || trackMaterials.wall;
  // Left wall
  addBox(WALL_THICKNESS, WALL_HEIGHT, d, x - w/2, y + WALL_HEIGHT/2, z, rx || 0, ry || 0, rz || 0, wm, true);
  // Right wall
  addBox(WALL_THICKNESS, WALL_HEIGHT, d, x + w/2, y + WALL_HEIGHT/2, z, rx || 0, ry || 0, rz || 0, wm, true);
}

function buildRampWithWalls(w, d, x, y, z, rx, ry, rz, floorMat, wallMat) {
  addBox(w, FLOOR_THICKNESS, d, x, y, z, rx || 0, ry || 0, rz || 0, floorMat);
  // Walls at the edges (in local coords, offset along x)
  const cos_rz = Math.cos(rz || 0);
  const sin_rz = Math.sin(rz || 0);
  const cos_rx = Math.cos(rx || 0);
  const sin_rx = Math.sin(rx || 0);
  const wOff = w / 2 + WALL_THICKNESS / 2;
  // For simplicity, add walls slightly wider
  addBox(WALL_THICKNESS, WALL_HEIGHT, d,
    x - wOff * Math.cos(ry || 0), y + WALL_HEIGHT * 0.3, z + wOff * Math.sin(ry || 0),
    rx || 0, ry || 0, rz || 0, wallMat || trackMaterials.wall, true);
  addBox(WALL_THICKNESS, WALL_HEIGHT, d,
    x + wOff * Math.cos(ry || 0), y + WALL_HEIGHT * 0.3, z - wOff * Math.sin(ry || 0),
    rx || 0, ry || 0, rz || 0, wallMat || trackMaterials.wall, true);
}

// ---- SECTION 1: START RAMP (y: 30 → 26) ----
{
  // Wide starting platform - Wider and deeper
  addBox(6, 0.3, 5, 0, 30.5, 0, 0, 0, 0, trackMaterials.ramp);
  // Walls on platform - Higher and fully enclosing
  const wallH = 1.5;
  addBox(0.2, wallH, 5, -3.1, 31.25, 0, 0, 0, 0, trackMaterials.wall, true); // Left
  addBox(0.2, wallH, 5, 3.1, 31.25, 0, 0, 0, 0, trackMaterials.wall, true); // Right
  addBox(6.4, wallH, 0.2, 0, 31.25, 2.6, 0, 0, 0, trackMaterials.wall, true); // Back
  
  // Front "gate" corners to guide into ramp
  addBox(1.0, wallH, 0.2, -2.5, 31.25, -2.6, 0, 0, 0, trackMaterials.wall, true);
  addBox(1.0, wallH, 0.2, 2.5, 31.25, -2.6, 0, 0, 0, trackMaterials.wall, true);

  // Downward ramp from platform into funnel - Wider with higher walls
  addBox(4.5, 0.2, 6, 0, 28.5, -4, -0.18, 0, 0, trackMaterials.ramp);
  addBox(0.2, 1.2, 6, -2.35, 29, -4, -0.18, 0, 0, trackMaterials.wall, true);
  addBox(0.2, 1.2, 6, 2.35, 29, -4, -0.18, 0, 0, trackMaterials.wall, true);
}

// ---- SECTION 2: WIDE FUNNEL/BOWL (y: 26 → 22) ----
{
  const funnelY = 25;
  // Outer cone (visual)
  const funnelOuterGeom = new THREE.ConeGeometry(5, 4, 32, 1, true);
  const funnelOuterMat = new THREE.MeshStandardMaterial({
    color: 0xcc8844, metalness: 0.5, roughness: 0.4,
    side: THREE.DoubleSide, transparent: true, opacity: 0.4,
  });
  const funnelOuterMesh = new THREE.Mesh(funnelOuterGeom, funnelOuterMat);
  funnelOuterMesh.position.set(0, funnelY, -9);
  scene.add(funnelOuterMesh);

  // Build funnel with ring of angled boxes
  const funnelSegments = 20;
  for (let i = 0; i < funnelSegments; i++) {
    const angle = (i / funnelSegments) * Math.PI * 2;
    const r = 4.2;
    const px = Math.cos(angle) * r;
    const pz = Math.sin(angle) * r - 9;
    const segW = 2.8;
    const segD = 0.25;
    // Tilt inward
    addBox(segW, segD, 1.8,
      px * 0.55, funnelY + 0.5, pz,
      0.6, angle, 0,
      trackMaterials.funnel);
  }

  // Funnel floor (angled disc to guide marbles out)
  for (let ring = 0; ring < 3; ring++) {
    const rr = 1.5 + ring * 1.2;
    const segs = 12 + ring * 4;
    for (let i = 0; i < segs; i++) {
      const angle = (i / segs) * Math.PI * 2;
      const px = Math.cos(angle) * rr;
      const pz = Math.sin(angle) * rr - 9;
      const tilt = 0.15 + ring * 0.15;
      addBox(1.0, 0.15, 0.8,
        px * 0.7, funnelY - 1.5 + ring * 0.3, pz,
        tilt, angle, 0,
        trackMaterials.funnel);
    }
  }

  // Central exit hole guides marbles down-left
  addBox(2, 0.15, 2, 0, funnelY - 2.2, -9, -0.15, 0, 0, trackMaterials.funnel);

  // Transition ramp from funnel to zigzag - Wider and Safer
  addBox(3.5, 0.2, 3, 0, funnelY - 3, -11, -0.2, 0, 0, trackMaterials.funnel);
  addBox(0.2, 1.2, 3, -1.8, funnelY - 2.5, -11, -0.2, 0, 0, trackMaterials.wall, true);
  addBox(0.2, 1.2, 3, 1.8, funnelY - 2.5, -11, -0.2, 0, 0, trackMaterials.wall, true);
}

// ---- SECTION 3: ZIGZAG SWITCHBACKS (y: 22 → 10) ----
{
  const zigzagStartY = 21;
  const zigzagX = 0;
  const zigzagZ = -13;
  const rampLen = 8;
  const rampW = 3.5; // Slightly wider
  const yDrop = 1.6;
  const zStep = 0;
  const numZigs = 8;

  for (let i = 0; i < numZigs; i++) {
    const direction = i % 2 === 0 ? 1 : -1;
    const yy = zigzagStartY - i * yDrop;
    const xOff = direction * 3.5;
    const slope = -0.12;

    // Main ramp surface
    addBox(rampLen, FLOOR_THICKNESS, rampW,
      zigzagX + xOff * 0.5, yy, zigzagZ - i * 1.2,
      0, 0, slope * direction,
      trackMaterials.zigzag);

    // Walls - HIGHER
    const wallH = 1.2;
    addBox(rampLen, wallH, WALL_THICKNESS,
      zigzagX + xOff * 0.5, yy + wallH/2 - 0.1, zigzagZ - i * 1.2 - rampW/2,
      0, 0, slope * direction,
      trackMaterials.wall, true);
    addBox(rampLen, wallH, WALL_THICKNESS,
      zigzagX + xOff * 0.5, yy + wallH/2 - 0.1, zigzagZ - i * 1.2 + rampW/2,
      0, 0, slope * direction,
      trackMaterials.wall, true);

    // End bumper (redirects marble) — except last one
    if (i < numZigs - 1) {
      const bumpX = zigzagX + xOff;
      // Tall bumper
      addBox(WALL_THICKNESS, 2.0, rampW + 0.5,
        bumpX + direction * rampLen * 0.45, yy + 0.5, zigzagZ - i * 1.2,
        0, 0, 0,
        trackMaterials.rail);

      // Connecting curved piece - WIDER CATCH
      addBox(2.0, FLOOR_THICKNESS, rampW,
        bumpX + direction * (rampLen * 0.35), yy - yDrop * 0.5, zigzagZ - (i + 0.5) * 1.2,
        -0.2, 0, 0,
        trackMaterials.zigzag);
      
      // Extra safety wall on the catch
      const safetyX = bumpX + direction * (rampLen * 0.35);
      const safetyZ = zigzagZ - (i + 0.5) * 1.2;
      // Depending on turn, we need a backstop. The bumper handles the main stop.
      // We need side containment on the connector.
    }
  }
}

// ---- SECTION 4: SPIRAL/HELIX (y: 8 → -2) ----
{
  const helixCenterX = -2;
  const helixCenterZ = -25;
  const helixTopY = 8;
  const helixRadius = 3.5;
  const helixTurns = 3;
  const helixSegments = helixTurns * 16;
  const helixHeightDrop = 10;
  const segWidth = 2.2;

  // Central column
  addCylinder(0.5, 0.5, helixHeightDrop + 2,
    helixCenterX, helixTopY - helixHeightDrop/2, helixCenterZ,
    0, 0, 0, trackMaterials.column, 12);

  // Transition from zigzag to helix
  addBox(3, 0.2, 5, -1, 8.5, -20, -0.1, 0.3, 0, trackMaterials.zigzag);
  addBox(0.15, 0.7, 5, -2.5, 8.9, -20, -0.1, 0.3, 0, trackMaterials.wall, true);
  addBox(0.15, 0.7, 5, 0.5, 8.9, -20, -0.1, 0.3, 0, trackMaterials.wall, true);

  for (let i = 0; i < helixSegments; i++) {
    const t = i / helixSegments;
    const angle = t * helixTurns * Math.PI * 2;
    const px = helixCenterX + Math.cos(angle) * helixRadius;
    const pz = helixCenterZ + Math.sin(angle) * helixRadius;
    const py = helixTopY - t * helixHeightDrop;

    const nextAngle = (i + 1) / helixSegments * helixTurns * Math.PI * 2;
    const yaw = Math.atan2(
      Math.cos(nextAngle) - Math.cos(angle),
      Math.sin(nextAngle) - Math.sin(angle)
    );

    // Track segment
    addBox(segWidth, 0.15, 1.6,
      px, py, pz,
      -0.08, -angle + Math.PI/2, 0.12,
      trackMaterials.helix);

    // Inner rail (every other segment)
    if (i % 2 === 0) {
      addBox(WALL_THICKNESS, 0.8, 1.6,
        helixCenterX + Math.cos(angle) * (helixRadius - segWidth * 0.45), py + 0.4, helixCenterZ + Math.sin(angle) * (helixRadius - segWidth * 0.45),
        0, -angle + Math.PI/2, 0,
        trackMaterials.wall, true);
    }

    // Outer rail - MUCH HIGHER to prevent fly-offs
    addBox(WALL_THICKNESS, 1.5, 1.6,
      helixCenterX + Math.cos(angle) * (helixRadius + segWidth * 0.45), py + 0.75, helixCenterZ + Math.sin(angle) * (helixRadius + segWidth * 0.45),
      0, -angle + Math.PI/2, 0,
      trackMaterials.wall, true);
  }
}

// ---- SECTION 5: HALF-PIPE / WAVE SECTION (y: -2 → -8) ----
{
  const waveStartY = -2.5;
  const waveZ = -25;
  const waveLen = 18;
  const waveSegments = 24;
  const waveAmplitude = 0.6;

  // Transition from helix
  addBox(3, 0.2, 3, -2, -1.8, -25, -0.1, 0, 0, trackMaterials.helix);

  for (let i = 0; i < waveSegments; i++) {
    const t = i / waveSegments;
    const xPos = -6 + t * waveLen;
    const yWave = Math.sin(t * Math.PI * 4) * waveAmplitude;
    const yy = waveStartY - t * 5 + yWave;

    // Half-pipe floor
    addBox(1.0, 0.15, 3.5,
      xPos, yy, waveZ,
      0, 0, 0,
      trackMaterials.wave);

    // Side walls (taller for half-pipe effect)
    if (i % 2 === 0) {
      addBox(1.0, 1.2, 0.12,
        xPos, yy + 0.5, waveZ - 1.8,
        0.25, 0, 0,
        trackMaterials.wall, true);
      addBox(1.0, 1.2, 0.12,
        xPos, yy + 0.5, waveZ + 1.8,
        -0.25, 0, 0,
        trackMaterials.wall, true);
    }
  }
}

// ---- SECTION 6: NARROW CHANNEL (y: -8 → -13) ----
{
  const chanY = -8;
  const chanZ = -25;
  const chanLen = 10;

  // Transition piece
  addBox(3, 0.2, 2.5, 12.5, -7.5, chanZ, 0, 0, -0.05, trackMaterials.wave);

  // Narrow channel — barely 2 marbles wide
  const chanW = 1.4;
  for (let i = 0; i < 12; i++) {
    const t = i / 12;
    const xPos = 14 + t * -chanLen;
    const yy = chanY - t * 4.5;
    const curve = Math.sin(t * Math.PI * 3) * 1.5;

    addBox(1.2, 0.15, chanW,
      xPos, yy, chanZ + curve,
      0, t * 0.2, -0.06,
      trackMaterials.channel);

    // Tight walls
    addBox(1.2, 0.6, WALL_THICKNESS,
      xPos, yy + 0.3, chanZ + curve - chanW/2,
      0, t * 0.2, 0,
      trackMaterials.wall, true);
    addBox(1.2, 0.6, WALL_THICKNESS,
      xPos, yy + 0.3, chanZ + curve + chanW/2,
      0, t * 0.2, 0,
      trackMaterials.wall, true);
  }
}

// ---- SECTION 7: SECOND FUNNEL / BOTTLENECK (y: -13 → -17) ----
{
  const f2Y = -13.5;
  const f2Z = -22;

  // Transition
  addBox(2.5, 0.2, 3, 4, -12.5, -23.5, -0.15, 0.3, 0, trackMaterials.channel);

  // Small funnel — cone shape
  const funnelGeom = new THREE.ConeGeometry(3, 3, 20, 1, true);
  const funnelMat = new THREE.MeshStandardMaterial({
    color: 0xaa6633, metalness: 0.5, roughness: 0.4,
    side: THREE.DoubleSide, transparent: true, opacity: 0.35,
  });
  const funnelMesh = new THREE.Mesh(funnelGeom, funnelMat);
  funnelMesh.position.set(3, f2Y, f2Z);
  scene.add(funnelMesh);

  // Funnel physics — ring of angled segments
  const f2Segs = 14;
  for (let i = 0; i < f2Segs; i++) {
    const angle = (i / f2Segs) * Math.PI * 2;
    const r = 2.2;
    const px = 3 + Math.cos(angle) * r * 0.5;
    const pz = f2Z + Math.sin(angle) * r * 0.5;

    addBox(1.6, 0.12, 1.0,
      px, f2Y, pz,
      0.5, angle, 0,
      trackMaterials.funnel2);
  }

  // Narrow exit
  addBox(1.4, 0.15, 1.4, 3, f2Y - 1.8, f2Z, 0, 0, 0, trackMaterials.funnel2);

  // Transition out - Wider and safer
  addBox(3, 0.2, 3, 3, f2Y - 2.5, f2Z + 2, -0.2, 0, 0, trackMaterials.funnel2);
  addBox(0.12, 1.2, 3, 1.5, f2Y - 2.0, f2Z + 2, -0.2, 0, 0, trackMaterials.wall, true);
  addBox(0.12, 1.2, 3, 4.5, f2Y - 2.0, f2Z + 2, -0.2, 0, 0, trackMaterials.wall, true);
}

// ---- SECTION 8: LONG GENTLE SLOPE WITH BANKED CURVES (y: -17 → -25) ----
{
  const bankY = -17;
  const bankStartZ = -18;

  // Long sweeping S-curve with banking
  const curveSegments = 30;
  for (let i = 0; i < curveSegments; i++) {
    const t = i / curveSegments;
    const xPos = 3 + Math.sin(t * Math.PI * 2.5) * 5;
    const zPos = bankStartZ + t * 16;
    const yy = bankY - t * 7.5;

    // Derivative for banking
    const dt = 1 / curveSegments;
    const xNext = 3 + Math.sin((t + dt) * Math.PI * 2.5) * 5;
    const banking = (xNext - xPos) * 0.08;

    addBox(2.8, 0.15, 1.2,
      xPos, yy, zPos,
      0, 0, banking,
      trackMaterials.banked);

    // Side rails - NO GAPS, HIGHER
    addBox(0.15, 0.8, 1.2,
      xPos - 1.4, yy + 0.35, zPos,
      0, 0, banking,
      trackMaterials.rail);
    addBox(0.15, 0.8, 1.2,
      xPos + 1.4, yy + 0.35, zPos,
      0, 0, banking,
      trackMaterials.rail);
  }
}

// ---- SECTION 9: JUMP GAP (y: -25 → -27) ----
{
  const jumpY = -25;
  const jumpZ = -2;

  // Launch ramp (upward angle) - Side walls higher
  addBox(3, 0.2, 3, 3, jumpY, jumpZ, 0.15, 0, 0, trackMaterials.jump);
  addBox(0.2, 1.0, 3, 1.4, jumpY + 0.4, jumpZ, 0.15, 0, 0, trackMaterials.rail);
  addBox(0.2, 1.0, 3, 4.6, jumpY + 0.4, jumpZ, 0.15, 0, 0, trackMaterials.rail);

  // GAP (nothing here — marbles must fly!)

  // Landing ramp - WIDER CATCH AREA
  addBox(5.0, 0.2, 3, 3, jumpY - 1.8, jumpZ + 5, -0.12, 0, 0, trackMaterials.jump);
  // Funneling walls on landing
  addBox(0.2, 1.2, 3, 0.4, jumpY - 1.3, jumpZ + 5, -0.12, 0, -0.1, trackMaterials.rail); // Angled in
  addBox(0.2, 1.2, 3, 5.6, jumpY - 1.3, jumpZ + 5, -0.12, 0, 0.1, trackMaterials.rail);  // Angled in

  // "DANGER" colored strips on launch ramp
  addBox(3, 0.025, 0.15, 3, jumpY + 0.15, jumpZ - 1, 0.15, 0, 0,
    new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.3 }));
  addBox(3, 0.025, 0.15, 3, jumpY + 0.12, jumpZ - 0.5, 0.15, 0, 0,
    new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 0.3 }));
}

// ---- SECTION 10: FINAL STRAIGHT & FINISH BOWL (y: -27 → -32) ----
{
  const finY = -27.5;
  const finZ = 8;

  // Final straight descent
  addBox(3, 0.2, 8, 3, finY - 1.5, finZ + 3, -0.08, 0, 0, trackMaterials.finish);
  addBox(0.12, 0.6, 8, 1.5, finY - 1.2, finZ + 3, -0.08, 0, 0, trackMaterials.rail);
  addBox(0.12, 0.6, 8, 4.5, finY - 1.2, finZ + 3, -0.08, 0, 0, trackMaterials.rail);

  // Finish line marker
  const finishLineMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffd700, emissiveIntensity: 0.5,
  });
  addBox(3.5, 0.03, 0.3, 3, finY - 1.9, finZ + 5, -0.08, 0, 0, finishLineMat);

  // Checker pattern on finish line
  for (let cx = 0; cx < 6; cx++) {
    const checkerMat = new THREE.MeshStandardMaterial({
      color: cx % 2 === 0 ? 0x000000 : 0xffffff,
      emissive: cx % 2 === 0 ? 0x000000 : 0xffd700,
      emissiveIntensity: 0.2,
    });
    addBox(0.5, 0.04, 0.2, 1.5 + cx * 0.55, finY - 2.0, finZ + 6, -0.08, 0, 0, checkerMat);
  }

  // Collection bowl at the very end
  const bowlY = FINISH_Y;
  const bowlZ = finZ + 8;

  // Bowl floor
  addBox(5, 0.3, 5, 3, bowlY, bowlZ, 0, 0, 0, trackMaterials.finish);

  // Bowl walls
  addBox(0.2, 1.5, 5, 0.5, bowlY + 0.75, bowlZ, 0, 0, 0, trackMaterials.wall, true);
  addBox(0.2, 1.5, 5, 5.5, bowlY + 0.75, bowlZ, 0, 0, 0, trackMaterials.wall, true);
  addBox(5, 1.5, 0.2, 3, bowlY + 0.75, bowlZ + 2.5, 0, 0, 0, trackMaterials.wall, true);
  addBox(5, 1.5, 0.2, 3, bowlY + 0.75, bowlZ - 2.5, 0, 0, 0, trackMaterials.wall, true);
}

// ============================================================
//  MARBLE MANAGEMENT
// ============================================================

function createMarbleMesh(teamColor) {
  const geom = new THREE.SphereGeometry(MARBLE_RADIUS, 32, 32);
  const mat = new THREE.MeshStandardMaterial({
    color: teamColor,
    metalness: 0.85,
    roughness: 0.1,
    envMapIntensity: 1.5,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;

  // Glass-like highlight ring
  const ringGeom = new THREE.TorusGeometry(MARBLE_RADIUS * 0.7, MARBLE_RADIUS * 0.08, 8, 16);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, transparent: true, opacity: 0.3,
    metalness: 1, roughness: 0,
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.rotation.x = Math.PI / 3;
  mesh.add(ring);

  return mesh;
}

function spawnMarble(teamIndex, xOffset, zOffset) {
  const team = TEAMS[teamIndex % TEAMS.length];
  const mesh = createMarbleMesh(team.color);
  scene.add(mesh);

  const body = new CANNON.Body({
    mass: MARBLE_MASS,
    shape: new CANNON.Sphere(MARBLE_RADIUS),
    material: marblePhysMaterial,
    linearDamping: MARBLE_LINEAR_DAMPING,
    angularDamping: MARBLE_ANGULAR_DAMPING,
  });

  body.position.set(
    (xOffset || 0) + (Math.random() - 0.5) * 1.5,
    31.2 + Math.random() * 0.3,
    (zOffset || 0) + (Math.random() - 0.5) * 0.5
  );
  world.addBody(body);

  const marble = {
    body, mesh, team,
    status: 'racing',   // 'racing', 'finished', 'eliminated'
    finishTime: null,
    lastPos: body.position.clone(),
    stuckSince: null,
    teamIndex,
  };

  marbles.push(marble);
  return marble;
}

function startRace() {
  resetScene();
  raceActive = true;
  raceStartTime = performance.now();
  finishOrder = [];

  const count = 8;
  for (let i = 0; i < count; i++) {
    const xOff = (i % 4 - 1.5) * 0.8;
    const zOff = i < 4 ? 0 : -0.8;
    spawnMarble(i, xOff, zOff);
  }
  nextTeamIndex = count;

  showAnnouncement('🏁 GO! GO! GO!', 2000);
  updateLeaderboard();
}

function dropSingleMarble() {
  const m = spawnMarble(nextTeamIndex, 0, 0);
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
  document.getElementById('timer-display').textContent = '0.00s';
  document.getElementById('marble-list').innerHTML =
    '<div style="color: rgba(255,255,255,0.3); font-size: 12px; text-align: center; padding: 8px;">Press Start Race!</div>';
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

    // Check finish
    if (pos.y < FINISH_Y + 1 && pos.y > FINISH_Y - 3 && pos.z > 14) {
      m.status = 'finished';
      m.finishTime = elapsed;
      finishOrder.push(m);
      const place = finishOrder.length;
      if (place === 1) {
        showAnnouncement(`🏆 ${m.team.name} WINS!`, 3000);
      }
    }

    // Check elimination (fell off track)
    if (pos.y < ELIMINATE_Y) {
      m.status = 'eliminated';
      m.finishTime = elapsed;
      // Remove physics body so it stops falling
      world.removeBody(m.body);
      m.mesh.visible = false;
    }

    // Check stuck (hasn't moved significantly in STUCK_TIMEOUT)
    const dist = pos.distanceTo(m.lastPos);
    if (dist < 0.05) {
      if (!m.stuckSince) m.stuckSince = now;
      if (now - m.stuckSince > STUCK_TIMEOUT) {
        m.status = 'eliminated';
        m.finishTime = elapsed;
        world.removeBody(m.body);
        m.mesh.visible = false;
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
  
  // Find the lowest racing marble
  marbles.forEach(m => {
    if (m.status === 'racing') {
      // Prioritize marbles that are actually on the track
      // If a marble falls below the elimination threshold but hasn't been processed yet, ignore it
      if (m.body.position.y < lowestY && m.body.position.y > ELIMINATE_Y + 5) {
        lowestY = m.body.position.y;
        leader = m;
      }
    }
  });

  // Fallback: if all racing marbles are falling, just pick the last valid one we saw or the highest one
  if (!leader) {
     const racing = marbles.filter(m => m.status === 'racing');
     if (racing.length > 0) {
       leader = racing[0]; // Just pick one
     }
  }

  return leader;
}

// ============================================================
//  UI UPDATES
// ============================================================

function updateTimer() {
  if (!raceActive) return;
  const elapsed = (performance.now() - raceStartTime) / 1000;
  document.getElementById('timer-display').textContent = elapsed.toFixed(2) + 's';
}

function updateLeaderboard() {
  const list = document.getElementById('marble-list');
  if (marbles.length === 0) return;

  // Sort: finished first (by finish time), then racing (by y pos ascending = lower is further), then eliminated
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
    let statusText = '';
    let statusClass = m.status;
    let positionBadge = '';

    if (m.status === 'finished') {
      const place = finishOrder.indexOf(m) + 1;
      const placeClass = place <= 3 ? ` p${place}` : '';
      positionBadge = `<span class="position-badge${placeClass}">#${place}</span>`;
      statusText = m.finishTime.toFixed(2) + 's';
    } else if (m.status === 'eliminated') {
      statusText = '💀 OUT';
    } else {
      statusText = '🏃 Racing';
    }

    html += `<div class="marble-entry">
      ${positionBadge}
      <span class="marble-dot" style="background: ${color}"></span>
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
  
  // If we have a leader, update target
  if (leader) {
    const pos = leader.body.position;
    // Don't follow if falling to death
    if (pos.y > ELIMINATE_Y) {
       currentCameraTarget = new THREE.Vector3(pos.x, pos.y, pos.z);
    }
  }

  if (currentCameraTarget) {
     // Smooth camera follow
    const camOffset = new THREE.Vector3(15, 12, 15); // Higher and further back for better view
    const desiredPos = currentCameraTarget.clone().add(camOffset);

    camera.position.lerp(desiredPos, 0.05);
    controls.target.lerp(currentCameraTarget, 0.05);
  }
}

function toggleCamera() {
  followCamera = !followCamera;
  document.getElementById('btn-camera').textContent = followCamera ? '📷 Free Camera' : '📷 Follow Leader';
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

  // Physics step
  world.fixedStep(1/60, delta);

  // Sync marble meshes
  marbles.forEach(m => {
    if (m.status === 'racing') {
      m.mesh.position.copy(m.body.position);
      m.mesh.quaternion.copy(m.body.quaternion);
    }
  });

  // Race logic
  if (raceActive) {
    checkFinishAndEliminate();
    updateTimer();

    leaderboardTimer += delta;
    if (leaderboardTimer > 0.3) {
      updateLeaderboard();
      leaderboardTimer = 0;
    }

    // Check if race is over
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

  // Camera
  updateCamera();
  controls.update();

  // Subtle star rotation
  scene.children.forEach(c => {
    if (c instanceof THREE.Points) {
      c.rotation.y += 0.00005;
    }
  });

  renderer.render(scene, camera);
}

animate();

// ============================================================
//  WINDOW RESIZE
// ============================================================

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
