
"use strict";
const R=6371,$=id=>document.getElementById(id),D2R=Math.PI/180,S=60; // S = scene units per AU in solar view
const CT="https://celestrak.org/",AUKM=149597870.7,LQ=location.search.includes("lq"),TP=n=>"textures/"+n,HI=["8k_mercury.jpg","4k_venus_atmosphere.jpg","8k_earth_daymap.jpg","8k_mars.jpg","8k_jupiter.jpg","8k_saturn.jpg","2k_uranus.jpg","2k_neptune.jpg"]; // ?lq = 2k textures for weak GPUs; // textures: Solar System Scope, served/cached by server.py
const DEBRIS=["cosmos-2251-debris","iridium-33-debris","fengyun-1c-debris","cosmos-1408-debris"];
let sats=[],byId=new Map(),pos=new Float32Array(0),sel=-1,selM=-1,selS=-1,cursor=0,follow=false,autoRot=true,autoPause=false,focus=2,curKey="visual",pts=null,orbitLine=null,model=null;

/* ---------- data tables ---------- */
// name, radius km, texture, rotation h, [a,da,e,de,I,dI,L,dL,varpi,dvarpi,Omega,dOmega] (JPL approx. elements, per century)
const B=[
["Mercury",2439.7,"2k_mercury.jpg",1407.6,[0.38709927,0.00000037,0.20563593,0.00001906,7.00497902,-0.00594749,252.2503235,149472.67411175,77.45779628,0.16047689,48.33076593,-0.12534081]],
["Venus",6051.8,"2k_venus_atmosphere.jpg",-5832.5,[0.72333566,0.0000039,0.00677672,-0.00004107,3.39467605,-0.0007889,181.9790995,58517.81538729,131.60246718,0.00268329,76.67984255,-0.27769418]],
["Earth",6371,"",23.934,[1.00000261,0.00000562,0.01671123,-0.00004392,-0.00001531,-0.01294668,100.46457166,35999.37244981,102.93768193,0.32327364,0,0]],
["Mars",3389.5,"2k_mars.jpg",24.623,[1.52371034,0.00001847,0.0933941,0.00007882,1.84969142,-0.00813131,-4.55343205,19140.30268499,-23.94362959,0.44441088,49.55953891,-0.29257343]],
["Jupiter",69911,"2k_jupiter.jpg",9.925,[5.202887,-0.00011607,0.04838624,-0.00013253,1.30439695,-0.00183714,34.39644051,3034.74612775,14.72847983,0.21252668,100.47390909,0.20469106]],
["Saturn",58232,"2k_saturn.jpg",10.656,[9.53667594,-0.0012506,0.05386179,-0.00050991,2.48599187,0.00193609,49.95424423,1222.49362201,92.59887831,-0.41897216,113.66242448,-0.28867794]],
["Uranus",25362,"2k_uranus.jpg",-17.24,[19.18916464,-0.00196176,0.04725744,-0.00004397,0.77263783,-0.00242939,313.23810451,428.48202785,170.9542763,0.40805281,74.01692503,0.04240589]],
["Neptune",24622,"2k_neptune.jpg",16.11,[30.06992276,0.00026291,0.00859048,0.00005105,1.77004347,0.00035372,-55.12002969,218.45945325,44.96476227,-0.32241464,131.78422574,-0.00508664]]];
// moon, parent index, semi-major axis km, period days, radius km, texture
const M=[["Moon",2,384400,27.3217,1737,"2k_moon.jpg"],["Phobos",3,9376,.3189,11],["Deimos",3,23463,1.263,6],
["Io",4,421700,1.769,1822],["Europa",4,671034,3.551,1561],["Ganymede",4,1070412,7.155,2634],["Callisto",4,1882709,16.689,2410],
["Mimas",5,185539,.942,198],["Enceladus",5,238037,1.37,252],["Tethys",5,294619,1.888,533],["Dione",5,377396,2.737,562],["Rhea",5,527108,4.518,764],["Titan",5,1221870,15.945,2575],["Iapetus",5,3560820,79.33,735],
["Miranda",6,129390,1.413,236],["Ariel",6,191020,2.52,579],["Umbriel",6,266300,4.144,585],["Titania",6,435910,8.706,789],["Oberon",6,583520,13.463,761],
["Triton",7,354759,5.877,1353]];

/* ---------- renderer / scene ---------- */
const renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);document.body.prepend(renderer.domElement);
const scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,0.001,40000);
const TL=new THREE.TextureLoader().setCrossOrigin("anonymous"),tc={},fb=(t,u)=>{const f=u.includes("/8k_")?u.replace("/8k_","/4k_"):u.includes("/4k_")?u.replace("/4k_","/2k_"):null;if(f)new THREE.ImageLoader().load(f,i=>{t.image=i;t.needsUpdate=true},undefined,()=>fb(t,f))}, // 8k missing -> try 4k -> 2k
  tex=u=>tc[u]||(tc[u]=(()=>{const t=TL.load(u,undefined,undefined,()=>fb(t,u));t.anisotropy=16;return t})());
const dot=(()=>{const c=document.createElement("canvas");c.width=c.height=32;const x=c.getContext("2d");x.beginPath();x.arc(16,16,14,0,7);x.fillStyle="#fff";x.fill();return new THREE.CanvasTexture(c)})();
const glowTex=(()=>{const c=document.createElement("canvas");c.width=c.height=128;const x=c.getContext("2d"),g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,"rgba(255,220,140,1)");g.addColorStop(.25,"rgba(255,170,60,.5)");g.addColorStop(1,"rgba(255,140,0,0)");x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c)})();
const stars=(()=>{const n=2500,a=new Float32Array(n*3);for(let i=0;i<n;i++){const u=Math.random()*2-1,t=Math.random()*6.283,s=Math.sqrt(1-u*u);a.set([9000*s*Math.cos(t),9000*u,9000*s*Math.sin(t)],i*3)}
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(a,3));const p=new THREE.Points(g,new THREE.PointsMaterial({color:0x9aa9c8,size:1.3,sizeAttenuation:false,fog:false}));p.frustumCulled=false;scene.add(p);return p})();
const dirLight=new THREE.DirectionalLight(0xffffff,1.5);scene.add(dirLight,new THREE.AmbientLight(0xffffff,.3));
const ring=(a,b,hi)=>{const g=new THREE.RingGeometry(a,b,128,1),p=g.attributes.position,u=g.attributes.uv,v=new THREE.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);u.setXY(i,(v.length()-a)/(b-a),.5)}
  const m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({map:tex(TP(hi&&!LQ?"8k_saturn_ring_alpha.png":"2k_saturn_ring_alpha.png")),side:2,transparent:true,depthWrite:false}));m.rotation.x=Math.PI/2;return m};
const sky=new THREE.Mesh(new THREE.SphereGeometry(20000,48,32),new THREE.MeshBasicMaterial({map:tex(TP(LQ?"2k_stars_milky_way.jpg":"8k_stars_milky_way.jpg")),side:THREE.BackSide,color:0x9a9a9a,depthWrite:false}));scene.add(sky);

/* ---------- solar system view ---------- */
function kep(p,T){const[a0,a1,e0,e1,i0,i1,l0,l1,w0,w1,o0,o1]=p,a=a0+a1*T,e=e0+e1*T,I=(i0+i1*T)*D2R,w=w0+w1*T,O=(o0+o1*T)*D2R,M=(l0+l1*T-w)*D2R;
  let E=M;for(let k=0;k<7;k++)E-=(E-e*Math.sin(E)-M)/(1-e*Math.cos(E));
  const xp=a*(Math.cos(E)-e),yp=a*Math.sqrt(1-e*e)*Math.sin(E),om=(w-o0-o1*T)*D2R,c=Math.cos,s=Math.sin;
  return[(c(om)*c(O)-s(om)*s(O)*c(I))*xp+(-s(om)*c(O)-c(om)*s(O)*c(I))*yp,(c(om)*s(O)+s(om)*c(O)*c(I))*xp+(-s(om)*s(O)+c(om)*c(O)*c(I))*yp,s(om)*s(I)*xp+c(om)*s(I)*yp]}
/* ---- planet shader: linear-light shading, relief from the texture, atmosphere haze, ocean glint, night lights, cloud shadows, filmic tone-map ---- */
const VS="varying vec2 u;varying vec3 n,w;void main(){u=uv;n=mat3(modelMatrix)*normal;w=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}";
const PFS=`uniform sampler2D day,night,clouds;uniform vec3 sun,atm;uniform float bump,ak,ns,cl,oc;varying vec2 u;varying vec3 n,w;
vec3 lin(vec3 c){return pow(c,vec3(2.2));}
void main(){
 vec3 Ng=normalize(n),V=normalize(cameraPosition-w),N=Ng;
 vec4 t=texture2D(day,u);vec3 alb=lin(t.rgb);
 float ocean=oc>.5?smoothstep(0.,.12,t.b-max(t.r,t.g)*1.1+.05):0.;
 if(bump>0.){float h=dot(t.rgb,vec3(.3,.59,.11)),bs=bump*(1.-ocean);vec3 sx=dFdx(w),sy=dFdy(w),r1=cross(sy,N),r2=cross(N,sx);float det=dot(sx,r1);vec3 g=sign(det)*(dFdx(h)*r1+dFdy(h)*r2);N=normalize(abs(det)*N-bs*g);}
 float dg=dot(Ng,sun),d=dot(N,sun),wr=.2*ak,lit=clamp((d+wr)/(1.+wr),0.,1.)*smoothstep(-.1,.08,dg);
 float cld=0.,cs=0.;if(cl>.5){cld=texture2D(clouds,u).r;cs=texture2D(clouds,u+vec2(.0022,-.0012)).r;}
 vec3 col=alb*lit*(1.-.45*cs);
 vec3 Hh=normalize(sun+V);float nh=max(dot(N,Hh),0.);
 col+=vec3(1.,.93,.8)*ocean*(1.-cld)*(pow(nh,500.)*1.6+pow(nh,60.)*.1)*lit;
 col=mix(col,vec3(.92)*lit,cld*.9);
 float mu=max(dot(Ng,V),0.),fr=pow(1.-mu,3.5),dy=smoothstep(-.2,.45,dg);
 vec3 tint=mix(vec3(1.,.35,.12),atm,smoothstep(0.,.4,dg));
 col=mix(col,col*.6+tint*lit*.5,fr*ak*.7*dy)+tint*fr*ak*dy*.28;
 col*=mix(1.,mix(.6,1.,pow(mu,.3)),min(ak,1.));
 vec3 nl=ns>.5?lin(texture2D(night,u).rgb)*2.2*(1.-smoothstep(-.12,.06,dg))*(1.-cld*.85):vec3(0.);
 col=col*2.6+nl+alb*(.012+.03*ak)*(atm*.5+.5);
 col=vec3(1.)-exp(-col*1.15);gl_FragColor=vec4(pow(col,vec3(1./2.2)),1.);}`;
function planetMat(o){return new THREE.ShaderMaterial({extensions:{derivatives:true},vertexShader:VS,fragmentShader:PFS,uniforms:{
  day:{value:tex(o.day)},night:{value:tex(o.night||o.day)},clouds:{value:tex(o.clouds||o.day)},sun:{value:new THREE.Vector3(1,0,0)},atm:{value:new THREE.Color(o.atm||0x6fa8ff)},
  bump:{value:o.bump||0},ak:{value:o.ak||0},ns:{value:o.night?1:0},cl:{value:o.clouds?1:0},oc:{value:o.ocean?1:0}}})}
const solar=new THREE.Group();scene.add(solar);
const sunMesh=new THREE.Mesh(new THREE.SphereGeometry(7,32,16),new THREE.MeshBasicMaterial({map:tex(TP("2k_sun.jpg"))}));
const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));glow.scale.set(40,40,1);
solar.add(sunMesh,glow,new THREE.PointLight(0xffffff,1.9,0,0));
const T0=(Date.now()/864e5-10957.5)/36525,dr=b=>0.6+1.4*Math.log10(b[1]/1000);
const sm=B.map((b,i)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(dr(b),32,16),planetMat({day:TP(i==2?"2k_earth_daymap.jpg":b[2])}));
  if(i==5)m.add(ring(dr(b)*1.15,dr(b)*2.41));solar.add(m);
  const pts2=[];for(let k=0;k<=240;k++){const p=b[4].slice();p[6]+=360*k/240;const v=kep(p,T0);pts2.push(new THREE.Vector3(v[0]*S,v[2]*S,-v[1]*S))}
  solar.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2),new THREE.LineBasicMaterial({color:0x3b4d6b,transparent:true,opacity:.7})));return m});
solar.visible=false;
// the Sun as seen from a planet's neighbourhood: bright disc + glare far away in the sun's direction (planet occludes it, so you get limb flare)
const mkTex=st=>{const c=document.createElement("canvas");c.width=c.height=128;const x=c.getContext("2d"),g=x.createRadialGradient(64,64,0,64,64,64);st.forEach(s=>g.addColorStop(s[0],s[1]));x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c)};
const sunGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:mkTex([[0,"rgba(255,230,170,.9)"],[.12,"rgba(255,200,120,.45)"],[.4,"rgba(255,150,60,.1)"],[1,"rgba(255,120,30,0)"]]),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
const sunCore=new THREE.Sprite(new THREE.SpriteMaterial({map:mkTex([[0,"rgba(255,255,255,1)"],[.2,"rgba(255,255,255,1)"],[.32,"rgba(255,235,190,.55)"],[1,"rgba(255,210,140,0)"]]),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
sunGlow.scale.set(12000,12000,1);sunCore.scale.set(1000,1000,1);scene.add(sunGlow,sunCore);

/* ---------- planet "local" views (planet at radius 1, moons around it) ---------- */
// soft atmospheric halo outside the disc: density falls off exponentially with altitude, brightens toward the sun, reddens at the terminator
const atmos=[];
function halo(H,col,k){const m=new THREE.Mesh(new THREE.SphereGeometry(1+H*9,96,64),new THREE.ShaderMaterial({side:THREE.BackSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
 uniforms:{sun:{value:new THREE.Vector3(1,0,0)},col:{value:new THREE.Color(col)},H:{value:H},k:{value:k}},
 vertexShader:"varying vec3 w;void main(){w=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
 fragmentShader:"uniform vec3 sun,col;uniform float H,k;varying vec3 w;void main(){vec3 dir=normalize(w-cameraPosition);vec3 pc=cameraPosition-dir*dot(cameraPosition,dir);float b=length(pc);if(b<1.)discard;float e=exp(-(b-1.)/H),l=dot(normalize(pc),sun),day=smoothstep(-.35,.45,l),fs=pow(max(dot(dir,sun),0.),5.);vec3 tint=mix(vec3(1.,.38,.12),col,smoothstep(-.05,.5,l));gl_FragColor=vec4(tint*e*k*(day*.9+fs*2.5),1.);}"}));atmos.push(m);return m}
const POLE=[[281.01,61.45],[272.76,67.16],null,[317.68,52.89],[268.06,64.5],[40.59,83.54],[257.31,-15.18],[299.36,43.46]]; // spin-axis RA/Dec (J2000)
const PRM=[{bump:.02},{ak:1.1,atm:0xffcc88,H:.02,k:1},{ocean:1,night:1,clouds:1,bump:.006,ak:1,atm:0x5f9bff,H:.012,k:.9},{bump:.02,ak:.35,atm:0xd9a07a,H:.01,k:.35},
  {ak:.35,atm:0xcdb593,H:.012,k:.2},{ak:.35,atm:0xd9c08c,H:.012,k:.2},{ak:.6,atm:0x7fdfff,H:.02,k:.7},{ak:.6,atm:0x4a66ff,H:.02,k:.8}];
const loc={};
function disposeLocal(k){const g=loc[k];scene.remove(g);g.traverse(o=>{const ix=atmos.indexOf(o);if(ix>=0)atmos.splice(ix,1);if(o.geometry)o.geometry.dispose();const m=o.material;
  if(m){[m.map,m.alphaMap,...(m.uniforms?Object.values(m.uniforms).map(x=>x.value):[])].forEach(t=>{if(t&&t.isTexture){t.dispose();for(const u in tc)if(tc[u]===t)delete tc[u]}});m.dispose()}});delete loc[k]} // frees GPU memory of 8k textures
function getLocal(i){
  if(loc[i])return loc[i];const g=new THREE.Group();g.visible=false;scene.add(g);const tilt=g.tilt=new THREE.Group(),P=PRM[i],r=LQ?"2k_":"8k_";g.add(tilt);
  if(POLE[i]){const ra=POLE[i][0]*D2R,de=POLE[i][1]*D2R,x=Math.cos(de)*Math.cos(ra),y=Math.cos(de)*Math.sin(ra),z=Math.sin(de);
    tilt.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(x,-y*.3978+z*.9175,-(y*.9175+z*.3978)).normalize())}
  const body=new THREE.Mesh(new THREE.SphereGeometry(1,160,96),planetMat(Object.assign({day:TP(i==2?r+"earth_daymap.jpg":LQ?B[i][2]:HI[i])},P,i==2?{night:TP(r+"earth_nightmap.jpg"),clouds:TP(r+"earth_clouds.jpg")}:{})));
  g.body=body;tilt.add(body);if(i==5)tilt.add(ring(1.15,2.41,1));if(P.H)tilt.add(halo(P.H,P.atm,P.k));
  g.moons=M.filter(m=>m[1]==i).map(m=>{const mesh=new THREE.Mesh(new THREE.SphereGeometry(Math.max(m[4]/B[i][1],.012),48,32),m[5]?planetMat({day:TP(m[5]),bump:.02}):new THREE.MeshLambertMaterial({color:0x9a958c}));tilt.add(mesh);return{d:m,mesh,w:new THREE.Vector3()}});
  g.mp=new THREE.Points(new THREE.BufferGeometry().setFromPoints(g.moons.map(()=>new THREE.Vector3())),new THREE.PointsMaterial({color:0xffffff,size:6,sizeAttenuation:false,map:dot,alphaTest:.4,transparent:true}));g.mp.frustumCulled=false;tilt.add(g.mp);
  g.sp=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color:0xffb347,size:7,sizeAttenuation:false,map:dot,alphaTest:.4,transparent:true}));g.sp.frustumCulled=false;g.add(g.sp);
  return loc[i]=g}
function moonVec(m,days,o){const d=m[2]/B[m[1]][1];
  if(m[0]=="Moon"){const lon=(218.316+13.176396*days)*D2R,lat=5.145*D2R*Math.sin(lon-(125.04-0.0529539*days)*D2R),xe=Math.cos(lat)*Math.cos(lon),ye=Math.cos(lat)*Math.sin(lon),ze=Math.sin(lat),ce=.9175,se=.3978;
    return o.set(xe*d,(ye*se+ze*ce)*d,-(ye*ce-ze*se)*d)}
  const a=((m[2]%360)+360*days/m[3])*D2R;return o.set(Math.cos(a)*d,0,-Math.sin(a)*d)}

/* ---------- procedural satellite models ---------- */
const MT=c=>new THREE.MeshLambertMaterial({color:c}),box=(w,h,d,c,x=0,y=0,z=0)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),MT(c));m.position.set(x,y,z);return m};
const cyl=(r,l,c,x=0,y=0,z=0)=>{const g=new THREE.CylinderGeometry(r,r,l,16);g.rotateX(Math.PI/2);const m=new THREE.Mesh(g,MT(c));m.position.set(x,y,z);return m};
function makeModel(s){const n=s.name.toUpperCase(),g=new THREE.Group(),P=0x1e3f8f,GOLD=0xd9b34a;
  if(s.sc){const d=new THREE.Mesh(new THREE.SphereGeometry(.14,16,8),MT(0xffffff));d.scale.set(1,.3,1);d.position.y=.14;g.add(box(.18,.18,.24,0xc9c9c9),box(.7,.008,.2,0x1e3f8f,.45,0,0),box(.7,.008,.2,0x1e3f8f,-.45,0,0),d)}
  else if(s.deb)g.add(box(.3,.1,.2,0x8a8a8a),box(.1,.14,.1,0x6a6a6a,.14,.06,0));
  else if(/ISS|ZARYA|CSS|TIANHE|TIANGONG/.test(n)){g.add(box(1,.03,.03,0xcccccc),cyl(.06,.55,0xe8e8e8),cyl(.05,.3,0xdddddd,0,0,.4));for(const x of[-.44,-.3,.3,.44])g.add(box(.1,.008,.3,0xc8a032,x,0,.2),box(.1,.008,.3,0xc8a032,x,0,-.2))}
  else if(/HST|HUBBLE/.test(n))g.add(cyl(.1,.5,0xb8bcc4),cyl(.12,.14,0x333844,0,0,.32),box(.4,.008,.12,P,.3,0,-.1),box(.4,.008,.12,P,-.3,0,-.1));
  else if(/STARLINK/.test(n))g.add(box(.5,.02,.24,0xdddddd),box(.9,.008,.24,P,.7,0,0));
  else if(s.grp=="geo"){g.add(box(.22,.22,.26,GOLD),box(.8,.008,.2,P,.58,0,0),box(.8,.008,.2,P,-.58,0,0));const d=new THREE.Mesh(new THREE.SphereGeometry(.12,16,8),MT(0xffffff));d.scale.set(1,1,.3);d.position.z=.2;g.add(d)}
  else g.add(box(.16,.16,.22,GOLD),box(.45,.008,.16,P,.32,0,0),box(.45,.008,.16,P,-.32,0,0),cyl(.012,.12,0xaaaaaa,0,.12,0));
  g.scale.setScalar(0.016);return g}
const marker=new THREE.Mesh(new THREE.SphereGeometry(0.018,12,8),new THREE.MeshBasicMaterial({color:0xffb347}));marker.visible=false;scene.add(marker);

/* ---------- camera ---------- */
const view={az:.6,el:.35,dist:3.2,goal:3.2,t:new THREE.Vector3()},el=renderer.domElement,ptrs=new Map();let moved=0;
el.addEventListener("pointerdown",e=>{el.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,e);moved=0;autoPause=true});
el.addEventListener("pointermove",e=>{const p=ptrs.get(e.pointerId);if(!p)return;
  if(ptrs.size==1){const k=.005*(follow?1:Math.min(1,view.dist/3));view.az-=(e.clientX-p.clientX)*k;view.el=Math.max(-1.5,Math.min(1.5,view.el+(e.clientY-p.clientY)*k))}
  else if(ptrs.size==2){const o=[...ptrs.values()].find(q=>q.pointerId!=e.pointerId);zoom(Math.hypot(p.clientX-o.clientX,p.clientY-o.clientY)/Math.hypot(e.clientX-o.clientX,e.clientY-o.clientY))}
  moved+=Math.abs(e.clientX-p.clientX)+Math.abs(e.clientY-p.clientY);ptrs.set(e.pointerId,e)});
el.addEventListener("pointerup",e=>{if(ptrs.size==1&&moved<6)pick(e.clientX,e.clientY);ptrs.delete(e.pointerId);autoPause=false});
el.addEventListener("pointercancel",e=>ptrs.delete(e.pointerId));
el.addEventListener("wheel",e=>{e.preventDefault();zoom(Math.exp(e.deltaY*.001))},{passive:false});
const zoom=f=>{const lim=focus==2?400:150;if(!follow&&focus>=0&&f>1&&view.goal>=lim*.97){setFocus(-1);return} // zooming out far enough leaves the planet for the Solar System
  view.goal=follow?Math.max(.02,Math.min(40,view.goal*f)):focus<0?Math.max(3,Math.min(6000,view.goal*f)):Math.max(1.15,Math.min(lim,view.goal*f))};
addEventListener("resize",()=>{renderer.setSize(innerWidth,innerHeight);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix()});
const home=()=>focus==-1?420:focus==-2?25:focus==5?5.5:3.2;
function setFollow(on,g){follow=on&&(sel>=0||selM>=0||selS>=0);view.goal=follow?(g||.06):home();$("glb").textContent=follow?"Zoom out":"Follow";$("glb").style.display=(sel>=0||selM>=0||selS>=0)?"inline-block":"none"}
const fgoal=()=>selM>=0?Math.max(.06,getLocal(focus).moons[selM].mesh.geometry.parameters.radius*4):selS>=0?(focus<0?3:.15):.06;
$("glb").onclick=()=>setFollow(!follow,fgoal());

/* ---------- sun ---------- */
function sunInfo(now){const n=now/864e5+2440587.5-2451545,L=(280.46+.9856474*n)*D2R,g=(357.528+.9856003*n)*D2R,lam=L+(1.915*Math.sin(g)+.02*Math.sin(2*g))*D2R,eps=(23.439-4e-7*n)*D2R;
  const ra=Math.atan2(Math.cos(eps)*Math.sin(lam),Math.cos(lam)),dec=Math.asin(Math.sin(eps)*Math.sin(lam));let lon=(ra-satellite.gstime(new Date(now)))/D2R;lon=((lon+540)%360)-180;
  return{x:Math.cos(dec)*Math.cos(ra),y:Math.cos(dec)*Math.sin(ra),z:Math.sin(dec),lat:dec/D2R,lon}}
const fmtLL=(a,o)=>Math.abs(a).toFixed(1)+"°"+(a<0?"S":"N")+", "+Math.abs(o).toFixed(1)+"°"+(o<0?"W":"E");

/* ---------- satellite data ---------- */
const fetchT=async(u,ms=9000)=>{const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(u,{signal:c.signal});if(!r.ok)throw 0;return r}finally{clearTimeout(t)}};
async function getTLE(key){const k="tle:"+key;try{const c=JSON.parse(localStorage.getItem(k));if(c&&Date.now()-c.t<72e5)return c.d}catch(e){}
  const d=await(await fetchT(CT+"NORAD/elements/gp.php?GROUP="+key+"&FORMAT=tle",30000)).text();try{localStorage.setItem(k,JSON.stringify({t:Date.now(),d}))}catch(e){}return d}
function parseTLE(txt,grp){const L=txt.split(/\r?\n/).map(s=>s.trimEnd()).filter(Boolean);
  for(let i=0;i+2<L.length;i+=3){const id=+L[i+1].substring(2,7);if(byId.has(id))continue;
    try{const s={name:L[i].trim(),id,l1:L[i+1],l2:L[i+2],rec:satellite.twoline2satrec(L[i+1],L[i+2]),grp,deb:DEBRIS.includes(grp)};byId.set(id,s);sats.push(s)}catch(e){}}}
async function loadKeys(key){curKey=key;$("grp").value=key;if(focus!=2)setFocus(2);closeInfo();$("stat").textContent="Loading "+key+"…";
  const keys=key=="everything"?["active",...DEBRIS]:key=="debris"?DEBRIS:[key];sats=[];byId=new Map();
  const r=await Promise.allSettled(keys.map(getTLE));r.forEach((x,i)=>{if(x.status=="fulfilled")parseTLE(x.value,keys[i])});
  if(!sats.length){$("stat").textContent="Could not reach CelesTrak. Check your connection and retry.";return}
  rebuild();$("stat").textContent=sats.length.toLocaleString()+" objects"+(r.some(x=>x.status!="fulfilled")?" (some groups failed)":"")}
function rebuild(){const N=sats.length;pos=new Float32Array(N*3);const c=new Float32Array(N*3);sats.forEach((s,i)=>c.set(s.deb?[1,.48,.27]:[.36,.78,1],i*3));
  if(pts){scene.remove(pts);pts.geometry.dispose()}const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(pos,3));g.setAttribute("color",new THREE.BufferAttribute(c,3));
  pts=new THREE.Points(g,new THREE.PointsMaterial({size:N>15000?2.2:N>3000?3:5,sizeAttenuation:false,map:dot,alphaTest:.4,transparent:true,vertexColors:true}));
  pts.frustumCulled=false;pts.visible=focus==2;scene.add(pts);cursor=0;stepSats(1e9)}
function stepSats(ms){const t0=performance.now(),now=new Date(),N=sats.length;let c=0;
  while(N&&c<N){const i=cursor;cursor=(cursor+1)%N;c++;const p=satellite.propagate(sats[i].rec,now).position;
    if(p&&p.x===p.x){pos[i*3]=p.x/R;pos[i*3+1]=p.z/R;pos[i*3+2]=-p.y/R}else pos[i*3]=pos[i*3+1]=pos[i*3+2]=1e5;
    if((c&63)==0&&performance.now()-t0>ms)break}
  if(pts)pts.geometry.attributes.position.needsUpdate=true}

/* ---------- focus / picking ---------- */
function setFocus(f){closeInfo();focus=f;const sol=f<0;solar.visible=sol;dirLight.visible=!sol;sunGlow.visible=sunCore.visible=!sol;for(const k in loc){if(k!=f&&k!=2)disposeLocal(k);else loc[k].visible=false}if(!sol)getLocal(f).visible=true;
  if(pts)pts.visible=f==2;$("go").value=f;{const hi=f==-2&&!LQ,k8="textures/8k_sun.jpg";sunMesh.material.map=tex(TP(hi?"8k_sun.jpg":"2k_sun.jpg"));sunMesh.material.needsUpdate=true;if(!hi&&tc[k8]){tc[k8].dispose();delete tc[k8]}}view.goal=home();view.dist=f<0?5:home()*12;view.t.set(0,0,0)}
const tmp=new THREE.Vector3();
function scr(v,c){tmp.copy(v).project(cam);if(tmp.z>1)return null;return[(tmp.x+1)/2*innerWidth-c[0],(1-tmp.y)/2*innerHeight-c[1]]}
function pick(cx,cy){const c=[cx,cy],cp=cam.position;let best=null,bd=20*20;const test=(v,fn)=>{const d=scr(v,c);if(d){const q=d[0]*d[0]+d[1]*d[1];if(q<bd){bd=q;best=fn}}};
  if(focus<0){B.forEach((b,i)=>test(sm[i].position,()=>{setFocus(i);planetPanel(i)}));SC.forEach((s,i)=>s[5]<0&&test(scW[i],()=>selectSC(i)));return best&&best()}
  const g=getLocal(focus);g.moons.forEach((o,k)=>test(o.w,()=>selectMoon(k)));SC.forEach((s,i)=>s[5]==focus&&test(scW[i],()=>selectSC(i)));
  if(focus==2)for(let i=0;i<sats.length;i++){const x=pos[i*3],y=pos[i*3+1],z=pos[i*3+2];if(x>1e4)continue;if(x*cp.x+y*cp.y+z*cp.z<1&&x*x+y*y+z*z<4)continue;test(tmp.set(x,y,z).clone(),()=>select(i))}
  if(best)best()}

/* ---------- spacecraft (live positions from NASA JPL Horizons via server.py) ---------- */
// Horizons id, name, agency, launched, purpose, centre (-1 = Sun, else planet index)
const SC=[[-74,"Mars Reconnaissance Orbiter","NASA","2005-08-12","High-resolution Mars imaging and data relay",3],[-202,"MAVEN","NASA","2013-11-18","Mars upper-atmosphere study",3],
[-53,"Mars Odyssey","NASA","2001-04-07","Mars mapping and communications relay",3],[-41,"Mars Express","ESA","2003-06-02","Mars imaging, atmosphere and subsurface radar",3],
[-143,"ExoMars Trace Gas Orbiter","ESA/Roscosmos","2016-03-14","Mars trace-gas detection and relay",3],[-61,"Juno","NASA","2011-08-05","Jupiter gravity, magnetosphere and atmosphere",4],
[-85,"Lunar Reconnaissance Orbiter","NASA","2009-06-18","Lunar mapping (orbits the Moon)",2],[-170,"James Webb Space Telescope","NASA/ESA/CSA","2021-12-25","Infrared observatory at Sun–Earth L2",2],
[-21,"SOHO","ESA/NASA","1995-12-02","Solar observatory at Sun–Earth L1",2],[-31,"Voyager 1","NASA","1977-09-05","Interstellar mission",-1],[-32,"Voyager 2","NASA","1977-08-20","Outer planets and interstellar mission",-1],
[-98,"New Horizons","NASA","2006-01-19","Pluto flyby and Kuiper Belt",-1],[-96,"Parker Solar Probe","NASA","2018-08-12","Closest-ever solar passes",-1],[-144,"Solar Orbiter","ESA/NASA","2020-02-10","Sun and heliosphere",-1],
[-49,"Lucy","NASA","2021-10-16","Jupiter Trojan asteroids",-1],[-255,"Psyche","NASA","2023-10-13","Metal-rich asteroid Psyche",-1],[-159,"Europa Clipper","NASA","2024-10-14","Jupiter's moon Europa",-1],
[-28,"JUICE","ESA","2023-04-14","Jupiter's icy moons",-1],[-121,"BepiColombo","ESA/JAXA","2018-10-20","Mercury orbiter mission",-1]];
const AG={NASA:"https://www.nasa.gov/",ESA:"https://www.esa.int/"},CEN=[199,299,399,499,599,699,799,899];
let scd={};const scW=SC.map(()=>new THREE.Vector3());
const scSolar=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color:0xffb347,size:7,sizeAttenuation:false,map:dot,alphaTest:.4,transparent:true}));scSolar.frustumCulled=false;solar.add(scSolar);
async function loadSC(){try{scd=await(await fetchT("/api/sc?q="+SC.map(s=>s[0]+":"+(s[5]<0?10:CEN[s[5]])).join(","),120000)).json();$("stat").textContent+=" · "+Object.keys(scd).length+" spacecraft live"}catch(e){$("stat").textContent+=" · spacecraft offline (run server.py)"}}
function scPos(i,ms,o){const d=scd[SC[i][0]];if(!d||d.p.length<2)return false;let f=Math.max(0,Math.min(d.p.length-1.001,(ms-d.t)/d.d));const k=f|0,u=f-k,a=d.p[k],b=d.p[k+1],c=SC[i][5],
  x=a[0]+(b[0]-a[0])*u,y=a[1]+(b[1]-a[1])*u,z=a[2]+(b[2]-a[2])*u;
  if(c<0){o.set(x,z,-y).multiplyScalar(S/AUKM);return true}
  if(c==2)o.set(x,y*.3978+z*.9175,-(y*.9175-z*.3978));else o.set(x,z,-y);o.multiplyScalar(1/B[c][1]);return true}
function updSC(ms){const g=solar.visible?null:getLocal(focus),pt=g?g.sp:scSolar,idx=[];SC.forEach((s,i)=>{if(s[5]==(g?focus:-1))idx.push(i)});
  let a=pt.geometry.attributes.position;if(!a||a.count!=idx.length){pt.geometry.setAttribute("position",new THREE.BufferAttribute(new Float32Array(idx.length*3),3));a=pt.geometry.attributes.position}
  idx.forEach((i,k)=>{if(!scPos(i,ms,scW[i]))scW[i].set(1e5,1e5,1e5);a.setXYZ(k,scW[i].x,scW[i].y,scW[i].z)});a.needsUpdate=true;pt.visible=idx.length>0}
function selectSC(i){closeInfo();selS=i;const s=SC[i];
  showInfo(s[1],"Spacecraft · "+s[2],"<div id='live'></div><dl><dt>Launched</dt><dd>"+s[3]+"</dd><dt>Purpose</dt><dd>"+esc(s[4])+"</dd><dt>Position source</dt><dd>NASA JPL Horizons (live ephemeris)</dd></dl><a class='b' target='_blank' rel='noopener' href='"+AG[s[2].split('/')[0]]+"'>Agency site</a><br><small>3D model is a generic stand-in.</small>");
  model=makeModel({sc:1,name:""});model.scale.setScalar(focus<0?.25:.016);scene.add(model);setFollow(true,fgoal())}
/* ---------- labels & dock ---------- */
const LB=["Sun",...B.map(b=>b[0])].map(n=>{const e=document.createElement("span");e.className="lb";e.textContent=n;$("labels").append(e);return e});
function updLabels(){cam.updateMatrixWorld();LB.forEach((e,k)=>{if(!solar.visible){e.style.display="none";return}tmp.copy(k?sm[k-1].position:new THREE.Vector3()).project(cam);
  if(tmp.z>1){e.style.display="none";return}e.style.display="block";e.style.transform="translate("+((tmp.x+1)/2*innerWidth+8)+"px,"+((1-tmp.y)/2*innerHeight-8)+"px)"})}
[["Solar System",-1],["Sun",-2],...B.map((b,i)=>[b[0],i])].forEach(([n,f])=>{const b=document.createElement("button");b.textContent=n;b.onclick=()=>{setFocus(f);if(f>=0)planetPanel(f)};$("dock").append(b)});
/* ---------- info panels ---------- */
const esc=s=>String(s??"—").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const safeUrl=u=>/^https?:\/\//i.test(u||"")?u:null;
function showInfo(title,sub,html){$("info").style.display="block";$("ib").innerHTML="<h2>"+esc(title)+"</h2><div class='sub'>"+esc(sub)+"</div>"+html}
function planetPanel(i){const b=B[i],p=kep(b[4],(Date.now()/864e5-10957.5)/36525),a=b[4][0];
  showInfo(b[0],"Planet",`<dl><dt>Distance from Sun</dt><dd>${Math.hypot(...p).toFixed(3)} AU (live)</dd><dt>Radius</dt><dd>${b[1].toLocaleString()} km</dd><dt>Rotation</dt><dd>${Math.abs(b[3]).toFixed(1)} h${b[3]<0?" (retrograde)":""}</dd><dt>Orbital period</dt><dd>${(Math.pow(a,1.5)).toFixed(2)} years</dd><dt>Eccentricity</dt><dd>${b[4][2].toFixed(3)}</dd><dt>Inclination</dt><dd>${b[4][4].toFixed(2)}°</dd><dt>Listed moons</dt><dd>${M.filter(m=>m[1]==i).map(m=>m[0]).join(", ")||"none"}</dd></dl><small>Position: JPL approximate Keplerian elements (valid 1800–2050). Planet sizes in Solar System view are exaggerated; orbits are to scale.</small>`)}
function selectMoon(k){const m=getLocal(focus).moons[k].d;closeInfo();selM=k;if(m[0]=="Moon"&&!LQ){const u=getLocal(focus).moons[k].mesh.material.uniforms;if(u)u.day.value=tex(TP("8k_moon.jpg"))}
  showInfo(m[0],"Moon of "+B[m[1]][0],`<dl><dt>Orbit radius</dt><dd>${m[2].toLocaleString()} km</dd><dt>Period</dt><dd>${m[3]} days</dd><dt>Radius</dt><dd>${m[4].toLocaleString()} km</dd></dl><small>${m[0]=="Moon"?"Position: low-precision lunar theory (good to ~1°).":"Position: circular mean-motion model — illustrative, phase not exact."}</small>`);
  setFollow(true,Math.max(.06,m[4]/B[m[1]][1]*4))}
const cache={};
const ago=d=>{const s=(Date.now()-d)/1000;return s<3600?Math.round(s/60)+" min":s<172800?(s/3600).toFixed(1)+" h":(s/86400).toFixed(1)+" days"};
const epochOf=l=>{const y=+l.substr(18,2),d=+l.substr(20,12);return Date.UTC(y<57?2000+y:1900+y,0,1)+(d-1)*864e5};
function purposeOf(s){const n=s.name.toUpperCase();
  const m=[[/ISS|ZARYA|CSS|TIANHE|TIANGONG/,"Crewed space station"],[/STARLINK|ONEWEB/,"Broadband internet constellation"],[/IRIDIUM/,"Voice and data communications"],[/NAVSTAR|GPS|GALILEO|GSAT|BEIDOU|GLONASS/,"Navigation"],[/NOAA|GOES|METEOR|METOP|FENGYUN|FY-|HIMAWARI/,"Weather observation"],[/HST|HUBBLE/,"Space telescope"],[/LANDSAT|SENTINEL|TERRA|AQUA|WORLDVIEW|FLOCK/,"Earth observation"]];
  if(s.deb||/ DEB|DEBRIS/.test(n))return"Debris from a breakup event (non-functioning)";
  for(const[re,t]of m)if(re.test(n))return t+" (inferred from name)";
  const g={weather:"Weather",science:"Scientific research",geo:"Geostationary (communications / weather)",stations:"Space station","gps-ops":"Navigation",galileo:"Navigation",beidou:"Navigation",starlink:"Broadband internet"}[s.grp];
  return g?g+" (inferred from catalog group)":"Not listed in open catalogs"}
const SITES=[[/ISS|ZARYA/,"https://www.nasa.gov/international-space-station/"],[/CSS|TIANHE/,"https://www.cmse.gov.cn/"],[/STARLINK/,"https://www.starlink.com/"],[/NAVSTAR|GPS/,"https://www.gps.gov/"],[/NOAA|GOES/,"https://www.nesdis.noaa.gov/"],[/GALILEO|GSAT/,"https://www.gsc-europa.eu/"],[/BEIDOU/,"http://en.beidou.gov.cn/"],[/HST/,"https://science.nasa.gov/mission/hubble/"],[/LANDSAT/,"https://landsat.gsfc.nasa.gov/"],[/SENTINEL/,"https://sentinels.copernicus.eu/"],[/IRIDIUM/,"https://www.iridium.com/"]];
const STAT={"+":"Operational","-":"Non-operational","P":"Partially operational","B":"Backup / standby","S":"Spare","X":"Extended mission","D":"Decayed (re-entered)","?":"Unknown"};
const ecfOf=(r,d)=>{const p=satellite.propagate(r,d).position;return p?satellite.eciToEcf(p,satellite.gstime(d)):null},dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

function select(i){closeInfo();sel=i;const s=sats[i];
  const p=tmp.set(pos[i*3],pos[i*3+1],pos[i*3+2]);view.az=Math.atan2(p.x,p.z);view.el=Math.asin(p.y/p.length());
  model=makeModel(s);scene.add(model);
  const per=2*Math.PI/s.rec.no,t0=Date.now(),q=[];for(let k=0;k<=180;k++){const r=satellite.propagate(s.rec,new Date(t0+k/180*per*60000)).position;if(r)q.push(new THREE.Vector3(r.x/R,r.z/R,-r.y/R))}
  orbitLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(q),new THREE.LineBasicMaterial({color:0xffb347,transparent:true,opacity:.7}));scene.add(orbitLine);
  showInfo(s.name,"NORAD "+s.id,"<div id='live'></div><div id='meta'><small>Loading catalog data…</small></div><div id='ver'><small>Verifying against other sources…</small></div>");
  setFollow(true);loadMeta(s).then(m=>{if(sel==i)renderMeta(s,m)});verify(s).then(v=>{if(sel==i)renderVer(s,v)})}
function closeInfo(){$("info").style.display="none";marker.visible=false;sel=selM=selS=-1;if(orbitLine){scene.remove(orbitLine);orbitLine=null}if(model){scene.remove(model);model=null}setFollow(false)}
$("x").onclick=closeInfo;
async function loadMeta(s){if(cache[s.id])return cache[s.id];
  const[a,b]=await Promise.allSettled([fetchT(CT+"satcat/records.php?CATNR="+s.id+"&FORMAT=json").then(r=>r.json()),fetchT("https://db.satnogs.org/api/satellites/?format=json&norad_cat_id="+s.id).then(r=>r.json())]);
  return cache[s.id]={cat:a.value&&a.value[0],nog:b.value&&b.value[0]}}
function renderMeta(s,{cat,nog}){const site=safeUrl(nog&&nog.website)||(SITES.find(x=>x[0].test(s.name.toUpperCase()))||[])[1],L=[];
  if(site)L.push("<a class='b' target='_blank' rel='noopener' href='"+esc(site)+"'>Official site</a>");
  if(s.id==25544)L.push("<a class='b' target='_blank' rel='noopener' href='https://www.youtube.com/@NASA/live'>Live from ISS</a>");
  $("meta").innerHTML="<dl><dt>Status</dt><dd>"+esc(cat&&(STAT[cat.OPS_STATUS_CODE]||cat.OPS_STATUS_CODE)||(s.deb?"Non-operational (debris)":null))+"</dd><dt>Launched</dt><dd>"+esc(cat&&cat.LAUNCH_DATE||nog&&nog.launched&&nog.launched.slice(0,10))+"</dd><dt>Launch site</dt><dd>"+esc(cat&&cat.LAUNCH_SITE)+"</dd><dt>Owner</dt><dd>"+esc(cat&&cat.OWNER||nog&&nog.countries)+"</dd><dt>Type</dt><dd>"+esc(cat&&({PAY:"Payload",RB:"Rocket body",DEB:"Debris"}[cat.OBJECT_TYPE]||cat.OBJECT_TYPE))+"</dd><dt>Intl. designator</dt><dd>"+esc(cat&&cat.OBJECT_ID)+"</dd><dt>Purpose</dt><dd>"+esc(purposeOf(s))+"</dd><dt>Orbit</dt><dd>"+esc(cat?cat.PERIOD+" min · "+cat.INCLINATION+"° inc · "+cat.PERIGEE+"–"+cat.APOGEE+" km":null)+"</dd></dl>"+(L.length?"<div style='margin-top:8px'>"+L.join("")+"</div>":"")+"<small>Catalog: CelesTrak SATCAT"+(nog?" + SatNOGS DB":"")+". 3D model is a generic stand-in.</small>"}
async function verify(s){const out=[],now=new Date(),me=ecfOf(s.rec,now),J=[
  fetchT("https://tle.ivanstanojevic.me/api/tle/"+s.id).then(r=>r.json()).then(j=>({name:"TLE API (ivanstanojevic.me)",rec:satellite.twoline2satrec(j.line1,j.line2),ep:epochOf(j.line1)})),
  fetchT("https://db.satnogs.org/api/tle/?format=json&norad_cat_id="+s.id).then(r=>r.json()).then(j=>({name:"SatNOGS DB",rec:satellite.twoline2satrec(j[0].tle1,j[0].tle2),ep:epochOf(j[0].tle1)}))];
  if(s.id==25544)J.push(fetchT("https://api.wheretheiss.at/v1/satellites/25544").then(r=>r.json()).then(j=>({name:"wheretheiss.at (live ISS feed)",ecf:satellite.geodeticToEcf({latitude:j.latitude*D2R,longitude:j.longitude*D2R,height:j.altitude}),ep:j.timestamp*1000})));
  for(const r of await Promise.allSettled(J)){if(r.status!="fulfilled")continue;const v=r.value,e=v.ecf||ecfOf(v.rec,now);if(e&&me)out.push({name:v.name,km:dist(me,e),ep:v.ep})}return out}
function renderVer(s,v){const ok=v.filter(x=>x.km<10).length,h=!v.length?"<span class='warn'>No second source reachable — position is from CelesTrak only.</span>":ok==v.length?"<span class='ok'>✔ Verified: "+(ok+1)+" sources agree (within 10 km)</span>":"<span class='warn'>⚠ "+ok+" of "+v.length+" other sources agree (within 10 km)</span>";
  $("ver").innerHTML="<h3>Data verification</h3><div class='v'>"+h+"</div><div class='v'><b>Primary:</b> CelesTrak TLE, epoch "+ago(epochOf(s.l1))+" old, SGP4</div>"+v.map(x=>"<div class='v'>"+esc(x.name)+": <span class='"+(x.km<10?"ok":x.km<50?"warn":"bad")+"'>Δ "+x.km.toFixed(1)+" km</span> <small>(data "+ago(x.ep)+" old)</small></div>").join("")+"<small>TLE sources mostly republish the same US tracking data; only the ISS has an independent live feed.</small>"}

/* ---------- search: keywords list results, NORAD IDs jump straight there ---------- */
const res=$("res");
function showResults(v){const items=[];
  B.forEach((b,i)=>b[0].toUpperCase().includes(v)&&items.push({t:b[0],s:"Planet",f:()=>{setFocus(i);planetPanel(i)}}));
  if("SUN".includes(v))items.push({t:"Sun",s:"Star",f:()=>{setFocus(-2);showInfo("Sun","Star","<dl><dt>Radius</dt><dd>695,700 km</dd><dt>Type</dt><dd>G2V star</dd></dl>")}});
  M.forEach(m=>m[0].toUpperCase().includes(v)&&items.push({t:m[0],s:"Moon of "+B[m[1]][0],f:()=>{if(focus!=m[1])setFocus(m[1]);selectMoon(getLocal(m[1]).moons.findIndex(o=>o.d==m))}}));
  SC.forEach((s,i)=>s[1].toUpperCase().includes(v)&&items.push({t:s[1],s:"Spacecraft · "+s[2],f:()=>{setFocus(s[5]<0?-1:s[5]);selectSC(i)}}));
  for(let i=0;i<sats.length&&items.length<300;i++)if(sats[i].name.toUpperCase().includes(v)){const s=sats[i];items.push({t:s.name,s:"NORAD "+s.id+(s.deb?" · debris":""),f:()=>{if(focus!=2)setFocus(2);select(i)}})}
  res.textContent="";
  if(!items.length){res.innerHTML="<button disabled>No matches in loaded data</button>"}
  items.forEach(it=>{const b=document.createElement("button"),s=document.createElement("small");b.textContent=it.t;s.textContent=it.s;b.append(s);b.onclick=()=>{res.style.display="none";it.f()};res.append(b)});
  if(curKey!="everything"){const b=document.createElement("button");b.textContent="Press Enter to search the whole catalog";b.style.color="var(--sel)";b.onclick=()=>doSearch(true);res.append(b)}
  res.style.display="block"}
async function goNorad(id){let i=sats.findIndex(s=>s.id==id);
  if(i<0){try{parseTLE(await(await fetchT(CT+"NORAD/elements/gp.php?CATNR="+id+"&FORMAT=tle")).text(),"single");rebuild();i=sats.findIndex(s=>s.id==id)}catch(e){}}
  if(i<0){$("stat").textContent="NORAD "+id+" not found";return}if(focus!=2)setFocus(2);select(i)}
async function doSearch(enter){const v=$("q").value.trim().toUpperCase();
  if(/^\d{1,6}$/.test(v)){res.style.display="none";if(enter)await goNorad(+v);return}
  if(v.length<2){res.style.display="none";return}
  if(enter&&curKey!="everything"){res.innerHTML="<button disabled>Loading full catalog…</button>";res.style.display="block";await loadKeys("everything")}
  showResults(v)}
$("q").addEventListener("input",()=>doSearch(false));$("q").addEventListener("keydown",e=>{if(e.key=="Enter")doSearch(true);if(e.key=="Escape")res.style.display="none"});

/* ---------- UI wiring ---------- */
$("go").innerHTML='<option value="-1">Solar System</option><option value="-2">Sun</option>'+B.map((b,i)=>"<option value='"+i+"'>"+b[0]+"</option>").join("");$("go").value=2;
$("go").onchange=e=>{const f=+e.target.value;setFocus(f);if(f>=0)planetPanel(f)};
$("grp").onchange=e=>loadKeys(e.target.value);
$("rot").onclick=()=>{autoRot=!autoRot;$("rot").textContent="Auto-rotate: "+(autoRot?"on":"off")};

/* ---------- loop ---------- */
const satV=new THREE.Vector3(),velV=new THREE.Vector3(),upV=new THREE.Vector3(),xV=new THREE.Vector3(),sv=new THREE.Vector3(),mat=new THREE.Matrix4(),ZERO=new THREE.Vector3(),pp=[];
let last=0,liveT=0;
function frame(t){requestAnimationFrame(frame);const dt=Math.min(.1,(t-last)/1000||.016);last=t;
  const now=new Date(),ms=+now,days=ms/864e5-10957.5,T=days/36525,sun=sunInfo(ms),gm=satellite.gstime(now);let have=false;
  for(let i=0;i<8;i++){const p=pp[i]=kep(B[i][4],T);if(solar.visible){sm[i].position.set(p[0]*S,p[2]*S,-p[1]*S);sm[i].rotation.y=ms/36e5/B[i][3]*6.2832;sm[i].material.uniforms.sun.value.copy(sm[i].position).normalize().negate()}}
  if(!solar.visible){const g=getLocal(focus);
    if(focus==2){sv.set(sun.x,sun.z,-sun.y);g.body.rotation.y=gm}
    else{const p=pp[focus];sv.set(-p[0],-p[2],p[1]).normalize();g.body.rotation.y=ms/36e5/B[focus][3]*6.2832}
    dirLight.position.copy(sv).multiplyScalar(10);atmos.forEach(q=>q.material.uniforms.sun.value.copy(sv));g.body.material.uniforms.sun.value.copy(sv);sunGlow.position.copy(cam.position).addScaledVector(sv,18000);sunCore.position.copy(sunGlow.position);const a=g.mp.geometry.attributes.position;
    g.moons.forEach((o,k)=>{moonVec(o.d,days,o.mesh.position);o.w.copy(o.mesh.position).applyQuaternion(g.tilt.quaternion);if(o.mesh.material.uniforms)o.mesh.material.uniforms.sun.value.copy(sv);a.setXYZ(k,o.mesh.position.x,o.mesh.position.y,o.mesh.position.z)});a.needsUpdate=true;
    if(selM>=0){satV.copy(g.moons[selM].w);have=true}
    if(focus==2&&sats.length)stepSats(3)}
  updSC(ms);
  if(selS>=0){const i=selS,s=SC[i],d=scd[s[0]];satV.copy(scW[i]);model.position.copy(satV);model.visible=true;have=true;
    if(t-liveT>500){liveT=t;let v="—";if(d&&d.p.length>2){const f=Math.max(0,Math.min(d.p.length-2,((ms-d.t)/d.d)|0)),a=d.p[f],b=d.p[f+1];v=(Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2])/60).toFixed(2)+" km/s"}
      $("live").innerHTML="<dl><dt>"+(s[5]<0?"From Sun":"From "+B[s[5]][0]+" centre")+"</dt><dd>"+(s[5]<0?(scW[i].length()/S).toFixed(3)+" AU":Math.round(scW[i].length()*B[s[5]][1]).toLocaleString()+" km")+"</dd><dt>Speed</dt><dd>"+v+" (relative)</dd></dl>"}}
  if(sel>=0&&focus==2){const s=sats[sel],r=satellite.propagate(s.rec,now);
    if(r.position){satV.set(r.position.x/R,r.position.z/R,-r.position.y/R);velV.set(r.velocity.x,r.velocity.z,-r.velocity.y).normalize();
      upV.copy(satV).normalize();velV.addScaledVector(upV,-velV.dot(upV)).normalize();xV.crossVectors(upV,velV);
      mat.makeBasis(xV,upV,velV);model.quaternion.setFromRotationMatrix(mat);model.position.copy(satV);marker.position.copy(satV);
      model.visible=view.dist<.5;marker.visible=!model.visible;have=true;
      if(t-liveT>500){liveT=t;const g=satellite.eciToGeodetic(r.position,gm),v=r.velocity,p=r.position,d=p.x*sun.x+p.y*sun.y+p.z*sun.z,sh=d<0&&Math.sqrt(p.x*p.x+p.y*p.y+p.z*p.z-d*d)<R;
        $("live").innerHTML="<dl><dt>Position</dt><dd>"+fmtLL(satellite.degreesLat(g.latitude),satellite.degreesLong(g.longitude))+"</dd><dt>Altitude</dt><dd>"+g.height.toFixed(0)+" km</dd><dt>Speed</dt><dd>"+Math.hypot(v.x,v.y,v.z).toFixed(2)+" km/s</dd><dt>Sunlight</dt><dd>"+(sh?"In Earth's shadow":"In sunlight")+"</dd><dt>Location source</dt><dd>CelesTrak TLE + SGP4 (live)</dd></dl>"}}
    else $("live").innerHTML="<span class='bad'>Orbit data has expired for this object.</span>"}
  if(t-liveT>1000&&sel<0){liveT=t;$("sun").textContent="Sun overhead: "+fmtLL(sun.lat,sun.lon)}
  if(autoRot&&!autoPause&&!have)view.az+=dt*.05;
  view.t.lerp(follow&&have?satV:ZERO,Math.min(1,dt*(follow?6:4)));view.dist+=(view.goal-view.dist)*Math.min(1,dt*4);
  const nd=Math.max(.0005,view.dist*.002);if(Math.abs(cam.near-nd)>nd*.1){cam.near=nd;cam.updateProjectionMatrix()}
  cam.position.set(Math.sin(view.az)*Math.cos(view.el)*view.dist,Math.sin(view.el)*view.dist,Math.cos(view.az)*Math.cos(view.el)*view.dist).add(view.t);
  cam.lookAt(view.t);stars.position.copy(cam.position);sky.position.copy(cam.position);updLabels();renderer.render(scene,cam)}
setFocus(2);loadKeys("visual").then(()=>{requestAnimationFrame(frame);loadSC()});
