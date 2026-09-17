import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { marbleMaterial } from './marble';
import type { Layout } from '../types';
import { ARCH, archGeometry, spandrelGeometry, jointedMarble } from './door-surround';
import { CORNICE_WIDTH, corniceJoinery, perpendicularJoints } from './joinery';

const UP = new Vector3(0,1,0);
const randomFor = (name:string) => {let n=2166136261;for(const c of name)n=Math.imul(n^c.charCodeAt(0),16777619);return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};};

function leafGeometry() {
  // A folded, pointed blade, with a true silhouette and no alpha texture.
  const edge=[[-.06,-.045,0],[-.09,.035,0],[-.045,.115,0],[0,.155,0],[.045,.115,0],[.09,.035,0],[.035,-.08,0],[0,-.105,0]];
  const p:number[]=[];
  for(let i=0;i<edge.length;i++)p.push(0,.02,.018,...edge[i],...edge[(i+1)%edge.length]);
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.computeVertexNormals();return g;
}

/** Small architectural and botanical details are procedural, instanced and tied
 * to the same visible stop window as the Matter kit. */
export function villaGardens(plan:Layout,mobile:boolean) {
  const root=new Group();root.name='garden-details';
  const stone=new MeshStandardMaterial({color:0xc2b69c,roughness:.88});
  const marble=marbleMaterial(.36),earth=new MeshStandardMaterial({color:0x3e4430,roughness:1});
  const leaves=new MeshStandardMaterial({color:0xffffff,roughness:.79,side:DoubleSide});
  const bark=new MeshStandardMaterial({color:0x626447,roughness:.9});
  const bronze=new MeshStandardMaterial({color:0x8e7544,roughness:.35,metalness:.7});
  const box=new RoundedBoxGeometry(1,1,1,1,.04),leaf=leafGeometry(),stem=new CylinderGeometry(1,1,1,5),arch=archGeometry();
  const cornices=corniceJoinery(plan),wallJoints=perpendicularJoints(plan.placements,['wall-3m','wall-3m-doorway']);
  const types={stone:{geometry:box,material:stone},marble:{geometry:box,material:marble},earth:{geometry:box,material:earth},leaf:{geometry:leaf,material:leaves},stem:{geometry:stem,material:bark},bronze:{geometry:stem,material:bronze},arch:{geometry:arch,material:jointedMarble(true)},pier:{geometry:new BoxGeometry(.28,ARCH.spring,ARCH.depth).translate(0,ARCH.spring/2,0),material:jointedMarble(false)},spandrel:{geometry:spandrelGeometry(),material:new MeshStandardMaterial({color:0xc7c3b7,roughness:.9})},quoin:{geometry:new BoxGeometry(.46,4,.46).translate(0,2,0),material:stone},cornice:{geometry:new BoxGeometry(CORNICE_WIDTH,.6125,CORNICE_WIDTH).translate(0,.30625,0),material:marble}};
  type Kind=keyof typeof types;
  const groups=new Map<string,Group>();
  const quat=new Quaternion(),scale=new Vector3(),position=new Vector3();
  const compose=(x:number,y:number,z:number,w=1,h=1,d=1,angle=0)=>new Matrix4().compose(position.set(x,y,z),quat.setFromAxisAngle(UP,angle),scale.set(w,h,d));
  let leafCount=0,stoneCount=0;
  const roomStops=new Set(plan.placements.filter(p=>p.part==='wall-3m').map(p=>p.stop));
  for(const stop of Object.keys(plan.bounds)){
    const group=new Group();group.name=stop;root.add(group);groups.set(stop,group);
    const batches=new Map<Kind,{matrix:Matrix4,color:Color}[]>();
    const random=randomFor(stop);
    const add=(kind:Kind,parent:Matrix4,local:Matrix4,tint=1)=>{
      let batch=batches.get(kind);if(!batch){batch=[];batches.set(kind,batch);}
      const color=kind==='leaf'?new Color().setHSL(.22+random()*.08,.27+random()*.15,.16+random()*.15):new Color(tint,tint,tint);
      batch.push({matrix:parent.clone().multiply(local),color});
      if(kind==='leaf')leafCount++;if(kind==='stone'||kind==='marble')stoneCount++;
    };
    const sprig=(parent:Matrix4,from:Vector3,to:Vector3,radius=.008)=>{
      const delta=to.clone().sub(from),mid=from.clone().add(to).multiplyScalar(.5);
      const local=new Matrix4().compose(mid,new Quaternion().setFromUnitVectors(UP,delta.clone().normalize()),new Vector3(radius,delta.length(),radius));
      add('stem',parent,local);
    };
    const blade=(parent:Matrix4,x:number,y:number,z:number,size:number,tilt:number,angle:number)=>{
      const q=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),tilt).multiply(new Quaternion().setFromAxisAngle(UP,angle));
      add('leaf',parent,new Matrix4().compose(new Vector3(x,y,z),q,new Vector3(size,size,size)));
    };
    const vine=(parent:Matrix4,x:number,z:number,length:number)=>{
      const steps=mobile?8:12;
      let previous=new Vector3(x,.36,z);
      for(let j=1;j<=steps;j++){
        const t=j/steps,next=new Vector3(x+Math.sin(t*5.4+x)*.15,.36-t*length,z+Math.sin(t*3.2)*.12);
        sprig(parent,previous,next,.007*(1-t*.6));
        for(const side of [-1,1])blade(parent,next.x+side*.08,next.y,next.z,.56+random()*.30,side*(.65+random()*.4),random()*.8);
        previous=next;
      }
    };
    const placements=plan.placements.filter(p=>p.stop===stop);
    for(const p of placements){
      const m=new Matrix4().fromArray(p.transform);
      if(p.part==='wall-3m'){
        // Rusticated courses, with real recessed joints and small edge bevels.
        for(const face of [-1,1])for(let row=0;row<3;row++){
          const ends=wallJoints.cuts.get(p.instance),left=-1.5+(ends?.left ? .25 : 0),right=1.5-(ends?.right ? .25 : 0);
          const cells=row%2?4:5,width=(right-left)/cells;
          for(let i=0;i<cells;i++)add(row===2?'marble':'stone',m,compose(left+width*(i+.5),.16+row*.27,face*.174,width-.018,.252,.075),.94+random()*.06);
        }
      } else if(p.part==='wall-3m-doorway'){
        add('arch',m,new Matrix4());
        add('spandrel',m,new Matrix4());
        for(const x of [-1.11,1.11])add('pier',m,compose(x,0,0));
      } else if(p.part==='entablature-3m'&&!roomStops.has(stop)&&random()<.52){
        for(let branch=0;branch<(mobile?3:4);branch++)vine(m,-1.3+branch*.75,.34,(.6+random()*.95));
        // A short run over the cornice connects the hanging stems.
        sprig(m,new Vector3(-1.42,.37,.34),new Vector3(1.42,.37,.34),.012);
      } else if(p.part==='stair-run-3m'){
        for(const side of [-1,1]){
          const x=side*1.59;
          if(stop==='entry'){
            const edge=new Vector3(x,0,0).applyMatrix4(m);
            if(edge.x>plan.bounds[stop].min[0]&&edge.x<plan.bounds[stop].max[0])continue;
          }
          for(const step of [1,3,5,7,9]){
            const z=-1.35+step*.3,top=-step*.1;
            add('marble',m,compose(x,top+.39,z,.13,.78,.16));
            add('marble',m,compose(x,top+.08,z,.24,.16,.25));
          }
          const from=new Vector3(x,.704,-1.05),to=new Vector3(x,-.096,1.35),delta=to.clone().sub(from);
          add('bronze',m,new Matrix4().compose(from.clone().add(to).multiplyScalar(.5),new Quaternion().setFromUnitVectors(UP,delta.clone().normalize()),new Vector3(.024,delta.length(),.024)));
        }
      } else if(p.part==='planter-square'){
        for(let shoot=0;shoot<(mobile?8:12);shoot++){
          const a=shoot*Math.PI*2/(mobile?8:12),r=.13+random()*.09;
          const base=new Vector3(Math.cos(a)*r,.70,Math.sin(a)*r),tip=new Vector3(Math.cos(a)*.32,1.02+random()*.12,Math.sin(a)*.32);
          sprig(m,base,tip,.005);
          for(let i=1;i<4;i++)for(const side of [-1,1]){
            const t=i/4,at=base.clone().lerp(tip,t);
            blade(m,at.x+Math.cos(a+Math.PI/2)*side*.06,at.y,at.z+Math.sin(a+Math.PI/2)*side*.06,.50,side*.9,a);
          }
        }
      } else if(p.part==='column-doric'&&!roomStops.has(stop)&&random()<.23){
        // Young climbers wind around a few shafts, leaving the fluting readable.
        let last=new Vector3(.39,.1,0);
        for(let i=1;i<=24;i++){
          const t=i/24,a=t*7.4;const at=new Vector3(Math.cos(a)*.39,.10+t*2.8,Math.sin(a)*.39);
          sprig(m,last,at,.006);if(i%2===0)blade(m,at.x*1.05,at.y,at.z*1.05,.65,.3,a);last=at;
        }
      }
    }
    for(const joint of cornices.joints.filter(j=>j.stop===stop))add('cornice',new Matrix4().makeTranslation(...joint.position as [number,number,number]),new Matrix4());
    for(const joint of wallJoints.joints.filter(j=>j.stop===stop)){
      const parent=new Matrix4().makeTranslation(...joint.position as [number,number,number]);
      // A solid corner pier encloses the wall ends; the courses project from it.
      add('quoin',parent,new Matrix4());
      for(let row=0;row<3;row++)add(row===2?'marble':'stone',parent,compose(0,.16+row*.27,0,.50,.252,.50));
    }
    // Low garden beds along exposed edges give the colonnades a planted base.
    if(!roomStops.has(stop)){
      const b=plan.bounds[stop],floor=b.min[1]+.2;
      for(const axis of [0,2])for(const sign of [-1,1]){
        const other=axis===0?2:0,edge=sign<0?b.min[axis]:b.max[axis];
        const covered=Object.entries(plan.bounds).some(([id,n])=>id!==stop&&Math.abs((sign<0?n.max[axis]:n.min[axis])-edge)<.01&&Math.min(b.max[other],n.max[other])-Math.max(b.min[other],n.min[other])>.1);
        if(covered)continue;
        const length=b.max[other]-b.min[other];
        for(const end of [-1,1]){
          const at=new Vector3();at.setComponent(axis,edge+sign*.30);at.setComponent(other,(b.min[other]+b.max[other])/2+end*(length/2-1.25));at.y=floor;
          const parent=new Matrix4().makeTranslation(at.x,at.y,at.z).multiply(new Matrix4().makeRotationY(axis===0?Math.PI/2:0));
          add('stone',parent,compose(0,.16,0,2.05,.32,.58));add('earth',parent,compose(0,.329,0,1.91,.022,.46));
          add('marble',parent,compose(0,.345,-.275,2.10,.06,.08));add('marble',parent,compose(0,.345,.275,2.10,.06,.08));
          for(let i=0;i<(mobile?16:28);i++){
            const x=(random()-.5)*1.84,z=(random()-.5)*.42;
            for(let j=0;j<3;j++)blade(parent,x,.43+random()*.12,z,.58+random()*.35,(random()-.5)*1.7,random()*6.28);
          }
        }
      }
    }
    for(const [kind,items]of batches){
      const {geometry,material}=types[kind];const mesh=new InstancedMesh(geometry,material,items.length);mesh.name=kind;
      items.forEach((item,i)=>{mesh.setMatrixAt(i,item.matrix);mesh.setColorAt(i,item.color);});
      mesh.castShadow=kind!=='earth';mesh.receiveShadow=true;group.add(mesh);
    }
  }
  return {root,leafCount,stoneCount,show(stops:Set<string>){for(const [id,group]of groups)group.visible=stops.has(id);}};
}
