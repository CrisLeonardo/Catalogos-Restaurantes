"""Genera locución sintética y música original; no usa música de terceros."""
import asyncio, json, subprocess, wave
from pathlib import Path
import edge_tts
import imageio_ffmpeg
import numpy as np

BASE = Path(__file__).resolve().parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000
DURATION = 30
SEGMENTS = [
    (0.0, 2.85, '¿Otro pedido perdido?'),
    (3.05, 3.2, 'Un chat. Un papel. Un enredo.'),
    (6.55, 2.25, 'Conecta tu restaurante con Leoguin.'),
    (9.1, 3.65, 'Tu cliente pide. Sin descargar aplicaciones.'),
    (13.1, 3.65, 'Cocina recibe la orden. Sin copiar a mano.'),
    (17.1, 3.65, 'Cada cobro queda registrado. Tus ventas, en tu celular.'),
    (21.1, 2.65, 'Cero comisión por pedido.'),
    (24.15, 5.55, 'Prueba Leoguin gratis. Treinta días, sin tarjeta. Entra a distleoguin punto com.'),
]

async def main():
    voice = np.zeros(SR * DURATION, np.float64)
    activity = np.zeros_like(voice)
    cues = []
    for i, (start, budget, words) in enumerate(SEGMENTS):
        target = BASE / 'assets' / f'voz-{i:02}.mp3'
        if not target.exists():
            await edge_tts.Communicate(words, 'es-GT-AndresNeural', rate='+9%').save(str(target))
        raw = subprocess.check_output([FF, '-v', 'error', '-i', str(target), '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-'])
        data = np.frombuffer(raw, np.float32).astype(np.float64)
        # Mantiene cada frase dentro de su escena sin cortar palabras.
        duration = len(data) / SR
        if duration > budget:
            raw = subprocess.check_output([FF, '-v', 'error', '-i', str(target), '-af', f'atempo={duration / budget:.6f}', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-'])
            data = np.frombuffer(raw, np.float32).astype(np.float64)
        peak = np.max(np.abs(data))
        data *= 0.68 / max(peak, 0.001)
        pos = round(start * SR)
        n = min(len(data), len(voice)-pos)
        voice[pos:pos+n] += data[:n]
        activity[max(0,pos-3500):min(len(voice),pos+n+6500)] = 1
        cues.append({'inicio':start,'duracion':round(n/SR,3),'texto':words})
        print(f'Frase {i+1}: {n/SR:.2f} s', flush=True)

    rng = np.random.default_rng(128)
    music = np.zeros((SR*DURATION,2), np.float64)
    def add(start, a, pan=0):
        p=round(start*SR); n=min(len(a),len(music)-p)
        if n>0 and p>=0:
            music[p:p+n,0] += a[:n] * (1-pan*.35)
            music[p:p+n,1] += a[:n] * (1+pan*.35)
    def tone(start, frequency, length=.3, gain=.05, pan=0):
        tt=np.arange(round(length*SR))/SR
        env=(1-np.exp(-tt*200))*np.exp(-tt*8)
        add(start,gain*env*(np.sin(2*np.pi*frequency*tt)+.23*np.sin(2*np.pi*2.003*frequency*tt)),pan)
    beat=60/112
    for k,start in enumerate(np.arange(0,30,beat)):
        # Silencio de percusión en el cambio que presenta la solución.
        if 6.4<start<8.95: continue
        tt=np.arange(round(.25*SR))/SR
        kick=.11*np.sin(2*np.pi*(45*tt+1.6*(1-np.exp(-tt*28))))*np.exp(-tt*22)
        add(start,kick)
        hh=rng.standard_normal(round(.055*SR))
        hh=np.concatenate([[0],np.diff(hh)])*.013*np.exp(-np.arange(len(hh))/SR*100)
        add(start+beat*.5,hh,(-1)**k*.65)
        if k%2:
            noise=rng.standard_normal(round(.12*SR));noise*=np.exp(-np.arange(len(noise))/SR*47)*.025
            add(start,noise,.15)
        tone(start,[110,110,130.81,98][(k//8)%4],.42,.048)
        if start>8.95:
            tone(start+beat*.5,[440,523.25,659.25,587.33,523.25,440,392,329.63][k%8],.42,.027,(-1)**k*.6)
    # Golpes sincronizados con cortes, un aviso y confirmaciones.
    for start in [0,3,6.5,9,13,17,21,24]:
        tt=np.arange(round(.18*SR))/SR
        add(start,rng.standard_normal(len(tt))*.035*np.exp(-tt*35))
    for start in [11.85,13.05,15.82,17.15,24.1]:
        tone(start,880,.4,.055,-.2);tone(start+.095,1318.5,.45,.045,.2)
    # Cama armónica suave y apertura en estéreo.
    tt=np.arange(len(voice))/SR
    for freq in [220,261.625,329.628]:
        music[:,0]+=.006*np.sin(2*np.pi*freq*tt)
        music[:,1]+=.006*np.sin(2*np.pi*(freq+.18)*tt)
    duck=1-activity*.55
    music*=duck[:,None]
    fade=np.minimum(1, np.maximum(0,(30-tt)/.6))
    out=(music+voice[:,None])*fade[:,None]
    out=np.clip(out,-.96,.96)
    with wave.open(str(BASE/'videos'/'banda-sonora.wav'),'wb') as w:
        w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes((out*32767).astype('<i2').tobytes())
    (BASE/'assets'/'locucion.json').write_text(json.dumps(cues,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Banda sonora estéreo lista.',flush=True)

if __name__=='__main__':asyncio.run(main())
