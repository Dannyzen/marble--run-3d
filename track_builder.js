import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * THE PIPE PROTOCOL: Replaces the U-channel with a FULLY ENCLOSED PIPE.
 * Optimized with dedicated TubeCollider logic to prevent ball escape and maximize mobile performance.
 */
export function buildSmoothTrack(curve, world, scene, trackPhysMat) {
  const segments = 240;
  const radius = 3.5; // Wide enough for multiple balls
  const tubeRes = 16; // Sides of the tube
  
  // 1. VISUAL: Enclosed Tube
  const geometry = new THREE.TubeGeometry(curve, segments, radius, tubeRes, false);
  const material = new THREE.MeshStandardMaterial({ 
    color: 0x00ffff, 
    emissive: 0x003344,
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.5, // See-through so you can track the race
    metalness: 0.2,
    roughness: 0.1,
    side: THREE.BackSide // Render inner walls
  });

  const trackMesh = new THREE.Mesh(geometry, material);
  scene.add(trackMesh);

  // Outer shell for better visibility
  const outerMat = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.15,
    side: THREE.FrontSide
  });
  const outerMesh = new THREE.Mesh(geometry, outerMat);
  scene.add(outerMesh);

  // 2. PHYSICS: High-Performance Tube Collider
  // Instead of thousands of boxes (expensive!), we use fewer, thicker segments
  // and a centripetal safety clamp in the main loop.
  const physicsSegments = 60; // Reduced from 200 for mobile
  const collisionBodies = [];

  for (let i = 0; i < physicsSegments; i++) {
    const t = i / physicsSegments;
    const tNext = (i + 1) / physicsSegments;
    
    const pos = curve.getPointAt(t);
    const posNext = curve.getPointAt(tNext);
    const midPoint = pos.clone().add(posNext).multiplyScalar(0.5);
    const dir = posNext.clone().sub(pos).normalize();
    const segmentLen = pos.distanceTo(posNext) * 1.1; // Slight overlap to prevent seams

    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    const normal = new THREE.Vector3().crossVectors(right, dir).normalize();

    const quat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, normal, dir)
    );

    // 8-sided cage is enough for physical collisions if walls are thick
    const numSides = 8;
    for (let s = 0; s < numSides; s++) {
      const angle = (s / numSides) * Math.PI * 2;
      const boxBody = new CANNON.Body({ 
        mass: 0, 
        material: trackPhysMat,
        allowSleep: true // Performance
      });
      
      // EXTREMELY FAT WALLS: 10 units thick. 
      // This prevents tunneling even at high speeds and low refresh rates.
      const boxThickness = 10.0;
      const boxWidth = (radius * 2 * Math.PI) / numSides * 1.5;
      
      const shape = new CANNON.Box(new CANNON.Vec3(boxWidth/2, boxThickness/2, segmentLen/2));
      boxBody.addShape(shape);
      
      // Position the box on the perimeter (pushed OUT by half thickness)
      const distFromCenter = radius + (boxThickness / 2) - 0.2; 
      const localX = Math.cos(angle) * distFromCenter;
      const localY = Math.sin(angle) * distFromCenter;
      const offset = new THREE.Vector3(localX, localY, 0).applyQuaternion(quat);
      
      boxBody.position.set(midPoint.x + offset.x, midPoint.y + offset.y, midPoint.z + offset.z);
      
      // Rotate box to face the center
      const boxQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle + Math.PI/2);
      const finalQuat = quat.clone().multiply(boxQuat);
      boxBody.quaternion.copy(new CANNON.Quaternion(finalQuat.x, finalQuat.y, finalQuat.z, finalQuat.w));
      
      world.addBody(boxBody);
      collisionBodies.push(boxBody);
    }
  }

  return { mesh: trackMesh, curve, radius };
}
