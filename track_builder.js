import * as THREE from 'three';

/**
 * THE MATHEMATICAL TUBE: Visuals only.
 * The 'main.js' loop handles the actual collision math for 100% reliability.
 */
export function buildVisualTrack(curve, scene) {
  const segments = 200;
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

  return { mesh: trackMesh, curve };
}
