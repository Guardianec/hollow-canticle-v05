import bpy
import math
from common import loft, mesh, bevel, tube, join

def build(m):
    result={}
    designs={
        'oathkeeper':('sword',1,'heavy_cloth'), 'moth':('twins',.82,'crimson_cloth'),
        'lancer':('spear',.94,'pilgrim_linen'), 'bellbearer':('great',1.17,'heavy_cloth'),
        'warden':('sword',1.05,'heavy_cloth'), 'duelist':('sword',.87,'crimson_cloth'),
        'archer':('bow',.83,'heavy_cloth'), 'assassin':('twins',.78,'crimson_cloth'),
        'monk':('bell',.85,'pilgrim_linen'), 'hexer':('bell',.88,'pilgrim_linen'),
        'brute':('great',1.33,'crimson_cloth'), 'saint':('bell',.87,'crimson_cloth'),
    }
    for name,(weapon,width,cloth) in designs.items():
        shield=name=='warden'
        hood=name in ['moth','assassin','archer','monk','hexer','lancer','shinobi']
        robed=name in ['monk','hexer','saint']
        parts=[]
        def piece(obj,bone):
            group=obj.vertex_groups.new(name=bone)
            group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
            parts.append(obj)
            return obj
        def shape(label,rings,mat,bone,sides=24,folds=0):
            if mat=='heavy_cloth': mat=cloth
            if robed and mat=='worn_iron' and label not in ['helmet','visor','diamond blade']: mat='worn_leather'
            return piece(loft(label,rings,m[mat],sides,folds),bone)
        shape('gambeson',[(.84,.25,.17,0,0),(1,.23,.16,0,0),(1.22,.3,.18,0,0),(1.43,.34,.17,0,0),(1.51,.23,.14,0,0)],'heavy_cloth','torso',32,.055)
        breast=shape('cuirass',[(1.02,.225,.155,0,-.01),(1.1,.245,.18,0,-.01),(1.24,.295,.205,0,-.015),(1.36,.30,.185,0,0),(1.44,.215,.13,0,0)],'worn_iron','torso',40)
        for v in breast.data.vertices:
            if v.co.y<-.08:
                v.co.y-=max(0,1-abs(v.co.x)/.30)*.035
        for k in range(3):
            z=1.015-k*.045
            shape('overlapping fauld',[(z-.035,.26+k*.012,.18,0,0),(z+.025,.24+k*.01,.17,0,0)],'worn_iron','torso',32)
        # Raised breastplate ridges follow the sculpted torso rather than a box face.
        for side in [-1,1]:
            piece(tube('cuirass seam',[(0,-.24,1.12),(side*.17,-.24,1.31),(side*.25,-.15,1.43)],.012,m['aged_bronze']),'torso')
        shape('belt',[(.97,.255,.187,0,0),(1.025,.25,.185,0,0)],'worn_leather','torso')
        for side in [-1,1]:
            x=side*.17
            leg='rightLeg' if side<0 else 'leftLeg'; shin='rightShin' if side<0 else 'leftShin'
            foot='rightFoot' if side<0 else 'leftFoot'
            trouser=shape('trouser',[(.39,.085,.10,x,0),(.45,.105,.11,x,0),(.52,.115,.12,x,0),(.65,.125,.13,x,0),(.8,.13,.13,x,0),(.91,.12,.115,x,0)],'heavy_cloth',leg,32,.025)
            lower=trouser.vertex_groups.new(name=shin)
            for v in trouser.data.vertices:
                weight=max(0,min(1,(.53-v.co.z)/.13))
                trouser.vertex_groups[leg].add([v.index],1-weight,'REPLACE')
                lower.add([v.index],weight,'REPLACE')
            shape('greave',[(.1,.09,.1,x,0),(.22,.1,.12,x,0),(.39,.12,.14,x,-.02),(.46,.1,.115,x,0)],'worn_iron','rightShin' if side<0 else 'leftShin')
            shape('boot',[(.02,.095,.145,x,-.055),(.065,.105,.16,x,-.06),(.12,.095,.135,x,-.04),(.22,.085,.09,x,0)],'worn_leather',foot,32)
            shape('sabatons',[(.065,.10,.155,x,-.06),(.09,.101,.145,x,-.05),(.14,.085,.10,x,-.02)],'worn_iron',foot,24)
            shape('knee shield',[(.39,.09,.035,x,-.12),(.45,.125,.065,x,-.14),(.52,.085,.04,x,-.13)],'worn_iron','rightLeg' if side<0 else 'leftLeg')
            arm='rightArm' if side<0 else 'leftArm'; fore='rightForearm' if side<0 else 'leftForearm'
            sx=side*.36
            sleeve=shape('sleeve',[(.98,.075,.085,sx,0),(1.04,.085,.09,sx,0),(1.10,.09,.095,sx,0),(1.2,.095,.10,sx,0),(1.4,.105,.11,sx,0)],'heavy_cloth',arm,32,.025)
            lower=sleeve.vertex_groups.new(name=fore)
            for v in sleeve.data.vertices:
                weight=max(0,min(1,(1.13-v.co.z)/.15))
                sleeve.vertex_groups[arm].add([v.index],1-weight,'REPLACE')
                lower.add([v.index],weight,'REPLACE')
            shape('vambrace',[(.77,.075,.085,sx,0),(.88,.1,.11,sx,0),(.99,.105,.11,sx,0),(1.04,.09,.09,sx,0)],'worn_iron',fore)
            shape('gauntlet',[(.66,.07,.075,sx,-.015),(.73,.085,.09,sx,0),(.82,.075,.08,sx,0)],'worn_leather',fore)
            # Open curved plates hang over the shoulder instead of stacked closed rings.
            count=3 if side==1 or shield else 2
            for k in range(count):
                verts=[]; faces=[]
                for j in range(5):
                    t=(k+j*.22)/3
                    for i in range(17):
                        a=-math.pi/2+math.pi*i/16
                        verts.append((side*(.29+math.cos(a)*(.075+.16*t)),math.sin(a)*(.145+.018*t),1.49-.17*t-abs(math.sin(a))*.04))
                for j in range(4):
                    for i in range(16):
                        a=j*17+i; faces.append((a,a+1,a+18,a+17))
                plate=piece(mesh('forged shoulder lame',verts,faces,m['worn_iron'],True),arm)
                solid=plate.modifiers.new('Plate thickness','SOLIDIFY'); solid.thickness=.014
                bpy.context.view_layer.objects.active=plate; bpy.ops.object.modifier_apply(modifier=solid.name)
                bevel(plate,.007,2)
                if k==count-1:
                    piece(tube('shoulder rolled rim',verts[-17:],.008,m['aged_bronze']),arm)
            # Separate folded tabard panels leave the legs free to stride.
            for back in [-1,1]:
                verts=[]; faces=[]
                for j in range(9):
                    t=j/8
                    for i in range(7):
                        u=i/6
                        verts.append((side*(.025+u*(.19+.045*t)),back*(.18+.055*t)+math.sin(u*math.pi*1.5+side)*.018,(1.0-.62*t)+(math.sin(i*2.4)*.018 if j==8 else 0)))
                for j in range(8):
                    for i in range(6):
                        a=j*7+i; faces.append((a,a+1,a+8,a+7))
                piece(mesh('split tabard',verts,faces,m['heavy_cloth'],True),'torso')
        # Faceted pointed helmet, enclosed in a lowered cowl on the Oathkeeper.
        shape('neck',[(1.44,.095,.09,0,0),(1.65,.095,.085,0,0)],'worn_leather','head')
        shape('gorget',[(1.43,.16,.12,0,0),(1.48,.145,.115,0,0),(1.53,.105,.095,0,0)],'worn_iron','torso',32)
        shape('helmet',[(1.61,.105,.105,0,0),(1.69,.13,.125,0,0),(1.80,.12,.11,0,.015),(1.90,.015,.025,0,.025)],cloth if hood else 'worn_iron','head',40)
        shape('visor',[(1.61,.095,.045,0,-.105),(1.67,.115,.045,0,-.12),(1.72,.12,.018,0,-.125)],'heavy_cloth' if hood else 'worn_iron','head',24)
        piece(tube('brow rim',[(-.12,-.09,1.748),(0,-.145,1.74),(.12,-.09,1.748)],.009,m['aged_bronze']),'head')
        # Dark eye slit remains recessed under the rim.
        piece(tube('eye slit',[(-.085,-.131,1.727),(.085,-.131,1.727)],.008,m['heavy_cloth']),'head')
        # Cape is a continuous corrugated surface weighted across three bones.
        verts=[]; faces=[]
        for j in range(17):
            t=j/16
            for i in range(17):
                u=i/16
                verts.append(((u-.5)*(.51+.22*t),.17+.18*t+math.cos(u*math.pi*6+t)*(.012+.014*t),1.46-t*1.13+(math.sin(i*1.1)*.025 if j==16 else 0)))
        for j in range(16):
            for i in range(16):
                a=j*17+i; faces.append((a,a+17,a+18,a+1))
        cape=mesh('folded cloak',verts,faces,m[cloth],True)
        for k in range(3):
            group=cape.vertex_groups.new(name=f'cape{k}')
            for j in range(17):
                w=max(0,1-abs(j/16*2-k))
                if w: group.add(list(range(j*17,j*17+17)),w,'REPLACE')
        parts.append(cape)
        if robed:
            shape('long folded vestment',[(.12,.37,.26,0,0),(.3,.34,.24,0,0),(.65,.29,.22,0,0),(.98,.25,.18,0,0)],cloth,'torso',48,.08)
        # Authored diamond-section sword with a tapering tip.
        x=-.36
        if weapon in ['sword','twins','great','spear']:
            length=1.4 if weapon=='great' else .60 if weapon in ['twins','spear'] else 1
            base=1.65 if weapon=='spear' else .88
            broad=.105 if weapon=='great' else .047
            shape('weapon grip',[(.35 if weapon=='spear' else .65,.029,.029,x,-.02),(base-.03,.029,.029,x,-.02)],'worn_leather','blade',12)
            piece(tube('quillons',[(x-.15,-.02,base),(x,-.02,base-.025),(x+.15,-.02,base)],.018,m['aged_bronze']),'blade')
            shape('diamond blade',[(base,broad,.015,x,-.02),(base+length*.8,broad*.65,.012,x,-.02),(base+length,.001,.001,x,-.02)],'worn_iron','blade',4)
            if weapon=='twins':
                shape('offhand grip',[(.65,.028,.028,.36,-.02),(.87,.028,.028,.36,-.02)],'worn_leather','offhand',12)
                shape('offhand blade',[(.88,.047,.012,.36,-.02),(1.35,.032,.012,.36,-.02),(1.49,.001,.001,.36,-.02)],'worn_iron','offhand',4)
        elif weapon=='bow':
            piece(tube('recurved bow',[(x+math.sin(t)*.24,-.04,.7+math.cos(t)*.65) for t in [math.pi*i/32 for i in range(33)]],.028,m['worn_leather']),'blade')
            piece(tube('bowstring',[(x,-.04,.05),(x,-.04,1.35)],.003,m['pilgrim_linen']),'blade')
            for i in range(4):
                piece(tube('quiver arrow',[(.17+i*.035,.23,1.1),(.17+i*.035,.23,1.72)],.008,m['worn_leather']),'torso')
        else:
            shape('ceremonial staff',[(.25,.026,.026,x,-.02),(1.95,.026,.026,x,-.02)],'aged_bronze','blade',12)
            shape('hanging bell',[(1.62,.11,.11,x,-.02),(1.7,.1,.1,x,-.02),(1.83,.04,.04,x,-.02)],'aged_bronze','blade',24)
        if name=='saint':
            for i in range(24):
                a=math.tau*i/24
                piece(tube('broken nimbus',[(math.cos(a)*.39,.12,1.77+math.sin(a)*.39),(math.cos(a)*(.49 if i%3 else .58),.12,1.77+math.sin(a)*(.49 if i%3 else .58))],.009,m['aged_bronze']),'head')
            piece(tube('halo ring',[(math.cos(math.tau*i/64)*.39,.12,1.77+math.sin(math.tau*i/64)*.39) for i in range(65)],.012,m['aged_bronze']),'head')
        if shield:
            start=len(parts)
            verts=[(.36+x,-.15,1.35+z) for x,z in [(-.27,0),(.27,0),(.24,-.65),(0,-.92),(-.24,-.65)]]
            obj=piece(bevel(mesh('kite shield',verts,[tuple(range(5))],m['worn_iron']),.015),'leftForearm')
            solid=obj.modifiers.new('shield thickness','SOLIDIFY'); solid.thickness=.055
            bpy.context.view_layer.objects.active=obj; bpy.ops.object.modifier_apply(modifier=solid.name)
            piece(tube('shield rim',verts+[verts[0]],.025,m['aged_bronze']),'leftForearm')
            piece(tube('shield oath',[(.36,-.18,.56),(.36,-.18,1.28)],.018,m['aged_bronze']),'leftForearm')
            from mathutils import Matrix, Vector
            pivot=Vector((.36,0,1.06))
            correction=Matrix.Rotation(.85,3,'X')
            for part in parts[start:]:
                for vertex in part.data.vertices: vertex.co=pivot+correction@(vertex.co-pivot)
        body=join(parts,name+'_body')
        for vertex in body.data.vertices: vertex.co.x*=width
        result[name]=make_rig(name,body,width,weapon)
    result['beast']=build_beast(m)
    result['shinobi']=build_shinobi(m)
    return result

def build_shinobi(m):
    """A separate cloth-and-lacquer silhouette; only the semantic rig is shared."""
    parts=[]
    def piece(obj,bone):
        obj.vertex_groups.new(name=bone).add(list(range(len(obj.data.vertices))),1,'REPLACE')
        parts.append(obj)
        return obj
    def shape(label,rings,material,bone,sides=24,folds=0):
        return piece(loft(label,rings,m[material],sides,folds),bone)
    def plate(label,outline,bone,material='shinobi_lacquer'):
        n=len(outline)
        verts=outline+[(x,y+.012,z) for x,y,z in outline]
        faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        return bevel(piece(mesh(label,verts,faces,m[material]),bone),.004,1)
    shape('black cross-wrapped jacket',[(.86,.22,.14,0,0),(1.01,.195,.135,0,0),(1.23,.245,.155,0,0),(1.43,.27,.14,0,0),(1.5,.16,.11,0,0)],'shinobi_cloth','torso',32,.04)
    # Overlapping diagonal panels replace the other Pilgrims' forged breastplate.
    plate('overlapping jacket lapel',[(-.23,-.15,1.42),(-.08,-.175,1.47),(.18,-.16,1.03),(.07,-.165,1.0)],'torso','shinobi_cloth')
    for i in range(4):
        z=1.15+i*.072
        plate('offset chest lamella',[(.025,-.175,z),(.235,-.15,z+.025),(.24,-.153,z+.085),(.015,-.18,z+.06)],'torso')
    shape('wound waist sash',[(.94,.23,.158,0,0),(1.03,.22,.155,0,0),(1.07,.215,.15,0,0)],'shinobi_cloth','torso',32,.035)
    piece(tube('diagonal binding cord',[(-.21,-.165,1.4),(.06,-.185,1.08),(.21,-.16,.99)],.009,m['worn_leather']),'torso')
    plate('small tarnished sash clasp',[(-.055,-.17,.99),(.015,-.17,.99),(.015,-.17,1.035),(-.055,-.17,1.035)],'torso','aged_bronze')
    for side in [-1,1]:
        x=side*.17; leg='rightLeg' if side<0 else 'leftLeg'; shin='rightShin' if side<0 else 'leftShin'; foot='rightFoot' if side<0 else 'leftFoot'
        trouser=shape('loose tapered black trousers',[(.42,.072,.082,x,0),(.58,.12,.12,x,0),(.77,.145,.14,x,.01),(.91,.12,.12,x,0)],'shinobi_cloth',leg,28,.05)
        lower=trouser.vertex_groups.new(name=shin)
        for v in trouser.data.vertices:
            weight=max(0,min(1,(.54-v.co.z)/.13)); trouser.vertex_groups[leg].add([v.index],1-weight,'REPLACE'); lower.add([v.index],weight,'REPLACE')
        shape('cloth gaiter',[(.1,.068,.085,x,0),(.28,.078,.085,x,0),(.46,.075,.085,x,0)],'shinobi_cloth',shin)
        for k in range(5):
            z=.16+k*.055
            shape('gaiter wrapping',[(z,.076,.092,x,-.003),(z+.02,.075,.09,x,-.003)],'shinobi_cloth',shin,20)
        # Soft divided toes and no steel sabatons or knee shields.
        for toe in [-1,1]:
            shape('split soft boot',[(.025,.037,.125,x+toe*.039,-.055),(.08,.041,.135,x+toe*.039,-.06),(.14,.033,.065,x+toe*.035,.01)],'shinobi_cloth',foot,20)
        arm='rightArm' if side<0 else 'leftArm'; fore='rightForearm' if side<0 else 'leftForearm'; sx=side*.36
        sleeve=shape('fitted black sleeve',[(1.0,.065,.068,sx,0),(1.15,.072,.077,sx,0),(1.39,.08,.085,sx,0),(1.45,.055,.065,sx,0)],'shinobi_cloth',arm,24,.04)
        lower=sleeve.vertex_groups.new(name=fore)
        for v in sleeve.data.vertices:
            weight=max(0,min(1,(1.13-v.co.z)/.15)); sleeve.vertex_groups[arm].add([v.index],1-weight,'REPLACE'); lower.add([v.index],weight,'REPLACE')
        shape('wrapped forearm',[(.76,.06,.065,sx,0),(.92,.075,.08,sx,0),(1.05,.065,.07,sx,0)],'shinobi_cloth',fore)
        for k in range(4):
            z=.79+k*.055
            shape('forearm binding',[(z,.07,.076,sx,0),(z+.024,.069,.075,sx,0)],'shinobi_cloth',fore,20)
        shape('black glove',[(.66,.058,.062,sx,-.015),(.75,.07,.074,sx,-.005),(.8,.061,.066,sx,0)],'shinobi_cloth',fore)
        for back in [-1,1]:
            plate('short split jacket skirt',[(side*.04,back*.16,.96),(side*.23,back*.145,.96),(side*.27,back*.19,.61),(side*.11,back*.2,.69)],'torso','shinobi_cloth')
    # One angular shoulder guard; the sword shoulder stays soft and unarmoured.
    for i in range(3):
        z=1.43-i*.065
        plate('left angular shoulder plate',[(.27,-.12,z+.08),(.43,-.14,z+.045),(.49,-.10,z-.02),(.45,.10,z-.02),(.27,.10,z+.08)],'leftArm')
    plate('left mechanical forearm guard',[(.3,-.085,.82),(.42,-.085,.82),(.43,-.08,1.04),(.29,-.08,1.03)],'leftForearm')
    shape('masked head',[(1.5,.08,.075,0,0),(1.61,.11,.095,0,-.015),(1.73,.115,.10,0,0),(1.79,.075,.075,0,.01)],'shinobi_cloth','head',32)
    shape('low wrapped face mask',[(1.54,.105,.045,0,-.07),(1.65,.112,.035,0,-.09),(1.68,.1,.025,0,-.095)],'shinobi_cloth','head')
    # Broad, shallow travelling hat gives a clearly different head silhouette.
    shape('low angular travelling hat',[(1.735,.345,.285,0,-.035),(1.76,.34,.28,0,-.035),(1.875,.115,.105,0,.015),(1.9,.04,.035,0,.015)],'shinobi_lacquer','head',12)
    piece(tube('hat bound edge',[(math.cos(math.tau*i/12)*.345,-.035+math.sin(math.tau*i/12)*.285,1.74) for i in range(13)],.008,m['shinobi_cloth']),'head')
    shape('short black neck wrap',[(1.46,.12,.115,0,0),(1.56,.14,.12,0,0),(1.61,.12,.10,0,0)],'shinobi_cloth','torso',28,.04)
    for side,length in [(-1,.48),(1,.65)]:
        verts=[]; faces=[]
        for j in range(9):
            t=j/8
            for i in range(4):
                u=i/3
                verts.append((side*(.05+u*.11+t*.12),.15+t*.11+math.sin(t*5+u)*.012,1.53-t*length+(u-.5)*.03))
        for j in range(8):
            for i in range(3):
                a=j*4+i; faces.append((a,a+1,a+5,a+4))
        tail=mesh('short split scarf tail',verts,faces,m['shinobi_cloth'],True)
        for k in range(3):
            group=tail.vertex_groups.new(name=f'cape{k}')
            for j in range(9):
                weight=max(0,1-abs(j/8*2-k))
                if weight: group.add(list(range(j*4,j*4+4)),weight,'REPLACE')
        parts.append(tail)
    x=-.36
    shape('long wrapped katana grip',[(.64,.025,.025,x,-.02),(.89,.025,.025,x,-.02)],'shinobi_cloth','blade',16)
    shape('plain katana disc guard',[(.885,.06,.035,x,-.02),(.91,.06,.035,x,-.02)],'shinobi_lacquer','blade',24)
    shape('curved single edge katana',[(.91,.03,.009,x,-.02),(1.3,.028,.008,x+.018,-.02),(1.66,.019,.006,x+.065,-.02),(1.87,.001,.001,x+.115,-.02)],'worn_iron','blade',4)
    piece(tube('black lacquer scabbard',[(.2,.1,1.02),(.34,.18,.77),(.53,.26,.4)],.031,m['shinobi_lacquer']),'torso')
    shape('compact springlock grip',[(.67,.04,.05,.36,-.02),(.84,.045,.055,.36,-.02)],'shinobi_lacquer','offhand',12)
    piece(tube('short bronze springlock barrel',[(.36,-.02,.81),(.36,-.02,1.03)],.031,m['aged_bronze']),'offhand')
    piece(tube('external winding spring',[(.36+math.cos(t)*.04,-.02+math.sin(t)*.04,.81+t*.008) for t in [i*.3 for i in range(36)]],.006,m['worn_iron']),'offhand')
    rig=make_rig('shinobi',join(parts,'shinobi_body'),1,'shinobi')
    rig['design']='black wrapped cloth; asymmetric lacquer lamella; travelling hat; split scarf; no knight cuirass'
    return rig

def make_rig(name,body,width,weapon):
        armdata=bpy.data.armatures.new(name+'_skeleton'); rig=bpy.data.objects.new(name+'_LOD0',armdata)
        bpy.context.collection.objects.link(rig); bpy.context.view_layer.objects.active=rig
        bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
        definitions=[('root',(0,0,0),None),('torso',(0,0,.94),'root'),('head',(0,0,1.55),'torso'),
                     ('rightArm',(-.36,0,1.4),'torso'),('rightForearm',(-.36,0,1.06),'rightArm'),
                     ('leftArm',(.36,0,1.4),'torso'),('leftForearm',(.36,0,1.06),'leftArm'),
                     ('rightLeg',(-.17,0,.86),'root'),('rightShin',(-.17,0,.46),'rightLeg'),
                     ('leftLeg',(.17,0,.86),'root'),('leftShin',(.17,0,.46),'leftLeg'),('blade',(-.36,-.02,.70),'rightForearm'),
                     ('rightFoot',(-.17,0,.12),'rightShin'),('leftFoot',(.17,0,.12),'leftShin'),
                     ('offhand',(.36,-.02,.70),'leftForearm'),('cape0',(0,.18,1.46),'torso'),('cape1',(0,.25,.95),'cape0'),('cape2',(0,.33,.45),'cape1')]
        for bone,head,parent in definitions:
            head=(head[0]*width,head[1],head[2])
            b=armdata.edit_bones.new(bone); b.head=head; b.tail=(head[0],head[1],head[2]+.15)
            if parent: b.parent=armdata.edit_bones[parent]
        bpy.ops.object.mode_set(mode='OBJECT')
        body.parent=rig; modifier=body.modifiers.new('Shared semantic skeleton','ARMATURE'); modifier.object=rig
        rig['weapon']=weapon
        return rig

def build_beast(m):
    parts=[]
    def shape(label,rings,material,bone,sides=24,folds=0):
        obj=loft(label,rings,m[material],sides,folds)
        group=obj.vertex_groups.new(name=bone)
        group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
        parts.append(obj)
        return obj
    shape('corded torso',[(.8,.22,.18,0,0),(1,.29,.21,0,.04),(1.28,.38,.25,0,.07),(1.49,.28,.23,0,-.01)],'worn_leather','torso',40,.045)
    shape('hunched mane',[(1.10,.25,.15,0,.2),(1.4,.4,.24,0,.18),(1.67,.24,.18,0,.09)],'fungal_skin','torso',36,.14)
    shape('blind skull',[(1.48,.13,.17,0,-.08),(1.58,.19,.22,0,-.12),(1.76,.16,.18,0,-.08),(1.84,.09,.11,0,-.02)],'worn_leather','head',32,.03)
    shape('split muzzle',[(1.45,.10,.12,0,-.28),(1.52,.14,.15,0,-.23),(1.62,.13,.14,0,-.19)],'aged_bronze','head',24)
    for side in [-1,1]:
        leg='rightLeg' if side<0 else 'leftLeg'; shin='rightShin' if side<0 else 'leftShin'
        arm='rightArm' if side<0 else 'leftArm'; fore='rightForearm' if side<0 else 'leftForearm'
        x=side*.17
        shape('sinewed thigh',[(.43,.075,.09,x,.03),(.56,.125,.13,x,.03),(.82,.16,.16,x,0),(.94,.11,.12,x,0)],'worn_leather',leg,32,.05)
        shape('hock',[(.12,.07,.09,x,.04),(.26,.08,.12,x,.09),(.44,.10,.12,x,.02)],'worn_leather',shin,24,.04)
        shape('splayed foot',[(.02,.115,.19,x,-.09),(.09,.12,.20,x,-.09),(.17,.07,.10,x,.02)],'worn_leather','rightFoot' if side<0 else 'leftFoot')
        x=side*.36
        shape('corded upper arm',[(1.03,.075,.09,x,0),(1.22,.14,.14,x,0),(1.45,.14,.16,x,.02)],'worn_leather',arm,28,.05)
        shape('elongated forearm',[(.61,.09,.12,x,-.03),(.78,.13,.13,x,0),(1.05,.09,.10,x,0)],'worn_leather',fore,28,.07)
        for i in range(3):
            cx=x+(i-1)*.065
            shape('hooked talon',[(.38,.002,.002,cx,-.20),(.46,.016,.025,cx,-.18),(.61,.024,.03,cx,-.09),(.72,.025,.03,cx,-.04)],'aged_bronze',fore,12)
        for i in range(5):
            z=1.08+i*.11
            shape('broken dorsal thorn',[(z,.065,.045,side*.15,.28),(z+.13,.028,.024,side*.20,.38),(z+.22,.001,.001,side*.24,.42)],'fungal_skin','torso',12)
    return make_rig('beast',join(parts,'beast_body'),1,'claw')
