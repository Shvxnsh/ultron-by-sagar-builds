import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export interface OrbSceneApi {
  rotateBy(deltaTheta: number, deltaPhi: number): void;
  zoomBy(factor: number): void;
  zoomIn(): void;
  zoomOut(): void;
  resetView(): void;
  dispose(): void;
}

const HOME_POSITION = new THREE.Vector3(0, 0.35, 5.2);
const MIN_DISTANCE = 1.1;
const MAX_DISTANCE = 24;
const TAU = Math.PI * 2;

export function createOrbScene(container: HTMLElement): OrbSceneApi {
  const width = Math.max(1, container.clientWidth || window.innerWidth);
  const height = Math.max(1, container.clientHeight || window.innerHeight);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071014);

  const camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 100);
  camera.position.copy(HOME_POSITION);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 1.1, 0.28, 0.3);
  composer.addPass(bloom);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = MIN_DISTANCE;
  controls.maxDistance = MAX_DISTANCE;
  controls.zoomSpeed = 1.2;
  controls.enablePan = false;

  const bright = 0x9de4df;
  const mid = 0x4daeb0;
  const dim = 0x236b73;
  const root = new THREE.Group();
  scene.add(root);

  const line = (color: number, opacity: number) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring = (radius: number, latitude: number, segments = 72) => {
    const points: THREE.Vector3[] = [];
    const r = radius * Math.cos(latitude);
    const y = radius * Math.sin(latitude);
    for (let i = 0; i <= segments; i++) { const a = (i / segments) * TAU; points.push(new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a))); }
    return new THREE.BufferGeometry().setFromPoints(points);
  };
  const meridian = (radius: number, longitude: number, segments = 72) => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) { const lat = (i / segments) * Math.PI - Math.PI / 2; points.push(new THREE.Vector3(radius * Math.cos(lat) * Math.cos(longitude), radius * Math.sin(lat), radius * Math.cos(lat) * Math.sin(longitude))); }
    return new THREE.BufferGeometry().setFromPoints(points);
  };

  const shell = new THREE.Group();
  const radius = 1.85;
  for (let i = -9; i <= 9; i++) shell.add(new THREE.Line(ring(radius, (i / 9) * 1.42, 72), line(i % 3 === 0 ? mid : dim, i % 3 === 0 ? 0.42 : 0.16)));
  for (let i = 0; i < 16; i++) shell.add(new THREE.Line(meridian(radius, (i / 16) * TAU, 72), line(i % 4 === 0 ? mid : dim, i % 4 === 0 ? 0.48 : 0.14)));
  root.add(shell);

  const core = new THREE.Group();
  const coreRadius = 0.82;
  for (let s = 0; s < 4; s++) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 160; i++) { const t = i / 160; const lat = t * Math.PI - Math.PI / 2; const lon = t * (3 + s * 0.35) * TAU + (s * TAU) / 4; points.push(new THREE.Vector3(coreRadius * Math.cos(lat) * Math.cos(lon), coreRadius * Math.sin(lat), coreRadius * Math.cos(lat) * Math.sin(lon))); }
    core.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), line(bright, 0.42)));
  }
  root.add(core);

  const ico = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.27, 1)), line(bright, 0.95));
  root.add(ico);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: bright, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending }));
  root.add(glow);

  // Instancing keeps hundreds of particles in one draw call instead of hundreds of meshes.
  const particleCount = 700;
  const particleGeo = new THREE.IcosahedronGeometry(0.018, 0);
  const particleMat = new THREE.MeshBasicMaterial({ color: mid, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending });
  const particles = new THREE.InstancedMesh(particleGeo, particleMat, particleCount);
  const dummy = new THREE.Object3D();
  const orbits: Array<{ radius: number; speed: number; phase: number; tilt: number }> = [];
  for (let i = 0; i < particleCount; i++) {
    const orbit = { radius: 2.0 + Math.random() * 2.5, speed: 0.08 + Math.random() * 0.2, phase: Math.random() * TAU, tilt: (Math.random() - 0.5) * 1.4 };
    orbits.push(orbit);
    const a = orbit.phase;
    dummy.position.set(orbit.radius * Math.cos(a), orbit.radius * Math.sin(orbit.tilt) * Math.sin(a * 0.7), orbit.radius * Math.sin(a) * Math.cos(orbit.tilt));
    dummy.updateMatrix(); particles.setMatrixAt(i, dummy.matrix);
  }
  particles.instanceMatrix.needsUpdate = true;
  root.add(particles);

  const spherical = new THREE.Spherical();
  const offset = new THREE.Vector3();
  const rotateBy = (theta: number, phi: number) => { offset.copy(camera.position).sub(controls.target); spherical.setFromVector3(offset); spherical.theta -= theta; spherical.phi = THREE.MathUtils.clamp(spherical.phi - phi, 0.05, Math.PI - 0.05); spherical.makeSafe(); offset.setFromSpherical(spherical); camera.position.copy(controls.target).add(offset); camera.lookAt(controls.target); controls.update(); };
  const zoomBy = (factor: number) => { offset.copy(camera.position).sub(controls.target); offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, MIN_DISTANCE, MAX_DISTANCE)); camera.position.copy(controls.target).add(offset); controls.update(); };
  const resetView = () => { camera.position.copy(HOME_POSITION); controls.target.set(0, 0, 0); controls.update(); };

  const clock = new THREE.Clock();
  let frame = 0;
  let disposed = false;
  const animate = () => {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    shell.rotation.y = t * 0.12;
    core.rotation.y = -t * 0.3;
    core.rotation.x = Math.sin(t * 0.2) * 0.08;
    ico.rotation.x = t * 0.7;
    ico.rotation.y = t;
    const pulse = 0.16 + (Math.sin(t * 1.6) + 1) * 0.05;
    (glow.material as THREE.MeshBasicMaterial).opacity = pulse;
    for (let i = 0; i < particleCount; i++) { const o = orbits[i]; const a = o.phase + t * o.speed; dummy.position.set(o.radius * Math.cos(a), o.radius * Math.sin(o.tilt) * Math.sin(a * 0.7), o.radius * Math.sin(a) * Math.cos(o.tilt)); dummy.updateMatrix(); particles.setMatrixAt(i, dummy.matrix); }
    particles.instanceMatrix.needsUpdate = true;
    controls.update();
    composer.render();
  };
  animate();

  const onResize = () => { const w = Math.max(1, container.clientWidth); const h = Math.max(1, container.clientHeight); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); composer.setSize(w, h); };
  window.addEventListener("resize", onResize);
  const dispose = () => { disposed = true; cancelAnimationFrame(frame); window.removeEventListener("resize", onResize); controls.dispose(); scene.traverse((object) => { const item = object as THREE.Mesh; item.geometry?.dispose(); const material = item.material; if (Array.isArray(material)) material.forEach((m) => m.dispose()); else material?.dispose(); }); composer.dispose(); renderer.dispose(); renderer.domElement.remove(); };

  return { rotateBy, zoomBy, zoomIn: () => zoomBy(0.72), zoomOut: () => zoomBy(1.4), resetView, dispose };
}
