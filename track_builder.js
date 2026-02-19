import * as THREE from 'three';

/**
 * THE MATHEMATICAL COLLIDER TRACK
 * No physics bodies here. Just a visual TubeGeometry.
 * The 'PipeConstraint' in main.js handles the collision logic.
 */
export function buildSmoothTrack(curve, scene) {
  const segments = 256; // Higher resolution for smooth curves
  const radius = 3.5;
  
  // 1. VISUAL TUBE
  const geometry = new THREE.TubeGeometry(curve, segments, radius, 32, false);
  const material = new THREE.MeshStandardMaterial({ 
    color: 0x00ffff, 
    emissive: 0x002233,
    transparent: true,
    opacity: 0.3,
    side: THREE.BackSide, // Render inside for better depth
    roughness: 0.05,
    metalness: 0.8
  });
  
  const trackMesh = new THREE.Mesh(geometry, material);
  trackMesh.receiveShadow = true;
  scene.add(trackMesh);

  // Outer shell for subtle reflection
  const outerMaterial = new THREE.MeshStandardMaterial({
    color: 0x0088ff,
    transparent: true,
    opacity: 0.1,
    side: THREE.FrontSide
  });
  const outerMesh = new THREE.Mesh(geometry, outerMaterial);
  scene.add(outerMesh);

  return { mesh: trackMesh, curve, radius };
}
