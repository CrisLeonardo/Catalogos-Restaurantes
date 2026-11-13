// Exporta el prototipo determinista sin tocar la aplicación ni la demo pública.
// Requiere npm ci en plataforma y un ffmpeg completo: --ffmpeg <ruta>.
// node docs/diseno/promocion-2026-11-12/render.mjs --salida C:/ruta --ffmpeg C:/ruta/ffmpeg.exe
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const here=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(path.resolve(here,'../../../plataforma/package.json'));
const {chromium}=require('playwright');
const sharp=require('sharp');
const args=process.argv.slice(2),opt=(key,fallback)=>{const i=args.indexOf('--'+key);return i<0?fallback:args[i+1];};
const out=path.resolve(opt('salida',path.join(os.homedir(),'Videos/Leogin/2026-11-12')));
const ffmpeg=opt('ffmpeg','ffmpeg'),variant=opt('variante','a'),fps=30,duration=24;
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(pathToFileURL(path.join(here,'video.html')).href+'?render=1');
 await page.evaluate(()=>window.ready);
 const frames=[];
 for(const t of [0,1.5,4,8,13,17.5,22]){
  await page.evaluate(([t,v])=>window.seek(t,v),[t,variant]);
  const shot=await page.screenshot({path:path.join(out,`fotograma-${variant}-${t}.png`)});
  frames.push(await sharp(shot).resize(270,480).png().toBuffer());
 }
 await sharp({create:{width:1890,height:480,channels:3,background:'#0C0B0A'}}).composite(frames.map((input,i)=>({input,left:i*270,top:0}))).png().toFile(path.join(out,`storyboard-${variant}.png`));
 if(errors.length)throw new Error(errors.join('\n'));
 if(args.includes('--solo-fotos')){console.log(`Fotogramas y storyboard: ${out}`);}else{
  // Música y efectos originales sintetizados: no muestras ni audio ajeno.
  const rate=48000,N=rate*duration,samples=new Float32Array(N);let seed=42;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296*2-1;};
  function tone(time,length,hz,amp,kind='sin'){const start=Math.round(time*rate);for(let j=0;j<length*rate&&start+j<N;j++){const t=j/rate,env=Math.min(1,t/.006)*Math.exp(-t/(length/3));const wave=kind==='noise'?rand():Math.sin(2*Math.PI*(hz*t+(kind==='kick'?38*(1-Math.exp(-t*25))/25:0)));samples[start+j]+=wave*env*amp;}}
  // Apertura con avisos; silencio breve en el cambio a Leogin; pulso cálido.
  for(const t of [.12,.65,1.25]){tone(t,.16,880,.16);tone(t+.09,.18,1174,.1);}
  for(let t=3;t<23.2;t+=.6){tone(t,.28,48,.28,'kick');tone(t+.3,.07,0,.055,'noise');}
  for(let t=3;t<23.2;t+=2.4){for(const h of [146.83,220,293.66])tone(t,1.8,h,.035);for(const [i,h]of [440,523.25,659.25,587.33].entries())tone(t+i*.6,.35,h,.055);}
  for(const t of [6,11,16,19.5]){tone(t,.18,660,.13);tone(t+.08,.25,880,.1);}
  const wav=Buffer.alloc(44+N*2);wav.write('RIFF');wav.writeUInt32LE(36+N*2,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(N*2,40);
  for(let i=0;i<N;i++){const fade=Math.min(1,(N-i)/(rate*.8));wav.writeInt16LE(Math.round(Math.tanh(samples[i])*fade*26000),44+i*2);}
  const sound=path.join(out,'sonido-original.wav');fs.writeFileSync(sound,wav);
  const target=path.join(out,`leogin-chat-${variant}-24s.mp4`);
  const ff=spawn(ffmpeg,['-y','-loglevel','error','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-i',sound,'-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-t',String(duration),'-movflags','+faststart',target],{stdio:['pipe','inherit','inherit']});
  let failure;ff.on('error',e=>{failure=e;});ff.stdin.on('error',e=>{failure=e;});
  const done=new Promise((resolve,reject)=>{ff.on('error',reject);ff.on('close',code=>code===0?resolve():reject(new Error(`ffmpeg: ${code}`)));});
  for(let i=0;i<duration*fps;i++){
   if(failure)throw failure;
   await page.evaluate(([t,v])=>window.seek(t,v),[i/fps,variant]);
   const jpg=await page.screenshot({type:'jpeg',quality:94});
   if(!ff.stdin.write(jpg))await once(ff.stdin,'drain');
   if(i%(fps*4)===0)console.log(`Variante ${variant}: ${i}/${duration*fps}`);
  }
  ff.stdin.end();await done;
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(`MP4 con audio: ${target}`);
 }
} finally {await browser.close();}
