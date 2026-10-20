/* Cartoon Pixel Studio — local-only deterministic cartoon segmentation and square-cell coloring. */
(function(root){
"use strict";
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function rgbhex(a){return "#"+a.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,"0")).join("").toUpperCase();}
function hexrgb(h){return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];}
function srgb(x){x=x/255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4);}
function lab(r,g,b){
let R=srgb(r),G=srgb(g),B=srgb(b),x=(R*.4124564+G*.3575761+B*.1804375)/.95047,y=(R*.2126729+G*.7151522+B*.072175)/1,z=(R*.0193339+G*.119192+B*.9503041)/1.08883;
let f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116;
let X=f(x),Y=f(y),Z=f(z);return [116*Y-16,500*(X-Y),200*(Y-Z)];
}
function dlab(a,b){let x=a[0]-b[0],y=a[1]-b[1],z=a[2]-b[2];return x*x+y*y+z*z;}
function nearest(v,centers){let idx=0,d=Infinity;for(let i=0;i<centers.length;i++){let nd=dlab(v,centers[i]);if(nd<d){d=nd;idx=i;}}return idx;}
function bilateral(input,w,h,passes){
let source=new Uint8ClampedArray(input);
for(let pass=0;pass<passes;pass++){
let dst=new Uint8ClampedArray(source);
for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
let p=(y*w+x)*4,cr=source[p],cg=source[p+1],cb=source[p+2],tr=cr*3,tg=cg*3,tb=cb*3,total=3;
for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;
let i=((y+dy)*w+x+dx)*4,dd=(cr-source[i])**2+(cg-source[i+1])**2+(cb-source[i+2])**2;
if(dd>12000)continue;
let weight=(dx&&dy?.62:1)*Math.exp(-dd/5400);
tr+=source[i]*weight;tg+=source[i+1]*weight;tb+=source[i+2]*weight;total+=weight;
}
dst[p]=tr/total;dst[p+1]=tg/total;dst[p+2]=tb/total;
}source=dst;
}return source;
}
function enrich(r,g,b,boost){
let avg=(r+g+b)/3,fac=1+boost*.46;
r=avg+(r-avg)*fac;g=avg+(g-avg)*fac;b=avg+(b-avg)*fac;
const contrast=1+boost*.16;
return [clamp((r-128)*contrast+128,0,255),clamp((g-128)*contrast+128,0,255),clamp((b-128)*contrast+128,0,255)];
}
function palette(src,w,h,requested,boost){
let samples=[],step=Math.max(1,Math.floor(Math.sqrt(w*h/7000)));
for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){let i=(y*w+x)*4,rgb=enrich(src[i],src[i+1],src[i+2],boost);samples.push({rgb,lab:lab(...rgb)});}
if(!samples.length)return [{rgb:[255,255,255],lab:lab(255,255,255)}];
const target=clamp(Math.round(requested),4,24);
let luminance=samples.slice().sort((a,b)=>a.lab[0]-b.lab[0]);
let centers=[luminance[Math.floor(samples.length*.06)].lab.slice(),luminance[Math.floor(samples.length*.94)].lab.slice()];
while(centers.length<target){
let max=-1,best=null;
for(let s of samples){
let dd=dlab(s.lab,centers[nearest(s.lab,centers)]),weight=1+Math.min(1.1,Math.hypot(s.lab[1],s.lab[2])/55),v=dd*weight;
if(v>max){max=v;best=s.lab;}
}
if(max<18*18)break;
centers.push(best.slice());
}
for(let t=0;t<10;t++){
let sums=centers.map(()=>[0,0,0,0]);
for(let s of samples){let q=sums[nearest(s.lab,centers)];q[0]+=s.lab[0];q[1]+=s.lab[1];q[2]+=s.lab[2];q[3]++;}
for(let i=0;i<centers.length;i++){let q=sums[i];if(q[3])centers[i]=[q[0]/q[3],q[1]/q[3],q[2]/q[3]];}
}
let merged=[];
for(let i=0;i<centers.length;i++){if(merged.length&&dlab(centers[i],merged[nearest(centers[i],merged)])<14*14)continue;merged.push(centers[i]);}
if(!merged.length)merged.push(centers[0]);
let rgbSums=merged.map(()=>[0,0,0,0]);
for(let s of samples){let p=rgbSums[nearest(s.lab,merged)];p[0]+=s.rgb[0];p[1]+=s.rgb[1];p[2]+=s.rgb[2];p[3]++;}
return merged.map((c,i)=>({lab:c,rgb:rgbSums[i][3]?rgbSums[i].slice(0,3).map(v=>Math.round(v/rgbSums[i][3])):samples[nearest(c,samples.map(s=>s.lab))].rgb}));
}
function majorityFilter(labels,w,h,passes,required){
let src=labels;
for(let t=0;t<passes;t++){
let dst=new Uint8Array(src);
for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
let p=y*w+x,counts={},lead=src[p],score=0;
for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
let q=src[p+dy*w+dx],n=(counts[q]||0)+1;counts[q]=n;
if(n>score){score=n;lead=q;}
}
if(score>=required)dst[p]=lead;
}src=dst;
}return src;
}
function componentClean(src,w,h,minSize,colors){
if(minSize<=1)return src;
let out=new Uint8Array(src),visited=new Uint8Array(src.length),queue=new Int32Array(src.length);
for(let k=0;k<out.length;k++){if(visited[k])continue;let label=out[k],head=0,tail=1,adj=new Map();queue[0]=k;visited[k]=1;
while(head<tail){let p=queue[head++],x=p%w,y=(p/w)|0;
let n=[x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1];
for(let v of n){if(v<0)continue;
if(out[v]===label){if(!visited[v]){visited[v]=1;queue[tail++]=v;}}
else adj.set(out[v],(adj.get(out[v])||0)+1);
}
}
if(tail>=minSize||!adj.size)continue;
const rgb=colors[label]||[128,128,128],importance=Math.max(...rgb)-Math.min(...rgb),dark=(rgb[0]+rgb[1]+rgb[2])/3<75;
if(importance>65||dark&&tail>=2)continue; // protect tiny blue eyes and pink noses
let best=-1,score=-1;
adj.forEach((count,index)=>{let metric=count;if(metric>score){score=metric;best=index;}});
for(let i=0;i<tail;i++)out[queue[i]]=best;
}return out;
}
function outlineCells(labels,w,h,colors,mode){
if(!mode)return labels;
let out=new Uint8Array(labels),labs=colors.map(c=>lab(...c)),darkIndex=colors.length;
const threshold=mode===2?29*29:39*39;
for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
let p=y*w+x,a=labels[p],neighbors=[p-1,p+1,p-w,p+w],high=0,best=0;
for(let ni of neighbors){let b=labels[ni];if(b===a)continue;
let dd=dlab(labs[a],labs[b]);
if(dd>high){high=dd;best=b;}
}
if(high<threshold)continue;
let L=labs[a][0],other=labs[best][0];
if(L+7>=other)continue;
if(Math.hypot(labs[a][1],labs[a][2])>34&&L>35)continue; // do not paint over blue eyes / pink accents
if(mode===1){
let n=0;for(let j of neighbors)if(labels[j]!==a)n++;
if(n<1)continue;
}
out[p]=darkIndex;
}
return out;
}
function transform(imageData,options){
const w=imageData.width,h=imageData.height,cols=clamp(Math.round(options.cols||50),2,180),rows=clamp(Math.round(options.rows||50),2,240),strength=clamp(+options.strength||0,0,100),minRegion=Math.round(options.minRegion??4),edge=+options.outline||0;
if(!w||!h||!imageData.data||imageData.data.length!==w*h*4)throw Error("图像数据格式不正确");
if(cols*rows>40000)throw Error("尺寸过大，请减小格数");
let blurred=bilateral(imageData.data,w,h,strength>=60?3:strength>=25?2:1),boost=strength/100;
let colors=palette(blurred,w,h,options.colors||12,boost),labs=colors.map(c=>c.lab),mapped=new Uint8Array(w*h);
for(let p=0;p<w*h;p++){let i=p*4,rgb=enrich(blurred[i],blurred[i+1],blurred[i+2],boost);mapped[p]=nearest(lab(...rgb),labs);}
mapped=majorityFilter(mapped,w,h,strength>75?2:1,strength>=60?5:7);
let cartoon=new Uint8ClampedArray(w*h*4);
for(let p=0;p<w*h;p++){let c=colors[mapped[p]].rgb,k=p*4;cartoon[k]=c[0];cartoon[k+1]=c[1];cartoon[k+2]=c[2];cartoon[k+3]=255;}
let labels=new Uint8Array(cols*rows),hist=new Int32Array(colors.length);
for(let cy=0;cy<rows;cy++)for(let cx=0;cx<cols;cx++){
let x0=Math.round(cx*w/cols),x1=Math.max(x0+1,Math.round((cx+1)*w/cols)),y0=Math.round(cy*h/rows),y1=Math.max(y0+1,Math.round((cy+1)*h/rows));
hist.fill(0);let max=0,index=0;
for(let py=y0;py<Math.min(h,y1);py++)for(let px=x0;px<Math.min(w,x1);px++){
let labidx=mapped[py*w+px],n=++hist[labidx];if(n>max){max=n;index=labidx;}
}
labels[cy*cols+cx]=index;
}
let salient=labels.slice();
labels=majorityFilter(labels,cols,rows,strength>=65?2:1,strength>=50?5:7);
for(let i=0;i<labels.length;i++){
let c=colors[salient[i]].rgb,contrast=Math.max(...c)-Math.min(...c),lum=(c[0]+c[1]+c[2])/3;
if(contrast>65||lum<67)labels[i]=salient[i]; // protect important facial landmarks
}
labels=componentClean(labels,cols,rows,minRegion,colors.map(c=>c.rgb));
let rgbs=colors.map(c=>c.rgb),pixelLabels=outlineCells(labels,cols,rows,rgbs,edge);
if(edge)rgbs.push([52,39,37]);
let resultPixels=Array.from(pixelLabels,i=>rgbhex(rgbs[i]));
return {cols,rows,pixels:resultPixels,cartoon:{width:w,height:h,data:cartoon},palette:rgbs.map(rgbhex),colorsUsed:new Set(resultPixels).size,outline:edge,method:"cartoon-region-v1"};
}
root.CartoonPixelEngine={transform,hexrgb,rgbhex,lab,componentClean,majorityFilter};
})(typeof window!=="undefined"?window:globalThis);
