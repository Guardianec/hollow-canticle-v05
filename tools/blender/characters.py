import bpy
import math
from common import loft, mesh, bevel, tube, join

def build(m):
    result={}
    for name in ['oathkeeper','warden']:
        shield=name=='warden'
        parts=[]
        def piece(obj,bone):
            group=obj.vertex_groups.new(name=bone)
            group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
            parts.append(obj)
            return obj
        def shape(label,rings,mat,bone,sides=24,folds=0):
            return piece(loft(label,rings,m[mat],sides,folds),bone)
        shape('gambeson',[(.84,.25,.17,0,0),(1,.23,.16,0,0),(1.22,.3,.18,0,0),(1.43,.34,.17,0,0),(1.51,.23,.14,0,0)],'heavy_cloth','torso',32,.055)
        shape('cuirass',[(1.02,.24,.17,0,-.01),(1.1,.26,.19,0,-.01),(1.28,.32,.23,0,-.025),(1.4,.30,.19,0,0),(1.47,.21,.15,0,0)],'worn_iron','torso',32)
        # Raised breastplate ridges follow the sculpted torso rather than a box face.
        for side in [-1,1]:
            piece(tube('cuirass seam',[(0,-.24,1.12),(side*.17,-.24,1.31),(side*.25,-.15,1.43)],.012,m['aged_bronze']),'torso')
        shape('belt',[(.97,.255,.187,0,0),(1.025,.25,.185,0,0)],'worn_leather','torso')
        for side in [-1,1]:
            x=side*.17
            shape('trouser',[(.45,.105,.11,x,0),(.57,.13,.13,x,0),(.8,.14,.135,x,0),(.91,.13,.12,x,0)],'heavy_cloth','rightLeg' if side<0 else 'leftLeg')
            shape('greave',[(.1,.09,.1,x,0),(.22,.1,.12,x,0),(.39,.12,.14,x,-.02),(.46,.1,.115,x,0)],'worn_iron','rightShin' if side<0 else 'leftShin')
            shape('boot',[(.02,.12,.21,x,-.08),(.08,.125,.23,x,-.085),(.16,.11,.18,x,-.04),(.22,.09,.1,x,0)],'worn_leather','rightShin' if side<0 else 'leftShin')
            shape('knee shield',[(.39,.09,.035,x,-.12),(.45,.125,.065,x,-.14),(.52,.085,.04,x,-.13)],'worn_iron','rightLeg' if side<0 else 'leftLeg')
            arm='rightArm' if side<0 else 'leftArm'; fore='rightForearm' if side<0 else 'leftForearm'
            sx=side*.36
            shape('sleeve',[(.98,.09,.1,sx,0),(1.18,.11,.12,sx,0),(1.4,.12,.12,sx,0)],'heavy_cloth',arm)
            shape('vambrace',[(.77,.075,.085,sx,0),(.88,.1,.11,sx,0),(.99,.105,.11,sx,0),(1.04,.09,.09,sx,0)],'worn_iron',fore)
            shape('gauntlet',[(.66,.07,.075,sx,-.015),(.73,.085,.09,sx,0),(.82,.075,.08,sx,0)],'worn_leather',fore)
            # Three overlapping shaped pauldron lames, asymmetrical on the pilgrim.
            count=3 if side==1 or shield else 2
            for k in range(count):
                z=1.30+k*.062; r=.145-k*.015
                shape('shoulder lame',[(z,r,.17,sx,0),(z+.06,r+.035,.19,sx,0),(z+.115,r*.55,.1,sx,0)],'worn_iron',arm,24)
            # Separate folded tabard panels leave the legs free to stride.
            for back in [-1,1]:
                verts=[]; faces=[]
                for j in range(9):
                    t=j/8
                    for i in range(7):
                        u=i/6
                        verts.append((side*(.025+u*(.21+.08*t)),back*(.18+.06*t)+math.sin(u*math.pi*4)*.02,(1.03-.53*t)+(math.sin(i*2.4)*.055 if j==8 else 0)))
                for j in range(8):
                    for i in range(6):
                        a=j*7+i; faces.append((a,a+1,a+8,a+7))
                piece(mesh('split tabard',verts,faces,m['heavy_cloth'],True),'torso')
        # Faceted pointed helmet, enclosed in a lowered cowl on the Oathkeeper.
        shape('neck',[(1.45,.11,.105,0,0),(1.6,.11,.1,0,0)],'worn_leather','head')
        shape('helmet',[(1.55,.13,.13,0,0),(1.66,.17,.16,0,0),(1.8,.155,.14,0,.015),(1.93,.035,.045,0,.03)],'worn_iron','head',32)
        shape('visor',[(1.58,.12,.055,0,-.125),(1.65,.145,.055,0,-.145),(1.7,.145,.025,0,-.15)],'worn_iron','head',24)
        piece(tube('brow rim',[(-.155,-.11,1.737),(0,-.18,1.73),(.155,-.11,1.737)],.014,m['aged_bronze']),'head')
        # Dark eye slit remains recessed under the rim.
        piece(tube('eye slit',[(-.105,-.158,1.713),(.105,-.158,1.713)],.012,m['heavy_cloth']),'head')
        # Cape is a continuous corrugated surface weighted across three bones.
        verts=[]; faces=[]
        for j in range(17):
            t=j/16
            for i in range(17):
                u=i/16
                verts.append(((u-.5)*(.52+.36*t),.16+.23*t+math.cos(u*math.pi*10)*(.015+.025*t),1.46-t*1.18+(math.sin(i*2.1)*.06 if j==16 else 0)))
        for j in range(16):
            for i in range(16):
                a=j*17+i; faces.append((a,a+17,a+18,a+1))
        cape=mesh('folded cloak',verts,faces,m['heavy_cloth'],True)
        for k in range(3):
            group=cape.vertex_groups.new(name=f'cape{k}')
            for j in range(17):
                w=max(0,1-abs(j/16*2-k))
                if w: group.add(list(range(j*17,j*17+17)),w,'REPLACE')
        parts.append(cape)
        # Authored diamond-section sword with a tapering tip.
        x=-.36
        shape('sword grip',[(.65,.033,.033,x,-.02),(.84,.033,.033,x,-.02)],'worn_leather','blade',12)
        shape('sword pommel',[(.61,.035,.035,x,-.02),(.65,.05,.04,x,-.02)],'aged_bronze','blade',12)
        piece(tube('quillons',[(x-.15,-.02,.88),(x,-.02,.85),(x+.15,-.02,.88)],.025,m['aged_bronze']),'blade')
        shape('diamond blade',[(.88,.055,.014,x,-.02),(1.1,.055,.014,x,-.02),(1.68,.039,.012,x,-.02),(1.88,.001,.001,x,-.02)],'worn_iron','blade',4)
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
        armdata=bpy.data.armatures.new(name+'_skeleton'); rig=bpy.data.objects.new(name+'_LOD0',armdata)
        bpy.context.collection.objects.link(rig); bpy.context.view_layer.objects.active=rig
        bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
        definitions=[('root',(0,0,0),None),('torso',(0,0,.94),'root'),('head',(0,0,1.55),'torso'),
                     ('rightArm',(-.36,0,1.4),'torso'),('rightForearm',(-.36,0,1.06),'rightArm'),
                     ('leftArm',(.36,0,1.4),'torso'),('leftForearm',(.36,0,1.06),'leftArm'),
                     ('rightLeg',(-.17,0,.86),'root'),('rightShin',(-.17,0,.46),'rightLeg'),
                     ('leftLeg',(.17,0,.86),'root'),('leftShin',(.17,0,.46),'leftLeg'),('blade',(-.36,-.02,.70),'rightForearm'),
                     ('cape0',(0,.18,1.46),'torso'),('cape1',(0,.25,.95),'cape0'),('cape2',(0,.33,.45),'cape1')]
        for bone,head,parent in definitions:
            b=armdata.edit_bones.new(bone); b.head=head; b.tail=(head[0],head[1],head[2]+.15)
            if parent: b.parent=armdata.edit_bones[parent]
        bpy.ops.object.mode_set(mode='OBJECT')
        body.parent=rig; modifier=body.modifiers.new('Shared semantic skeleton','ARMATURE'); modifier.object=rig
        result[name]=rig
    return result
