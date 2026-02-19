import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * Builds a smooth, solid U-channel track from a THREE.Curve.
 * This version uses a single continuous mesh for visual clarity.
 */
export function buildSmoothTrack(curve, world, scene, trackPhysMat) {
  const points = curve.getPoints(300); // High resolution for smoothness
  const width = 3.2;
  const wallHeight = 2.0;
  const thickness = 0.8; // Thicker for visibility
  
  const geometries = [];
  const bodies = [];
  
  // Create a custom profile for the U-channel
  // Cross section:  |___|
  const shape = new THREE.Shape();
  shape.moveTo(-width/2, wallHeight);
  shape.lineTo(-width/2, 0);
  shape.lineTo(width/2, 0);
  shape.lineTo(width/2, wallHeight);
  
  const extrudeSettings = {
    steps: 300,
    bevelEnabled: false,
    extrudePath: curve
  };
  
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const material = new THREE.MeshStandardMaterial({ 
    color: 0xff4400, // Vibrant Safety Orange
    metalness: 0.3,
    roughness: 0.4,
    side: THREE.DoubleSide
  });
  
  const trackMesh = new THREE.Mesh(geometry, material);
  trackMesh.castShadow = true;
  trackMesh.receiveShadow = true;
  scene.add(trackMesh);
  
  // Physics: Piecewise boxes for collision
  const segments = 150;
  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const tNext = (i + 1) / segments;
    
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
    
    // Simple floor collider
    const body = new CANNON.Body({ mass: 0, material: trackPhysMat });
    body.addShape(new CANNON.Box(new CANNON.Vec3(width/2, thickness/2, segmentLen/2)));
    body.position.copy(new CANNON.Vec3(midPoint.x, midPoint.y, midPoint.z));
    body.quaternion.copy(new CANNON.Quaternion(quat.x, quat.y, quat.z, quat.w));
    world.addBody(body);
    bodies.push(body);
    
    // Side wall colliders
    const leftWallBody = new CANNON.Body({ mass: 0, material: trackPhysMat });
    leftWallBody.addShape(new CANNON.Box(new CANNON.Vec3(0.2, wallHeight/2, segmentLen/2)));
    const lPos = midPoint.clone().add(right.clone().multiplyScalar(-width/2));
    leftWallBody.position.copy(new CANNON.Vec3(lPos.x, lPos.y + wallHeight/2, lPos.z));
    leftWallBody.quaternion.copy(new CANNON.Quaternion(quat.x, quat.y, quat.z, quat.w));
    world.addBody(leftWallBody);
    
    const rightWallBody = new CANNON.Body({ mass: 0, material: trackPhysMat });
    rightWallBody.addShape(new CANNON.Box(new CANNON.Vec3(0.2, wallHeight/2, segmentLen/2)));
    const rPos = midPoint.clone().add(right.clone().multiplyScalar(width/2));
    rightWallBody.position.copy(new CANNON.Vec3(rPos.x, rPos.y + wallHeight/2, rPos.z));
    rightWallBody.quaternion.copy(new CANNON.Quaternion(quat.x, quat.y, quat.z, quat.w));
    world.addBody(rightWallBody);
  }
  
  return { mesh: trackMesh, bodies };
}
