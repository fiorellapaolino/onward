# Vista previa de la niña: pose de rodillas (frame 0 de Standing Up) + ajustes en ejes locales
import sys, json, numpy as np
sys.path.insert(0,'/home/claude/scripts')
from gltfload import GLTF
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
E='/home/claude/onward/public/models/'
clip=json.load(open("/home/claude/onward/src/anims/"+(sys.argv[4] if len(sys.argv)>4 else "standup")+".json"))
import os
if os.environ.get('CHAR')=='elder': parts=[GLTF(E+'elder/'+p+'.gltf') for p in ('body','outfit','hair','beard')]
else: parts=[GLTF(E+'elf/body.gltf'),GLTF(E+'girl/outfit.gltf'),GLTF(E+'girl/hair.gltf')]
def qmul(a,b):
    x1,y1,z1,w1=a; x2,y2,z2,w2=b
    return np.array([w1*x2+x1*w2+y1*z2-z1*y2, w1*y2-x1*z2+y1*w2+z1*x2, w1*z2+x1*y2-y1*x2+z1*w2, w1*w2-x1*x2-y1*y2-z1*z2])
def axang(ax,a):
    ax=np.array(ax,float); ax=ax/np.linalg.norm(ax); return np.r_[ax*np.sin(a/2),np.cos(a/2)]
g0=parts[0]; idx0={n['name']:i for i,n in enumerate(g0.g['nodes'])}
def rest_axes(b):
    W=g0.world(idx0[b]); R=W[:3,:3]/np.linalg.norm(W[:3,:3],axis=0); inv=R.T
    return {'up':inv@[0,1,0],'left':inv@[1,0,0],'fwd':inv@[0,0,1]}
def pose(adj, frame=0, head_scale=1.0):
    q={}
    for b,arr in clip['bones'].items():
        a=np.array(arr).reshape(-1,4); q[b]=a[min(frame,len(a)-1)]
    for b,ax,ang in adj:
        q[b]=qmul(q[b],axang(rest_axes(b)[ax],ang))
    trs={}
    return q
def render(ax,q,title,rooty,hs,zoom):
    Vs=[];Fs=[];Cs=[];o=0
    for g in parts:
        idx={n['name']:i for i,n in enumerate(g.g['nodes'])}
        trs={idx[b]:{'r':v} for b,v in q.items() if b in idx}
        if 'Head' in idx: trs.setdefault(idx['Head'],{})['s']=np.array([hs]*3)
        for name,V,F,C,ex in g.meshes(trs=trs):
            if name.startswith(('Hair','Eyebrows')): C=np.clip(C*(np.array([0.85,0.84,0.82])*1.9 if os.environ.get('CHAR')=='elder' else np.array([0.45,0.3,0.2])*1.6),0,1)
            Vs.append(V);Fs.append(F+o);Cs.append(C);o+=len(V)
    V=np.vstack(Vs);F=np.vstack(Fs);C=np.vstack(Cs)
    print(title,'miny',V[:,1].min()); V[:,1]-=V[:,1].min() if os.environ.get('NOGROUND') is None else 0
    c,s=np.cos(rooty),np.sin(rooty); Ry=np.array([[c,0,s],[0,1,0],[-s,0,c]]); P=V@Ry.T
    # cámara mirando hacia -Z desde +Z (vemos el frente del modelo, que mira a +Z)
    Q=np.stack([P[:,0],P[:,1]],1); depth=P[F][:,:,2].mean(1); od=np.argsort(depth)
    ax.add_collection(PolyCollection(Q[F[od]],facecolors=np.clip(C[F[od]].mean(1),0,1),edgecolors='none'))
    ax.set_xlim(-zoom,zoom); ax.set_ylim(-0.05,2*zoom-0.05); ax.set_aspect('equal'); ax.axis('off'); ax.set_title(title,color='w',fontsize=10)
if __name__=='__main__':
    adj=json.loads(sys.argv[1]); hs=float(sys.argv[2]); out=sys.argv[3]
    views=[0,np.pi/2,np.pi*0.25,-np.pi/2]
    fig,axes=plt.subplots(1,len(views),figsize=(4*len(views),5),facecolor='#2a2a2a')
    q=pose(adj)
    for ax,v in zip(axes,views): render(ax,q,f'vista {v:+.2f}',v,hs,0.9)
    plt.savefig(out,dpi=70,bbox_inches='tight')
