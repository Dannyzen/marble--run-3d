import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- CONFIG ---
const MARBLE_RADIUS = 0.35;
const GRAVITY = -60; // Heavy gravity
const PIPE_RADIUS = 3.5;

// --- STATE ---
let marbles = [];
let raceActive = false;

// --- SCENE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
scene.fog = new THREE.Fog(0xffffff, 50, 400);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(40, 80, 60);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(50, 100, 50);
sun.castShadow = true;
scene.add(sun);

// --- PHYSICS (CANNON-ES) ---
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
const trackMat = new CANNON.Material('track');
const marbleMat = new CANNON.Material('marble');
world.addContactMaterial(new CANNON.ContactMaterial(trackMat, marbleMat, { friction: 0.05, restitution: 0.1 }));

// --- THE PIPE (TRIMESH FOR 100% COLLISION) ---
const points = [
  new THREE.Vector3(0, 42, 0), new THREE.Vector3(5, 35, -20), new THREE.Vector3(25, 25, -10),
  new THREE.Vector3(15, 15, 15), new THREE.Vector3(-15, 10, 20), new THREE.Vector3(-30, 0, 0),
  new THREE.Vector3(-10, -15, -20), new THREE.Vector3(10, -30, 0), new THREE.Vector3(0, -50, 20),
  new THREE.Vector3(0, -70, 0)
];
const trackCurve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
const tubeGeom = new THREE.TubeGeometry(trackCurve, 200, PIPE_RADIUS, 12, false);

// Visual Tube
const tubeMesh = new THREE.Mesh(tubeGeom, new THREE.MeshStandardMaterial({ 
  color: 0x00ffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide 
}));
tubeMesh.receiveShadow = true;
scene.add(tubeMesh);

// Physics Pipe (The real deal)
const vertices = tubeGeom.attributes.position.array;
const indices = tubeGeom.index.array;
const tubeTrimesh = new CANNON.Trimesh(vertices, indices);
const tubeBody = new CANNON.Body({ mass: 0, material: trackMat });
tubeBody.addShape(tubeTrimesh);
world.addBody(tubeBody);

// --- MARBLES ---
const TEAMS = [0xff2244, 0x2266ff, 0x22cc44, 0xffcc00];

function startRace() {
  marbles.forEach(m => { scene.remove(m.mesh); world.removeBody(m.body); });
  marbles = []; raceActive = true;
  
  const sp = points[0];
  const dir = points[1].clone().sub(sp).normalize();

  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(MARBLE_RADIUS, 16, 16), new THREE.MeshStandardMaterial({ color: TEAMS[i] }));
    mesh.castShadow = true;
    scene.add(mesh);

    const body = new CANNON.Body({ mass: 1, shape: new CANNON.Sphere(MARBLE_RADIUS), material: marbleMat });
    // Spawn deep in the mouth, staggered
    body.position.set(sp.x + (i-1.5), sp.y - 1, sp.z - (i*2));
    world.addBody(body);
    body.applyImpulse(new CANNON.Vec3(dir.x*30, dir.y*30, dir.z*30)); // ONE WAY: DOWN.

    marbles.push({ body, mesh });
  }
}

document.getElementById('btn-race').addEventListener('click', startRace);
document.getElementById('btn-reset').addEventListener('click', () => { location.reload(); });

// --- ANIMATION ---
function animate() {
  requestAnimationFrame(animate);
  const delta = 1/60;
  world.step(delta);

  marbles.forEach(m => {
    m.mesh.position.copy(m.body.position);
    m.mesh.quaternion.copy(m.body.quaternion);
  });

  if (raceActive && marbles.length > 0) {
    const leader = [...marbles].sort((a,b) => a.body.position.y - b.body.position.y)[0];
    controls.target.lerp(leader.mesh.position, 0.1);
    camera.position.lerp(leader.mesh.position.clone().add(new THREE.Vector3(25, 15, 25)), 0.05);
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
