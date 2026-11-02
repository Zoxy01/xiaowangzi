import * as THREE from 'three';
const R = 6.0;
const { PlanetWalker } = await import('../src/planet-walker.js');
const w = new PlanetWalker(new THREE.Object3D(), R, { standHeight: 0.02 });
w.spawn(new THREE.Vector3(0, 0, 1));
const cam = new THREE.PerspectiveCamera(52, 393 / 852, 0.05, 1400);
for (const p of [-0.35, 0, 0.24, 0.6, 1.05]) {
  w.camPitch = p;
  for (let i = 0; i < 120; i++) w.updateCamera(cam, 1 / 60);
  const rel = cam.position.clone().sub(w.position);
  console.log(
    `pitch ${p.toFixed(2)}  相机相对角色  up=${rel.dot(w.up).toFixed(2)}  fwd=${rel.dot(w.getCameraForward(new THREE.Vector3())).toFixed(2)}  |rel|=${rel.length().toFixed(2)}  camR=${cam.position.length().toFixed(2)}`
  );
}
