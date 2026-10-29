"""Deterministic organic fungi: folded surfaces, torn rims, radial gills and root webs."""
import math
from common import loft, mesh, tube, join

KINDS=['tiny_cluster','thin_cluster','wide_cap','shelf','cup','lantern','spore_sac','landmark','hanging','infestation']

def cap(m,height,radius,seed=0,cup=False,shelf=False):
    verts=[]; faces=[]; sides=48; rings=9
    for j in range(rings):
        t=j/(rings-1)
        for i in range(sides):
            a=math.tau*i/sides
            edge=1+.09*math.sin(a*3+seed)+.05*math.sin(a*7+1.7*seed)
            tear=.07*max(0,math.sin(a*11+seed))**8*t**6
            r=radius*max(.015,t)*edge
            z=height+radius*(.4*(1-t*t)+.045*math.sin(a*9+seed)*t)-tear*radius
            if cup: z=height+radius*(.1+.65*t*t)+.06*math.sin(a*5)*t
            x=math.cos(a)*r+.12*math.sin(t*2+seed)*t
            y=math.sin(a)*r*(.58 if shelf else .83)
            verts.append((x,y,z))
    for j in range(rings-1):
        for i in range(sides):
            a=j*sides+i; b=j*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    skin=mesh('asymmetric folded cap',verts,faces,m['fungal_ochre' if seed%3==0 else 'fungal_skin'],True)
    # A closed underside with relief gills gives the rim thickness and a readable interior.
    under=loft('soft undercap',[(height-.13,radius*.92,radius*(.5 if shelf else .74),0,0),(height-.06,radius,radius*(.58 if shelf else .83),0,0)],m['fungal_teal'],48,.045,seed)
    parts=[skin,under]
    for k in range(18):
        a=math.tau*k/18+seed
        points=[]
        for j in range(8):
            t=.15+j/7*.8
            points.append((math.cos(a)*radius*t,math.sin(a)*radius*t*(.58 if shelf else .83),height-.13+.04*math.sin(t*math.pi)))
        parts.append(tube('luminous radial gill',points,max(.007,radius*.008),m['fungal_teal' if seed%2 else 'fungal_gills']))
    return parts

def roots(m,spread=1,seed=0):
    parts=[]
    for k in range(9):
        a=math.tau*k/9+seed
        points=[]
        for j in range(12):
            t=j/11
            points.append((math.cos(a+t*.8)*t*spread,math.sin(a+t*.8)*t*spread,.035+.05*math.sin(t*7+k)))
        parts.append(tube('mycelial root',points,.012+(k%3)*.006,m['fungal_teal' if k%4==0 else 'moss_stone']))
    return parts

def mushroom(m,h,r,seed=0,cup=False,shelf=False):
    stem=loft('fibrous curved stalk',[(0,.11,.10,0,0),(.22*h,.09,.08,.08,0),(.55*h,.07,.09,-.06,.05),(.85*h,.09,.10,.05,0),(h,.14,.12,0,0)],m['fungal_ochre'],24,.12,seed)
    return [stem,*cap(m,h,r,seed,cup,shelf)]

def build(m):
    assets={}
    for variant,kind in enumerate(KINDS):
        pieces=[]
        if kind in ['tiny_cluster','thin_cluster']:
            for i in range(5 if kind=='tiny_cluster' else 4):
                h=(.16 if kind=='tiny_cluster' else .85)*(1+i*.19)
                group=mushroom(m,h,h*(.65 if kind=='tiny_cluster' else .18),variant+i)
                for obj in group:
                    for v in obj.data.vertices: v.co.x+=math.cos(i*2.4)*.25; v.co.y+=math.sin(i*2.4)*.24
                pieces.extend(group)
        elif kind=='shelf':
            for i in range(3):
                group=cap(m,.25+i*.27,.55-i*.07,variant+i,shelf=True)
                for obj in group:
                    for v in obj.data.vertices: v.co.y+=i*.08
                pieces.extend(group)
        elif kind=='cup': pieces=mushroom(m,.22,.44,variant,cup=True)
        elif kind=='lantern': pieces=mushroom(m,2.5,.65,variant)+roots(m,.7,variant)
        elif kind=='wide_cap': pieces=mushroom(m,.95,1.25,variant)+roots(m,1.3,variant)
        elif kind=='landmark': pieces=mushroom(m,7.5,4.1,variant)+roots(m,3,variant)
        elif kind=='spore_sac':
            pieces=[loft('veined spore bulb',[(0,.25,.23,0,0),(.2,.42,.36,.07,0),(.6,.52,.47,.03,0),(1,.34,.28,-.06,.03),(1.2,.06,.04,0,0)],m['fungal_skin'],40,.13,variant),*roots(m,.8,variant)]
            for k in range(8):
                a=math.tau*k/8
                pieces.append(tube('bulb emissive seam',[(math.cos(a)*r,math.sin(a)*r,z) for z,r in [(.1,.3),(.4,.49),(.7,.46),(1,.3),(1.16,.09)]],.012,m['fungal_gills']))
        elif kind=='hanging':
            for i in range(7):
                x=(i-3)*.16; length=.8+(i%3)*.25
                pieces.append(tube('hanging tendril',[(x,.1,2),(x+.07,-.03,1.6),(x-.04,.04,2-length)],.024,m['moss_stone']))
                group=cap(m,2-length,.11,variant+i,cup=True)
                for obj in group:
                    for v in obj.data.vertices: v.co.x+=x
                pieces.extend(group)
        else:
            pieces=roots(m,1.25,variant)
            for i in range(6):
                group=cap(m,.07+i*.025,.22+(i%3)*.08,variant+i,shelf=True)
                for obj in group:
                    for v in obj.data.vertices: v.co.x+=(i%3-.8)*.55;v.co.y+=(i//3-.5)*.8
                pieces.extend(group)
        assets['fungal_'+kind]=join(pieces,'fungal_'+kind+'_LOD0')
    return assets
