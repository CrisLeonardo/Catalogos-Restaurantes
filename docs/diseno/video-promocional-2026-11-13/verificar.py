"""Valida el MP4 entregable, decodificando todos sus cuadros y su audio."""
import json, re, subprocess
from pathlib import Path
import imageio_ffmpeg

base=Path(__file__).resolve().parent
video=base/'videos'/'Leogin-Promocional-30s-1080x1920.mp4'
ff=imageio_ffmpeg.get_ffmpeg_exe()
reader=imageio_ffmpeg.read_frames(str(video),pix_fmt='rgb24')
meta=next(reader)
frames=sum(1 for _ in reader)
assert tuple(meta['size'])==(1080,1920),meta
assert abs(meta['fps']-30)<.01,meta
assert abs(meta['duration']-30)<.05,meta
assert frames==900,frames
check=subprocess.run([ff,'-hide_banner','-i',str(video),'-af','loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-'],capture_output=True,text=True)
assert check.returncode==0,check.stderr
match=re.findall(r'\{\s*"input_i"[\s\S]*?\}',check.stderr)
assert match,'No hay medición de audio'
audio=json.loads(match[-1])
assert -18<float(audio['input_i'])<-14,audio
assert float(audio['input_tp'])<-.5,audio
for moment in [0,14,25.5]:
    subprocess.run([ff,'-y','-v','error','-ss',str(moment),'-i',str(video),'-frames:v','1',str(base/'videos'/f'cuadro-exportado-{str(moment).replace(".","_")}.png')],check=True)
report={'archivo':video.name,'bytes':video.stat().st_size,'resolucion':meta['size'],'fps':meta['fps'],'duracion_segundos':meta['duration'],'cuadros_decodificados':frames,'codec_video':meta.get('codec'),'audio_estereo':'Audio: aac' in check.stderr and 'stereo' in check.stderr,'sonoridad_LUFS':float(audio['input_i']),'pico_real_dBTP':float(audio['input_tp']),'decodificacion_completa':'correcta','revision_visual':'11 encuadres del montaje y 3 cuadros del MP4 exportado'}
assert report['audio_estereo'],report
(base/'videos'/'verificacion.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
