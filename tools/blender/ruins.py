import bpy
import math
from common import stone, loft, mesh, bevel, tube, join, RNG

def column(m, broken=False):
    rings=[(0,.65),(.15,.65),(.22,.54),(.32,.52),(.42,.42),(.55,.36),
           (1.3,.34),(2.4,.31),(3.5,.30),(4.25,.33),(4.36,.45),(4.46,.56),(4.65,.56),(4.8,.65),(5,.65)]
    if broken: rings=[p for p in rings if p[0]<2.5]+[(2.65,.31)]
    obj=loft('fluted shaft',[(z,r,r,0,0) for z,r in rings],m['carved_stone'],32,.055)
    if broken:
        for v in obj.data.vertices:
            if v.co.z>2.5: v.co.z+=RNG.uniform(-.3,.25)
    objects=[obj]
    for h in [.35,.48,4.28,4.43]:
        if broken and h>2.5: continue
        objects.append(loft('molding',[(h,.45,.45,0,0),(h+.06,.46,.46,0,0),(h+.1,.4,.4,0,0)],m['ancient_stone'],32))
    if not broken:
        objects.append(stone('capital abacus',(0,0,4.91),(1.27,1.27,.18),m['carved_stone'],.025))
        for i in range(8):
            a=math.tau*i/8
            points=[]
            for k in range(9):
                t=k/8; radius=.34+.14*math.sin(t*math.pi*.7)
                points.append((math.cos(a)*radius,math.sin(a)*radius,4.08+t*.48))
            objects.append(tube('carved capital leaf',points,.025,m['ancient_stone']))
    return objects

def arch(m, broken=False, width=2.8):
    r=width/2; spring=2.8
    objects=[]
    for side in [-1,1]:
        parts=column(m)
        for obj in parts:
            for v in obj.data.vertices:
                v.co.x=v.co.x*.65+side*(r+.19)
                v.co.y*=.65; v.co.z*=spring/5
        objects.extend(parts)
    for i in range(15):
        if broken and i in [6,7,8,9]: continue
        a0=math.pi*i/15+.005; a1=math.pi*(i+1)/15-.005
        verts=[]
        for y in [-.36,.36]:
            for rad,a in [(r,a0),(r+.4,a0),(r+.4,a1),(r,a1)]:
                verts.append((math.cos(a)*rad,y,spring+math.sin(a)*rad))
        objects.append(bevel(mesh('voussoir',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],m['carved_stone']),.022))
    # Continuous archivolt follows the curved crown.
    for y in [-.39,.39]:
        end=math.pi*.4 if broken else math.pi
        objects.append(tube('archivolt',[(math.cos(a)*(r+.43),y,spring+math.sin(a)*(r+.43)) for a in [end*j/48 for j in range(49)]],.045,m['ancient_stone']))
    return objects

def wall(m, broken=False):
    objects=[]
    for row in range(6):
        boundaries=[-1.5,-1.2,-.6,0,.6,1.2,1.5] if row%2 else [-1.5,-.9,-.3,.3,.9,1.5]
        for j,(left,right) in enumerate(zip(boundaries,boundaries[1:])):
            crown=[6,5,4,3,2,3][min(j,5)]
            if broken and row>=crown: continue
            x=(left+right)*.5
            h=.49 if not broken or row<crown-1 else RNG.uniform(.28,.5)
            objects.append(stone('eroded ashlar',(x,(row%2)*.025,row*.5+h*.5),(right-left+.015,.5,h),m['ancient_stone'],.035))
    objects.append(stone('plinth',(0,0,.14),(3.03,.71,.28),m['carved_stone']))
    if not broken:
        objects.append(stone('cornice',(0,0,3.06),(3.06,.73,.23),m['carved_stone']))
        for j in [-1,0,1]:
            # Blind arcaded relief on the front face.
            objects.append(tube('blind arch',[(j*.82+math.cos(a)*.31,-.29,1.72+math.sin(a)*.44) for a in [math.pi*k/24 for k in range(25)]],.042,m['carved_stone']))
    return objects

def statue(m):
    objects=[stone('pedestal',(0,0,.2),(1.3,1.1,.4),m['carved_stone'])]
    objects.append(loft('folded robe',[(.4,.53,.4,0,0),(.65,.49,.35,0,0),(1.25,.32,.27,0,0),(1.9,.25,.22,0,0),(2.28,.39,.25,0,0),(2.42,.23,.2,0,0)],m['carved_stone'],48,.15))
    objects.append(loft('veiled head',[(2.36,.2,.2,0,0),(2.55,.26,.23,0,0),(2.83,.2,.19,0,0),(3,.06,.06,0,-.035)],m['carved_stone'],24,.06))
    for side in [-1,1]:
        objects.append(tube('prayer arms',[(side*.34,0,2.22),(side*.48,-.14,1.94),(side*.14,-.36,2.06)],.115,m['carved_stone']))
    return objects

def build(m):
    assets={}
    def add(name,objects): assets[name]=join(objects,name+'_LOD0')
    for variant in ['a','b','c']:
        pieces=[stone('foundation',(0,0,-.39),(1.018,1.018,.72),m['ancient_stone'],.013)]
        # Polygonal flagstones overlap below the walk surface, avoiding grid cracks.
        pieces.append(stone('walking slab',(0,0,-.075),(1.015,1.015,.15),m['ancient_stone'],.009))
        add('ruins_floor_'+variant,pieces)
    add('ruins_floor_broken',[stone('fracture',(x,y,-.1),(sx,sy,.2),m['ancient_stone'],.035) for x,y,sx,sy in [(-.25,0,.48,1),(.25,-.2,.48,.55),(.2,.32,.5,.4)]])
    add('ruins_column_a',column(m)); add('ruins_column_b',column(m)); add('ruins_column_broken',column(m,True))
    add('ruins_arch_a',arch(m)); add('ruins_arch_broken',arch(m,True))
    add('ruins_doorway',arch(m,width=4.2))
    add('ruins_wall_a',wall(m)); add('ruins_wall_broken',wall(m,True))
    for broken in [False,True]:
        pieces=[]
        for i in range(8):
            pieces.append(stone('tread',(0,i*.4,i*.1-.1),(2.8,.43,.2*(i+1)),m['carved_stone'],.045 if broken else .014))
        add('ruins_stairs_broken' if broken else 'ruins_stairs',pieces)
    rail=[]
    for x in [-1.4,-.7,0,.7,1.4]:
        rail.append(loft('baluster',[(.12,.12,.12,x,0),(.28,.09,.09,x,0),(.58,.14,.14,x,0),(.87,.07,.07,x,0),(1,.12,.12,x,0)],m['carved_stone'],12))
    rail.extend([stone('coping',(0,0,z),(3,.35,.16),m['carved_stone'],.012) for z in [.08,1.05]])
    add('ruins_railing',rail)
    bridge=[]
    for i in range(3):
        bridge.append(stone('bridge deck',(0,i-1,-.22),(2.8,1.01,.42),m['ancient_stone'],.02))
    underneath=arch(m,width=2.3)
    for obj in underneath:
        for v in obj.data.vertices: v.co.z-=4.6
    bridge.extend(underneath); add('ruins_bridge',bridge)
    add('ruins_rubble',[stone('fractured rubble',(RNG.uniform(-.65,.65),RNG.uniform(-.45,.45),RNG.uniform(.03,.17)),(RNG.uniform(.15,.5),RNG.uniform(.15,.4),RNG.uniform(.12,.3)),m['moss_stone'] if i%4==0 else m['ancient_stone'],.055) for i in range(12)])
    add('ruins_statue',statue(m))
    altar=[stone('altar base',(0,0,.15),(1.8,1.1,.3),m['ancient_stone']),stone('altar top',(0,0,1),(1.9,1.15,.2),m['carved_stone'])]
    altar.append(loft('altar support',[(.3,.7,.4,0,0),(.45,.55,.3,0,0),(.85,.6,.34,0,0),(.9,.8,.45,0,0)],m['carved_stone'],16,.06))
    add('ruins_altar',altar)
    add('ruins_tomb',[stone('sarcophagus',(0,0,.45),(1.1,2,.85),m['ancient_stone']),stone('lid',(0,0,.95),(1.25,2.15,.2),m['carved_stone'])])
    add('ruins_pedestal',[stone('pedestal',(0,0,.12),(1.2,1.2,.24),m['carved_stone']),* [loft('base',[(.24,.45,.45,0,0),(.4,.35,.35,0,0),(1.3,.35,.35,0,0),(1.45,.52,.52,0,0)],m['carved_stone'],16)]])
    brazier=[loft('brazier stem',[(0,.25,.25,0,0),(.12,.23,.23,0,0),(.2,.1,.1,0,0),(.8,.08,.08,0,0),(.94,.24,.24,0,0),(1.08,.3,.3,0,0)],m['aged_bronze'],20)]
    for i in range(8):
        a=math.tau*i/8
        brazier.append(tube('cage tine',[(math.cos(a)*r,math.sin(a)*r,z) for r,z in [(.14,.9),(.3,1.1),(.28,1.35)]],.018,m['worn_iron']))
    add('ruins_brazier',brazier)
    # Deep supports are authored long enough that their bottoms are below opaque fog.
    add('ruins_deep_support',[loft('pier',[(-65,.75,.7,0,0),(-30,.68,.65,0,0),(-8,.6,.6,0,0),(0,.65,.65,0,0)],m['ancient_stone'],16,.045)])
    return assets
