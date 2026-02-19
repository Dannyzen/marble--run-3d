import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * THE WATER SLIDE PROTOCOL: Builds a smooth, deep U-channel half-pipe.
 * Designed to cradle marbles at high speeds like a professional water slide.
 */
export function buildSmoothTrack(curve, world, scene, trackPhysMat) {
  const segments = 240;
  const width = 6.0; // Increased from 3.5 to 6.0 for a wide slide
  const depth = 3.5; // Increased depth to match width
  const wallThickness = 0.4;
  
  // 1. VISUAL: Create a semi-circular U-profile for extrusion
  const shape = new THREE.Shape();
  const radius = width / 2;
  const resolution = 16;
  
  // Draw semi-circle for the U-channel bottom
  for (let i = 0; i <= resolution; i++) {
    const pct = i / resolution;
    const angle = Math.PI + pct * Math.PI;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius + depth;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  // Vertical walls up to the top
  shape.lineTo(radius, 0);
  shape.lineTo(-radius, 0);
  shape.lineTo(-radius, depth);

  const extrudeSettings = {
    steps: segments,
    bevelEnabled: false,
    extrudePath: curve
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const material = new THREE.MeshStandardMaterial({ 
    color: 0x00ffff,       // Neon Cyan
    emissive: 0x004466,   // Seafoam Glow
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.75,
    metalness: 0.2,
    roughness: 0.1,
    side: THREE.DoubleSide
  });

  const trackMesh = new THREE.Mesh(geometry, material);
  trackMesh.castShadow = true;
  trackMesh.receiveShadow = true;
  scene.add(trackMesh);

  // 2. PHYSICS: High-banked collision boxes
  const physicsSegments = 160;
  const bodies = [];

  for (let i = 0; i < physicsSegments; i++) {
    const t = i / physicsSegments;
    const tNext = (i + 1) / physicsSegments;
    
    const pos = curve.getPointAt(t);
    const posNext = curve.getPointAt(tNext);
    const midPoint = pos.clone().add(posNext).multiplyScalar(0.5);
    const dir = posNext.clone().sub(pos).normalize();
    const segmentLen = pos.distanceTo(posNext) * 1.1;

    // Parallel transport frame for orientation
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    const normal = new THREE.Vector3().crossVectors(right, dir).normalize();

    // --- High Banking Logic ---
    // Compute curvature to auto-bank the track in turns
    const dt = 0.005;
    const tan0 = curve.getTangentAt(Math.max(0, t - dt));
    const tan1 = curve.getTangentAt(Math.min(1, t + dt));
    const curvature = tan1.clone().sub(tan0).dot(right) * 25; // Amp the bank
    const bankAngle = Math.max(-1.2, Math.min(1.2, curvature)); // Max ~70 degrees

    const quat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, normal, dir)
    );
    if (Math.abs(bankAngle) > 0.01) {
      const bankQ = new THREE.Quaternion().setFromAxisAngle(dir, bankAngle);
      quat.premultiply(bankQ);
    }

    const cQuat = new CANNON.Quaternion(quat.x, quat.y, quat.z, quat.w);

    // Floor Collider
    const floor = new CANNON.Body({ mass: 0, material: trackPhysMat });
    floor.addShape(new CANNON.Box(new CANNON.Vec3(width/2, 0.4, segmentLen/2)));
    floor.position.copy(new CANNON.Vec3(midPoint.x, midPoint.y, midPoint.z));
    floor.quaternion.copy(cQuat);
    world.addBody(floor);
    bodies.push(floor);

    // Left Steep Wall
    const lWall = new CANNON.Body({ mass: 0, material: trackPhysMat });
    lWall.addShape(new CANNON.Box(new CANNON.Vec3(0.2, depth/2, segmentLen/2)));
    const lOffset = new THREE.Vector3(-width/2, depth/2, 0).applyQuaternion(quat);
    lWall.position.copy(new CANNON.Vec3(midPoint.x + lOffset.x, midPoint.y + lOffset.y, midPoint.z + lOffset.z));
    lWall.quaternion.copy(cQuat);
    world.addBody(lWall);
    bodies.push(lWall);

    // Right Steep Wall
    const rWall = new CANNON.Body({ mass: 0, material: trackPhysMat });
    rWall.addShape(new CANNON.Box(new CANNON.Vec3(0.2, depth/2, segmentLen/2)));
    const rOffset = new THREE.Vector3(width/2, depth/2, 0).applyQuaternion(quat);
    rWall.position.copy(new CANNON.Vec3(midPoint.x + rOffset.x, midPoint.y + rOffset.y, midPoint.z + rOffset.z));
    rWall.quaternion.copy(cQuat);
    world.addBody(rWall);
    bodies.push(rWall);
  }

  return { mesh: trackMesh, bodies };
}
