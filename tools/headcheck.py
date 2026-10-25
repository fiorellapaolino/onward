import sys, json, numpy as np
sys.path.insert(0,'/home/claude/scripts')
from gltfload import GLTF, quat_to_mat
from retarget import mat_to_quat
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
E='/home/claude/onward/public/models/elf/'
clip=json.load(open('/home/claude/onward/src/anims/standup.json'))
parts=[GLTF(E+p+'.gltf') for p in ('body','outfit','hair')]
def qmul(a,b):
    x1,y1,z1,w1=a; x2,y2,z2,w2=b
    return np.array([w1*x2+x1*w2+y1*z2-z1*y2, w1*y2-x1*z2+y1*w2+z1*x2, w1*z2+x1*y2-y1*x2+z1*w2, w1*w2-x1*x2-y1*y2-z1*z2])
def axang(ax,a):
    ax=ax/np.linalg.norm(ax); return np.r_[ax*np.sin(a/2),np.cos(a/2)]
g0=parts[0]; idx0={n['name']:i for i,n in enumerate(g0.g['nodes'])}
def rest_axes(b):
    W=g0.world(idx0[b]); R=W[:3,:3]/np.linalg.norm(W[:3,:3],axis=0); inv=R.T
    return {'up':inv@[0,1,0],'left':inv@[1,0,0],'fwd':inv@[0,0,1]}
AX={'Head':rest_axes('Head'),'neck_01':rest_axes('neck_01')}
def pose_q(frame_t, yaw, pitch):
    f=int(round(frame_t*clip['fps']))
    q={}
    for b,arr in clip['bones'].items():
        a=np.array(arr).reshape(-1,4); q[b]=a[0] if len(a)==1 else a[min(f,len(a)-1)]
    q['neck_01']=qmul(q['neck_01'],axang(AX['neck_01']['up'],yaw*0.4))
    q['Head']=qmul(q['Head'],axang(AX['Head']['up'],yaw*0.6))
    q['Head']=qmul(q['Head'],axang(AX['Head']['left'],pitch))
    return q
def render(ax, q, title, rooty):
    Vs=[];Fs=[];Cs=[];o=0
    for g in parts:
        idx={n['name']:i for i,n in enumerate(g.g['nodes'])}
        trs={idx[b]:{'r':v} for b,v in q.items() if b in idx}
        for name,V,F,C,ex in g.meshes(trs=trs):
            if name in('Hair_Buns','Eyebrows'): C=np.clip(C*np.array([0.75,0.41,0.24])*1.7,0,1)
            Vs.append(V);Fs.append(F+o);Cs.append(C);o+=len(V)
    V=np.vstack(Vs);F=np.vstack(Fs);C=np.vstack(Cs)
    c,s=np.cos(rooty),np.sin(rooty); Ry=np.array([[c,0,s],[0,1,0],[-s,0,c]]); P=V@Ry.T
    # cámara detrás (en -Z) mirando a +Z: derecha de pantalla = -X
    Q=np.stack([-P[:,0],P[:,1]],1); depth=-P[F][:,:,2].mean(1); od=np.argsort(depth)
    ax.add_collection(PolyCollection(Q[F[od]],facecolors=np.clip(C[F[od]].mean(1),0,1),edgecolors='none'))
    ax.set_xlim(-0.75,0.35); ax.set_ylim(1.0,1.85); ax.set_aspect('equal'); ax.axis('off'); ax.set_title(title,color='w',fontsize=10)
yaws=[float(x) for x in sys.argv[1].split(',')]; rooty=float(sys.argv[2]); ft=float(sys.argv[3])
fig,axes=plt.subplots(1,len(yaws),figsize=(4*len(yaws),5),facecolor='#2a2a2a')
for ax,y in zip(axes,yaws): render(ax,pose_q(ft,y,0),f'giro {y:+.2f}',rooty)
plt.savefig(sys.argv[4],dpi=80,bbox_inches='tight')
