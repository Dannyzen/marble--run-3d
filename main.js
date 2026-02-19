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

// ============================================================
//  THREE.JS
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
scene.fog = new THREE.Fog(0xffffff, 50, 400);

const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.1, 1000
);
camera.position.set(40, 80, 60);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0; 
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxDistance = 400;

// --- LIGHTS ---
scene.add(new THREE.AmbientLight(0xffffff, 0.7));

const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(100, 200, 100);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

scene.add(new THREE.DirectionalLight(0xffffff, 0.4).translateX(-50).translateY(50));

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
  buildSmoothTrack(trackCurve, world, scene, trackPhysMat);

  // --- STARTING PLATFORM ---
  const sp = controlPoints[0];
  const platW = 12;
  const platD = 12;
  const platH = 0.6;
  
  const platGeom = new THREE.BoxGeometry(platW, platH, platD);
  const platMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, metalness: 0.1, roughness: 0.5 });
  const platMesh = new THREE.Mesh(platGeom, platMat);
  platMesh.position.set(sp.x, sp.y - 0.3, sp.z + platD/2 + 2);
  platMesh.receiveShadow = true;
  scene.add(platMesh);

  const platBody = new CANNON.Body({ mass: 0, material: trackPhysMat });
  platBody.addShape(new CANNON.Box(new CANNON.Vec3(platW/2, platH/2, platD/2)));
  platBody.position.copy(platMesh.position);
  world.addBody(platBody);

  // Platform Walls
  const wallH = 3;
  const wallT = 0.4;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, transparent: true, opacity: 0.2 });
  
  const addWall = (w, h, d, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    const b = new CANNON.Body({ mass: 0, material: trackPhysMat });
    b.addShape(new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2)));
    b.position.copy(mesh.position);
    world.addBody(b);
  };

  addWall(platW, wallH, wallT, sp.x, sp.y + wallH/2, sp.z + platD + 2); // Back
  addWall(wallT, wallH, platD, sp.x - platW/2, sp.y + wallH/2, sp.z + platD/2 + 2); // Left
  addWall(wallT, wallH, platD, sp.x + platW/2, sp.y + wallH/2, sp.z + platD/2 + 2); // Right
}

buildLugeTrack();

// ============================================================
//  MARBLES
// ============================================================

function createMarbleMesh(teamColor) {
  const geom = new THREE.SphereGeometry(MARBLE_RADIUS, 32, 32);
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
  body.position.set(sp.x + (xOff || 0), sp.y + 1.5, sp.z + 8 + (zOff || 0));
  world.addBody(body);

  if (applyImpulse) {
    body.applyImpulse(new CANNON.Vec3(0, 0, -15), new CANNON.Vec3(0, 0, 0));
  }

  marbles.push({ body, mesh, team, status: 'racing', lastPos: body.position.clone(), teamIndex });
}

function startRace() {
  resetScene();
  raceActive = true;
  raceStartTime = performance.now();
  for (let i = 0; i < 8; i++) {
    spawnMarble(i, (i % 3 - 1) * 2, Math.floor(i / 3) * 2, true);
  }
  showAnnouncement('🌊 WATER SLIDE READY!', 2000);
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
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  for (let s = 0; s < 4; s++) world.step(1 / 180, delta / 4);
  marbles.forEach(m => {
    if (m.status === 'racing') { m.mesh.position.copy(m.body.position); m.mesh.quaternion.copy(m.body.quaternion); }
  });
  if (raceActive) { checkFinishAndEliminate(); document.getElementById('timer-display').textContent = ((performance.now() - raceStartTime)/1000).toFixed(2) + 's'; }
  updateCamera(); controls.update(); renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
