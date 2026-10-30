import os, socket, subprocess, sys, time
from pathlib import Path
base=Path.cwd()
port=int(os.environ.get('MODEL_BENCHMARK_BLENDER_PORT','9877'))
if port not in (9877,9878):
    raise RuntimeError('Unsupported benchmark Blender port')
blender=r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
os.environ['BLENDER_PATH']=blender
os.environ['BLENDER_MCP_HOST']='127.0.0.1'
os.environ['BLENDER_MCP_PORT']=str(port)
with socket.socket() as probe:
    if probe.connect_ex(('127.0.0.1',port))==0:
        raise RuntimeError(f'Benchmark port {port} occupied; refusing to attach to another scene')
with (base/'blender-mcp-host.log').open('w',encoding='utf-8') as log:
    host=subprocess.Popen([blender,'--background','--factory-startup','--disable-autoexec','--offline-mode','--python',str(Path(__file__).with_name('host.py'))],cwd=base,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
    (base/'blender-process.json').write_text(__import__('json').dumps({'pid':host.pid,'host':'127.0.0.1','port':port}),encoding='utf-8')
    try:
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            if host.poll() is not None: raise RuntimeError('Blender bridge failed; see local host log')
            with socket.socket() as probe:
                if probe.connect_ex(('127.0.0.1',port))==0: break
            time.sleep(0.2)
        else: raise RuntimeError('Blender bridge startup failed')
        from blmcp import main
        main()
    finally:
        if host.poll() is None:
            host.terminate()
            host.wait(timeout=10)
