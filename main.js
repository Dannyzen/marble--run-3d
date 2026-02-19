import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildSmoothTrack } from './track_builder.js';

// --- CONFIG ---
const MARBLE_RADIUS = 0.28;
const GRAVITY = -25;
const MAX_VELOCITY = 45; // Prevents "teleporting"
const PIPE_RADIUS = 3.5;

// --- STATE ---
let marbles = [];
let raceActive = false;
let raceStartTime = 0;
let finishOrder = [];
let trackCurve = null;

// --- THREE.JS SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
scene.fog = new THREE.Fog(0xffffff, 50, 400);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(40, 80, 60);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap; // Optimized for mobile
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxDistance = 400;

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(50, 100, 50);
sun.castShadow = true;
scene.add(sun);

// --- PHYSICS SETUP ---
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
const trackPhysMat = new CANNON.Material('track');
const marblePhysMat = new CANNON.Material('marble');
world.addContactMaterial(new CANNON.ContactMaterial(trackPhysMat, marblePhysMat, { friction: 0.01, restitution: 0.1 }));

// --- PATH ---
const points = [
  new THREE.Vector3(0,42,0), new THREE.Vector3(5,35,-20), new THREE.Vector3(25,25,-10),
  new THREE.Vector3(15,15,15), new THREE.Vector3(-15,10,20), new THREE.Vector3(-30,0,0),
  new THREE.Vector3(-10,-15,-20), new THREE.Vector3(10,-30,0), new THREE.Vector3(0,-50,20),
  new THREE.Vector3(0,-70,0)
];
trackCurve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
buildSmoothTrack(trackCurve, world, scene, trackPhysMat);

// --- MARBLES ---
const TEAMS = [0xff2244, 0x2266ff, 0x22cc44, 0xffcc00];

function startRace() {
  marbles.forEach(m => { scene.remove(m.mesh); world.removeBody(m.body); });
  marbles = []; finishOrder = []; raceActive = true;
  raceStartTime = performance.now();

  const sp = points[0];
  const nextPoint = points[1];
  const startDir = new THREE.Vector3().subVectors(nextPoint, sp).normalize();

  // STAGGERED LINEUP: Give each ball a unique, clear path
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(MARBLE_RADIUS, 16, 16), new THREE.MeshStandardMaterial({ color: TEAMS[i] }));
    mesh.castShadow = true;
    scene.add(mesh);

    const body = new CANNON.Body({ mass: 1, shape: new CANNON.Sphere(MARBLE_RADIUS), material: marblePhysMat });
    
    // Position them further down the pipe in a staggered line
    // i=0 starts at +6, i=1 at +9, i=2 at +12, i=3 at +15
    const depthOffset = 6 + (i * 3);
    const spawnPos = sp.clone().add(startDir.clone().multiplyScalar(depthOffset));
    
    body.position.set(
      spawnPos.x + (i % 2 - 0.5) * 2, // Slight left/right spread
      spawnPos.y + 0.5,
      spawnPos.z
    );
    
    world.addBody(body);
    
    // ENORMOUS LAUNCH IMPULSE - Vector aware
    const launchForce = 120; // Cranked up to 120
    body.applyImpulse(new CANNON.Vec3(
      startDir.x * launchForce,
      startDir.y * launchForce - 20, // Downward component to stick to floor
      startDir.z * launchForce
    ));

    marbles.push({ body, mesh, status: 'racing' });
  }
}

document.getElementById('btn-race').addEventListener('click', startRace);
document.getElementById('btn-reset').addEventListener('click', () => { location.reload(); });

// --- ANIMATION ---
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  
  if (raceActive) {
    world.step(1/120, delta, 3);
    
    marbles.forEach(m => {
      if (m.status !== 'racing') return;
      
      // 1. Velocity Cap
      const v = m.body.velocity;
      if (v.length() > MAX_VELOCITY) v.scale(MAX_VELOCITY / v.length(), v);

      // 2. CENTRIPETAL CLAMP: Force marbles to stay inside pipe radius
      const t = trackCurve.getUtoTmapping(0, (points[0].y - m.body.position.y) / (points[0].y - points[points.length-1].y));
      const center = trackCurve.getPointAt(Math.max(0, Math.min(1, t)));
      const dist = new THREE.Vector3().subVectors(m.body.position, center);
      
      if (dist.length() > PIPE_RADIUS - MARBLE_RADIUS) {
        dist.setLength(PIPE_RADIUS - MARBLE_RADIUS);
        m.body.position.set(center.x + dist.x, center.y + dist.y, center.z + dist.z);
        // Dampen outward velocity
        const normal = dist.clone().normalize();
        const dot = m.body.velocity.dot(new CANNON.Vec3(normal.x, normal.y, normal.z));
        if (dot > 0) m.body.velocity.vsub(new CANNON.Vec3(normal.x * dot, normal.y * dot, normal.z * dot), m.body.velocity);
      }

      m.mesh.position.copy(m.body.position);
      m.mesh.quaternion.copy(m.body.quaternion);
    });

    // Camera follow leader
    const leader = marbles.filter(m => m.status === 'racing').sort((a,b) => a.body.position.y - b.body.position.y)[0];
    if (leader) {
      controls.target.lerp(leader.mesh.position, 0.1);
      const camOff = new THREE.Vector3(25, 15, 25);
      camera.position.lerp(leader.mesh.position.clone().add(camOff), 0.05);
    }
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
