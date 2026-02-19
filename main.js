import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildSmoothTrack } from './track_builder.js';

// ============================================================
//  VIBRANT SOLID-TRACK MARBLE RUN 3D
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
let followCamera = true; // Hard-locked to true
let nextTeamIndex = 0;
let currentCameraTarget = null;
let trackData = null; // Store curve and radius for centripetal clamp

// ============================================================
//  THREE.JS
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111); // Dark background for performance/contrast
scene.fog = new THREE.Fog(0x111111, 100, 500);

const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.1, 1000
);
camera.position.set(40, 80, 60);

const renderer = new THREE.WebGLRenderer({ 
  antialias: window.devicePixelRatio < 2, // Only antialias on low-DPI (perf)
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap; // Faster shadows for mobile
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0; 
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxDistance = 400;

// --- LIGHTS (Optimized) ---
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(50, 100, 50);
sun.castShadow = true;
// Smaller shadow map for mobile performance
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -100;
sun.shadow.camera.right = 100;
sun.shadow.camera.top = 100;
sun.shadow.camera.bottom = -100;
scene.add(sun);

// Removed secondary light for performance

// --- GROUND GRID ---
const grid = new THREE.GridHelper(1000, 100, 0xdddddd, 0xeeeeee);
grid.position.y = -80;
scene.add(grid);

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
  friction: 0.02,       // VERY SLICK
  restitution: 0.1,
  contactEquationStiffness: 1e8,
  contactEquationRelaxation: 3,
}));

// ============================================================
//  TRACK PATH
// ============================================================
const controlPoints = [
  new THREE.Vector3(  0,   42,   0),
  new THREE.Vector3(  0,   40,  -5),
  new THREE.Vector3(  2,   37, -14),
  new THREE.Vector3(  5,   34, -22),
  new THREE.Vector3( 14,   30, -28),
  new THREE.Vector3( 22,   26, -22),
  new THREE.Vector3( 24,   22, -10),
  new THREE.Vector3( 18,   18,   0),
  new THREE.Vector3(  8,   15,   8),
  new THREE.Vector3( -4,   12,  10),
  new THREE.Vector3(-14,   10.5,   6),
  new THREE.Vector3(-20,    9,  -2),
  new THREE.Vector3(-22,   10, -10),
  new THREE.Vector3(-20,    8, -18),
  new THREE.Vector3(-16,    9, -24),
  new THREE.Vector3(-10,    6, -30),
  new THREE.Vector3(  0,    3, -34),
  new THREE.Vector3( 10,    0, -30),
  new THREE.Vector3( 14,   -3, -22),
  new THREE.Vector3( 18,   -7, -14),
  new THREE.Vector3( 14,  -11,  -6),
  new THREE.Vector3(  6,  -15, -10),
  new THREE.Vector3(  2,  -19, -18),
  new THREE.Vector3( -4,  -21, -24),
  new THREE.Vector3(-10,  -20, -28),
  new THREE.Vector3(-16,  -23, -30),
  new THREE.Vector3(-20,  -22, -34),
  new THREE.Vector3(-22,  -25, -38),
  new THREE.Vector3(-18,  -28, -44),
  new THREE.Vector3(-10,  -31, -48),
  new THREE.Vector3(  0,  -34, -46),
  new THREE.Vector3(  8,  -37, -42),
  new THREE.Vector3( 12,  -40, -36),
  new THREE.Vector3( 10,  -43, -28),
  new THREE.Vector3(  4,  -46, -20),
  new THREE.Vector3( -4,  -49, -16),
  new THREE.Vector3(-12,  -51, -12),
  new THREE.Vector3(-18,  -50, -8),
  new THREE.Vector3(-22,  -53, -2),
  new THREE.Vector3(-18,  -52,  4),
  new THREE.Vector3(-12,  -55,  8),
  new THREE.Vector3( -4,  -58,  12),
  new THREE.Vector3(  4,  -61,  14),
  new THREE.Vector3( 10,  -64,  10),
  new THREE.Vector3( 10,  -66,   2),
  new THREE.Vector3(  8,  -68,  -6),
  new THREE.Vector3(  5,  -69, -12),
];

const trackCurve = new THREE.CatmullRomCurve3(controlPoints, false, 'catmullrom', 0.4);

function buildLugeTrack() {
  // Main wide slide
  trackData = buildSmoothTrack(trackCurve, world, scene, trackPhysMat);
}

buildLugeTrack();

// ============================================================
//  MARBLES
// ============================================================

function createMarbleMesh(teamColor) {
  const geom = new THREE.SphereGeometry(MARBLE_RADIUS, 16, 16); // Reduced segments
  const mat = new THREE.MeshStandardMaterial({ color: teamColor, metalness: 0.85, roughness: 0.1 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
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
    linearDamping: 0.01,
    angularDamping: 0.1,
  });

  const sp = controlPoints[0];
  // SPAWN DIRECTLY IN THE MOUTH OF THE SLIDE
  body.position.set(
    sp.x + (xOff || 0),
    sp.y + 1.0, 
    sp.z + (zOff || 0)
  );
  world.addBody(body);

  if (applyImpulse) {
    // Forward impulse to get them moving immediately down the slide
    body.applyImpulse(new CANNON.Vec3(0, 0, -10), new CANNON.Vec3(0, 0, 0));
  }

  marbles.push({ body, mesh, team, status: 'racing', lastPos: body.position.clone(), teamIndex });
}

function startRace() {
  resetScene();
  raceActive = true;
  raceStartTime = performance.now();
  for (let i = 0; i < 4; i++) {
    spawnMarble(i, (i % 2 - 0.5) * 2, Math.floor(i / 2) * 2, true);
  }
  showAnnouncement('🌊 TUBE RACE: 4 BALLS!', 2000);
}

function resetScene() {
  marbles.forEach(m => { world.removeBody(m.body); scene.remove(m.mesh); });
  marbles = []; finishOrder = []; raceActive = false;
  document.getElementById('timer-display').textContent = '0.00s';
}

function checkFinishAndEliminate() {
  const now = performance.now();
  const elapsed = (now - raceStartTime) / 1000;
  marbles.forEach(m => {
    if (m.status !== 'racing') return;
    const pos = m.body.position;
    const ep = controlPoints[controlPoints.length - 1];
    if (pos.y < ep.y + 5 && Math.abs(pos.x - ep.x) < 10 && Math.abs(pos.z - ep.z) < 10) {
      m.status = 'finished'; m.finishTime = elapsed; finishOrder.push(m);
      if (finishOrder.length === 1) showAnnouncement(`🏆 ${m.team.name} WINS!`, 4000);
    }
    if (pos.y < ELIMINATE_Y) {
      m.status = 'eliminated'; world.removeBody(m.body); m.mesh.visible = false;
    }
  });
}

function updateCamera() {
  // Always follow the leader
  let leader = marbles.filter(m => m.status === 'racing').sort((a,b) => a.body.position.y - b.body.position.y)[0];
  if (leader) {
    const pos = leader.body.position;
    if (!currentCameraTarget) currentCameraTarget = new THREE.Vector3(pos.x, pos.y, pos.z);
    
    // Smooth lerp to leader position
    currentCameraTarget.lerp(new THREE.Vector3(pos.x, pos.y, pos.z), 0.15);
    
    // Dynamic chase distance
    const offset = new THREE.Vector3(20, 15, 20);
    const desiredPos = currentCameraTarget.clone().add(offset);
    camera.position.lerp(desiredPos, 0.08);
    controls.target.lerp(currentCameraTarget, 0.1);
  }
}

function showAnnouncement(text, duration) {
  const el = document.getElementById('announcement');
  el.textContent = text; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

document.getElementById('btn-race').addEventListener('click', startRace);
document.getElementById('btn-reset').addEventListener('click', resetScene);

const clock = new THREE.Clock();
const tempVec = new THREE.Vector3();

function applyCentripetalClamp(marble) {
  if (!trackData || marble.status !== 'racing') return;
  
  const pos = marble.body.position;
  // This is a simplified "closest point on curve" check
  // For better performance, we'd pre-calculate a lookup table,
  // but for 4 balls, getPointAt is okay if used sparingly.
  
  // Estimate 't' based on Y height (track is mostly vertical)
  const startY = controlPoints[0].y;
  const endY = controlPoints[controlPoints.length - 1].y;
  let t = (startY - pos.y) / (startY - endY);
  t = Math.max(0, Math.min(1, t));
  
  const centerPos = trackData.curve.getPointAt(t);
  const dist = Math.sqrt(
    Math.pow(pos.x - centerPos.x, 2) + 
    Math.pow(pos.z - centerPos.z, 2)
  );

  // If ball is outside radius (plus a small buffer), clamp it!
  const maxRadius = trackData.radius - MARBLE_RADIUS;
  if (dist > maxRadius) {
    const angle = Math.atan2(pos.z - centerPos.z, pos.x - centerPos.x);
    marble.body.position.x = centerPos.x + Math.cos(angle) * maxRadius;
    marble.body.position.z = centerPos.z + Math.sin(angle) * maxRadius;
    
    // Dampen velocity that is pushing OUTWARDS
    const vel = marble.body.velocity;
    const radialDirX = Math.cos(angle);
    const radialDirZ = Math.sin(angle);
    const dot = vel.x * radialDirX + vel.z * radialDirZ;
    if (dot > 0) {
      marble.body.velocity.x -= radialDirX * dot * 0.5;
      marble.body.velocity.z -= radialDirZ * dot * 0.5;
    }
  }

  // Velocity Cap to prevent tunneling
  const maxVel = 50;
  if (marble.body.velocity.length() > maxVel) {
    marble.body.velocity.scale(0.95, marble.body.velocity);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  
  // MOBILE OPTIMIZATION: fewer substeps but higher quality per step
  const subSteps = 3; 
  const timeStep = 1 / 60;
  
  for (let s = 0; s < subSteps; s++) {
    world.step(timeStep / subSteps);
    // Apply indestructible clamp after each physics step
    marbles.forEach(applyCentripetalClamp);
  }

  marbles.forEach(m => {
    if (m.status === 'racing') { 
      m.mesh.position.copy(m.body.position); 
      m.mesh.quaternion.copy(m.body.quaternion); 
    }
  });
  
  if (raceActive) { 
    checkFinishAndEliminate(); 
    document.getElementById('timer-display').textContent = ((performance.now() - raceStartTime)/1000).toFixed(2) + 's'; 
  }
  
  updateCamera(); 
  controls.update(); 
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
