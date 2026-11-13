// Render determinista a 1080 × 1920, H.264 + AAC, listo para redes.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import http from 'node:http';
const dir=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(path.resolve(dir,'../../../plataforma/package.json'));
const {chromium}=require('playwright');
const root=path.resolve(dir,'../../..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp','.png':'image/png'})[ext]||'application/octet-stream');const stream=fs.createReadStream(file);stream.on('error',()=>{res.statusCode=404;res.end()});stream.pipe(res)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const ff=execFileSync('python',['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8'}).trim();
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1080,height:1920}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.goto(`http://127.0.0.1:${server.address().port}/docs/diseno/video-promocional-2026-11-13/video.html`);
await page.evaluate(()=>window.ready);
const frames=[0,1.5,4.3,7.9,11,14,16,19,22.5,25.5,29.5];
for(const t of frames){await page.evaluate(t=>window.render(t),t);const b64=await page.evaluate(()=>document.querySelector('canvas').toDataURL('image/png').split(',')[1]);fs.writeFileSync(path.join(dir,'videos',`cuadro-${String(t).replace('.','_')}.png`),Buffer.from(b64,'base64'))}
if(process.argv.includes('--fotos')){console.log(JSON.stringify({errors,fotos:frames}));await browser.close();server.close();process.exit(errors.length?1:0)}
const output=path.join(dir,'videos','Leogin-Promocional-30s-1080x1920.mp4');
const proc=spawn(ff,['-y','-v','warning','-f','image2pipe','-framerate','30','-c:v','mjpeg','-i','pipe:0','-i',path.join(dir,'videos','banda-sonora.wav'),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-t','30','-movflags','+faststart',output],{stdio:['pipe','inherit','inherit']});
let code=null;const done=new Promise(r=>proc.on('close',c=>{code=c;r(c)}));proc.stdin.on('error',()=>{});
for(let i=0;i<900;i++){
 if(code!==null)throw new Error(`FFmpeg terminó antes: ${code}`);
 const b64=await page.evaluate(t=>{window.render(t);return document.querySelector('canvas').toDataURL('image/jpeg',.96).split(',')[1]},i/30);
 if(!proc.stdin.write(Buffer.from(b64,'base64')))await new Promise(r=>proc.stdin.once('drain',r));
 if(i%150===0)console.log(`Render ${i}/900`,new Date().toISOString());
}
proc.stdin.end();const result=await done;await browser.close();server.close();
if(result!==0||errors.length)throw new Error(JSON.stringify({result,errors}));
console.log(`Listo: ${output}`);
