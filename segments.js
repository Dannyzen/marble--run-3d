import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Generates a high-performance, high-stability Loop-the-Loop segment.
 */
export function createLoop(startPos, direction, diameter = 10, width = 3) {
  const radius = diameter / 2;
  const segments = 60; 
  const thickness = 1.5;
  const wallHeight = 1.0;
  const wallThickness = 0.3;
  
  const bodies = [];
  const geometries = [];
  
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(direction, up).normalize();
  const loopCenter = startPos.clone().add(up.clone().multiplyScalar(radius));
  
  let prevPoint = startPos.clone();
  
  for (let i = 1; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    
    // Parametric circle with a lateral spiral to clear the entry
    const x = Math.sin(angle) * radius;
    const y = -Math.cos(angle) * radius;
    const z = (i / segments) * (width * 0.8);
    
    const currentPoint = loopCenter.clone()
      .add(direction.clone().multiplyScalar(x))
      .add(up.clone().multiplyScalar(y))
      .add(right.clone().multiplyScalar(z));
      
    const midPoint = prevPoint.clone().add(currentPoint).multiplyScalar(0.5);
    const segmentLen = prevPoint.distanceTo(currentPoint);
    
    // Orientation: Frenet-Serret Frame
    const tangent = currentPoint.clone().sub(prevPoint).normalize();
    const normal = loopCenter.clone().add(right.clone().multiplyScalar(z)).sub(midPoint).normalize();
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    
    const rotMat = new THREE.Matrix4().makeBasis(binormal, normal, tangent);
    const quat = new THREE.Quaternion().setFromRotationMatrix(rotMat);
    
    // 1. Floor Geometry
    const floorGeom = new THREE.BoxGeometry(width, thickness, segmentLen + 0.1);
    floorGeom.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quat));
    floorGeom.applyMatrix4(new THREE.Matrix4().makeTranslation(midPoint.x, midPoint.y, midPoint.z));
    geometries.push(floorGeom);
    
    // 2. Walls
    const leftWallGeom = new THREE.BoxGeometry(wallThickness, wallHeight, segmentLen + 0.1);
    const leftWallPos = midPoint.clone().add(binormal.clone().multiplyScalar(-(width / 2 + wallThickness / 2)));
    leftWallPos.add(normal.clone().multiplyScalar(wallHeight / 2 + thickness / 2));
    leftWallGeom.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quat));
    leftWallGeom.applyMatrix4(new THREE.Matrix4().makeTranslation(leftWallPos.x, leftWallPos.y, leftWallPos.z));
    geometries.push(leftWallGeom);

    const rightWallGeom = new THREE.BoxGeometry(wallThickness, wallHeight, segmentLen + 0.1);
    const rightWallPos = midPoint.clone().add(binormal.clone().multiplyScalar(width / 2 + wallThickness / 2));
    rightWallPos.add(normal.clone().multiplyScalar(wallHeight / 2 + thickness / 2));
    rightWallGeom.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quat));
    rightWallGeom.applyMatrix4(new THREE.Matrix4().makeTranslation(rightWallPos.x, rightWallPos.y, rightWallPos.z));
    geometries.push(rightWallGeom);
    
    // Physics
    const floorBody = new CANNON.Body({ mass: 0 });
    floorBody.addShape(new CANNON.Box(new CANNON.Vec3(width / 2, thickness / 2, (segmentLen + 0.1) / 2)));
    floorBody.position.copy(new CANNON.Vec3(midPoint.x, midPoint.y, midPoint.z));
    floorBody.quaternion.copy(new CANNON.Quaternion(quat.x, quat.y, quat.z, quat.w));
    bodies.push(floorBody);
    
    const wallBody = new CANNON.Body({ mass: 0 });
    const qInv = quat.clone().invert();
    const lPos = leftWallPos.clone().sub(midPoint).applyQuaternion(qInv);
    const rPos = rightWallPos.clone().sub(midPoint).applyQuaternion(qInv);
    wallBody.addShape(new CANNON.Box(new CANNON.Vec3(wallThickness / 2, wallHeight / 2, (segmentLen + 0.1) / 2)), new CANNON.Vec3(lPos.x, lPos.y, lPos.z));
    wallBody.addShape(new CANNON.Box(new CANNON.Vec3(wallThickness / 2, wallHeight / 2, (segmentLen + 0.1) / 2)), new CANNON.Vec3(rPos.x, rPos.y, rPos.z));
    wallBody.position.copy(new CANNON.Vec3(midPoint.x, midPoint.y, midPoint.z));
    wallBody.quaternion.copy(new CANNON.Quaternion(quat.x, quat.y, quat.z, quat.w));
    bodies.push(wallBody);

    prevPoint = currentPoint;
  }
  
  const mergedGeom = BufferGeometryUtils.mergeGeometries(geometries);
  const mesh = new THREE.Mesh(mergedGeom, new THREE.MeshStandardMaterial({ 
    color: 0x8899bb, 
    metalness: 0.4, 
    roughness: 0.1,
    emissive: 0x224488,
    emissiveIntensity: 0.4
  }));
  
  return { mesh, bodies, endPos: prevPoint, endDirection: direction.clone() };
}

/**
 * Generates a high-performance Corkscrew (Helix) segment.
 */
export function createCorkscrew(startPos, height = 20, radius = 5, turns = 2, width = 3) {
  const segments = 120;
  const thickness = 1.5;
  const wallHeight = 1.0;
  const wallThickness = 0.3;
  const bodies = [];
  const geometries = [];
  
  const centerX = startPos.x - radius;
  const centerZ = startPos.z;
  let prevPoint = startPos.clone();
  
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const angle = t * Math.PI * 2 * turns;
    const currentPoint = new THREE.Vector3(centerX + Math.cos(angle) * radius, startPos.y - t * height, centerZ + Math.sin(angle) * radius);
    const midPoint = prevPoint.clone().add(currentPoint).multiplyScalar(0.5);
    const segmentLen = prevPoint.distanceTo(currentPoint);
    
    const tangent = currentPoint.clone().sub(prevPoint).normalize();
    const normal = new THREE.Vector3(centerX - midPoint.x, 0, centerZ - midPoint.z).normalize();
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    const finalNormal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();
    
    const rotMat = new THREE.Matrix4().makeBasis(binormal, finalNormal, tangent);
    const quat = new THREE.Quaternion().setFromRotationMatrix(rotMat);
    
    const floorGeom = new THREE.BoxGeometry(width, thickness, segmentLen + 0.1);
    floorGeom.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quat));
    floorGeom.applyMatrix4(new THREE.Matrix4().makeTranslation(midPoint.x, midPoint.y, midPoint.z));
    geometries.push(floorGeom);
    
    const wallGeom = new THREE.BoxGeometry(wallThickness, wallHeight, segmentLen + 0.1);
    const lPos = midPoint.clone().add(binormal.clone().multiplyScalar(-(width / 2 + wallThickness / 2))).add(finalNormal.clone().multiplyScalar(wallHeight / 2 + thickness / 2));
    const rPos = midPoint.clone().add(binormal.clone().multiplyScalar(width / 2 + wallThickness / 2)).add(finalNormal.clone().multiplyScalar(wallHeight / 2 + thickness / 2));
    
    [lPos, rPos].forEach(p => {
      const g = wallGeom.clone();
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quat));
      g.applyMatrix4(new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
      geometries.push(g);
    });
    
    const floorBody = new CANNON.Body({ mass: 0 });
    floorBody.addShape(new CANNON.Box(new CANNON.Vec3(width / 2, thickness / 2, (segmentLen + 0.1) / 2)));
    floorBody.position.copy(new CANNON.Vec3(midPoint.x, midPoint.y, midPoint.z));
    floorBody.quaternion.copy(new CANNON.Quaternion(quat.x, quat.y, quat.z, quat.w));
    bodies.push(floorBody);

    const wallBody = new CANNON.Body({ mass: 0 });
    const qInv = quat.clone().invert();
    wallBody.addShape(new CANNON.Box(new CANNON.Vec3(wallThickness / 2, wallHeight / 2, (segmentLen + 0.1) / 2)), new CANNON.Vec3(lPos.clone().sub(midPoint).applyQuaternion(qInv).x, lPos.clone().sub(midPoint).applyQuaternion(qInv).y, lPos.clone().sub(midPoint).applyQuaternion(qInv).z));
    wallBody.addShape(new CANNON.Box(new CANNON.Vec3(wallThickness / 2, wallHeight / 2, (segmentLen + 0.1) / 2)), new CANNON.Vec3(rPos.clone().sub(midPoint).applyQuaternion(qInv).x, rPos.clone().sub(midPoint).applyQuaternion(qInv).y, rPos.clone().sub(midPoint).applyQuaternion(qInv).z));
    wallBody.position.copy(new CANNON.Vec3(midPoint.x, midPoint.y, midPoint.z));
    wallBody.quaternion.copy(new CANNON.Quaternion(quat.x, quat.y, quat.z, quat.w));
    bodies.push(wallBody);
    
    prevPoint = currentPoint;
  }
  
  const mesh = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geometries), new THREE.MeshStandardMaterial({ 
    color: 0x8899bb, 
    metalness: 0.4, 
    roughness: 0.1,
    emissive: 0x224488,
    emissiveIntensity: 0.4
  }));
  return { mesh, bodies, endPos: prevPoint };
}
