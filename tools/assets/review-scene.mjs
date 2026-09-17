// Browser-side inspection fixture, served only by the local Vite dev server.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { columnAsset } from '../../src/kit/matter';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.style.cssText = 'margin:0;overflow:hidden';
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe6e5df);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xf5f8ef, 0x918878, 1.3));
const sun = new THREE.DirectionalLight(0xfff1d6, 2);
sun.position.set(5, 7, 4);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 100);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
let mesh;
window.reviewColumn = async (url, view = 'overview') => {
  if (mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    for (const value of new Set(Object.values(mesh.material))) if (value?.isTexture) value.dispose();
    mesh.material.dispose();
  }
  const gltf = await loader.loadAsync(url);
  const asset = columnAsset(gltf.scene);
  mesh = new THREE.Mesh(asset.geometry, asset.material);
  scene.add(mesh);
  if (view === 'capital') { camera.position.set(1.4, 4.35, 1.8); camera.lookAt(0, 3.65, 0); }
  else if (view === 'base') { camera.position.set(1.4, 0.9, 1.8); camera.lookAt(0, 0.4, 0); }
  else { camera.position.set(3.2, 2.7, 6.9); camera.lookAt(0, 2, 0); }
  renderer.render(scene, camera);
  const box = new THREE.Box3().setFromObject(mesh);
  return { bounds: { min: box.min.toArray(), max: box.max.toArray() },
    triangles: mesh.geometry.index.count / 3,
    textures: renderer.info.memory.textures,
    map: [mesh.material.map.image.width, mesh.material.map.image.height],
    material: mesh.material.type,
  };
};
window.reviewReady = true;
