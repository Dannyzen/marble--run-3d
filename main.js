import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildSmoothTrack } from './track_builder.js';

// ============================================================
//  VIBRANT WATER SLIDE MARBLE RUN 3D
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
scene.background = new THREE.Color(0xffffff); // Force pure white
scene.fog = new THREE.Fog(0xffffff, 50, 400); // Standard fog for white bg

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

// Accent lights along course
const accentCols = [0x00ffff, 0x0088ff, 0x88ffff, 0x00ffcc, 0x00ccff];
for (let i = 0; i < accentCols.length; i++) {
  const pl = new THREE.PointLight(accentCols[i], 0.6, 80); 
  pl.position.set(Math.sin(i * 1.3) * 30, 40 - i * 25, Math.cos(i * 1.3) * 30);
  scene.add(pl);
}

// Add a darker helper grid to contrast against white
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
  friction: 0.02,       // EXTREMELY SLICK FOR WATER
  restitution: 0.1,    
  contactEquationStiffness: 1e8,
  contactEquationRelaxation: 3,
}));
world.addContactMaterial(new CANNON.ContactMaterial(marblePhysMat, marblePhysMat, {
  friction: 0.1,
  restitution: 0.15,
}));

// ============================================================
//  TRACK PATH (CatmullRom Spline)
// ============================================================
const controlPoints = [
  // --- START GATE ---
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

// ============================================================
//  BUILD THE TRACK (THE WATER SLIDE PROTOCOL)
// ============================================================

buildSmoothTrack(trackCurve, world, scene, trackPhysMat);

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
  body.position.set(
    sp.x + (xOff || 0),
    sp.y + 0.5,
    sp.z + 4 + (zOff || 0)
  );
  world.addBody(body);

  if (applyImpulse) {
    const impulse = new CANNON.Vec3(0, 0, -15);
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

  for (let i = 0; i < 8; i++) {
    const row = Math.floor(i / 2);
    const col = (i % 2) - 0.5;
    spawnMarble(i, col * 1.2, row * 1.2, true);
  }
  nextTeamIndex = 8;

  showAnnouncement('🌊 SPLASH! WATER SLIDE RACE!', 2000);
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

    if (pos.y < ELIMINATE_Y) {
      m.status = 'eliminated';
      m.finishTime = elapsed;
      world.removeBody(m.body);
      m.mesh.visible = false;
    }

    const dist = pos.distanceTo(m.lastPos);
    if (dist < 0.04) {
      if (!m.stuckSince) m.stuckSince = now;
      if (now - m.stuckSince > STUCK_TIMEOUT) {
        m.body.applyImpulse(
          new CANNON.Vec3((Math.random()-0.5)*5, -5, (Math.random()-0.5)*5),
          new CANNON.Vec3(0, 0, 0)
        );
        m.stuckSince = now;
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
  return leader || marbles.filter(m => m.status === 'racing')[0];
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
      currentCameraTarget.lerp(new THREE.Vector3(pos.x, pos.y, pos.z), 0.1);
    }
  }
  if (currentCameraTarget) {
    const offset = new THREE.Vector3(20, 15, 20);
    const desiredPos = currentCameraTarget.clone().add(offset);
    camera.position.lerp(desiredPos, 0.05);
    controls.target.lerp(currentCameraTarget, 0.08);
  }
}

function toggleCamera() {
  followCamera = !followCamera;
  document.getElementById('btn-camera').textContent =
    followCamera ? '📷 Free Camera' : '📷 Follow Leader';
}

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

  const subSteps = 4;
  for (let s = 0; s < subSteps; s++) {
    world.step(1 / 180, delta / subSteps);
  }

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
      updateLeaderboard();
    }
  }

  updateCamera();
  controls.update();
  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
