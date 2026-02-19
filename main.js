import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildSmoothTrack } from './track_builder.js';

// --- CONFIG ---
const MARBLE_RADIUS = 0.28;
const GRAVITY = -25;
const MAX_VELOCITY = 60; 
const PIPE_RADIUS = 3.5;
const BALL_BOUNCE = 0.6; // Restitution for pipe hits

// --- STATE ---
let marbles = [];
let raceActive = false;
let raceStartTime = 0;
let trackCurve = null;

// --- THREE.JS SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.Fog(0x050505, 50, 400);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(40, 80, 60);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxDistance = 400;

scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(50, 100, 50);
sun.castShadow = true;
sun.shadow.camera.left = -100;
sun.shadow.camera.right = 100;
sun.shadow.camera.top = 100;
sun.shadow.camera.bottom = -100;
scene.add(sun);

// --- PHYSICS SETUP (CANNON only for ball-to-ball and gravity) ---
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
// No track bodies added to the world!

// --- PATH ---
const points = [
  new THREE.Vector3(0, 100, 0),
  new THREE.Vector3(10, 80, -30),
  new THREE.Vector3(50, 60, -10),
  new THREE.Vector3(30, 40, 40),
  new THREE.Vector3(-20, 20, 50),
  new THREE.Vector3(-60, 0, 0),
  new THREE.Vector3(-30, -30, -40),
  new THREE.Vector3(20, -60, 0),
  new THREE.Vector3(0, -90, 40),
  new THREE.Vector3(0, -120, 0)
];
trackCurve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
buildSmoothTrack(trackCurve, scene);

// --- MARBLES ---
const TEAMS = [0xff2244, 0x2266ff, 0x22cc44, 0xffcc00];

function startRace() {
  marbles.forEach(m => { scene.remove(m.mesh); world.removeBody(m.body); });
  marbles = [];
  raceActive = true;
  raceStartTime = performance.now();

  const startPoint = points[0];
  const startDir = trackCurve.getTangentAt(0).normalize();

  // STARTING GATE LINEUP
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(MARBLE_RADIUS, 24, 24), 
      new THREE.MeshStandardMaterial({ 
        color: TEAMS[i],
        roughness: 0.1,
        metalness: 0.5
      })
    );
    mesh.castShadow = true;
    scene.add(mesh);

    const body = new CANNON.Body({ 
      mass: 1, 
      shape: new CANNON.Sphere(MARBLE_RADIUS),
      linearDamping: 0.05,
      angularDamping: 0.05
    });
    
    // Spawn in a cross pattern for the start
    const offset = new THREE.Vector3(
      (i < 2 ? -1 : 1) * 1.5,
      0,
      (i % 2 === 0 ? -1 : 1) * 1.5
    );
    
    body.position.set(
      startPoint.x + offset.x,
      startPoint.y + 2,
      startPoint.z + offset.z
    );
    
    world.addBody(body);
    marbles.push({ body, mesh, launchForceActive: true });
  }
}

// Global button handlers (ensure they exist in index.html)
const raceBtn = document.getElementById('btn-race');
if(raceBtn) raceBtn.onclick = startRace;

// --- ANIMATION ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);
  
  if (raceActive) {
    // 1. Step physics (ball-ball collisions)
    world.step(1/60, delta, 3);
    
    const now = performance.now();

    marbles.forEach(m => {
      // 2. Initial Pusher Force (Starting Gate)
      if (m.launchForceActive) {
        if (now - raceStartTime < 2000) {
          const t = 0; // Near start
          const pushDir = trackCurve.getTangentAt(t).normalize();
          m.body.applyForce(new CANNON.Vec3(pushDir.x * 100, pushDir.y * 100, pushDir.z * 100), m.body.position);
        } else {
          m.launchForceActive = false;
        }
      }

      // 3. MATHEMATICAL PIPE CONSTRAINT (The "Perfect Collider")
      // Find nearest point on curve using a simple search (optimized for speed)
      // For a race, we can approximate 't' based on the ball's Y progress or look ahead
      // Better approach: project position onto segments
      let nearestT = 0;
      let minDistSq = Infinity;
      const samples = 20; // Search resolution
      for(let i=0; i<=samples; i++) {
        const t = i/samples;
        const p = trackCurve.getPointAt(t);
        const dSq = p.distanceToSquared(m.body.position);
        if(dSq < minDistSq) {
          minDistSq = dSq;
          nearestT = t;
        }
      }
      
      // Refine T (binary search or local check)
      const range = 1/samples;
      for(let i=0; i<10; i++) {
        const t1 = Math.max(0, nearestT - range/2);
        const t2 = Math.min(1, nearestT + range/2);
        const p1 = trackCurve.getPointAt(t1);
        const p2 = trackCurve.getPointAt(t2);
        const d1 = p1.distanceToSquared(m.body.position);
        const d2 = p2.distanceToSquared(m.body.position);
        if(d1 < d2) { nearestT = t1; } else { nearestT = t2; }
      }

      const center = trackCurve.getPointAt(nearestT);
      const toBall = new THREE.Vector3().subVectors(m.body.position, center);
      const dist = toBall.length();
      const limit = PIPE_RADIUS - MARBLE_RADIUS;

      if (dist > limit) {
        // LEAK-PROOF RECONSTRUCTION: Snap back and reflect
        const normal = toBall.normalize();
        
        // 1. Position Correction
        m.body.position.set(
          center.x + normal.x * limit,
          center.y + normal.y * limit,
          center.z + normal.z * limit
        );

        // 2. Velocity Reflection (Bounce)
        const v = m.body.velocity;
        const dot = v.x * normal.x + v.y * normal.y + v.z * normal.z;
        
        if (dot > 0) { // Only reflect if moving OUTWARD
          const bounceFactor = 1 + BALL_BOUNCE;
          m.body.velocity.x -= normal.x * dot * bounceFactor;
          m.body.velocity.y -= normal.y * dot * bounceFactor;
          m.body.velocity.z -= normal.z * dot * bounceFactor;
        }
      }

      // 4. Velocity Cap
      const vel = m.body.velocity;
      const speed = vel.length();
      if (speed > MAX_VELOCITY) {
        vel.scale(MAX_VELOCITY / speed, vel);
      }

      m.mesh.position.copy(m.body.position);
      m.mesh.quaternion.copy(m.body.quaternion);
    });

    // Camera follow leader
    const leader = marbles.sort((a,b) => a.body.position.y - b.body.position.y)[0];
    if (leader) {
      controls.target.lerp(leader.mesh.position, 0.1);
      const camOff = new THREE.Vector3(20, 10, 20);
      camera.position.lerp(leader.mesh.position.clone().add(camOff), 0.05);
    }
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; 
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
