// Local inspection fixture: uses the production kit, assembly and daylight.
import * as THREE from 'three';
import contract from '../../kit/contract.json';
import manifest from '../../content/manifest.json';
import { layout } from '../../layout/layout.js';
import { MatterSource } from '../../src/kit/matter';
import { KitLoader } from '../../src/kit/loader';
import { buildScene } from '../../src/scene/builder';
import { corniceJoinery } from '../../src/scene/joinery';
import { villaGardens } from '../../src/scene/gardens';
import { villaDaylight } from '../../src/scene/daylight';
import { villaWater } from '../../src/scene/water';

document.body.style.cssText='margin:0;overflow:hidden';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
document.body.append(renderer.domElement);
const scene=new THREE.Scene(),plan=layout(manifest,contract);
scene.background=new THREE.Color(0xe9ece3);scene.fog=new THREE.FogExp2(0xe8e5d9,.0075);
scene.add(new THREE.HemisphereLight(0xe5eee9,0x80745c,.85),new THREE.AmbientLight(0xffffff,.08));
const sun=new THREE.DirectionalLight(0xffebca,2.2);scene.add(sun);
const mobile=innerWidth<768;
const source=new MatterSource(renderer,mobile?'mobile':'desktop');
const {root,stops}=buildScene(plan,new KitLoader(contract,source),corniceJoinery(plan).transforms);
scene.add(root,villaGardens(plan,mobile).root);
const daylight=villaDaylight(renderer,scene,sun,plan,mobile),water=villaWater(plan,mobile);
scene.add(water.root);
await Promise.all([...stops.values()].map(s=>s.load()));
const camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.1,200);
window.reviewJoinery=({eye,target,stop='entry',fov=50})=>{
 camera.position.fromArray(eye);camera.lookAt(...target);camera.fov=fov;camera.updateProjectionMatrix();
 daylight.focus(stop);daylight.refresh();water.update(0);water.refresh();
 water.reflect(renderer,scene,camera,performance.now());renderer.render(scene,camera);
 return {assets:source.loaded,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
};
window.reviewReady=true;
