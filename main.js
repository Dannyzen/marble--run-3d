import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// --- CONFIG ---
const marbleRadius = 0.2;
const marbles = [];
const marbleMeshes = [];

// --- THREE.JS SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(10, 10, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1);
sunLight.position.set(5, 10, 5);
scene.add(sunLight);

// --- CANNON.JS SETUP ---
const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0)
});

// --- TRACK CREATION ---
const material = new THREE.MeshStandardMaterial({ color: 0x444444 });
const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x00ffff, transparent: true, opacity: 0.3 });

function createBox(w, h, d, x, y, z, rx=0, ry=0, rz=0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    scene.add(mesh);

    const body = new CANNON.Body({
        mass: 0, // static
        shape: new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2))
    });
    body.position.set(x, y, z);
    body.quaternion.setFromEuler(rx, ry, rz);
    world.addBody(body);
}

// Simple Track Design
createBox(10, 0.5, 10, 0, 0, 0); // Ground
createBox(1, 0.5, 10, -2, 5, 0, 0.5, 0, 0); // Slope 1
createBox(1, 0.5, 8, 2, 2, 0, -0.3, 0, 0); // Slope 2

// --- MARBLE LOGIC ---
window.spawnMarble = () => {
    const geometry = new THREE.SphereGeometry(marbleRadius);
    const color = new THREE.Color(Math.random(), Math.random(), Math.random());
    const mMaterial = new THREE.MeshStandardMaterial({ color: color });
    const mesh = new THREE.Mesh(geometry, mMaterial);
    scene.add(mesh);
    marbleMeshes.push(mesh);

    const body = new CANNON.Body({
        mass: 1,
        shape: new CANNON.Sphere(marbleRadius)
    });
    body.position.set(-2, 8, 4);
    world.addBody(body);
    marbles.push(body);
    
    document.getElementById('count').innerText = marbles.length;
};

window.resetScene = () => {
    marbles.forEach(b => world.removeBody(b));
    marbleMeshes.forEach(m => scene.remove(m));
    marbles.length = 0;
    marbleMeshes.length = 0;
    document.getElementById('count').innerText = '0';
};

// --- RENDER LOOP ---
function animate() {
    requestAnimationFrame(animate);
    
    world.fixedStep();
    
    for (let i = 0; i < marbles.length; i++) {
        marbleMeshes[i].position.copy(marbles[i].position);
        marbleMeshes[i].quaternion.copy(marbles[i].quaternion);
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
