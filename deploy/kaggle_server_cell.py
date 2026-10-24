"""Start CallSense (+ the optional VoiceGuard service) on Kaggle and expose them through Cloudflare quick tunnels.

Paste this whole file into one Kaggle notebook cell (GPU on, Internet on) after training has produced
/kaggle/working/callsense/emotion_head.npz. It prints the public URLs at the end.
The URLs are temporary: they change every time the cell is run.
CallSense runs without an API key (demo); VoiceGuard is protected by a random key that is passed to CallSense internally.
"""
import os, glob, shutil, subprocess, time, secrets, re, urllib.request
W = '/kaggle/working'
REPO = 'https://github.com/prajapatiritik139-commits/TeamFriday_Ritik'
subprocess.run('pkill -f uvicorn; pkill -f cloudflared', shell=True)

# CallSense code from GitHub + trained head
shutil.rmtree(W + '/cs', ignore_errors=True)
subprocess.run(f'git clone -q {REPO} {W}/cs', shell=True, check=True)
os.makedirs(W + '/cs/model', exist_ok=True)
shutil.copy(W + '/callsense/emotion_head.npz', W + '/cs/model/emotion_head.npz')

# VoiceGuard code + model from private Kaggle datasets (separate, pre-existing service)
main = glob.glob('/kaggle/input/datasets/ritikprajapat2/voiceguard-backend/**/app/main.py', recursive=True)[0]
shutil.rmtree(W + '/vg', ignore_errors=True); shutil.copytree(os.path.dirname(os.path.dirname(main)), W + '/vg')
os.makedirs(W + '/vg/model', exist_ok=True)
shutil.copy('/kaggle/input/datasets/ritikprajapat2/detector-v4/detector_v4.npz', W + '/vg/model/detector_v4.npz')

subprocess.run('pip -q install fastapi "uvicorn[standard]" python-multipart requests', shell=True)

vg_key = secrets.token_urlsafe(12)
def start(cwd, port, gpu, extra, log):
    env = dict(os.environ, CUDA_VISIBLE_DEVICES=gpu, DEVICE='cuda', CORS_ORIGINS='*', LOG_SALT=secrets.token_hex(8), **extra)
    return subprocess.Popen(f'cd {cwd} && python -m uvicorn app.main:app --host 0.0.0.0 --port {port}',
                            shell=True, env=env, stdout=open(log, 'w'), stderr=subprocess.STDOUT)
start(W + '/vg', 8000, '0', dict(API_KEY=vg_key, MODEL_NPZ=W + '/vg/model/detector_v4.npz', LOG_PATH=W + '/vg_audit.jsonl'), W + '/vg.log')
start(W + '/cs', 8001, '1', dict(MODEL_NPZ=W + '/cs/model/emotion_head.npz', LOG_PATH=W + '/cs_audit.jsonl',
                               VOICEGUARD_URL='http://127.0.0.1:8000', VOICEGUARD_KEY=vg_key), W + '/cs.log')

def wait(port, log):
    for _ in range(150):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=2); return True
        except Exception:
            time.sleep(3)
    print(open(log).read()[-1500:]); return False
ok_vg, ok_cs = wait(8000, W + '/vg.log'), wait(8001, W + '/cs.log')
print('VoiceGuard up:', ok_vg, '| CallSense up:', ok_cs)

cf = W + '/cloudflared'
if not os.path.exists(cf):
    urllib.request.urlretrieve('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64', cf)
    os.chmod(cf, 0o755)
def tunnel(port):
    log = f'{W}/tunnel{port}.log'
    subprocess.Popen(f'{cf} tunnel --url http://127.0.0.1:{port} --no-autoupdate', shell=True,
                     stdout=open(log, 'w'), stderr=subprocess.STDOUT)
    for _ in range(40):
        m = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', open(log).read())
        if m: return m.group(0)
        time.sleep(2)
print('CALLSENSE (dashboard):', tunnel(8001))
print('VOICEGUARD URL       :', tunnel(8000))
print('VOICEGUARD KEY       :', vg_key)
