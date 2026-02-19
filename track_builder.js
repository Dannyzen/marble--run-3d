import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * THE INDESTRUCTIBLE TUBE: Optimized for mobile.
 * Uses thick collision blocks and a centered pipe geometry.
 */
export function buildSmoothTrack(curve, world, scene, trackPhysMat) {
  const segments = 180;
  const radius = 3.5;
  
  // 1. VISUAL TUBE
  const geometry = new THREE.TubeGeometry(curve, segments, radius, 12, false);
  const material = new THREE.MeshStandardMaterial({ 
    color: 0x00ffff, 
    emissive: 0x002233,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    roughness: 0.1
  });
  const trackMesh = new THREE.Mesh(geometry, material);
  trackMesh.receiveShadow = true;
  scene.add(trackMesh);

  // 2. PHYSICS: High-efficiency collision segments
  const physicsSegments = 60; // Fewer segments = better mobile performance
  const wallThickness = 10;   // Massive thickness to stop tunneling

  for (let i = 0; i < physicsSegments; i++) {
    const t = i / physicsSegments;
    const tNext = (i + 1) / physicsSegments;
    
    const pos = curve.getPointAt(t);
    const posNext = curve.getPointAt(tNext);
    const midPoint = pos.clone().add(posNext).multiplyScalar(0.5);
    const dir = posNext.clone().sub(pos).normalize();
    const segmentLen = pos.distanceTo(posNext) * 1.1;

    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    const normal = new THREE.Vector3().crossVectors(right, dir).normalize();
    const quat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, normal, dir)
    );
    const cQuat = new CANNON.Quaternion(quat.x, quat.y, quat.z, quat.w);

    // 8-sided "Super-Thick" Cage
    const numSides = 8;
    for (let s = 0; s < numSides; s++) {
      const angle = (s / numSides) * Math.PI * 2;
      const b = new CANNON.Body({ mass: 0, material: trackPhysMat });
      const boxW = (radius * 2 * Math.PI) / numSides * 1.5;
      
      b.addShape(new CANNON.Box(new CANNON.Vec3(boxW/2, wallThickness/2, segmentLen/2)));
      
      const offset = new THREE.Vector3(
        Math.cos(angle) * (radius + wallThickness/2),
        Math.sin(angle) * (radius + wallThickness/2),
        0
      ).applyQuaternion(quat);
      
      b.position.set(midPoint.x + offset.x, midPoint.y + offset.y, midPoint.z + offset.z);
      const bQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle + Math.PI/2);
      const fQuat = quat.clone().multiply(bQuat);
      b.quaternion.copy(new CANNON.Quaternion(fQuat.x, fQuat.y, fQuat.z, fQuat.w));
      world.addBody(b);
    }
  }

  return { mesh: trackMesh, curve };
}
