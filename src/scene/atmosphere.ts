import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Group, Points, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from 'three';

/** Sparse dust uses the sun's actual shadow map, so specks dim inside shadows. */
export function villaAtmosphere(mobile:boolean) {
  const root=new Group();root.name='sunlit-dust';
  const count=mobile?280:650,positions=new Float32Array(count*3),seeds=new Float32Array(count);
  let state=91627;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  for(let i=0;i<count;i++){positions.set([random()*22,random()*5,random()*22],i*3);seeds[i]=random();}
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('seed',new Float32BufferAttribute(seeds,1));
  const material=new ShaderMaterial({transparent:true,depthWrite:false,blending:AdditiveBlending,lights:true,
    uniforms:UniformsUtils.merge([UniformsLib.lights,{time:{value:0},floorHeight:{value:0},pixelRatio:{value:1},sunDirection:{value:new Vector3(-18,30,-12).normalize()}}]),
    vertexShader:/* glsl */`
      #include <common>
      #include <shadowmap_pars_vertex>
      uniform float time;uniform float floorHeight;uniform float pixelRatio;attribute float seed;
      varying float vFade;varying vec3 vWorld;
      void main(){
        vec3 drift=vec3(time*.024+sin(time*.15+seed*30.)*.18,time*.013,time*.018);
        vec3 p=position+drift;
        p.xz=mod(p.xz-cameraPosition.xz+11.,22.)-11.+cameraPosition.xz;
        p.y=mod(p.y,4.8)+floorHeight+.12;
        vec4 worldPosition=vec4(p,1.);vWorld=p;
        vec4 mvPosition=viewMatrix*worldPosition;
        vec3 transformedNormal=mat3(viewMatrix)*vec3(0,1,0);
        #include <shadowmap_vertex>
        float edge=1.-smoothstep(7.,11.,length(p.xz-cameraPosition.xz));
        vFade=edge*smoothstep(.25,.9,p.y-floorHeight)*(1.-smoothstep(3.9,4.9,p.y-floorHeight));
        gl_PointSize=clamp((14.+seed*10.)/max(-mvPosition.z,1.),1.,3.0)*pixelRatio;
        gl_Position=projectionMatrix*mvPosition;
      }`,
    fragmentShader:/* glsl */`
      #include <common>
      #include <packing>
      #include <shadowmap_pars_fragment>
      uniform bool receiveShadow;
      #include <shadowmask_pars_fragment>
      uniform vec3 sunDirection;varying float vFade;varying vec3 vWorld;
      void main(){
        float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;
        float sun=getShadowMask();
        float phase=.35+.65*pow(max(dot(normalize(cameraPosition-vWorld),sunDirection),0.),4.);
        float alpha=pow(1.-d*d,2.)*vFade*(.025+sun*.19)*phase;
        gl_FragColor=vec4(vec3(1.,.87,.59),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const points=new Points(geometry,material);points.frustumCulled=false;points.receiveShadow=true;root.add(points);
  return {root,count,update(seconds:number,floor:number,pixelRatio:number){material.uniforms.time.value=seconds;material.uniforms.floorHeight.value=floor;material.uniforms.pixelRatio.value=pixelRatio;}};
}
