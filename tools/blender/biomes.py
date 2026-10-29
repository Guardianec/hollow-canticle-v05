"""Biome-specific authored structures built on the validated connection sockets."""
import math
from common import loft, stone, tube, mesh, join
import ruins
import fungi

NAMES=['ruins','shrine','fungal','frozen','foundry']

def mushroom(m,height=3,radius=1.4):
    return fungi.mushroom(m,height,radius,3)

def roots(m,spread=1.7):
    pieces=[]
    for i in range(7):
        a=math.tau*i/7
        points=[]
        for k in range(17):
            t=k/16; r=t*spread
            points.append((math.cos(a+t*.8)*r,math.sin(a+t*.8)*r,.06+.12*math.sin(t*math.pi)+.06*math.cos(t*8+i)))
        pieces.append(tube('twisted root',points,.045+(i%3)*.015,m['moss_stone']))
    return pieces

def roof(m,width=3.5,height=5.1):
    verts=[]; faces=[]
    for side in [-1,1]:
        offset=len(verts)
        for j in range(9):
            t=j/8
            for i in range(13):
                x=(i/12-.5)*width
                verts.append((x,side*t*1.1,height-.7*t+.35*t**4+.12*(abs(x)/(width*.5))**4))
        for j in range(8):
            for i in range(12):
                a=offset+j*13+i; faces.append((a,a+1,a+14,a+13))
    return [mesh('swept shrine eaves',verts,faces,m['worn_iron'],True),
            tube('ridge cap',[(-width*.52,0,height+.09),(0,0,height+.05),(width*.52,0,height+.09)],.075,m['aged_bronze'])]

def gear(m,radius=.8):
    verts=[]; count=96
    for z in [-.1,.1]:
        for i in range(count):
            a=math.tau*i/count; r=radius*(1 if i%4 in [1,2] else .84)
            verts.append((math.cos(a)*r,math.sin(a)*r,z))
    faces=[tuple(reversed(range(count))),tuple(range(count,2*count))]
    faces.extend((i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count))
    return [mesh('forged gear teeth',verts,faces,m['rusted_iron']),loft('gear axle',[(-.25,.18,.18,0,0),(.25,.18,.18,0,0)],m['aged_bronze'],24)]

def build(m,biome):
    name=NAMES[biome]
    mapping=dict(m)
    stone_family={1:'wet_stone',2:'moss_stone',3:'frozen_stone',4:'burnt_stone'}[biome]
    mapping['ancient_stone']=m[stone_family]
    mapping['carved_stone']=m[stone_family if biome!=4 else 'rusted_iron']
    original=ruins.build(mapping)
    assets={}
    for key,obj in original.items():
        key=key.replace('ruins_',name+'_')
        parts=[obj]
        if biome==1 and ('arch' in key or 'doorway' in key): parts.extend(roof(m,4.8 if 'doorway' in key else 3.5,5.8 if 'doorway' in key else 5.1))
        if biome==2 and ('column' in key or 'statue' in key): parts.extend(mushroom(m,2.4 if 'broken' in key else 4,1.2))
        if biome==2 and ('wall' in key or 'rubble' in key): parts.extend(roots(m))
        if biome==3:
            # Accumulation is assigned by surface normal, including cap and tread tops.
            snow_index=len(obj.data.materials); obj.data.materials.append(m['snow_crust'])
            for polygon in obj.data.polygons:
                if polygon.normal.z>.58: polygon.material_index=snow_index
            if 'arch' in key or 'wall' in key:
                for i in range(7):
                    x=-1.3+i*.42; h=.32+.22*math.sin(i*3.7)**2
                    parts.append(loft('bent icicle',[(2.65-h,.003,.003,x+.03,-.37),(2.65-h*.6,.035,.04,x,-.37),(2.65,.065,.07,x,-.35)],m['frozen_stone'],12))
        if biome==4 and ('column' in key or 'wall' in key):
            for side in [-1,1]:
                parts.append(tube('flanged pressure pipe',[(side*.37,.27,.2),(side*.37,.27,1.5),(side*.55,.27,1.7),(side*.55,.27,2.6)],.055,m['rusted_iron']))
        assets[key]=join(parts,key+'_LOD0')
    def add(suffix,parts):
        key=name+'_'+suffix; assets[key]=join(parts,key+'_LOD0')
    if biome==1:
        add('lantern',[loft('lantern stand',[(0,.15,.15,0,0),(.2,.1,.1,0,0),(1.6,.08,.08,0,0),(1.8,.24,.24,0,0)],m['aged_bronze'],16),*roof(m,1.1,1.8)])
        add('channel',[stone('channel curb',(side*.55,0,.06),(.16,3,.2),m['wet_stone']) for side in [-1,1]])
    elif biome==2:
        add('growth',mushroom(m,2.5,1.5)+roots(m,2))
        add('root_cluster',roots(m,2.4))
    elif biome==3:
        add('snowbank',[loft('wind sculpted drift',[(0,1.3,.7,0,0),(.15,1.25,.65,0,0),(.36,.8,.4,.2,0),(.45,.1,.08,.35,0)],m['snow_crust'],40,.06)])
        add('ice_shards',[loft('ice shard',[(0,.15,.13,x,0),(.4,.12,.1,x+.04,0),(.9,.001,.001,x+.15,0)],m['frozen_stone'],8) for x in [-.4,0,.4]])
    else:
        add('gear',gear(m))
        furnace=[stone('furnace shell',(0,0,.9),(2.8,1.2,1.8),m['burnt_stone'])]
        for i in range(9): furnace.append(tube('furnace grate',[(-1+i*.25,-.67,.25),(-1+i*.25,-.67,1.5)],.026,m['rusted_iron']))
        add('furnace',furnace)
        chains=[]
        for i in range(18):
            points=[]
            for j in range(25):
                a=math.tau*j/24
                points.append((math.cos(a)*.075 if i%2 else 0,0 if i%2 else math.cos(a)*.075,i*.17+math.sin(a)*.12))
            chains.append(tube('interlocked chain',points,.019,m['worn_iron']))
        add('chain',chains)
    return assets
