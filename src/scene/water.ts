import { CircleGeometry, Color, DoubleSide, Group, InstancedMesh, Matrix4, MeshPhysicalMaterial, PlaneGeometry, ShaderMaterial, UniformsLib, UniformsUtils, Vector3, Quaternion, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import type { Layout } from '../types';

/** One bounded planar reflection is shared by pools on the nearest water level.
 * Wave normals, fountain impact rings and caustic hints need no image downloads. */
export function villaWater(plan: Layout, mobile: boolean) {
  const root = new Group(); root.name = 'water';
  const uniforms = UniformsUtils.merge([UniformsLib.fog, {
    time: { value: 0 }, reflectedScene: { value: null }, reflectionMatrix: { value: new Matrix4() },
    reflectionLevel: { value: -100 }, reflectionReady: { value: 0 },
  }]);
  const material = new ShaderMaterial({ fog: true, uniforms,
    vertexShader: /* glsl */`
      varying vec3 waterPosition; varying vec2 waterCenter;
      #include <fog_pars_vertex>
      void main(){vec4 p=vec4(position,1.0),center=vec4(0,0,0,1);
        #ifdef USE_INSTANCING
          p=instanceMatrix*p; center=instanceMatrix*center;
        #endif
        vec4 world=modelMatrix*p; waterPosition=world.xyz;waterCenter=(modelMatrix*center).xz;
        vec4 mvPosition=viewMatrix*world;
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float time;uniform sampler2D reflectedScene;uniform mat4 reflectionMatrix;
      uniform float reflectionLevel;uniform float reflectionReady;
      varying vec3 waterPosition;varying vec2 waterCenter;
      #include <fog_pars_fragment>
      void main(){
        vec2 p=waterPosition.xz,local=p-waterCenter;
        float a=dot(p,vec2(3.7,2.1))+time*.72;
        float b=dot(p,vec2(-7.2,5.3))-time*.51;
        float c=dot(p,vec2(17.,11.))+time*.38;
        vec2 slope=.009*cos(a)*vec2(3.7,2.1)+.003*cos(b)*vec2(-7.2,5.3)+.0007*cos(c)*vec2(17.,11.);
        float radius=max(length(local),.001);
        float impact=cos((radius-.43)*38.-time*3.8)*exp(-abs(radius-.43)*2.8)*.025;
        slope+=local/radius*impact;
        vec3 n=normalize(vec3(-slope.x,1.,-slope.y));
        vec3 v=normalize(cameraPosition-waterPosition);
        float facing=max(dot(n,v),0.);
        float fresnel=.12+.78*pow(1.-facing,4.);
        vec4 projected=reflectionMatrix*vec4(waterPosition,1.);
        vec2 uv=projected.xy/projected.w+slope*.019;
        float valid=reflectionReady*step(.001,projected.w)*step(abs(waterPosition.y-reflectionLevel),.025);
        valid*=step(.005,uv.x)*step(uv.x,.995)*step(.005,uv.y)*step(uv.y,.995);
        vec3 reflected=vec3(.49,.62,.61);
        if(valid>.5) reflected=(texture2D(reflectedScene,uv).rgb+texture2D(reflectedScene,uv+vec2(.0012,-.0012)).rgb)*.5;
        float caustic=pow(.5+.5*sin(a*2.+sin(b)),9.)*pow(.5+.5*sin(b*1.3+cos(a)),5.);
        vec3 depthColor=vec3(.038,.155,.145)+caustic*vec3(.13,.16,.105)*.4;
        // A quiet tiled bottom remains perceptible under the shallow water.
        vec2 tile=abs(fract((local+slope*.08)*6.)-.5);
        depthColor*=1.-smoothstep(.475,.5,max(tile.x,tile.y))*.045;
        float sun=pow(max(dot(reflect(normalize(vec3(.487,-.811,.324)),n),v),0.),180.);
        vec3 color=mix(depthColor,reflected,fresnel)+vec3(1.,.84,.51)*sun*.48;
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const planeMatrices: Matrix4[] = [], bowlMatrices: Matrix4[] = [], streamMatrices: Matrix4[] = [];
  const poolPositions: Vector3[] = [];
  const rotation = new Quaternion(), yAxis = new Vector3(0,1,0);
  const compose = (x:number,y:number,z:number,sx:number,sy:number,sz:number,angle=0) =>
    new Matrix4().compose(new Vector3(x,y,z),rotation.setFromAxisAngle(yAxis,angle),new Vector3(sx,sy,sz));
  const falling = (parent:Matrix4,x:number,z:number,bottom:number,top:number,width:number) => {
    for (const angle of [0,Math.PI/2]) streamMatrices.push(parent.clone().multiply(compose(x,(top+bottom)/2,z,width,top-bottom,1,angle)));
  };
  for (const p of plan.placements) {
    const m = new Matrix4().fromArray(p.transform);
    if (p.part === 'pool-basin-3x3') {
      const water = m.clone().multiply(compose(0,.215,0,2.62,1,2.62));
      planeMatrices.push(water);poolPositions.push(new Vector3().setFromMatrixPosition(water));
    } else if (p.part === 'fountain-tiered') {
      for (const [y,radius] of [[.46,.48],[1.27,.37],[2.04,.26]]) bowlMatrices.push(m.clone().multiply(compose(0,y+radius*.465,0,radius*.85,1,radius*.85)));
      for(let i=0;i<3;i++){
        const angle=i*Math.PI*2/3;
        falling(m,Math.cos(angle)*.23,Math.sin(angle)*.23,1.43,2.18,.015);
        falling(m,Math.cos(angle+.5)*.34,Math.sin(angle+.5)*.34,.68,1.47,.018);
        falling(m,Math.cos(angle+.9)*.43,Math.sin(angle+.9)*.43,.225,.68,.019);
      }
    } else if (p.part === 'fountain-wall') {
      planeMatrices.push(m.clone().multiply(compose(0,.423,-.09,2.12,1,.54)));
      falling(m,0,-.28,.427,1.52,.032);
    }
  }
  const surfaces = new InstancedMesh(new PlaneGeometry(1,1).rotateX(-Math.PI/2),material,planeMatrices.length);
  planeMatrices.forEach((m,i)=>surfaces.setMatrixAt(i,m));root.add(surfaces);
  const bowls = new InstancedMesh(new CircleGeometry(1,48).rotateX(-Math.PI/2),material,bowlMatrices.length);
  bowlMatrices.forEach((m,i)=>bowls.setMatrixAt(i,m));root.add(bowls);
  const flowTime = {value:0};
  const streamMaterial = new MeshPhysicalMaterial({ color:0xc2ded6,roughness:.18,metalness:.1,transparent:true,opacity:.56,depthWrite:false,side:DoubleSide });
  streamMaterial.onBeforeCompile = shader => {
    shader.uniforms.flowTime=flowTime;
    shader.vertexShader='varying vec2 vFlowUv;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n vFlowUv=uv;');
    shader.fragmentShader='uniform float flowTime; varying vec2 vFlowUv;\n'+shader.fragmentShader.replace('#include <alphamap_fragment>','#include <alphamap_fragment>\n diffuseColor.a*=sin(vFlowUv.x*3.14159)*(.72+.28*sin(vFlowUv.y*65.-flowTime*7.));');
  };
  const streams = new InstancedMesh(new PlaneGeometry(1,1),streamMaterial,streamMatrices.length);
  streamMatrices.forEach((m,i)=>streams.setMatrixAt(i,m));root.add(streams);

  const reflectionGeometry = new PlaneGeometry(2.62,2.62);
  let reflector: Reflector;
  let dirty=true,lastReflection=-Infinity,reflectionPasses=0;
  const lastPosition=new Vector3(Infinity,Infinity,Infinity),lastRotation=new Quaternion();
  const rebuild = () => {
    reflector=new Reflector(reflectionGeometry,{textureWidth:mobile?256:512,textureHeight:mobile?256:512,multisample:0,clipBias:.003,color:new Color(0xffffff)});
    reflector.rotation.x=-Math.PI/2;
    uniforms.reflectedScene.value=reflector.getRenderTarget().texture;
    uniforms.reflectionReady.value=0;dirty=true;
  };
  rebuild();
  return {
    root,
    update(seconds:number) {uniforms.time.value=seconds;flowTime.value=seconds;},
    refresh() {dirty=true;},
    lost() {reflector.dispose();uniforms.reflectionReady.value=0;},
    restore() {rebuild();},
    get reflectionPasses() {return reflectionPasses;},
    reflect(renderer:WebGLRenderer,scene:Scene,camera:PerspectiveCamera,now:number,excluded?:Group) {
      if(!poolPositions.length)return;
      const moved=camera.position.distanceToSquared(lastPosition)>.00001 || 1-Math.abs(camera.quaternion.dot(lastRotation))>.000001;
      if(!dirty && (!moved || now-lastReflection<(mobile?65:33)))return;
      const pool=poolPositions.reduce((a,b)=>a.distanceToSquared(camera.position)<b.distanceToSquared(camera.position)?a:b);
      reflector.position.copy(pool);reflector.updateMatrixWorld(true);
      const waterVisible=root.visible,otherVisible=excluded?.visible;
      root.visible=false;if(excluded)excluded.visible=false;
      try{
        reflector.onBeforeRender(renderer,scene,camera,reflectionGeometry,reflector.material as ShaderMaterial,null as any);
        const matrix=(reflector.material as ShaderMaterial).uniforms.textureMatrix.value as Matrix4;
        uniforms.reflectionMatrix.value.copy(matrix).multiply(new Matrix4().copy(reflector.matrixWorld).invert());
        uniforms.reflectionLevel.value=pool.y;uniforms.reflectionReady.value=1;
        lastPosition.copy(camera.position);lastRotation.copy(camera.quaternion);lastReflection=now;dirty=false;reflectionPasses++;
      } finally {root.visible=waterVisible;if(excluded)excluded.visible=otherVisible!;}
    },
  };
}
