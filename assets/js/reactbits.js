(function(){"use strict";(function(){["WebGL2RenderingContext","WebGLRenderingContext"].forEach(function(e){const u=window[e]&&window[e].prototype;u&&["getProgramInfoLog","getShaderInfoLog"].forEach(function(n){const o=u[n];if(typeof o!="function"||o.__vnNullGuard)return;const r=function(a){return o.call(this,a)||""};r.__vnNullGuard=!0,u[n]=r})})})(),(function(){const u=[];let n=0;const o=()=>performance.now();function r(i){return i==="webgl"||i==="experimental-webgl"||i==="webgl2"}function a(i,c){return c&&typeof c=="object"&&c.__vnHandle?i.cur.has(c.__vnReal)?i.cur.get(c.__vnReal):c.__vnReal:c}function t(i,c){const p={real:c,cur:new Map},S={on:!0,calls:[]};function R(b){return b.indexOf("create")===0||b==="getUniformLocation"}return new Proxy(c,{get(b,E){if(E==="__vnReg")return p;if(E==="__vnRec")return S;const h=p.real;let x;try{x=h[E]}catch{return}return typeof x!="function"?E==="canvas"?i:x:E==="getExtension"?x.bind(h):E==="drawArrays"||E==="drawElements"?function(){S.on&&(S.on=!1,S.calls.push([E,[].slice.call(arguments),null]));try{return x.apply(h,arguments)}catch{return}}:function(){const T=[].slice.call(arguments);let F;try{F=x.apply(h,T.map(_=>a(p,_)))}catch{F=void 0}if(S.on){const _=F&&typeof F=="object"?F:null;if(S.calls.push([E,T,_]),R(E))return{__vnHandle:!0,__vnReg:p,__vnReal:_}}return F}},set(b,E,h){try{p.real[E]=h}catch(x){}return!0}})}function d(i){const c=i.reg;c.cur.clear();for(let p=0;p<i.rec.calls.length;p++){const S=i.rec.calls[p][0],R=i.rec.calls[p][2],b=i.rec.calls[p][1].map(h=>a(c,h));let E;try{E=c.real[S].apply(c.real,b)}catch{continue}R&&c.cur.set(R,E)}}function l(i){const c=i.getBoundingClientRect();return c.bottom>-600&&c.top<innerHeight+600}function v(i){const c=i.canvas.getBoundingClientRect(),p=Math.max(0,Math.min(c.right,innerWidth)-Math.max(c.left,0)),S=Math.max(0,Math.min(c.bottom,innerHeight)-Math.max(c.top,0));return p*S/(innerWidth*innerHeight)}function g(i){const c=i.canvas.getBoundingClientRect();return c.bottom<0?-c.bottom:c.top>innerHeight?c.top-innerHeight:0}function f(i,c){if(!(i.lost||i.pinned||!i.ext||i===c)){i.lost=!0,n--;try{i.ext.loseContext()}catch(p){}}}function m(i){if(n<=10)return;const c=u.filter(function(p){return!p.lost&&!p.pinned&&p!==i});c.sort(function(p,S){return v(p)-v(S)||g(S)-g(p)||p.seen-S.seen});for(let p=0;p<c.length&&n>9;p++){if(v(c[p])>=.1)break;if(n>10||g(c[p])>=innerHeight*.6)f(c[p],i)}}function y(i){if(i.seen=o(),i.lost&&i.ext)try{i.ext.restoreContext()}catch(c){}}const C=new IntersectionObserver(function(i){for(const c of i){const p=c.target.__vnGl;p&&(c.isIntersecting&&v(p)>=.12?y(p):p.seen=o(),m(null))}},{rootMargin:"300px 0px",threshold:[0,.05,.12,.3,.6]});let A=!1;addEventListener("scroll",function(){A||(A=!0,requestAnimationFrame(function(){A=!1,m(null)}))},{passive:!0});const w=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(i,c){if(!r(i))return w.call(this,i,c);const p=w.call(this,i,c);if(!p)return p;if(this.__vnGl){const E=this.__vnGl;return y(E),E.raw?E.wrapper:p}const S=!!(c&&c.__vnRawGL);let R=null;try{R=p.getExtension("WEBGL_lose_context")}catch(E){}const b={canvas:this,raw:S,ext:R,lost:!1,pinned:this.id==="petalWebGL"||this.id==="bloom3d",seen:o()};if(S){const E=t(this,p);b.wrapper=E,b.reg=E.__vnReg,b.rec=E.__vnRec}return this.__vnGl=b,u.push(b),n++,this.addEventListener("webglcontextlost",function(E){E.preventDefault(),b.lost||(b.lost=!0,n--)},!1),this.addEventListener("webglcontextrestored",function(){if(b.lost&&(b.lost=!1,n++),b.raw)try{d(b)}catch(E){}m(b)},!1),C.observe(this),m(b),S?b.wrapper:p},window.__vnGlStats=function(){return{total:u.length,live:n,lost:u.filter(function(i){return i.lost}).length}}})();const z=window.matchMedia("(prefers-reduced-motion: reduce)").matches,q=window.matchMedia("(hover: hover) and (pointer: fine)").matches,Q=(s,e)=>getComputedStyle(document.documentElement).getPropertyValue(s).trim()||e;q&&document.querySelectorAll("[data-glare],[data-tilt]").forEach(s=>{s.classList.add("rb-glare");let e=null;const u=n=>{e||(e=s.getBoundingClientRect());const o=n.clientX-e.left,r=n.clientY-e.top;if(s.style.setProperty("--gx",(o/e.width*100).toFixed(1)+"%"),s.style.setProperty("--gy",(r/e.height*100).toFixed(1)+"%"),s.hasAttribute("data-tilt")&&!z){const a=(r/e.height-.5)*-7,t=(o/e.width-.5)*9;s.style.transform="perspective(900px) rotateX("+a.toFixed(2)+"deg) rotateY("+t.toFixed(2)+"deg) translateZ(0)"}};s.addEventListener("pointermove",u,{passive:!0}),s.addEventListener("pointerenter",()=>{e=s.getBoundingClientRect(),s.classList.add("is-glare-in")},{passive:!0}),s.addEventListener("pointerleave",()=>{e=null,s.classList.remove("is-glare-in"),s.hasAttribute("data-tilt")&&(s.style.transform="")},{passive:!0})}),q&&document.querySelectorAll("[data-spotlight]").forEach(s=>{s.classList.add("rb-spot");let e=null;s.addEventListener("pointermove",u=>{e||(e=s.getBoundingClientRect()),s.style.setProperty("--sx",(u.clientX-e.left).toFixed(0)+"px"),s.style.setProperty("--sy",(u.clientY-e.top).toFixed(0)+"px")},{passive:!0}),s.addEventListener("pointerenter",()=>{e=s.getBoundingClientRect(),s.classList.add("is-spot")},{passive:!0}),s.addEventListener("pointerleave",()=>{e=null,s.classList.remove("is-spot")},{passive:!0})}),document.querySelectorAll("[data-truefocus]").forEach(s=>{const e=s.textContent.trim().split(/\s+/);s.setAttribute("aria-label",s.textContent),s.textContent="";const u=e.map(d=>{const l=document.createElement("span");return l.className="tf-word",l.textContent=d,s.appendChild(l),l});if(z)return;const n=Number(s.dataset.speed)||1.8;let o=0,r=0,a=!1;function t(d){if(!a){o=0;return}r||(r=d);const l=(d-r)/1e3*n*.35,v=(Math.sin(l)*.5+.5)*(u.length-1);u.forEach((g,f)=>{const m=Math.abs(f-v),y=Math.min(9,m*3.2);g.style.filter="blur("+y.toFixed(2)+"px)",g.style.opacity=String(Math.max(.16,1-m*.34)),g.style.transform="scale("+(1-Math.min(.12,m*.05)).toFixed(3)+")"}),o=requestAnimationFrame(t)}new IntersectionObserver(d=>{a=d[0].isIntersecting,a&&!o&&(r=0,o=requestAnimationFrame(t))},{threshold:.2}).observe(s)}),document.querySelectorAll("[data-stagger]").forEach(s=>{const e=Array.from(s.children);if(e.forEach((u,n)=>{u.style.transitionDelay=n*90+"ms"}),z){e.forEach(u=>u.classList.add("is-st-in"));return}new IntersectionObserver(u=>{u[0].isIntersecting?e.forEach(n=>n.classList.add("is-st-in")):e.forEach(n=>n.classList.remove("is-st-in"))},{threshold:.25}).observe(s)}),document.querySelectorAll("img[data-pixel]").forEach(s=>{const e=s.parentElement;if(!e)return;getComputedStyle(e).position==="static"&&(e.style.position="relative");const u=document.createElement("canvas");u.className="px-cover",u.setAttribute("aria-hidden","true"),e.appendChild(u);const n=u.getContext("2d");let o=!1;function r(d){const l=s.clientWidth,v=s.clientHeight;if(!l||!v)return;if(u.width=l,u.height=v,u.style.cssText="position:absolute;inset:0;width:100%;height:100%;pointer-events:none",s.style.visibility="hidden",d<=1){s.style.visibility="";return}const g=Math.max(1,Math.round(l/d)),f=Math.max(1,Math.round(v/d)),m=document.createElement("canvas");m.width=g,m.height=f,m.getContext("2d").drawImage(s,0,0,g,f),n.imageSmoothingEnabled=!1,n.clearRect(0,0,l,v),n.drawImage(m,0,0,g,f,0,0,l,v)}function a(){if(o||z||!s.naturalWidth){r(1);return}o=!0;const d=1500,l=performance.now();(function v(g){const f=Math.min(1,(g-l)/d),m=1-Math.pow(1-f,3),y=Math.max(1,Math.round(64*(1-m))+1);y>1?(r(y),s.style.visibility="hidden"):(s.style.visibility="",n.clearRect(0,0,u.width,u.height)),f<1&&requestAnimationFrame(v)})(l)}const t=()=>{if(!("IntersectionObserver"in window)){a();return}let d=!1;new IntersectionObserver(l=>{l[0].isIntersecting&&!d&&(d=!0,a())},{threshold:.3}).observe(s)};s.complete?t():s.addEventListener("load",t,{once:!0}),s.addEventListener("error",()=>u.remove(),{once:!0})}),document.querySelectorAll("[data-countup]").forEach(s=>{const e=Number(s.dataset.countup)||0,u=s.dataset.suffix||"",n=(String(e).split(".")[1]||"").length,o=a=>{s.textContent=a.toFixed(n)+u};if(z){o(e);return}let r=!1;new IntersectionObserver(a=>{if(!a[0].isIntersecting||r)return;r=!0;const t=1600,d=performance.now();(function l(v){const g=Math.min(1,(v-d)/t);o(e*(1-Math.pow(1-g,4))),g<1&&requestAnimationFrame(l)})(d)},{threshold:.5}).observe(s)}),(function(){const e=Array.from(document.querySelectorAll("[data-bloom-line]"));if(!e.length)return;if(z){e.forEach(o=>o.classList.add("is-on"));return}const u=e[0].closest(".bloom")||document.body;function n(){const o=u.getBoundingClientRect(),r=o.height-innerHeight,a=r>0?Math.min(1,Math.max(0,-o.top/r)):o.top<innerHeight*.6?1:0;e.forEach((t,d)=>{t.classList.toggle("is-on",a>(d+.35)/(e.length+.4))})}addEventListener("scroll",n,{passive:!0}),addEventListener("resize",n,{passive:!0}),n()})(),(function(){const e=window.gsap,u=window.ScrollTrigger;!e||!u||(e.registerPlugin(u),document.querySelectorAll("[data-animated]").forEach(n=>{if(z)return;const o=n.dataset,r=Number(o.distance||100),a=o.direction==="horizontal"?"x":"y",t=o.reverse==="true"?-r:r,d=Number(o.scale||1),l=Number(o.threshold||.1);e.set(n,{[a]:t,scale:d,opacity:Number(o.opacity||0),visibility:"visible"}),e.to(n,{[a]:0,scale:1,opacity:1,duration:Number(o.duration||.8),ease:o.ease||"power3.out",delay:Number(o.delay||0),scrollTrigger:{trigger:n,start:"top "+(1-l)*100+"%",once:!0}})}))})(),(function(){document.querySelectorAll("[data-magnetlines]").forEach(e=>{const u=(e.dataset.magnetlines||"5,9").split(",").map(Number),n=u[0],o=u[1]||u[0];e.style.setProperty("--rows",n),e.style.setProperty("--cols",o);const r=[];for(let f=0;f<n*o;f++){const m=document.createElement("span");m.style.setProperty("--rotate","-10deg"),e.appendChild(m),r.push(m)}if(z||!q)return;let a=null,t=!1,d=0;const l={x:innerWidth/2,y:innerHeight/2},v=()=>{a=r.map(f=>f.getBoundingClientRect())},g=()=>{d=0,a||v();for(let f=0;f<r.length;f++){const m=a[f],y=m.x+m.width/2,C=m.y+m.height/2,A=l.x-y,w=l.y-C,i=Math.sqrt(w*w+A*A)||1,c=Math.acos(A/i)*180/Math.PI*(l.y>C?1:-1);r[f].style.setProperty("--rotate",c+"deg")}};addEventListener("pointermove",f=>{l.x=f.clientX,l.y=f.clientY,t&&!d&&(d=requestAnimationFrame(g))},{passive:!0}),new IntersectionObserver(f=>{t=f[0].isIntersecting,t?(v(),g()):a=null},{rootMargin:"120px"}).observe(e),addEventListener("resize",()=>{a=null,t&&!d&&(d=requestAnimationFrame(g))},{passive:!0})})})(),(function(){if(z||!q)return;const e=document.createElement("div");e.className="crosshair",e.setAttribute("aria-hidden","true"),e.innerHTML='<i class="crosshair__h"></i><i class="crosshair__v"></i>',document.body.appendChild(e);const u=e.children[0],n=e.children[1];let o=-200,r=-200,a=-200,t=-200,d=0,l=0,v=!1;const g=()=>{a+=(o-a)*.15,t+=(r-t)*.15,u.style.transform="translate3d(0,"+t.toFixed(1)+"px,0)",n.style.transform="translate3d("+a.toFixed(1)+"px,0,0)",performance.now()<l||Math.abs(o-a)>.4||Math.abs(r-t)>.4?d=requestAnimationFrame(g):(d=0,v=!1,u.style.opacity="0",n.style.opacity="0")};addEventListener("pointermove",f=>{f.pointerType==="mouse"&&(o=f.clientX,r=f.clientY,l=performance.now()+1300,v||(v=!0,u.style.opacity="",n.style.opacity="",d||(d=requestAnimationFrame(g))))},{passive:!0})})(),(function(){document.querySelectorAll("[data-dotgrid]").forEach(e=>{const u=e.querySelector("canvas");if(!u||!window.Path2D)return;const n=(h,x)=>Number(e.dataset[h])||x,o={dotSize:n("dotSize",16),gap:n("gap",32),proximity:n("proximity",150),speedTrigger:n("speedTrigger",100),shockRadius:n("shockRadius",250),shockStrength:n("shockStrength",5),maxSpeed:5e3,returnDuration:1.5},r=h=>{const x=h.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);return x?[parseInt(x[1],16),parseInt(x[2],16),parseInt(x[3],16)]:[0,0,0]},a=r(e.dataset.baseColor||"#3B2A63"),t=r(e.dataset.activeColor||"#C4B5FD"),d="rgb("+a.join(",")+")",l=u.getContext("2d"),v=new Path2D;v.arc(0,0,o.dotSize/2,0,Math.PI*2);let g=[],f=0,m=0,y=0,C=!1;const A=Math.min(window.devicePixelRatio||1,2),w=()=>{const h=e.getBoundingClientRect();f=h.width,m=h.height,u.width=f*A,u.height=m*A,l.setTransform(A,0,0,A,0,0);const x=o.dotSize+o.gap,T=Math.floor((f+o.gap)/x),F=Math.floor((m+o.gap)/x),_=(f-(x*T-o.gap))/2+o.dotSize/2,L=(m-(x*F-o.gap))/2+o.dotSize/2,M=[];for(let P=0;P<F;P++)for(let B=0;B<T;B++)M.push({cx:_+B*x,cy:L+P*x,xOffset:0,yOffset:0,busy:!1});g=M},i={x:-9999,y:-9999,vx:0,vy:0,t:0,lx:0,ly:0},c=o.proximity*o.proximity,p=()=>{l.clearRect(0,0,f,m);for(const h of g){let x=d;const T=h.cx-i.x,F=h.cy-i.y,_=T*T+F*F;if(_<=c){const L=1-Math.sqrt(_)/o.proximity;x="rgb("+Math.round(a[0]+(t[0]-a[0])*L)+","+Math.round(a[1]+(t[1]-a[1])*L)+","+Math.round(a[2]+(t[2]-a[2])*L)+")"}l.save(),l.translate(h.cx+h.xOffset,h.cy+h.yOffset),l.fillStyle=x,l.fill(v),l.restore()}},S=()=>{p(),y=requestAnimationFrame(S)},R=()=>{const h=C&&!document.hidden;h&&!y?y=requestAnimationFrame(S):!h&&y&&(cancelAnimationFrame(y),y=0)},b=(h,x,T)=>{window.gsap&&(h.busy=!0,gsap.killTweensOf(h),gsap.to(h,{xOffset:x,yOffset:T,duration:.22,ease:"power2.out",onComplete:()=>gsap.to(h,{xOffset:0,yOffset:0,duration:o.returnDuration,ease:"elastic.out(1,0.75)",onComplete:()=>{h.busy=!1}})}))};if(w(),z){p(),e.__dotgrid=()=>({dots:g.length,raf:0});return}let E=0;e.addEventListener("pointermove",h=>{const x=performance.now();if(x-E<50)return;E=x;const T=u.getBoundingClientRect(),F=i.t?x-i.t:16;i.t=x;let _=(h.clientX-i.lx)/F*1e3,L=(h.clientY-i.ly)/F*1e3;i.lx=h.clientX,i.ly=h.clientY;let M=Math.hypot(_,L);if(M>o.maxSpeed){const P=o.maxSpeed/M;_*=P,L*=P,M=o.maxSpeed}i.vx=_,i.vy=L,i.x=h.clientX-T.left,i.y=h.clientY-T.top;for(const P of g){const B=Math.hypot(P.cx-i.x,P.cy-i.y);M>o.speedTrigger&&B<o.proximity&&!P.busy&&b(P,(P.cx-i.x)*.55+_*.012,(P.cy-i.y)*.55+L*.012)}},{passive:!0}),e.addEventListener("pointerleave",()=>{i.x=-9999,i.y=-9999}),e.addEventListener("click",h=>{const x=u.getBoundingClientRect(),T=h.clientX-x.left,F=h.clientY-x.top;for(const _ of g){const L=Math.hypot(_.cx-T,_.cy-F);if(L<o.shockRadius&&!_.busy){const M=Math.max(0,1-L/o.shockRadius);b(_,(_.cx-T)*o.shockStrength*M,(_.cy-F)*o.shockStrength*M)}}}),new IntersectionObserver(h=>{C=h[0].isIntersecting,R()},{rootMargin:"120px"}).observe(e),document.addEventListener("visibilitychange",R),"ResizeObserver"in window?new ResizeObserver(w).observe(e):addEventListener("resize",w,{passive:!0}),e.__dotgrid=()=>({dots:g.length,raf:!!y})})})(),(function(){if(!window.THREE)return;const e=["varying vec2 vUv;","varying vec3 vPosition;","void main() {","  vPosition = position;","  vUv = uv;","  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);","}"].join(`
`),u=["varying vec2 vUv;","varying vec3 vPosition;","uniform float uTime;","uniform vec3  uColor;","uniform float uSpeed;","uniform float uScale;","uniform float uRotation;","uniform float uNoiseIntensity;","uniform float uLightMode;","const float e = 2.71828182845904523536;","float noise(vec2 texCoord) {","  float G = e;","  vec2  r = (G * sin(G * texCoord));","  return fract(r.x * r.y * (1.0 + texCoord.x));","}","vec2 rotateUvs(vec2 uv, float angle) {","  float c = cos(angle);","  float s = sin(angle);","  mat2  rot = mat2(c, -s, s, c);","  return rot * uv;","}","void main() {","  float rnd        = noise(gl_FragCoord.xy);","  vec2  uv         = rotateUvs(vUv * uScale, uRotation);","  vec2  tex        = uv * uScale;","  float tOffset    = uSpeed * uTime;","  tex.y += 0.03 * sin(8.0 * tex.x - tOffset);","  float pattern = 0.6 +","                  0.4 * sin(5.0 * (tex.x + tex.y +","                                   cos(3.0 * tex.x + 5.0 * tex.y) +","                                   0.02 * tOffset) +","                           sin(20.0 * (tex.x + tex.y - 0.1 * tOffset)));","  float grain = rnd / 15.0 * uNoiseIntensity;","  vec3 result = uColor * pattern - vec3(grain);","  if (uLightMode > 0.5) {","    float fold = smoothstep(0.28, 0.9, pattern);","    float specular = smoothstep(0.72, 0.98, pattern);","    vec3 shadowColor = uColor * 0.72;","    vec3 bodyColor = min(uColor * 1.18, vec3(1.0));","    vec3 lightBase = mix(shadowColor, bodyColor, fold);","    lightBase = mix(lightBase, vec3(1.0), specular * 0.92);","    float fineNoise = noise(gl_FragCoord.xy * 0.63 + vec2(17.0, 41.0));","    float grainSignal = (rnd + fineNoise - 1.0);","    float grainStrength = clamp(uNoiseIntensity * 0.038, 0.0, 0.16);","    result = lightBase + grainSignal * grainStrength;","  }","  gl_FragColor = vec4(clamp(result, 0.0, 1.0), 1.0);","}"].join(`
`);document.querySelectorAll("[data-silk]").forEach(n=>{const o=n.querySelector("canvas");if(!o)return;const r=window.THREE;let a;try{a=new r.WebGLRenderer({canvas:o,antialias:!1})}catch{return}a.setPixelRatio(Math.min(window.devicePixelRatio||1,2));const t=new r.Scene,d=new r.OrthographicCamera(-1,1,1,-1,0,1),l=(n.dataset.color||"#A78BFA").replace("#",""),v={uSpeed:{value:Number(n.dataset.speed)||5},uScale:{value:Number(n.dataset.scale)||1},uNoiseIntensity:{value:Number(n.dataset.noise)||1.5},uColor:{value:new r.Color(parseInt(l.slice(0,2),16)/255,parseInt(l.slice(2,4),16)/255,parseInt(l.slice(4,6),16)/255)},uRotation:{value:Number(n.dataset.rotation)||0},uLightMode:{value:document.documentElement.getAttribute("data-theme")==="light"?1:0},uTime:{value:0}},g=new r.ShaderMaterial({uniforms:v,vertexShader:e,fragmentShader:u});t.add(new r.Mesh(new r.PlaneGeometry(2,2),g));const f=()=>{const i=n.getBoundingClientRect();a.setSize(i.width,i.height,!1)};f();let m=0,y=!1,C=0;const A=i=>{const c=C?Math.min((i-C)/1e3,.05):.016;C=i,v.uTime.value+=.1*c,a.render(t,d),m=requestAnimationFrame(A)},w=()=>{const i=y&&!document.hidden;i&&!m?(C=0,m=requestAnimationFrame(A)):!i&&m&&(cancelAnimationFrame(m),m=0)};if("ResizeObserver"in window?new ResizeObserver(f).observe(n):addEventListener("resize",f,{passive:!0}),z){v.uTime.value=6,a.render(t,d),n.__silk=()=>({running:!1,t:v.uTime.value});return}new IntersectionObserver(i=>{y=i[0].isIntersecting,w()},{rootMargin:"120px"}).observe(n),document.addEventListener("visibilitychange",w),n.__silk=()=>({running:!!m,t:v.uTime.value})})})(),(()=>{const s=document.querySelectorAll("[data-floatinglines]");if(!s.length||typeof window.THREE=="undefined")return;const e=window.THREE,u=matchMedia("(prefers-reduced-motion: reduce)").matches,n="void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",o=["precision highp float;","uniform float iTime;","uniform vec3  iResolution;","uniform float animationSpeed;","uniform bool enableTop;","uniform bool enableMiddle;","uniform bool enableBottom;","uniform int topLineCount;","uniform int middleLineCount;","uniform int bottomLineCount;","uniform float topLineDistance;","uniform float middleLineDistance;","uniform float bottomLineDistance;","uniform vec3 topWavePosition;","uniform vec3 middleWavePosition;","uniform vec3 bottomWavePosition;","uniform vec2 iMouse;","uniform bool interactive;","uniform float bendRadius;","uniform float bendStrength;","uniform float bendInfluence;","uniform bool parallax;","uniform float parallaxStrength;","uniform vec2 parallaxOffset;","uniform vec3 lineGradient[8];","uniform int lineGradientCount;","uniform vec3 backgroundColor;","uniform bool lightMode;","const vec3 BLACK = vec3(0.0);","const vec3 PINK  = vec3(233.0, 71.0, 245.0) / 255.0;","const vec3 BLUE  = vec3(47.0,  75.0, 162.0) / 255.0;","mat2 rotate(float r) { return mat2(cos(r), sin(r), -sin(r), cos(r)); }","vec3 background_color(vec2 uv) {","  vec3 col = vec3(0.0);","  float y = sin(uv.x - 0.2) * 0.3 - 0.1;","  float m = uv.y - y;","  col += mix(BLUE, BLACK, smoothstep(0.0, 1.0, abs(m)));","  col += mix(PINK, BLACK, smoothstep(0.0, 1.0, abs(m - 0.8)));","  return col * 0.5;","}","vec3 getLineColor(float t, vec3 baseColor) {","  if (lineGradientCount <= 0) { return baseColor; }","  vec3 gradientColor;","  if (lineGradientCount == 1) { gradientColor = lineGradient[0]; }","  else {","    float clampedT = clamp(t, 0.0, 0.9999);","    float scaled = clampedT * float(lineGradientCount - 1);","    int idx = int(floor(scaled));","    float f = fract(scaled);","    int idx2 = min(idx + 1, lineGradientCount - 1);","    vec3 c1 = lineGradient[idx];","    vec3 c2 = lineGradient[idx2];","    gradientColor = mix(c1, c2, f);","  }","  return gradientColor * 0.5;","}","float wave(vec2 uv, float offset, vec2 screenUv, vec2 mouseUv, bool shouldBend) {","  float time = iTime * animationSpeed;","  float x_offset   = offset;","  float x_movement = time * 0.1;","  float amp        = sin(offset + time * 0.2) * 0.3;","  float y          = sin(uv.x + x_offset + x_movement) * amp;","  if (shouldBend) {","    vec2 d = screenUv - mouseUv;","    float influence = exp(-dot(d, d) * bendRadius);","    float bendOffset = (mouseUv.y - screenUv.y) * influence * bendStrength * bendInfluence;","    y += bendOffset;","  }","  float m = uv.y - y;","  return 0.0175 / max(abs(m) + 0.01, 1e-3) + 0.01;","}","void mainImage(out vec4 fragColor, in vec2 fragCoord) {","  vec2 baseUv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;","  baseUv.y *= -1.0;","  if (parallax) { baseUv += parallaxOffset; }","  vec3 col = vec3(0.0);","  vec3 b = lineGradientCount > 0 ? vec3(0.0) : background_color(baseUv);","  vec2 mouseUv = vec2(0.0);","  if (interactive) { mouseUv = (2.0 * iMouse - iResolution.xy) / iResolution.y; mouseUv.y *= -1.0; }","  if (enableBottom) {","    for (int i = 0; i < bottomLineCount; ++i) {","      float fi = float(i);","      float t = fi / max(float(bottomLineCount - 1), 1.0);","      vec3 lineCol = getLineColor(t, b);","      float angle = bottomWavePosition.z * log(length(baseUv) + 1.0);","      vec2 ruv = baseUv * rotate(angle);","      col += lineCol * wave(ruv + vec2(bottomLineDistance * fi + bottomWavePosition.x, bottomWavePosition.y), 1.5 + 0.2 * fi, baseUv, mouseUv, interactive) * 0.2;","    }","  }","  if (enableMiddle) {","    for (int i = 0; i < middleLineCount; ++i) {","      float fi = float(i);","      float t = fi / max(float(middleLineCount - 1), 1.0);","      vec3 lineCol = getLineColor(t, b);","      float angle = middleWavePosition.z * log(length(baseUv) + 1.0);","      vec2 ruv = baseUv * rotate(angle);","      col += lineCol * wave(ruv + vec2(middleLineDistance * fi + middleWavePosition.x, middleWavePosition.y), 2.0 + 0.15 * fi, baseUv, mouseUv, interactive);","    }","  }","  if (enableTop) {","    for (int i = 0; i < topLineCount; ++i) {","      float fi = float(i);","      float t = fi / max(float(topLineCount - 1), 1.0);","      vec3 lineCol = getLineColor(t, b);","      float angle = topWavePosition.z * log(length(baseUv) + 1.0);","      vec2 ruv = baseUv * rotate(angle);","      ruv.x *= -1.0;","      col += lineCol * wave(ruv + vec2(topLineDistance * fi + topWavePosition.x, topWavePosition.y), 1.0 + 0.2 * fi, baseUv, mouseUv, interactive) * 0.1;","    }","  }","  if (lightMode) {","    vec3 energy = max(col, vec3(0.0));","    float peak = max(energy.r, max(energy.g, energy.b));","    float coverage = smoothstep(0.018, 0.5, peak);","    vec3 chroma = clamp(energy / max(peak, 0.0001), 0.0, 1.0);","    chroma = pow(chroma, vec3(1.35));","    float chromaPeak = max(chroma.r, max(chroma.g, chroma.b));","    chroma /= max(chromaPeak, 0.0001);","    vec3 ink = mix(chroma, clamp(chroma * 0.82, 0.0, 1.0), smoothstep(0.5, 1.0, coverage));","    fragColor = vec4(mix(vec3(1.0), ink, coverage * 0.94), 1.0);","  } else {","    fragColor = vec4(col, 1.0);","  }","}","void main() { vec4 color = vec4(0.0); mainImage(color, gl_FragCoord.xy); gl_FragColor = color; }"].join(`
`),r=a=>new e.Vector3(parseInt(a.slice(1,3),16)/255,parseInt(a.slice(3,5),16)/255,parseInt(a.slice(5,7),16)/255);s.forEach(a=>{const t=a.querySelector("canvas"),d=new e.WebGLRenderer({canvas:t,antialias:!0,alpha:!1});d.setPixelRatio(Math.min(devicePixelRatio||1,2));const l=new e.Scene,v=new e.OrthographicCamera(-1,1,1,-1,0,1);v.position.z=1;const g=(a.dataset.gradient||"#8B5CF6,#E879F9,#C4B5FD").split(",").map(x=>x.trim()).filter(Boolean).slice(0,8),f={iTime:{value:0},iResolution:{value:new e.Vector3(1,1,1)},animationSpeed:{value:Number(a.dataset.speed)||1},enableTop:{value:!0},enableMiddle:{value:!0},enableBottom:{value:!0},topLineCount:{value:6},middleLineCount:{value:6},bottomLineCount:{value:6},topLineDistance:{value:.06},middleLineDistance:{value:.05},bottomLineDistance:{value:.05},topWavePosition:{value:new e.Vector3(10,.5,-.4)},middleWavePosition:{value:new e.Vector3(5,0,.2)},bottomWavePosition:{value:new e.Vector3(2,-.7,.4)},iMouse:{value:new e.Vector2(-1e3,-1e3)},interactive:{value:!0},bendRadius:{value:5},bendStrength:{value:-.5},bendInfluence:{value:0},parallax:{value:!0},parallaxStrength:{value:.2},parallaxOffset:{value:new e.Vector2(0,0)},lineGradient:{value:Array.from({length:8},(x,T)=>r(g[T%g.length]||"#ffffff"))},lineGradientCount:{value:g.length},backgroundColor:{value:new e.Vector3(0,0,0)},lightMode:{value:document.documentElement.getAttribute("data-theme")==="light"}},m=new e.ShaderMaterial({uniforms:f,vertexShader:n,fragmentShader:o});l.add(new e.Mesh(new e.PlaneGeometry(2,2),m));const y=()=>{const x=a.getBoundingClientRect();d.setSize(x.width,x.height,!1),f.iResolution.value.set(d.domElement.width,d.domElement.height,1)};y();const C=new e.Vector2(-1e3,-1e3),A=new e.Vector2(-1e3,-1e3),w=new e.Vector2,i=new e.Vector2;let c=0,p=0;t.addEventListener("pointermove",x=>{const T=t.getBoundingClientRect(),F=x.clientX-T.left,_=x.clientY-T.top,L=d.getPixelRatio();C.set(F*L,(T.height-_)*L),c=1,w.set((F-T.width/2)/T.width*.2,-(_-T.height/2)/T.height*.2)},{passive:!0}),t.addEventListener("pointerleave",()=>{c=0},{passive:!0});const S=new e.Clock;let R=0,b=!1;const E=()=>{f.iTime.value=S.getElapsedTime(),A.lerp(C,.05),f.iMouse.value.copy(A),p+=(c-p)*.05,f.bendInfluence.value=p,i.lerp(w,.05),f.parallaxOffset.value.copy(i),d.render(l,v),R=requestAnimationFrame(E)},h=()=>{const x=b&&!document.hidden;x&&!R?R=requestAnimationFrame(E):!x&&R&&(cancelAnimationFrame(R),R=0)};if("ResizeObserver"in window?new ResizeObserver(y).observe(a):addEventListener("resize",y,{passive:!0}),document.addEventListener("visibilitychange",()=>{f.lightMode.value=document.documentElement.getAttribute("data-theme")==="light",h()}),u){f.iTime.value=6,d.render(l,v),a.__floatinglines=()=>({running:!1});return}new IntersectionObserver(x=>{b=x[0].isIntersecting,h()},{rootMargin:"120px"}).observe(a),a.__floatinglines=()=>({running:!!R,t:f.iTime.value})})})(),(()=>{const s=document.querySelectorAll("[data-aurora]");if(!s.length||typeof window.THREE=="undefined")return;const e=window.THREE,u="void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",n=["precision highp float;","uniform float uTime;","uniform float uAmplitude;","uniform vec3 uColorStops[3];","uniform vec2 uResolution;","uniform float uBlend;","uniform float uLightMode;","out vec4 fragColor;","vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }","float snoise(vec2 v){","  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);","  vec2 i  = floor(v + dot(v, C.yy));","  vec2 x0 = v - i + dot(i, C.xx);","  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);","  vec4 x12 = x0.xyxy + C.xxzz;","  x12.xy -= i1;","  i = mod(i, 289.0);","  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));","  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);","  m = m * m; m = m * m;","  vec3 x = 2.0 * fract(p * C.www) - 1.0;","  vec3 h = abs(x) - 0.5;","  vec3 ox = floor(x + 0.5);","  vec3 a0 = x - ox;","  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);","  vec3 g;","  g.x  = a0.x  * x0.x  + h.x  * x0.y;","  g.yz = a0.yz * x12.xz + h.yz * x12.yw;","  return 130.0 * dot(m, g);","}","struct ColorStop { vec3 color; float position; };","#define COLOR_RAMP(colors, factor, finalColor) { int index = 0; for (int i = 0; i < 2; i++) { ColorStop currentColor = colors[i]; bool isInBetween = currentColor.position <= factor; index = int(mix(float(index), float(i), float(isInBetween))); } ColorStop currentColor = colors[index]; ColorStop nextColor = colors[index + 1]; float range = nextColor.position - currentColor.position; float lerpFactor = (factor - currentColor.position) / range; finalColor = mix(currentColor.color, nextColor.color, lerpFactor); }","void main() {","  vec2 uv = gl_FragCoord.xy / uResolution;","  ColorStop colors[3];","  colors[0] = ColorStop(uColorStops[0], 0.0);","  colors[1] = ColorStop(uColorStops[1], 0.5);","  colors[2] = ColorStop(uColorStops[2], 1.0);","  vec3 rampColor;","  COLOR_RAMP(colors, uv.x, rampColor);","  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;","  height = exp(height);","  height = (uv.y * 2.0 - height + 0.2);","  float intensity = 0.6 * height;","  float midPoint = 0.20;","  float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);","  vec3 auroraColor = intensity * rampColor;","  if (uLightMode > 0.5) {","    float energy = clamp(max(intensity, 0.0), 0.0, 1.0);","    float coverage = clamp(auroraAlpha * (0.55 + 0.45 * energy), 0.0, 0.86);","    vec3 chroma = pow(clamp(rampColor, 0.0, 1.0), vec3(1.2));","    float chromaPeak = max(chroma.r, max(chroma.g, chroma.b));","    chroma /= max(chromaPeak, 0.0001);","    fragColor = vec4(mix(vec3(1.0), chroma, min(coverage * 1.08, 0.94)), 1.0);","  } else {","    fragColor = vec4(auroraColor * auroraAlpha, auroraAlpha);","  }","}"].join(`
`),o=r=>new e.Vector3(parseInt(r.slice(1,3),16)/255,parseInt(r.slice(3,5),16)/255,parseInt(r.slice(5,7),16)/255);s.forEach(r=>{const a=r.querySelector("canvas"),t=(r.dataset.colorStops||"#8B5CF6,#E879F9,#C4B5FD").split(","),d=Number(r.dataset.speed)||1,l=new e.WebGLRenderer({canvas:a,alpha:!0,antialias:!0});l.setPixelRatio(Math.min(devicePixelRatio||1,2)),l.setClearColor(0,0);const v=new e.Scene,g=new e.OrthographicCamera(-1,1,1,-1,0,1),f={uTime:{value:0},uAmplitude:{value:Number(r.dataset.amplitude)||1},uColorStops:{value:t.slice(0,3).map(o)},uResolution:{value:new e.Vector2(1,1)},uBlend:{value:r.dataset.blend!=null?Number(r.dataset.blend):.5},uLightMode:{value:document.documentElement.getAttribute("data-theme")==="light"?1:0}},m=new e.ShaderMaterial({uniforms:f,vertexShader:u,fragmentShader:n,transparent:!0,premultipliedAlpha:!0,glslVersion:e.GLSL3});v.add(new e.Mesh(new e.PlaneGeometry(2,2),m));const y=()=>{const c=r.getBoundingClientRect();l.setSize(c.width,c.height,!1),f.uResolution.value.set(c.width,c.height)};y();let C=0,A=!1;const w=c=>{f.uTime.value=c*.001*d,l.render(v,g),C=requestAnimationFrame(w)},i=()=>{const c=A&&!document.hidden;c&&!C?C=requestAnimationFrame(w):!c&&C&&(cancelAnimationFrame(C),C=0)};if("ResizeObserver"in window?new ResizeObserver(y).observe(r):addEventListener("resize",y,{passive:!0}),document.addEventListener("visibilitychange",()=>{f.uLightMode.value=document.documentElement.getAttribute("data-theme")==="light"?1:0,i()}),z){f.uTime.value=6,l.render(v,g),r.__aurora=()=>({running:!1});return}new IntersectionObserver(c=>{A=c[0].isIntersecting,i()},{rootMargin:"120px"}).observe(r),r.__aurora=()=>({running:!!C,t:f.uTime.value})})})(),(()=>{const s=document.querySelectorAll("[data-plasma]");if(!s.length||typeof window.THREE=="undefined")return;const e=window.THREE,u="void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",n=["precision highp float;","uniform vec2 iResolution;","uniform float iTime;","uniform vec3 uCustomColor;","uniform float uUseCustomColor;","uniform float uSpeed;","uniform float uDirection;","uniform float uScale;","uniform float uOpacity;","uniform vec2 uMouse;","uniform float uMouseInteractive;","uniform float uQuality;","uniform float uStepScale;","uniform float uLightMode;","out vec4 fragColor;","void mainImage(out vec4 o, vec2 C) {","  vec2 center = iResolution.xy * 0.5;","  C = (C - center) / uScale + center;","  vec2 mouseOffset = (uMouse - center) * 0.0002;","  C += mouseOffset * length(C - center) * step(0.5, uMouseInteractive);","  float i, d, z, T = iTime * uSpeed * uDirection;","  vec3 O, p, S;","  for (vec2 r = iResolution.xy, Q; ++i < 60.0; O += o.w/d*o.xyz) {","    p = z*normalize(vec3(C-.5*r,r.y));","    p.z -= 4.;","    S = p;","    d = p.y-T;","    p.x += .4*(1.+p.y)*sin(d + p.x*0.1)*cos(.34*d + p.x*0.05);","    Q = p.xz *= mat2(cos(p.y+vec4(0,11,33,0)-T));","    z += d = (abs(sqrt(length(Q*Q)) - .25*(5.+S.y))/3.+8e-4) * uStepScale;","    o = 1.+sin(S.y+p.z*.5+S.z-length(S-p)+vec4(2,1,0,8));","    if (i >= uQuality) break;","  }","  o.xyz = tanh(O/1e4);","}","bool finite1(float x){ return !(isnan(x) || isinf(x)); }","vec3 sanitize(vec3 c){ return vec3(finite1(c.r) ? c.r : 0.0, finite1(c.g) ? c.g : 0.0, finite1(c.b) ? c.b : 0.0); }","void main() {","  vec4 o = vec4(0.0);","  mainImage(o, gl_FragCoord.xy);","  vec3 rgb = sanitize(o.rgb);","  float intensity = (rgb.r + rgb.g + rgb.b) / 3.0;","  vec3 customColor = intensity * uCustomColor;","  vec3 finalColor = mix(rgb, customColor, step(0.5, uUseCustomColor));","  float alpha = length(rgb) * uOpacity;","  if (uLightMode > 0.5) {","    vec3 source = clamp(finalColor, 0.0, 1.0);","    float peak = max(source.r, max(source.g, source.b));","    float floorColor = min(source.r, min(source.g, source.b));","    vec3 chroma = (source - vec3(floorColor)) / max(peak - floorColor, 0.0001);","    vec3 pigment = mix(source / max(peak, 0.0001), chroma, 0.68) * 0.72;","    float energy = clamp(length(rgb) / 1.7320508, 0.0, 1.0);","    float coverage = pow(smoothstep(0.035, 0.72, energy), 0.76) * min(uOpacity, 1.0) * 0.9;","    fragColor = vec4(mix(vec3(1.0), pigment, coverage), 1.0);","  } else {","    fragColor = vec4(finalColor, alpha);","  }","}"].join(`
`),o=r=>new e.Vector3(parseInt(r.slice(1,3),16)/255,parseInt(r.slice(3,5),16)/255,parseInt(r.slice(5,7),16)/255);s.forEach(r=>{const a=r.querySelector("canvas"),t=r.dataset.color||"#E879F9",d=Number(r.dataset.speed)||1,l=r.dataset.direction||"forward",v=Number(r.dataset.renderScale)||.55,g=Number(r.dataset.targetFps)||60,f=Number(r.dataset.iterations)||60,m=r.dataset.mouseInteractive!=="false",y=new e.WebGLRenderer({canvas:a,alpha:!0,antialias:!1});y.setPixelRatio(1),y.setClearColor(0,0);const C=new e.Scene,A=new e.OrthographicCamera(-1,1,1,-1,0,1),w={iTime:{value:0},iResolution:{value:new e.Vector2(1,1)},uCustomColor:{value:o(t)},uUseCustomColor:{value:1},uSpeed:{value:d*.4},uDirection:{value:l==="reverse"?-1:1},uScale:{value:Number(r.dataset.scale)||1},uOpacity:{value:r.dataset.opacity!=null?Number(r.dataset.opacity):1},uMouse:{value:new e.Vector2(0,0)},uMouseInteractive:{value:m?1:0},uQuality:{value:f},uStepScale:{value:60/f},uLightMode:{value:document.documentElement.getAttribute("data-theme")==="light"?1:0}},i=new e.ShaderMaterial({uniforms:w,vertexShader:u,fragmentShader:n,transparent:!0,glslVersion:e.GLSL3});C.add(new e.Mesh(new e.PlaneGeometry(2,2),i));let c=!1;const p=()=>{const M=r.getBoundingClientRect(),P=Math.max(1,Math.floor(M.width*v)),B=Math.max(1,Math.floor(M.height*v));y.setSize(P,B,!1),w.iResolution.value.set(y.domElement.width,y.domElement.height)},S=()=>{c||(c=!0,requestAnimationFrame(()=>{c=!1,p()}))};"ResizeObserver"in window?new ResizeObserver(S).observe(r):addEventListener("resize",S,{passive:!0}),p();let R=null;m&&r.addEventListener("mousemove",M=>{const P=r.getBoundingClientRect();R={x:M.clientX-P.left,y:M.clientY-P.top}},{passive:!0});let b=0,E=!1,h=!1;const x=performance.now(),T=1e3/g;let F=0;const _=M=>{if(b=requestAnimationFrame(_),M-F<T)return;F=M,R&&(w.uMouse.value.set(R.x,R.y),R=null);let P=(M-x)*.001;if(l==="pingpong"){const W=P%10,I=Math.floor(P/10)%2===0,O=W/10,U=O*O*(3-2*O);w.uDirection.value=1,w.iTime.value=I?U*10:(1-U)*10}else w.iTime.value=P;y.render(C,A)},L=()=>{const M=E&&!document.hidden&&!h;M&&!b?(F=0,b=requestAnimationFrame(_)):!M&&b&&(cancelAnimationFrame(b),b=0)};if(a.addEventListener("webglcontextlost",M=>{M.preventDefault(),h=!0,L()}),a.addEventListener("webglcontextrestored",()=>{h=!1,L()}),document.addEventListener("visibilitychange",()=>{w.uLightMode.value=document.documentElement.getAttribute("data-theme")==="light"?1:0,L()}),z){w.iTime.value=0,y.render(C,A),r.__plasma=()=>({running:!1});return}new IntersectionObserver(M=>{E=M[0].isIntersecting,L()},{threshold:0}).observe(r),r.__plasma=()=>({running:!!b,t:w.iTime.value})})})(),(function(){const e=window.THREE;if(!e)return;const u=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,n=`
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform vec2 uFocal;
uniform vec2 uRotation;
uniform float uStarSpeed;
uniform float uDensity;
uniform float uHueShift;
uniform float uSpeed;
uniform vec2 uMouse;
uniform float uGlowIntensity;
uniform float uSaturation;
uniform float uMouseRepulsion;
uniform float uTwinkleIntensity;
uniform float uRotationSpeed;
uniform float uRepulsionStrength;
uniform float uMouseActiveFactor;
uniform float uAutoCenterRepulsion;
uniform float uTransparent;
uniform float uLightMode;

varying vec2 vUv;

#define NUM_LAYER 4.0
#define STAR_COLOR_CUTOFF 0.2
#define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
#define PERIOD 3.0

float Hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float tri(float x) {
  return abs(fract(x) * 2.0 - 1.0);
}

float tris(float x) {
  float t = fract(x);
  return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0));
}

float trisn(float x) {
  float t = fract(x);
  return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0;
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float Star(vec2 uv, float flare) {
  float d = length(uv);
  float m = (0.05 * uGlowIntensity) / d;
  float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * flare * uGlowIntensity;
  uv *= MAT45;
  rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * 0.3 * flare * uGlowIntensity;
  m *= smoothstep(1.0, 0.2, d);
  return m;
}

vec3 StarLayer(vec2 uv) {
  vec3 col = vec3(0.0);

  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 si = id + vec2(float(x), float(y));
      float seed = Hash21(si);
      float size = fract(seed * 345.32);
      float glossLocal = tri(uStarSpeed / (PERIOD * seed + 1.0));
      float flareSize = smoothstep(0.9, 1.0, size) * glossLocal;

      float red = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 1.0)) + STAR_COLOR_CUTOFF;
      float blu = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 3.0)) + STAR_COLOR_CUTOFF;
      float grn = min(red, blu) * seed;
      vec3 base = vec3(red, grn, blu);

      float hue = atan(base.g - base.r, base.b - base.r) / (2.0 * 3.14159) + 0.5;
      hue = fract(hue + uHueShift / 360.0);
      float sat = length(base - vec3(dot(base, vec3(0.299, 0.587, 0.114)))) * uSaturation;
      float val = max(max(base.r, base.g), base.b);
      base = hsv2rgb(vec3(hue, sat, val));

      vec2 pad = vec2(tris(seed * 34.0 + uTime * uSpeed / 10.0), tris(seed * 38.0 + uTime * uSpeed / 30.0)) - 0.5;

      float star = Star(gv - offset - pad, flareSize);
      vec3 color = base;

      float twinkle = trisn(uTime * uSpeed + seed * 6.2831) * 0.5 + 1.0;
      twinkle = mix(1.0, twinkle, uTwinkleIntensity);
      star *= twinkle;

      col += star * size * color;
    }
  }

  return col;
}

void main() {
  vec2 focalPx = uFocal * uResolution.xy;
  vec2 uv = (vUv * uResolution.xy - focalPx) / uResolution.y;

  vec2 mouseNorm = uMouse - vec2(0.5);

  if (uAutoCenterRepulsion > 0.5) {
    vec2 centerUV = vec2(0.0, 0.0);
    float centerDist = length(uv - centerUV);
    vec2 repulsion = normalize(uv - centerUV) * (uAutoCenterRepulsion / (centerDist + 0.1));
    uv += repulsion * 0.05;
  } else if (uMouseRepulsion > 0.5) {
    vec2 mousePosUV = (uMouse * uResolution.xy - focalPx) / uResolution.y;
    float mouseDist = length(uv - mousePosUV);
    vec2 repulsion = normalize(uv - mousePosUV) * (uRepulsionStrength / (mouseDist + 0.1));
    uv += repulsion * 0.05 * uMouseActiveFactor;
  } else {
    vec2 mouseOffset = mouseNorm * 0.1 * uMouseActiveFactor;
    uv += mouseOffset;
  }

  float autoRotAngle = uTime * uRotationSpeed;
  mat2 autoRot = mat2(cos(autoRotAngle), -sin(autoRotAngle), sin(autoRotAngle), cos(autoRotAngle));
  uv = autoRot * uv;

  uv = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * uv;

  vec3 col = vec3(0.0);

  for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYER) {
    float depth = fract(i + uStarSpeed * uSpeed);
    float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
    float fade = depth * smoothstep(1.0, 0.9, depth);
    col += StarLayer(uv * scale + i * 453.32) * fade;
  }

  if (uLightMode > 0.5) {
    float energy = max(max(col.r, col.g), col.b);
    float coverage = clamp(smoothstep(0.0, 0.42, energy) * 0.92, 0.0, 0.92);
    vec3 ink = clamp(col * 0.48, 0.0, 0.82);
    gl_FragColor = vec4(mix(vec3(1.0), ink, coverage), 1.0);
  } else if (uTransparent > 0.5) {
    float alpha = length(col);
    alpha = smoothstep(0.0, 0.3, alpha);
    alpha = min(alpha, 1.0);
    gl_FragColor = vec4(col, alpha);
  } else {
    gl_FragColor = vec4(col, 1.0);
  }
}
`;document.querySelectorAll("[data-galaxy]").forEach(o=>{const r=o.querySelector("canvas");if(!r)return;const a=(S,R)=>{const b=parseFloat(o.getAttribute(S));return Number.isFinite(b)?b:R},t=a("data-star-speed",.5),d=a("data-speed",1),l=new e.WebGLRenderer({canvas:r,alpha:!0,antialias:!1,powerPreference:"high-performance"});l.setClearColor(0,0),l.setPixelRatio(Math.min(window.devicePixelRatio||1,2));const v={uTime:{value:0},uResolution:{value:new e.Vector3(1,1,1)},uFocal:{value:new e.Vector2(.5,.5)},uRotation:{value:new e.Vector2(1,0)},uStarSpeed:{value:0},uDensity:{value:a("data-density",1)},uHueShift:{value:a("data-hue-shift",140)},uSpeed:{value:d},uMouse:{value:new e.Vector2(.5,.5)},uGlowIntensity:{value:a("data-glow",.3)},uSaturation:{value:a("data-saturation",0)},uMouseRepulsion:{value:o.getAttribute("data-repulsion")==="false"?0:1},uTwinkleIntensity:{value:a("data-twinkle",.3)},uRotationSpeed:{value:a("data-rotation-speed",.1)},uRepulsionStrength:{value:a("data-repulsion-strength",2)},uMouseActiveFactor:{value:0},uAutoCenterRepulsion:{value:a("data-auto-center-repulsion",0)},uTransparent:{value:1},uLightMode:{value:0}},g=new e.ShaderMaterial({vertexShader:u,fragmentShader:n,uniforms:v,transparent:!0,depthTest:!1,depthWrite:!1}),f=new e.Scene,m=new e.OrthographicCamera(-1,1,1,-1,0,1),y=new e.Mesh(new e.PlaneGeometry(2,2),g);y.frustumCulled=!1,f.add(y);const C=()=>{l.setPixelRatio(Math.min(window.devicePixelRatio||1,2)*(window.__vnPerf?window.__vnPerf.scale:1));const S=o.getBoundingClientRect(),R=Math.max(1,S.width),b=Math.max(1,S.height);l.setSize(R,b,!1),v.uResolution.value.set(r.width,r.height,r.width/r.height)};C(),new ResizeObserver(C).observe(o),window.__vnPerf&&window.__vnPerf.subscribe(C);const A={x:.5,y:.5,active:0},w={x:.5,y:.5,active:0};o.addEventListener("mousemove",S=>{const R=o.getBoundingClientRect();A.x=(S.clientX-R.left)/R.width,A.y=1-(S.clientY-R.top)/R.height,A.active=1},{passive:!0}),o.addEventListener("mouseleave",()=>{A.active=0});let i=0,c=!1;const p=S=>{if(document.hidden||!c){i=0;return}i=requestAnimationFrame(p);if(window.__vnPerf&&window.__vnPerf._move!==1&&(S&1))return;v.uTime.value=S*.001,v.uStarSpeed.value=S*.001*t/10,w.x+=(A.x-w.x)*.05,w.y+=(A.y-w.y)*.05,w.active+=(A.active-w.active)*.05,v.uMouse.value.set(w.x,w.y),v.uMouseActiveFactor.value=w.active,v.uLightMode.value=document.documentElement.dataset.theme==="light"?1:0,l.render(f,m)};if(z){v.uTime.value=6,v.uStarSpeed.value=.3,v.uLightMode.value=document.documentElement.dataset.theme==="light"?1:0,l.render(f,m),o.__galaxy=()=>({running:!1});return}new IntersectionObserver(S=>{c=S[0].isIntersecting,c&&!i&&(i=requestAnimationFrame(p))},{rootMargin:"120px"}).observe(o),o.__galaxy=()=>({running:!!i,t:v.uTime.value})})})(),window.__vnRB=!0,(function(){const s=window.matchMedia("(prefers-reduced-motion: reduce)");document.querySelectorAll("[data-lightning]").forEach(function(e){const u=function(_,L){const M=parseFloat(e.getAttribute(_));return Number.isFinite(M)?M:L},n=e.getContext("webgl",{alpha:!0,premultipliedAlpha:!1,__vnRawGL:!0});if(!n)return;const o=`attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`,r=`precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uHue;
uniform float uXOffset;
uniform float uSpeed;
uniform float uIntensity;
uniform float uSize;

#define OCTAVE_COUNT 10

vec3 hsv2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z * mix(vec3(1.0), rgb, c.y);
}

float hash11(float p) {
    p = fract(p * .1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

mat2 rotate2d(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat2(c, -s, s, c);
}

float noise(vec2 p) {
    vec2 ip = floor(p);
    vec2 fp = fract(p);
    float a = hash12(ip);
    float b = hash12(ip + vec2(1.0, 0.0));
    float c = hash12(ip + vec2(0.0, 1.0));
    float d = hash12(ip + vec2(1.0, 1.0));

    vec2 t = smoothstep(0.0, 1.0, fp);
    return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < OCTAVE_COUNT; ++i) {
        value += amplitude * noise(p);
        p *= rotate2d(0.45);
        p *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
    vec2 uv = fragCoord / iResolution.xy;
    uv = 2.0 * uv - 1.0;
    uv.x *= iResolution.x / iResolution.y;
    uv.x += uXOffset;

    uv += 2.0 * fbm(uv * uSize + 0.8 * iTime * uSpeed) - 1.0;

    float dist = abs(uv.x);
    vec3 baseColor = hsv2rgb(vec3(uHue / 360.0, 0.7, 0.8));
    vec3 col = baseColor * pow(mix(0.0, 0.07, hash11(iTime * uSpeed)) / dist, 1.0) * uIntensity;
    col = pow(col, vec3(1.0));
    float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
    fragColor = vec4(col, a);
}

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`,a=function(_,L){const M=n.createShader(L);return M?(n.shaderSource(M,_),n.compileShader(M),n.getShaderParameter(M,n.COMPILE_STATUS)?M:(n.deleteShader(M),null)):null},t=a(o,n.VERTEX_SHADER),d=a(r,n.FRAGMENT_SHADER);if(!t||!d)return;const l=n.createProgram();if(n.attachShader(l,t),n.attachShader(l,d),n.linkProgram(l),!n.getProgramParameter(l,n.LINK_STATUS))return;n.useProgram(l);const v=new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),g=n.createBuffer();n.bindBuffer(n.ARRAY_BUFFER,g),n.bufferData(n.ARRAY_BUFFER,v,n.STATIC_DRAW);const f=n.getAttribLocation(l,"aPosition");n.enableVertexAttribArray(f),n.vertexAttribPointer(f,2,n.FLOAT,!1,0,0);const m={iResolution:n.getUniformLocation(l,"iResolution"),iTime:n.getUniformLocation(l,"iTime"),uHue:n.getUniformLocation(l,"uHue"),uXOffset:n.getUniformLocation(l,"uXOffset"),uSpeed:n.getUniformLocation(l,"uSpeed"),uIntensity:n.getUniformLocation(l,"uIntensity"),uSize:n.getUniformLocation(l,"uSize")},y=u("data-hue",268),C=u("data-xoffset",0),A=u("data-speed",.6),w=u("data-intensity",1),i=u("data-size",1),c=function(){const _=Math.max(e.clientWidth,1),L=Math.max(e.clientHeight,1);(e.width!==_||e.height!==L)&&(e.width=_,e.height=L)},p=performance.now(),S=function(){c(),n.viewport(0,0,e.width,e.height),n.uniform2f(m.iResolution,e.width,e.height),n.uniform1f(m.iTime,(performance.now()-p)/1e3),n.uniform1f(m.uHue,y),n.uniform1f(m.uXOffset,C),n.uniform1f(m.uSpeed,A),n.uniform1f(m.uIntensity,w),n.uniform1f(m.uSize,i),n.drawArrays(n.TRIANGLES,0,6)};let R=0,b=!1;const E=function(){if(document.hidden||!b){R=0;return}R=requestAnimationFrame(E),S()},h=function(){!R&&!s.matches&&(R=requestAnimationFrame(E))},x=function(){R&&(cancelAnimationFrame(R),R=0)};new IntersectionObserver(function(_){b=_[0].isIntersecting,b?h():x()},{rootMargin:"120px"}).observe(e),document.addEventListener("visibilitychange",function(){document.hidden?x():b&&h()}),new ResizeObserver(function(){S()}).observe(e),S(),e.__lightning=function(){return{running:!!R}}})})();const $=function(s,e,u,n){let o;try{o=s.getContext("webgl2",{alpha:!!n.alpha,premultipliedAlpha:!!n.premul,antialias:!1,__vnRawGL:!0})}catch(m){return null}if(!o)return null;const r=function(m,y){const C=o.createShader(m);return o.shaderSource(C,y),o.compileShader(C),o.getShaderParameter(C,o.COMPILE_STATUS)?C:(console.warn("[rb-gl2]",o.getShaderInfoLog(C)),null)},a=r(o.VERTEX_SHADER,e),t=r(o.FRAGMENT_SHADER,u);if(!a||!t)return null;const d=o.createProgram();if(o.attachShader(d,a),o.attachShader(d,t),o.linkProgram(d),!o.getProgramParameter(d,o.LINK_STATUS))return console.warn("[rb-gl2]",o.getProgramInfoLog(d)),null;o.useProgram(d);const l=o.createBuffer();o.bindBuffer(o.ARRAY_BUFFER,l),o.bufferData(o.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),o.STATIC_DRAW);const v=o.getAttribLocation(d,"position");o.enableVertexAttribArray(v),o.vertexAttribPointer(v,2,o.FLOAT,!1,0,0);const g={},f=o.getProgramParameter(d,o.ACTIVE_UNIFORMS);for(let m=0;m<f;m++){const y=o.getActiveUniform(d,m);g[y.name]=o.getUniformLocation(d,y.name)}return n.clear&&o.clearColor(n.clear[0],n.clear[1],n.clear[2],n.clear[3]),{gl:o,u:g,resize:function(m,y,C){const A=Math.max(1,Math.floor(m*C)),w=Math.max(1,Math.floor(y*C));return(s.width!==A||s.height!==w)&&(s.width=A,s.height=w),s.style.width="100%",s.style.height="100%",s.style.display="block",o.viewport(0,0,A,w),[A,w]},render:function(){o.clear(o.COLOR_BUFFER_BIT),o.drawArrays(o.TRIANGLES,0,3)}}},H=function(s){const e=(s||"").trim().replace(/^#/,""),u=e.length===3?e.replace(/./g,function(o){return o+o}):e,n=/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(u);return n?[parseInt(n[1],16)/255,parseInt(n[2],16)/255,parseInt(n[3],16)/255]:[1,1,1]};(function(){const s=window.matchMedia("(prefers-reduced-motion: reduce)"),e=`#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`,u=`#version 300 es
precision highp float;
uniform vec2 resolution;
uniform float time;
uniform float waveSpeed;
uniform float waveFrequency;
uniform float waveAmplitude;
uniform vec3 waveColor;
uniform vec3 backgroundColor;
uniform vec2 mousePos;
uniform int enableMouseInteraction;
uniform float mouseRadius;
out vec4 fragColor;

vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

float cnoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0,0.0,1.0,1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0,0.0,1.0,1.0);
  Pi = mod289(Pi);
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = fract(i * (1.0/41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g00,g00), dot(g01,g01), dot(g10,g10), dot(g11,g11)));
  g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fade_xy = fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  return 2.3 * mix(n_x.x, n_x.y, fade_xy.y);
}

const int OCTAVES = 4;
float fbm(vec2 p) {
  float value = 0.0;
  float amp = 1.0;
  float freq = waveFrequency;
  for (int i = 0; i < OCTAVES; i++) {
    value += amp * abs(cnoise(p));
    p *= freq;
    amp *= waveAmplitude;
  }
  return value;
}

float pattern(vec2 p) {
  vec2 p2 = p - time * waveSpeed;
  return fbm(p + fbm(p2));
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  uv -= 0.5;
  uv.x *= resolution.x / resolution.y;
  float f = pattern(uv);
  if (enableMouseInteraction == 1) {
    vec2 mouseNDC = (mousePos / resolution - 0.5) * vec2(1.0, -1.0);
    mouseNDC.x *= resolution.x / resolution.y;
    float dist = length(uv - mouseNDC);
    float effect = 1.0 - smoothstep(0.0, mouseRadius, dist);
    f -= 0.5 * effect;
  }
  vec3 col = mix(backgroundColor, waveColor, clamp(f, 0.0, 1.0));
  fragColor = vec4(col, 1.0);
}
`,n=`#version 300 es
precision highp float;
uniform sampler2D inputBuffer;
uniform vec2 resolution;
uniform float colorNum;
uniform float pixelSize;
out vec4 outputColor;

const float bayerMatrix8x8[64] = float[64](
  0.0/64.0, 48.0/64.0, 12.0/64.0, 60.0/64.0,  3.0/64.0, 51.0/64.0, 15.0/64.0, 63.0/64.0,
  32.0/64.0,16.0/64.0, 44.0/64.0, 28.0/64.0, 35.0/64.0,19.0/64.0, 47.0/64.0, 31.0/64.0,
  8.0/64.0, 56.0/64.0,  4.0/64.0, 52.0/64.0, 11.0/64.0,59.0/64.0,  7.0/64.0, 55.0/64.0,
  40.0/64.0,24.0/64.0, 36.0/64.0, 20.0/64.0, 43.0/64.0,27.0/64.0, 39.0/64.0, 23.0/64.0,
  2.0/64.0, 50.0/64.0, 14.0/64.0, 62.0/64.0,  1.0/64.0,49.0/64.0, 13.0/64.0, 61.0/64.0,
  34.0/64.0,18.0/64.0, 46.0/64.0, 30.0/64.0, 33.0/64.0,17.0/64.0, 45.0/64.0, 29.0/64.0,
  10.0/64.0,58.0/64.0,  6.0/64.0, 54.0/64.0,  9.0/64.0,57.0/64.0,  5.0/64.0, 53.0/64.0,
  42.0/64.0,26.0/64.0, 38.0/64.0, 22.0/64.0, 41.0/64.0,25.0/64.0, 37.0/64.0, 21.0/64.0
);

vec3 dither(vec2 uv, vec3 color) {
  vec2 scaledCoord = floor(uv * resolution / pixelSize);
  int x = int(mod(scaledCoord.x, 8.0));
  int y = int(mod(scaledCoord.y, 8.0));
  float threshold = bayerMatrix8x8[y * 8 + x] - 0.25;
  float step = 1.0 / (colorNum - 1.0);
  color += threshold * step;
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float bias = mix(0.2, 0.0, smoothstep(0.45, 0.8, luminance));
  color = clamp(color - bias, 0.0, 1.0);
  return floor(color * (colorNum - 1.0) + 0.5) / (colorNum - 1.0);
}

void mainImage(in vec4 inputColor, in vec2 uv, out vec4 oCol) {
  vec2 normalizedPixelSize = pixelSize / resolution;
  vec2 uvPixel = normalizedPixelSize * floor(uv / normalizedPixelSize);
  vec4 color = texture(inputBuffer, uvPixel);
  color.rgb = dither(uv, color.rgb);
  oCol = color;
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  mainImage(vec4(1.0), uv, outputColor);
}
`;document.querySelectorAll("[data-dither]").forEach(function(o){const r=function(I,O){const U=parseFloat(o.getAttribute(I));return Number.isFinite(U)?U:O},a=document.createElement("canvas");a.style.width="100%",a.style.height="100%",a.style.display="block",o.appendChild(a);let t;try{t=a.getContext("webgl2",{alpha:!1,antialias:!0,__vnRawGL:!0})}catch(I){t=null}if(!t){a.remove();return}const d=function(I){const O=function(D,k){const V=t.createShader(D);return t.shaderSource(V,k),t.compileShader(V),t.getShaderParameter(V,t.COMPILE_STATUS)?V:(console.warn("[rb-dither]",t.getShaderInfoLog(V)),null)},U=O(t.VERTEX_SHADER,e),G=O(t.FRAGMENT_SHADER,I);if(!U||!G)return null;const N=t.createProgram();if(t.attachShader(N,U),t.attachShader(N,G),t.linkProgram(N),!t.getProgramParameter(N,t.LINK_STATUS))return console.warn("[rb-dither]",t.getProgramInfoLog(N)),null;const K=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,K),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW);const X=t.getAttribLocation(N,"position");t.enableVertexAttribArray(X),t.vertexAttribPointer(X,2,t.FLOAT,!1,0,0);const Y={},j=t.getProgramParameter(N,t.ACTIVE_UNIFORMS);for(let D=0;D<j;D++){const k=t.getActiveUniform(N,D);Y[k.name]=t.getUniformLocation(N,k.name)}return{prog:N,u:Y}},l=d(u),v=d(n);if(!l||!v){a.remove();return}const g=l.u,f=v.u,m=H(o.getAttribute("data-wave-color")||"#B497CF"),y=H(o.getAttribute("data-bg-color")||"#0D0620");t.useProgram(l.prog),t.uniform1f(g.waveSpeed,r("data-wave-speed",.05)),t.uniform1f(g.waveFrequency,r("data-wave-frequency",3)),t.uniform1f(g.waveAmplitude,r("data-wave-amplitude",.3)),t.uniform3f(g.waveColor,m[0],m[1],m[2]),t.uniform3f(g.backgroundColor,y[0],y[1],y[2]),t.uniform1i(g.enableMouseInteraction,1),t.uniform1f(g.mouseRadius,r("data-mouse-radius",1)),t.useProgram(v.prog),t.uniform1f(f.colorNum,r("data-color-num",4)),t.uniform1f(f.pixelSize,r("data-pixel-size",2));const C=t.createTexture();t.bindTexture(t.TEXTURE_2D,C),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);const A=t.createFramebuffer();let w=0,i=0;const c=function(I,O){t.bindTexture(t.TEXTURE_2D,C),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,I,O,0,t.RGBA,t.UNSIGNED_BYTE,null),t.bindFramebuffer(t.FRAMEBUFFER,A),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,C,0),t.bindFramebuffer(t.FRAMEBUFFER,null),w=I,i=O},p=[0,0],S=function(I){const O=a.getBoundingClientRect();p[0]=I.clientX-O.left,p[1]=I.clientY-O.top};a.addEventListener("mousemove",S);let R=0,b=0;const E=function(){t.bindFramebuffer(t.FRAMEBUFFER,A),t.viewport(0,0,w,i),t.useProgram(l.prog),t.uniform2f(g.resolution,w,i),t.uniform2f(g.mousePos,p[0],p[1]),t.drawArrays(t.TRIANGLES,0,3),t.bindFramebuffer(t.FRAMEBUFFER,null),t.viewport(0,0,R,b),t.useProgram(v.prog),t.uniform2f(f.resolution,R,b),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,C),t.uniform1i(f.inputBuffer,0),t.drawArrays(t.TRIANGLES,0,3)},h=function(){const I=o.getBoundingClientRect(),O=Math.max(.5,window.__vnPerf?window.__vnPerf.scale:1),U=Math.max(1,Math.floor(Math.max(I.width,1)*O)),G=Math.max(1,Math.floor(Math.max(I.height,1)*O));(a.width!==U||a.height!==G)&&(a.width=U,a.height=G),R=U,b=G,(U!==w||G!==i)&&c(U,G),E()};new ResizeObserver(h).observe(o),h();window.__vnPerf&&window.__vnPerf.subscribe(h);let T=0,F=!1,_=performance.now(),L=0;const M=function(I){if(document.hidden||!F){T=0;return}T=requestAnimationFrame(M);if(window.__vnPerf&&window.__vnPerf._move!==1&&(I&1))return;L=(I-_)*.001,t.useProgram(l.prog),t.uniform1f(g.time,L),E()},P=function(){!T&&!s.matches&&(_=performance.now()-L*1e3,T=requestAnimationFrame(M))},B=function(){T&&(cancelAnimationFrame(T),T=0)};new IntersectionObserver(function(I){F=I[0].isIntersecting,F?P():B()},{rootMargin:"120px"}).observe(o),document.addEventListener("visibilitychange",function(){document.hidden?B():F&&P()}),s.matches&&(t.useProgram(l.prog),t.uniform1f(g.time,8),E()),o.__dither=function(){return{running:!!T,t:L}}})})()})();
