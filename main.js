import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildVisualTrack } from './track_builder.js';

// --- CONFIG ---
const MARBLE_RADIUS = 0.28;
const GRAVITY = -45; // Increased gravity for more downward "weight"
const PIPE_RADIUS = 3.5;
const BALL_REVERSION = 0.1; // Reduced bounce significantly to stop "jumping"
const MAX_VELOCITY = 60; // Hard cap to prevent erratic physics

// --- STATE ---
let marbles = [];
let raceActive = false;
let raceStartTime = 0;
let trackCurve = null;

// --- THREE.JS ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
scene.fog = new THREE.Fog(0xffffff, 50, 400);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(40, 80, 60);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxDistance = 400;

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(50, 100, 50);
scene.add(sun);

// --- PHYSICS (Balls Only) ---
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
const marblePhysMat = new CANNON.Material('marble');

// --- PATH ---
const points = [
  new THREE.Vector3(0,42,0), new THREE.Vector3(5,35,-20), new THREE.Vector3(25,25,-10),
  new THREE.Vector3(15,15,15), new THREE.Vector3(-15,10,20), new THREE.Vector3(-30,0,0),
  new THREE.Vector3(-10,-15,-20), new THREE.Vector3(10,-30,0), new THREE.Vector3(0,-50,20),
  new THREE.Vector3(0,-70,0)
];
trackCurve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
buildVisualTrack(trackCurve, scene);

// --- MARBLES ---
const TEAMS = [0xff2244, 0x2266ff, 0x22cc44, 0xffcc00];

function startRace() {
  marbles.forEach(m => { scene.remove(m.mesh); world.removeBody(m.body); });
  marbles = []; raceActive = true;
  raceStartTime = performance.now();

  const sp = points[0];
  const nextPoint = points[1];
  const startDir = new THREE.Vector3().subVectors(nextPoint, sp).normalize();

  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(MARBLE_RADIUS, 12, 12), new THREE.MeshStandardMaterial({ color: TEAMS[i], roughness: 0.1 }));
    scene.add(mesh);

    const body = new CANNON.Body({ mass: 1, shape: new CANNON.Sphere(MARBLE_RADIUS), material: marblePhysMat });
    // Staggered file line inside the pipe
    const spawnPos = sp.clone().add(startDir.clone().multiplyScalar(5 + i*3));
    body.position.set(spawnPos.x + (Math.random()-0.5), spawnPos.y, spawnPos.z);
    world.addBody(body);
    body.applyImpulse(new CANNON.Vec3(startDir.x*40, startDir.y*40 - 15, startDir.z*40));

    marbles.push({ body, mesh, status: 'racing' });
  }
}

document.getElementById('btn-race').addEventListener('click', startRace);
document.getElementById('btn-reset').addEventListener('click', () => { location.reload(); });

// --- ANIMATION LOOP ---
const clock = new THREE.Clock();
const tempVec = new THREE.Vector3();
const centerPos = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  
  if (raceActive) {
    world.step(1/120, delta, 5); // Higher frequency for smoother tracking
    
    marbles.forEach(m => {
      if (m.status !== 'racing') return;
      
      // 0. Friction Simulation (Mobile optimization hack)
      m.body.velocity.scale(0.992, m.body.velocity); 

      // 1. MATHEMATICAL COLLIDER (The "Rail" System)
      // Map current Y position to curve progress [0,1]
      const totalY = points[0].y - points[points.length-1].y;
      const progress = Math.max(0, Math.min(1, (points[0].y - m.body.position.y) / totalY));
      
      // Precision search: Check a small neighborhood around progress
      let bestT = progress;
      let minDist = Infinity;
      const searchRange = 0.05;
      for (let tStep = -searchRange; tStep <= searchRange; tStep += 0.01) {
        const testT = Math.max(0, Math.min(1, progress + tStep));
        trackCurve.getPointAt(testT, centerPos);
        const d = tempVec.subVectors(m.body.position, centerPos).lengthSq();
        if (d < minDist) {
          minDist = d;
          bestT = testT;
        }
      }
      
      trackCurve.getPointAt(bestT, centerPos);
      tempVec.subVectors(m.body.position, centerPos);
      
      const dist = tempVec.length();
      const maxDist = PIPE_RADIUS - MARBLE_RADIUS;
      
      if (dist > maxDist) {
        // Instant hard-clamp to the interior of the pipe
        tempVec.setLength(maxDist);
        m.body.position.set(centerPos.x + tempVec.x, centerPos.y + tempVec.y, centerPos.z + tempVec.z);
        
        // Bounce off the wall (Reduced energy)
        const normal = tempVec.normalize();
        const velocity = new THREE.Vector3(m.body.velocity.x, m.body.velocity.y, m.body.velocity.z);
        const dot = velocity.dot(normal);
        
        if (dot > 0) {
          const reflect = normal.multiplyScalar(dot * (1 + BALL_REVERSION));
          m.body.velocity.x -= reflect.x;
          m.body.velocity.y -= reflect.y;
          m.body.velocity.z -= reflect.z;
        }
      }

      // Hard cap velocity
      const speed = m.body.velocity.length();
      if (speed > MAX_VELOCITY) {
        m.body.velocity.scale(MAX_VELOCITY / speed, m.body.velocity);
      }

      m.mesh.position.copy(m.body.position);
      m.mesh.quaternion.copy(m.body.quaternion);
    });

    // Broadcast Camera: Follow Leader
    const leader = marbles.sort((a,b) => a.body.position.y - b.body.position.y)[0];
    if (leader) {
      controls.target.lerp(leader.mesh.position, 0.1);
      const camPos = leader.mesh.position.clone().add(new THREE.Vector3(25, 15, 25));
      camera.position.lerp(camPos, 0.05);
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
