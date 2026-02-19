import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * THE PIPE PROTOCOL: Replaces the U-channel with a FULLY ENCLOSED PIPE.
 * It is physically impossible for a ball to leave the pipe until the finish line.
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

  // 2. PHYSICS: Circular Cage
  const physicsSegments = 200;
  const bodies = [];

  for (let i = 0; i < physicsSegments; i++) {
    const t = i / physicsSegments;
    const tNext = (i + 1) / physicsSegments;
    
    const pos = curve.getPointAt(t);
    const posNext = curve.getPointAt(tNext);
    const midPoint = pos.clone().add(posNext).multiplyScalar(0.5);
    const dir = posNext.clone().sub(pos).normalize();
    const segmentLen = pos.distanceTo(posNext) * 1.05;

    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    const normal = new THREE.Vector3().crossVectors(right, dir).normalize();

    const quat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, normal, dir)
    );
    const cQuat = new CANNON.Quaternion(quat.x, quat.y, quat.z, quat.w);

    // Optimized 10-sided cage for mobile
    const numSides = 10;
    for (let s = 0; s < numSides; s++) {
      const angle = (s / numSides) * Math.PI * 2;
      const boxBody = new CANNON.Body({ mass: 0, material: trackPhysMat });
      
      // FAT WALLS: 8 units thick. 
      // Even with fewer substeps, a ball can't skip through 8 units of solid wall.
      const boxW = (radius * 2 * Math.PI) / numSides * 1.6;
      boxBody.addShape(new CANNON.Box(new CANNON.Vec3(boxW/2, 4.0, segmentLen/2)));
      
      // Position the box on the perimeter of the circle
      const localX = Math.cos(angle) * radius;
      const localY = Math.sin(angle) * radius;
      const offset = new THREE.Vector3(localX, localY, 0).applyQuaternion(quat);
      
      boxBody.position.set(midPoint.x + offset.x, midPoint.y + offset.y, midPoint.z + offset.z);
      
      // Rotate box to face the center
      const boxQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle + Math.PI/2);
      const finalQuat = quat.clone().multiply(boxQuat);
      boxBody.quaternion.copy(new CANNON.Quaternion(finalQuat.x, finalQuat.y, finalQuat.z, finalQuat.w));
      
      world.addBody(boxBody);
      bodies.push(boxBody);
    }
  }

  return { mesh: trackMesh, bodies };
}
