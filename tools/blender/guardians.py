"""Five independently authored realm silhouettes on Living Steel's semantic skeleton."""
import math
from common import loft, mesh, tube, join, bevel
from characters import make_rig
import fungi

KEYS=['ashen_marshal','drowned_prelate','spore_crown','pale_sentinel','forge_tyrant']

def build(m,biome):
    key=KEYS[biome];parts=[]
    def piece(obj,bone):
        obj.vertex_groups.new(name=bone).add(list(range(len(obj.data.vertices))),1,'REPLACE');parts.append(obj);return obj
    def shape(label,rings,material,bone='torso',sides=28,folds=0):
        return piece(loft(label,rings,m[material],sides,folds),bone)
    material=['worn_iron','wet_stone','fungal_ochre','frozen_stone','rusted_iron'][biome]
    width=[.34,.28,.39,.3,.53][biome]
    shape('guardian body',[(.82,width*.7,.19,0,0),(1.0,width*.9,.23,0,0),(1.25,width*1.1,.27,0,.025),(1.47,width,.23,0,0),(1.56,width*.6,.15,0,0)],material,sides=40,folds=.06 if biome in [1,2] else .015)
    for side in [-1,1]:
        arm='rightArm' if side<0 else 'leftArm';fore='rightForearm' if side<0 else 'leftForearm';leg='rightLeg' if side<0 else 'leftLeg';shin='rightShin' if side<0 else 'leftShin'
        x=side*.36
        shape('upper arm',[(1.04,.085,.10,x,0),(1.2,.12,.13,x,0),(1.43,.16,.16,x,0)],material,arm)
        shape('forearm',[(.65,.085,.09,x,-.03),(.82,.12,.12,x,0),(1.06,.095,.11,x,0)],material,fore)
        x=side*.17
        shape('thigh',[(.45,.09,.10,x,0),(.7,.14,.14,x,0),(.91,.12,.12,x,0)],material,leg)
        shape('shin',[(.08,.09,.11,x,0),(.24,.11,.12,x,0),(.46,.095,.11,x,0)],material,shin)
        shape('foot',[(.02,.11,.18,x,-.08),(.1,.12,.16,x,-.05),(.2,.08,.10,x,0)],material,'rightFoot' if side<0 else 'leftFoot')
    shape('guardian head',[(1.52,.09,.09,0,0),(1.65,.15,.14,0,0),(1.8,.12,.12,0,0),(1.85,.055,.07,0,0)],material,'head',32)
    if biome==0:
        # Broken field commander's crest and a broad asymmetric shield.
        for i in range(5):
            shape('marshal crest',[(1.79,.024,.055,(i-2)*.035,0),(2.03-.05*abs(i-2),.012,.025,(i-2)*.045,0)],'aged_bronze','head',12)
        verts=[(.36+x,-.19,1.4+z) for x,z in [(-.29,0),(.29,0),(.26,-.6),(0,-.9),(-.26,-.6)]]
        piece(bevel(mesh('ceremonial shield',verts,[tuple(range(5))],m['worn_iron']),.01),'leftForearm')
        piece(tube('shield golden rim',verts+[verts[0]],.025,m['aged_bronze']),'leftForearm')
        shape('commander sword',[(.7,.028,.015,-.36,0),(1.15,.05,.012,-.36,0),(1.95,.032,.009,-.36,0),(2.08,.001,.001,-.36,0)],'worn_iron','blade',4)
    elif biome==1:
        shape('tall ritual mantle',[(.15,.34,.27,0,.04),(.6,.38,.25,0,0),(1,.24,.18,0,0),(1.48,.29,.22,0,0)],'pilgrim_linen',folds=.12)
        shape('split bell mitre',[(1.8,.14,.1,0,0),(2.16,.09,.06,0,.02),(2.28,.02,.02,-.04,.02)],'aged_bronze','head',12)
        piece(tube('bell staff',[(-.36,0,.3),(-.36,0,2.35)],.035,m['aged_bronze']),'blade')
        shape('ritual bell blade',[(1.95,.19,.12,-.36,0),(2.2,.12,.09,-.36,0),(2.38,.02,.02,-.36,0)],'wet_stone','blade')
        for side in [-1,1]:
            piece(tube('hanging ritual chain',[(side*.23,.12,1.5),(side*.31,.18,1.05),(side*.22,.13,.5)],.014,m['aged_bronze']),'torso')
    elif biome==2:
        # Root-bound beast torso, a broken living crown and hooked organic limbs.
        for i in range(7):
            a=math.tau*i/7
            for obj in fungi.cap(m,1.75+.12*math.sin(i*2),.23+.06*(i%2),i):
                for v in obj.data.vertices:v.co.x+=math.cos(a)*.25;v.co.y+=math.sin(a)*.18
                piece(obj,'head')
        for i in range(9):
            a=math.tau*i/9
            piece(tube('root armour',[(math.cos(a)*.2,math.sin(a)*.2,.75),(math.cos(a+.5)*.42,math.sin(a+.5)*.29,1.15),(math.cos(a)*.27,math.sin(a)*.24,1.55)],.045,m['moss_stone']),'torso')
        for side in [-1,1]:
            for i in range(4):
                x=side*.36+(i-1.5)*.055
                shape('hooked fungal claw',[(.35,.001,.001,x,-.24),(.48,.022,.025,x,-.15),(.72,.032,.035,x,-.02)],'fungal_teal','rightForearm' if side<0 else 'leftForearm',12)
    elif biome==3:
        for side in [-1,1]:
            for i in range(3):
                shape('ice shoulder blade',[(1.35,.07,.12,side*(.33+i*.035),.02),(1.65+i*.08,.02,.05,side*(.4+i*.06),.04),(1.85+i*.07,.001,.001,side*(.44+i*.08),.04)],'frozen_stone','rightArm' if side<0 else 'leftArm',5)
        piece(tube('long sentinel haft',[(-.36,0,.2),(-.36,0,2.25)],.03,m['worn_iron']),'blade')
        shape('ice spear blade',[(2.0,.065,.02,-.36,0),(2.28,.12,.018,-.36,0),(2.72,.001,.001,-.36,0)],'frozen_stone','blade',4)
        shape('faceless ice mask',[(1.58,.13,.05,0,-.1),(1.75,.15,.04,0,-.12),(1.93,.025,.02,0,-.1)],'snow_crust','head',8)
    else:
        shape('open furnace core',[(.97,.21,.04,0,-.25),(1.28,.24,.05,0,-.29),(1.44,.17,.04,0,-.25)],'aged_bronze')
        for i in range(7):
            x=(i-3)*.066
            piece(tube('chest furnace grate',[(x,-.31,1.0),(x,-.35,1.4)],.017,m['burnt_stone']),'torso')
        for side in [-1,1]:
            piece(tube('furnace chimney',[(side*.29,.15,1.35),(side*.4,.18,1.75),(side*.4,.18,2.13)],.09,m['rusted_iron']),'torso')
        piece(tube('hammer haft',[(-.36,0,.35),(-.36,0,1.75)],.055,m['worn_iron']),'blade')
        shape('forged hammer head',[(1.52,.36,.18,-.36,0),(1.85,.4,.2,-.36,0),(1.92,.3,.15,-.36,0)],'rusted_iron','blade',8)
        for i in range(10):
            points=[(.36+math.cos(math.tau*j/16)*.055,.03+math.sin(math.tau*j/16)*.055,.7-i*.055) for j in range(17)]
            piece(tube('hammer chain',points,.014,m['worn_iron']),'offhand')
    rig=make_rig(key,join(parts,key+'_body'),1,['sword','spear','claw','spear','great'][biome])
    rig['realm']=biome;rig['design']='Original realm guardian; shared Living Steel semantic joints'
    return {key:rig}
