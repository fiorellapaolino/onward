import json, os, shutil, sys, numpy as np
from PIL import Image
sys.path.insert(0,'/home/claude/scripts')
from gltfload import GLTF
OUT='/home/claude/onward/public/models/elf'; os.makedirs(OUT,exist_ok=True)
B='/home/claude/assets_in/ubc/Universal Base Characters[Standard]/Base Characters/Godot - UE/'
O='/home/claude/assets_in/outfits/Modular Character Outfits - Fantasy[Standard]/Exports/glTF (Godot-Unreal)/Outfits/'
H='/home/claude/assets_in/ubc/Universal Base Characters[Standard]/Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/'
done_imgs={}
def prep(src, outname, drop_nodes=(), trim_body=False, size=1024):
    g=GLTF(src); j=g.g; d=os.path.dirname(src)
    binname=outname+'.bin'
    buf=bytearray(g.bufs[0])
    if trim_body:
        for n in j['nodes']:
            if n.get('name')=='Superhero_Female':
                mesh=j['meshes'][n['mesh']]
                for pr in mesh['primitives']:
                    at=pr['attributes']; J=g.acc(at['JOINTS_0']).astype(int); W=g.acc(at['WEIGHTS_0']).astype(float)
                    jn=[j['nodes'][k]['name'] for k in j['skins'][n['skin']]['joints']]
                    keep={i for i,nm in enumerate(jn) if nm in('Head','neck_01') or nm.startswith(('hand_','index','middle','pinky','ring','thumb'))}
                    w=sum(W[:,k]*np.isin(J[:,k],list(keep)) for k in range(4))
                    F=g.acc(pr['indices']).reshape(-1,3)
                    Fk=F[(w>0.5)[F].all(1)].astype(np.uint32).flatten()
                    while len(buf)%4: buf.append(0)
                    off=len(buf); buf+=Fk.tobytes()
                    j['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(Fk)*4,'target':34963})
                    j['accessors'].append({'bufferView':len(j['bufferViews'])-1,'componentType':5125,'count':int(len(Fk)),'type':'SCALAR'})
                    pr['indices']=len(j['accessors'])-1
                    print('body trimmed', len(F),'->',len(Fk)//3)
    # quitar nodos (p.ej. capucha) de la escena
    if drop_nodes:
        drop={i for i,n in enumerate(j['nodes']) if n.get('name') in drop_nodes}
        for n in j['nodes']:
            if 'children' in n: n['children']=[c for c in n['children'] if c not in drop]
        for sc in j['scenes']: sc['nodes']=[c for c in sc['nodes'] if c not in drop]
        for i in drop:
            j['nodes'][i].pop('mesh',None); j['nodes'][i].pop('skin',None)
    j['buffers']=[{'uri':binname,'byteLength':len(buf)}]
    open(os.path.join(OUT,binname),'wb').write(buf)
    # materiales: solo color base (sin normal/ORM/roughness), texturas reducidas
    used=set()
    for m in j.get('materials',[]):
        m.pop('normalTexture',None); m.pop('occlusionTexture',None)
        pbr=m.setdefault('pbrMetallicRoughness',{}); pbr.pop('metallicRoughnessTexture',None)
        pbr['metallicFactor']=0; pbr['roughnessFactor']=0.8
        if 'baseColorTexture' in pbr: used.add(j['textures'][pbr['baseColorTexture']['index']]['source'])
    for i,im in enumerate(j.get('images',[])):
        if i not in used: im['uri']='unused.png'; im.pop('mimeType',None); continue
        srcp=os.path.join(d,im['uri'])
        if not os.path.exists(srcp):
            alt=os.path.join(d,im['uri'].replace('_png.png','.png'))
            srcp=alt if os.path.exists(alt) else srcp
        key=os.path.abspath(srcp)
        if key not in done_imgs:
            I=Image.open(srcp)
            alpha=I.mode in('RGBA','LA') and I.getchannel('A').getextrema()[0]<250
            I=I.convert('RGBA' if alpha else 'RGB'); I.thumbnail((size,size),Image.LANCZOS)
            name=os.path.splitext(os.path.basename(srcp))[0]+('.png' if alpha else '.jpg')
            I.save(os.path.join(OUT,name),**({'optimize':True} if alpha else {'quality':86}))
            done_imgs[key]=(name,alpha)
        name,alpha=done_imgs[key]
        im['uri']=name; im['mimeType']='image/png' if alpha else 'image/jpeg'
    Image.new('RGBA',(2,2),(0,0,0,0)).save(os.path.join(OUT,'unused.png'))
    json.dump(j,open(os.path.join(OUT,outname+'.gltf'),'w'),separators=(',',':'))
prep(B+'Superhero_Female_FullBody.gltf','body',trim_body=True)
prep(O+'Female_Ranger.gltf','outfit',drop_nodes=('Female_Ranger_Head_Hood','Female_Ranger_Acc_Pauldrons'))
prep(H+'Hair_Buns.gltf','hair')
print(sorted(done_imgs.values()))
