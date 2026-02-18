import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ============================================================
//  OLYMPIC LUGE MARBLE RUN 3D
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
const GRAVITY = -25; // High gravity for speed
const PHYSICS_STEPS = 5; // Extra sub-steps for stability
const FINISH_Y = -60;
const ELIMINATE_Y = -100;
const STUCK_TIMEOUT = 3000;

// --- STATE ---
let marbles = [];
let raceActive = false;
let raceStartTime = 0;
let finishOrder = [];
let followCamera = true;
let nextTeamIndex = 0;
let cameraTargetPos = new THREE.Vector3();

// --- THREE.JS SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1020);
scene.fog = new THREE.FogExp2(0x0a1020, 0.008);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(20, 30, 20);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxDistance = 100;

// --- LIGHTING ---
const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
sunLight.position.set(50, 80, 50);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 200;
sunLight.shadow.camera.left = -50;
sunLight.shadow.camera.right = 50;
sunLight.shadow.camera.top = 50;
sunLight.shadow.camera.bottom = -50;
scene.add(sunLight);

// Track lights
const lightColors = [0xff0044, 0x00ff44, 0x4444ff];
for (let i = 0; i < 8; i++) {
  const pl = new THREE.PointLight(lightColors[i % 3], 0.8, 40);
  pl.position.set(Math.sin(i)*20, 20 - i*10, Math.cos(i)*20);
  scene.add(pl);
}

// --- PHYSICS SETUP ---
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
// High performance materials
const marbleMat = new CANNON.Material('marble');
const trackMat = new CANNON.Material('track');
const contactMat = new CANNON.ContactMaterial(trackMat, marbleMat, {
  friction: 0.1,       // Very slick (Ice/Luge)
  restitution: 0.1,    // Low bounce
  contactEquationStiffness: 1e8,
  contactEquationRelaxation: 3,
});
world.addContactMaterial(contactMat);

// ============================================================
//  TRACK GENERATION (LUGE STYLE)
// ============================================================

const trackMeshes = [];

// Helper to add a physics box with visual mesh
function createBox(w, h, d, pos, quat, color, isWall = false) {
  // Visual
  const mat = new THREE.MeshStandardMaterial({
    color: color,
    metalness: 0.4,
    roughness: 0.2,
    transparent: isWall,
    opacity: isWall ? 0.4 : 1.0,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.copy(pos);
  mesh.quaternion.copy(quat);
  mesh.castShadow = !isWall;
  mesh.receiveShadow = true;
  scene.add(mesh);
  trackMeshes.push(mesh);

  // Physics
  const body = new CANNON.Body({ mass: 0, material: trackMat });
  body.addShape(new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2)));
  body.position.copy(pos);
  body.quaternion.copy(quat);
  world.addBody(body);
  
  return { mesh, body };
}

// 1. Define the Path (Spline)
// We want a high start, drops, loops, and a finish.
const pathPoints = [
  new THREE.Vector3(0, 40, 0),        // Start Platform
  new THREE.Vector3(0, 38, -10),      // Initial drop
  new THREE.Vector3(10, 32, -20),     // Right Bank
  new THREE.Vector3(20, 25, -10),     // Curve back
  new THREE.Vector3(10, 20, 10),      // S-curve 1
  new THREE.Vector3(-10, 15, 0),      // S-curve 2
  new THREE.Vector3(-20, 10, -15),    // Big sweep
  new THREE.Vector3(-10, 5, -30),     // Bottom of sweep
  new THREE.Vector3(10, 0, -30),      // Straight
  new THREE.Vector3(25, -5, -15),     // Helix entry
  new THREE.Vector3(25, -10, 5),      // Helix mid
  new THREE.Vector3(10, -15, 15),     // Helix exit
  new THREE.Vector3(-5, -20, 15),     // Drop
  new THREE.Vector3(-15, -25, 5),     // Turn
  new THREE.Vector3(-15, -30, -10),   // Final stretch start
  new THREE.Vector3(0, -35, -20),     // Final straight
  new THREE.Vector3(0, -40, -30),     // Finish
];

const curve = new THREE.CatmullRomCurve3(pathPoints);
curve.tension = 0.5;
curve.type = 'catmullrom';

// 2. Extrude the Track
// We'll walk along the curve and place "ribs" of physics boxes.
// This approximates a smooth tube.

function buildTrack() {
  const samples = 80; // LOW segment count for performance (~240 bodies for track)
  const trackColor = 0x4466aa;
  const wallColor = 0x6688cc;
  const totalLen = curve.getLength();
  const segLen = (totalLen / samples) * 1.08; // overlap to prevent gaps

  // ── Start Platform: fully enclosed box ──
  createBox(8, 1, 8, new THREE.Vector3(0, 39.5, 2), new THREE.Quaternion(), 0x334455);
  createBox(0.5, 4, 8, new THREE.Vector3(-4.25, 41.5, 2), new THREE.Quaternion(), 0x334455, true);
  createBox(0.5, 4, 8, new THREE.Vector3(4.25, 41.5, 2), new THREE.Quaternion(), 0x334455, true);
  createBox(9, 4, 0.5, new THREE.Vector3(0, 41.5, 6.25), new THREE.Quaternion(), 0x334455, true);
  createBox(9, 4, 0.5, new THREE.Vector3(0, 41.5, -2.25), new THREE.Quaternion(), 0x334455, true);

  // ── Generate U-channel luge track along spline ──
  const floorW = 3.0;    // Wide floor
  const wallH = 2.2;     // Tall walls
  const thickness = 0.25;

  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const pos = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();

    // Compute curvature to bank turns
    const dt = 0.005;
    const t0 = Math.max(0, t - dt);
    const t1 = Math.min(1, t + dt);
    const tan0 = curve.getTangentAt(t0).normalize();
    const tan1 = curve.getTangentAt(t1).normalize();
    const curvatureVec = tan1.clone().sub(tan0);
    // Cross tangent with up → side direction; dot with curvature → signed curvature
    const side = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
    const signedCurvature = curvatureVec.dot(side);
    const bankAngle = THREE.MathUtils.clamp(signedCurvature * 8, -0.4, 0.4); // max ~23°

    // Build rotation frame
    let normal = new THREE.Vector3(0, 1, 0);
    let binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    if (binormal.lengthSq() < 0.001) {
      binormal.set(1, 0, 0);
    }
    normal.crossVectors(binormal, tangent).normalize();

    const rotMat = new THREE.Matrix4().makeBasis(binormal, normal, tangent);
    const baseQuat = new THREE.Quaternion().setFromRotationMatrix(rotMat);

    // Apply banking
    const bankQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1), bankAngle
    );
    const quat = baseQuat.clone().multiply(bankQuat);

    // Gentle undulation on straight sections (low curvature)
    const isRelativelyStraight = Math.abs(signedCurvature) < 0.02;
    const undulationAngle = isRelativelyStraight ? Math.sin(i * 0.7) * 0.04 : 0; // ~2-3°
    if (undulationAngle !== 0) {
      const undulationQ = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0), undulationAngle
      );
      quat.multiply(undulationQ);
    }

    // ── Floor ──
    createBox(floorW, thickness, segLen, pos.clone(), quat, trackColor);

    // ── Left Wall (tilted inward ~40°) ──
    const leftTiltAngle = -Math.PI / 4.5; // ~40° inward
    const leftWallOff = new THREE.Vector3(-floorW / 2 - 0.05, wallH / 2.5, 0);
    leftWallOff.applyQuaternion(quat);
    const leftWallPos = pos.clone().add(leftWallOff);
    const leftTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), leftTiltAngle);
    const leftQuat = quat.clone().multiply(leftTilt);
    // Outer wall in curves is extra tall
    const leftExtraH = signedCurvature > 0.01 ? wallH * 0.5 : 0;
    createBox(thickness, wallH + leftExtraH, segLen, leftWallPos, leftQuat, wallColor, true);

    // ── Right Wall (tilted inward ~40°) ──
    const rightTiltAngle = Math.PI / 4.5;
    const rightWallOff = new THREE.Vector3(floorW / 2 + 0.05, wallH / 2.5, 0);
    rightWallOff.applyQuaternion(quat);
    const rightWallPos = pos.clone().add(rightWallOff);
    const rightTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rightTiltAngle);
    const rightQuat = quat.clone().multiply(rightTilt);
    const rightExtraH = signedCurvature < -0.01 ? wallH * 0.5 : 0;
    createBox(thickness, wallH + rightExtraH, segLen, rightWallPos, rightQuat, wallColor, true);
  }

  // ── Finish: large enclosed bowl ──
  const endP = pathPoints[pathPoints.length - 1];
  createBox(14, 1, 14, new THREE.Vector3(endP.x, endP.y - 1, endP.z), new THREE.Quaternion(), 0x334455);
  createBox(1, 5, 14, new THREE.Vector3(endP.x - 7, endP.y + 1.5, endP.z), new THREE.Quaternion(), 0x334455, true);
  createBox(1, 5, 14, new THREE.Vector3(endP.x + 7, endP.y + 1.5, endP.z), new THREE.Quaternion(), 0x334455, true);
  createBox(15, 5, 1, new THREE.Vector3(endP.x, endP.y + 1.5, endP.z - 7), new THREE.Quaternion(), 0x334455, true);
  createBox(15, 5, 1, new THREE.Vector3(endP.x, endP.y + 1.5, endP.z + 7), new THREE.Quaternion(), 0x334455, true);
}

// ============================================================
//  MARBLE LOGIC
// ============================================================

function spawnMarble(idx) {
  const team = TEAMS[idx];
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(MARBLE_RADIUS, 32, 32),
    new THREE.MeshStandardMaterial({ color: team.color, metalness: 0.9, roughness: 0.1 })
  );
  mesh.castShadow = true;
  scene.add(mesh);

  const body = new CANNON.Body({
    mass: 1,
    material: marbleMat,
    shape: new CANNON.Sphere(MARBLE_RADIUS),
    linearDamping: 0.05,
    angularDamping: 0.05
  });
  
  // Spawn in grid pattern on start platform
  const row = Math.floor(idx / 3);
  const col = idx % 3;
  body.position.set( (col-1)*1.5, 41, 1 + row*1.5 );
  world.addBody(body);

  marbles.push({ mesh, body, team, status: 'racing', idx });
}

function updateGame() {
  // Leaderboard & Camera
  if (marbles.length === 0) return;

  let leader = marbles[0];
  let finishedCount = 0;

  marbles.forEach(m => {
    // Camera target (lowest marble that hasn't finished/died)
    if (m.status === 'racing') {
      if (m.body.position.y < leader.body.position.y) leader = m;
      
      // Check finish
      if (m.body.position.y < FINISH_Y && m.body.position.y > ELIMINATE_Y) {
         m.status = 'finished';
         finishOrder.push(m);
         showToast(`${m.team.name} Finished! #${finishOrder.length}`);
      }
      // Check death
      if (m.body.position.y < ELIMINATE_Y) {
         m.status = 'eliminated';
      }
    } else {
      finishedCount++;
    }
  });

  // Camera Follow
  if (followCamera && leader) {
    const p = leader.body.position;
    // Smooth Lerp
    const target = new THREE.Vector3(p.x, p.y, p.z);
    const offset = new THREE.Vector3(10, 15, 15);
    cameraTargetPos.lerp(target, 0.1);
    camera.position.lerp(target.clone().add(offset), 0.05);
    controls.target.copy(cameraTargetPos);
  }

  // Update UI
  const ui = document.getElementById('marble-list');
  if (ui) {
    let html = '';
    // Sort by status then Y position (race rank)
    const sorted = [...marbles].sort((a,b) => {
      if(a.status === 'finished' && b.status !== 'finished') return -1;
      if(b.status === 'finished' && a.status !== 'finished') return 1;
      if(a.status === 'finished') return finishOrder.indexOf(a) - finishOrder.indexOf(b);
      return a.body.position.y - b.body.position.y; // Lower y is better
    });
    
    sorted.forEach((m, i) => {
      let stat = m.status === 'racing' ? 'Runs' : (m.status === 'finished' ? 'DONE' : 'X');
      let rank = i + 1;
      html += `<div>#${rank} <span style="color:#${new THREE.Color(m.team.color).getHexString()}">●</span> ${m.team.name} (${stat})</div>`;
    });
    ui.innerHTML = html;
  }
}

function showToast(msg) {
  const el = document.getElementById('announcement');
  if(el) {
    el.innerText = msg;
    el.style.opacity = 1;
    setTimeout(() => el.style.opacity = 0, 3000);
  }
}

// ============================================================
//  INIT
// ============================================================

buildTrack();

// Controls
document.getElementById('btn-race').onclick = () => {
  marbles.forEach(m => { scene.remove(m.mesh); world.removeBody(m.body); });
  marbles = [];
  finishOrder = [];
  TEAMS.forEach((t, i) => spawnMarble(i));
  raceActive = true;
  raceStartTime = Date.now();
};

document.getElementById('btn-reset').onclick = () => {
  marbles.forEach(m => { scene.remove(m.mesh); world.removeBody(m.body); });
  marbles = [];
  finishOrder = [];
};

document.getElementById('btn-camera').onclick = () => {
  followCamera = !followCamera;
};

// Animation Loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  // Substep physics for smooth high speed collision
  for(let i=0; i<PHYSICS_STEPS; i++) {
    world.step(dt / PHYSICS_STEPS);
  }

  // Sync visual
  marbles.forEach(m => {
    m.mesh.position.copy(m.body.position);
    m.mesh.quaternion.copy(m.body.quaternion);
  });

  updateGame();
  controls.update();
  renderer.render(scene, camera);
}

animate();

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
