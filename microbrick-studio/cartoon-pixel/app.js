/* Cartoon Pixel Studio UI — imports remain in browser memory, never upload implicitly. */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const E=window.CartoonPixelEngine;
const state={items:[],current:null,image:null,result:null,activeColor:"#352725",tool:"brush",showGrid:true,history:[],drawing:false,request:0,busy:false};
const images=["image/jpeg","image/png","image/webp"];
const format=n=>Math.round(n).toLocaleString("zh-CN");
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const setStatus=s=>{$("status").textContent=s;};
const error=s=>{$("error").textContent=s||"";};
const isImage=f=>images.includes(f.type)||/\.(png|jpg|jpeg|webp)$/i.test(f.name);
const isJson=f=>f.type==="application/json"||/\.json$/i.test(f.name);
const baseName=()=>((state.current&&state.current.name)||"microbrick").replace(/\.[^.]+$/,"").replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]+/g,"_").slice(0,36);
function reflectDimensions(){
if(!state.image)return;
if($("keepRatio").checked){
let c=clamp(Math.round(+$("cols").value||50),2,180);
$("rows").value=clamp(Math.round(c*state.image.height/state.image.width),2,240);
$("rows").disabled=true;
}else $("rows").disabled=false;
$("ratioInfo").textContent="原图 "+state.image.width+"×"+state.image.height+"；当前 "+$("cols").value+"×"+$("rows").value+"，每格都是正方形。";
}
function reflectPresets(){document.querySelectorAll("[data-cols]").forEach(b=>b.classList.toggle("primary",+$("cols").value===+b.dataset.cols));}
function syncRanges(){$("colorsOut").textContent=$("colors").value+" 色";$("strengthOut").textContent=$("strength").value+"%";}
function setMode(mode){
if(mode==="bold"){$("colors").value=12;$("strength").value=75;$("outline").value="1";$("minRegion").value="4";}
if(mode==="soft"){$("colors").value=18;$("strength").value=35;$("outline").value="0";$("minRegion").value="2";}
syncRanges();
}
function resetPanels(){
["original","cartoon","gridCanvas"].forEach(id=>{$(id).hidden=true;$(id).getContext("2d").clearRect(0,0,$(id).width,$(id).height);});
["originalEmpty","cartoonEmpty","gridEmpty"].forEach(id=>$(id).hidden=false);
state.result=null;state.history=[];$("swatches").replaceChildren();$("stats").textContent="暂无";
$("summary").textContent="尚未生成";$("physical").textContent="—";$("sizeInfo").textContent="等待导入";
["savePng","saveCsv","saveJson","undo"].forEach(id=>$(id).disabled=true);
}
function filesDisplay(){
const root=$("fileList");root.replaceChildren();
state.items.forEach((item,i)=>{
const b=document.createElement("button");
b.className="file"+(item===state.current?" active":"");
b.title=item.name;b.textContent=(i+1)+". "+item.name;b.onclick=()=>selectItem(item);
root.append(b);
});
}
function addFiles(list){
let added=0;
for(let f of list){
if(!(isImage(f)||isJson(f)))continue;
if(f.size>25*1024*1024){error(f.name+" 超过 25MB，已跳过。");continue;}
if(state.items.some(t=>t.name===f.name&&t.size===f.size&&t.lastModified===f.lastModified))continue;
state.items.push(f);added++;
}
filesDisplay();
if(added&&(!state.current||state.items.length===added))selectItem(state.items[state.items.length-added]);
else if(!added)error("未找到可导入的图片或 JSON 文件。");
}
async function bitmap(file){
if("createImageBitmap" in window)return await createImageBitmap(file,{imageOrientation:"from-image"});
const url=URL.createObjectURL(file);
try{let im=new Image();im.src=url;await im.decode();return im;}finally{URL.revokeObjectURL(url);}
}
async function selectItem(file){
let id=++state.request;state.current=file;filesDisplay();error("");$("run").disabled=true;
if(state.image&&typeof state.image.close==="function")state.image.close();
state.image=null;resetPanels();setStatus("正在读取："+file.name);
try{
if(isJson(file)){await loadProject(file,id);return;}
const im=await bitmap(file);if(id!==state.request){if(im.close)im.close();return;}
state.image={bitmap:im,width:im.width||im.naturalWidth,height:im.height||im.naturalHeight,close:()=>{if(im.close)im.close();}};
if(!state.image.width||!state.image.height)throw Error("图片尺寸无法识别");
reflectDimensions();drawOriginal();$("run").disabled=false;
setStatus("已导入："+file.name+"，正在卡通化与逐格填色…");
await run();
}catch(e){if(id===state.request){error("打开文件失败："+e.message);setStatus("请换一张照片重试。");}}
}
function drawOriginal(){
let im=state.image;if(!im)return;
let c=$("original"),w=Math.min(450,im.width),h=Math.round(w*im.height/im.width);
if(h>640){h=640;w=Math.round(h*im.width/im.height);}
c.width=Math.max(1,w);c.height=Math.max(1,h);
const ctx=c.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);ctx.drawImage(im.bitmap,0,0,w,h);
c.hidden=false;$("originalEmpty").hidden=true;
}
function prepareWork(){
const cols=clamp(Math.round(+$("cols").value||50),2,180);
const rows=clamp(Math.round(+$("rows").value||50),2,240);
let w=Math.max(200,Math.min(385,Math.round(cols*5.7))),h=Math.max(1,Math.round(w*rows/cols));
if(h>570){w=Math.max(1,Math.round(w*570/h));h=570;}
const c=document.createElement("canvas");c.width=w;c.height=h;
const g=c.getContext("2d",{willReadFrequently:true});g.fillStyle="#fff";g.fillRect(0,0,w,h);
let iw=state.image.width,ih=state.image.height;
let fit=$("fit").value;
let scale=fit==="cover"?Math.max(w/iw,h/ih):Math.min(w/iw,h/ih);
let dw=iw*scale,dh=ih*scale;
g.imageSmoothingEnabled=true;g.imageSmoothingQuality="high";
g.drawImage(state.image.bitmap,(w-dw)/2,(h-dh)/2,dw,dh);
return g.getImageData(0,0,w,h);
}
async function run(){
if(!state.image||state.busy)return;
const id=state.request;
state.busy=true;$("run").disabled=true;error("");
setStatus("正在处理卡通分区、颜色合并及方格填色，请稍候…");
await new Promise(resolve=>setTimeout(resolve,35));
try{
const cols=clamp(Math.round(+$("cols").value||50),2,180);
const rows=clamp(Math.round(+$("rows").value||50),2,240);
$("cols").value=cols;$("rows").value=rows;
const data=prepareWork();
const result=E.transform(data,{cols,rows,colors:+$("colors").value,strength:+$("strength").value,minRegion:+$("minRegion").value,outline:+$("outline").value});
if(state.request!==id)return;
state.result=result;state.activeColor=result.palette[0];state.history=[];
showCartoon(result.cartoon);renderGrid();renderPalette();renderStats();
["savePng","saveCsv","saveJson"].forEach(n=>$(n).disabled=false);
$("undo").disabled=true;
setStatus("完成："+baseName()+" · "+cols+"×"+rows+" 格 · "+result.colorsUsed+" 种颜色（可继续修正）");
}catch(ex){console.error(ex);error("生成失败："+ex.message);setStatus("尝试减少格数或换一张图片。");}
finally{state.busy=false;$("run").disabled=!state.image;}
}
function showCartoon(info){
let c=$("cartoon");c.width=info.width;c.height=info.height;
let ctx=c.getContext("2d");ctx.putImageData(new ImageData(info.data,info.width,info.height),0,0);
c.hidden=false;$("cartoonEmpty").hidden=true;
}
function paintCanvas(canvas,withGrid=true,cell=17){
const r=state.result;if(!r)return;
const u=cell,w=r.cols,h=r.rows;canvas.width=w*u;canvas.height=h*u;
const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){let c=r.pixels[y*w+x];if(c){ctx.fillStyle=c;ctx.fillRect(x*u,y*u,u,u);}}
if(withGrid){
ctx.strokeStyle="rgba(45,58,51,.30)";ctx.lineWidth=1;ctx.beginPath();
for(let x=0;x<=w;x++){ctx.moveTo(x*u+.5,0);ctx.lineTo(x*u+.5,h*u);}
for(let y=0;y<=h;y++){ctx.moveTo(0,y*u+.5);ctx.lineTo(w*u,y*u+.5);}ctx.stroke();
}
}
function renderGrid(){
if(!state.result)return;
const c=$("gridCanvas");paintCanvas(c,state.showGrid,17);c.hidden=false;$("gridEmpty").hidden=true;
const r=state.result;$("sizeInfo").textContent=r.cols+" × "+r.rows+" 方格 · "+r.colorsUsed+" 色";
$("summary").textContent=r.cols*r.rows+" 个方格 / "+r.colorsUsed+" 色";
const b=clamp(+$("brick").value||8,1,30);
$("physical").textContent=(r.cols*b/10).toFixed(1)+" × "+(r.rows*b/10).toFixed(1)+" cm";
}
function renderPalette(){
const root=$("swatches");root.replaceChildren();if(!state.result)return;
const palette=Array.from(new Set([...state.result.palette,...state.result.pixels.filter(Boolean)]));
palette.forEach(color=>{
let b=document.createElement("button");b.type="button";b.className="swatch"+(state.activeColor===color?" active":"");
b.style.background=color;b.title=color;b.setAttribute("aria-label","选择颜色 "+color);
b.onclick=()=>{state.activeColor=color;state.tool="brush";showTools();renderPalette();};
root.append(b);
});
}
function renderStats(){
const r=state.result;if(!r)return;
let counts=new Map();r.pixels.forEach(c=>{if(c)counts.set(c,(counts.get(c)||0)+1);});
r.colorsUsed=counts.size;
let root=$("stats");root.replaceChildren();
[...counts.entries()].sort((a,b)=>b[1]-a[1]).forEach(([color,n])=>{
let b=document.createElement("span");b.className="chip";
let dot=document.createElement("span");dot.className="dot";dot.style.background=color;
b.append(dot,document.createTextNode(color+" × "+n));root.append(b);
});
if(!counts.size)root.textContent="暂无填色格子";
$("sizeInfo").textContent=r.cols+"×"+r.rows+" 格 · "+counts.size+" 色";
$("summary").textContent=r.cols*r.rows+" 格，其中 "+r.pixels.filter(Boolean).length+" 格已填色";
}
function showTools(){
$("brush").classList.toggle("active",state.tool==="brush");
$("eraser").classList.toggle("active",state.tool==="eraser");
$("gridToggle").classList.toggle("active",state.showGrid);
}
function editAt(e){
const c=$("gridCanvas"),r=state.result;if(!r)return;
const b=c.getBoundingClientRect(),x=Math.floor((e.clientX-b.left)*r.cols/b.width),y=Math.floor((e.clientY-b.top)*r.rows/b.height);
if(x<0||y<0||x>=r.cols||y>=r.rows)return;
let i=y*r.cols+x,next=state.tool==="eraser"?null:state.activeColor;
if(r.pixels[i]===next)return;
r.pixels[i]=next;renderGrid();renderStats();
}
function outputFile(name,blob){let url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
async function loadProject(f,id){
let j=JSON.parse(await f.text());
if(j&&j.format==="cartoon-pixel-v1"&&j.grid)j=j.grid;
const w=+(j.cols||0),h=+(j.rows||0);
if(!Number.isInteger(w)||!Number.isInteger(h)||w<2||h<2||w>180||h>240||!Array.isArray(j.pixels)||j.pixels.length!==w*h)throw Error("不支持的工程文件格式");
let px=j.pixels.map(c=>typeof c==="string"&&/^#[0-9a-fA-F]{6}$/.test(c)?c.toUpperCase():null);
if(id!==state.request)return;
state.result={cols:w,rows:h,pixels:px,palette:Array.from(new Set(px.filter(Boolean))),colorsUsed:new Set(px.filter(Boolean)).size,method:"project-import"};
state.activeColor=state.result.palette[0]||"#352725";
$("cols").value=w;$("rows").value=h;$("rows").disabled=false;$("keepRatio").checked=false;
renderGrid();renderPalette();renderStats();
["savePng","saveCsv","saveJson"].forEach(n=>$(n).disabled=false);
let original=$("original");paintCanvas(original,false,8);original.hidden=false;$("originalEmpty").hidden=true;
setStatus("已打开工程："+f.name+"。此文件不包含原始照片，左侧显示方格稿。");
}
function savePng(){
if(!state.result)return;
const canvas=document.createElement("canvas");paintCanvas(canvas,state.showGrid,24);
canvas.toBlob(blob=>{if(blob)outputFile(baseName()+"_"+state.result.cols+"x"+state.result.rows+".png",blob);},"image/png");
}
function saveCsv(){
if(!state.result)return;
let counts=new Map();state.result.pixels.forEach(c=>{if(c)counts.set(c,(counts.get(c)||0)+1);});
let data=["颜色HEX,数量,颗粒尺寸mm",...[...counts.entries()].map(([c,n])=>[c,n,$("brick").value].join(","))];
outputFile(baseName()+"_采购清单.csv",new Blob(["\uFEFF"+data.join("\r\n")],{type:"text/csv;charset=utf-8"}));
}
function saveJson(){
if(!state.result)return;
let {cols,rows,pixels,palette}=state.result;
let payload={format:"cartoon-pixel-v1",cols,rows,pixels,palette,brickSizeMm:clamp(+$("brick").value||8,1,30)};
outputFile(baseName()+"_工程.json",new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}));
}
async function samples(){
const sel=$("projectFiles");sel.replaceChildren(new Option("暂无项目素材",""));
try{
let response=await fetch("./samples/index.json",{cache:"no-store"});
if(!response.ok)throw Error("no manifest");const arr=await response.json();
if(!Array.isArray(arr))throw Error("bad list");
for(let name of arr){
if(typeof name!=="string"||!/^[-.\w\u4e00-\u9fa5 ]+\.(png|jpe?g|webp)$/i.test(name))continue;
sel.append(new Option(name,name));
}
if(sel.options.length>1)sel.options[0].text="请选择项目素材";
}catch(_){}
}
$("inputFiles").addEventListener("change",e=>{addFiles(e.target.files);e.target.value="";});
$("inputFolder").addEventListener("change",e=>{addFiles(e.target.files);e.target.value="";});
$("clearFiles").onclick=()=>{
state.request++;if(state.image&&state.image.close)state.image.close();state.image=null;state.current=null;state.items=[];
filesDisplay();resetPanels();$("run").disabled=true;setStatus("已清空文件。");error("");
};
const dz=$("dropZone");for(let type of ["dragenter","dragover"]){dz.addEventListener(type,e=>{e.preventDefault();dz.style.background="#e0f6e7";});}
for(let type of ["dragleave","drop"]){dz.addEventListener(type,e=>{e.preventDefault();dz.style.background="";});}
dz.addEventListener("drop",e=>{if(e.dataTransfer.files.length)addFiles(e.dataTransfer.files);});
$("projectFiles").addEventListener("change",async e=>{
let name=e.target.value;if(!name)return;
try{let response=await fetch("./samples/"+encodeURIComponent(name));if(!response.ok)throw Error("文件无法读取");
let b=await response.blob();addFiles([new File([b],name,{type:b.type||"image/jpeg",lastModified:Date.now()})]);
let last=state.items.find(f=>f.name===name);if(last)selectItem(last);
}catch(ex){error("项目素材加载失败："+ex.message);}
});
document.querySelectorAll("[data-cols]").forEach(b=>b.onclick=()=>{
$("cols").value=b.dataset.cols;reflectPresets();reflectDimensions();
if(state.image)run();
});
$("cols").addEventListener("change",()=>{reflectDimensions();reflectPresets();if(state.image)run();});
$("rows").addEventListener("change",()=>{if(state.image&&!$("keepRatio").checked)run();});
$("keepRatio").addEventListener("change",()=>{reflectDimensions();if(state.image)run();});
$("mode").addEventListener("change",e=>{setMode(e.target.value);if(state.image)run();});
for(let id of ["colors","strength"]){
$(id).addEventListener("input",()=>{$("mode").value="custom";syncRanges();});
$(id).addEventListener("change",()=>{if(state.image)run();});
}
for(let id of ["outline","minRegion","fit"])$(id).addEventListener("change",()=>{if(id!=="fit")$("mode").value="custom";if(state.image)run();});
$("run").onclick=run;$("brick").addEventListener("input",renderGrid);
$("brush").onclick=()=>{state.tool="brush";showTools();};
$("eraser").onclick=()=>{state.tool="eraser";showTools();};
$("gridToggle").onclick=()=>{state.showGrid=!state.showGrid;showTools();renderGrid();};
$("undo").onclick=()=>{
if(!state.history.length||!state.result)return;
state.result.pixels=state.history.pop();$("undo").disabled=state.history.length===0;renderGrid();renderStats();renderPalette();
};
const cv=$("gridCanvas");
cv.addEventListener("pointerdown",e=>{
if(!state.result)return;state.drawing=true;cv.setPointerCapture(e.pointerId);
state.history.push(state.result.pixels.slice());if(state.history.length>15)state.history.shift();
$("undo").disabled=false;editAt(e);
});
cv.addEventListener("pointermove",e=>{if(state.drawing)editAt(e);});
cv.addEventListener("pointerup",()=>{state.drawing=false;});
cv.addEventListener("pointercancel",()=>{state.drawing=false;});
$("savePng").onclick=savePng;$("saveCsv").onclick=saveCsv;$("saveJson").onclick=saveJson;
syncRanges();samples();
})();
