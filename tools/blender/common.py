"""Original deterministic mesh authoring helpers. Blender meters, Z up."""
import bpy
import math
import random
from mathutils import Vector
from mathutils import noise

RNG = random.Random(5050)

def mesh(name, verts, faces, material, smooth=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    for poly in data.polygons:
        poly.use_smooth = smooth
    return obj

def bevel(obj, amount=0.035, segments=2):
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('Worn edge bevel', 'BEVEL')
    mod.width, mod.segments = amount, segments
    bpy.ops.object.modifier_apply(modifier=mod.name)
    mod = obj.modifiers.new('Area weighted normals', 'WEIGHTED_NORMAL')
    mod.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def stone(name, pos, size, material, damage=0.025):
    # An eight-sided chipped footprint, independently eroded at each elevation.
    sx, sy, sz = size
    outline = [(-.5,-.4),(-.4,-.5),(.4,-.5),(.5,-.4),(.5,.4),(.4,.5),(-.4,.5),(-.5,.4)]
    verts=[]
    for level in [-.5, .5]:
        for x,y in outline:
            verts.append((pos[0]+x*sx+RNG.uniform(-damage,damage), pos[1]+y*sy+RNG.uniform(-damage,damage), pos[2]+level*sz+RNG.uniform(-damage,damage)))
    faces=[tuple(reversed(range(8))),tuple(range(8,16))]
    faces += [(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
    return bevel(mesh(name,verts,faces,material),min(.035,sz*.12))

def loft(name, rings, material, sides=24, folds=0, phase=0):
    """Cross sections are (z, radiusX, radiusY, centerX, centerY)."""
    verts=[]
    for k,(z,rx,ry,cx,cy) in enumerate(rings):
        for i in range(sides):
            a=math.tau*i/sides
            relief=1+folds*math.cos(a*8+phase+z*.7)
            verts.append((cx+math.cos(a)*rx*relief,cy+math.sin(a)*ry*relief,z))
    faces=[tuple(reversed(range(sides)))]
    for k in range(len(rings)-1):
        faces += [(k*sides+i,k*sides+(i+1)%sides,(k+1)*sides+(i+1)%sides,(k+1)*sides+i) for i in range(sides)]
    faces.append(tuple(range((len(rings)-1)*sides,len(rings)*sides)))
    return mesh(name,verts,faces,material,True)

def tube(name, points, radius, material):
    curve=bpy.data.curves.new(name,'CURVE')
    curve.dimensions='3D'
    curve.bevel_depth=radius
    curve.bevel_resolution=2
    poly=curve.splines.new('POLY')
    poly.points.add(len(points)-1)
    for p,co in zip(poly.points,points): p.co=(*co,1)
    obj=bpy.data.objects.new(name,curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    return obj

def uv(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=.0001)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.015)
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)

def join(objects,name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    obj=bpy.context.object
    obj.name=name
    # Vertices are authored in asset coordinates, so origin remains at the socket.
    bpy.context.scene.cursor.location=(0,0,0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    uv(obj)
    return obj

def bake_occlusion(obj):
    """Actual self-occlusion on authored geometry, stored as glTF vertex color."""
    meshes=[obj] if obj.type=='MESH' else [o for o in obj.children_recursive if o.type=='MESH']
    scene=bpy.context.scene
    scene.render.engine='CYCLES'; scene.cycles.samples=8
    scene.render.bake.target='VERTEX_COLORS'
    hidden={o:o.hide_render for o in scene.objects}
    for o in scene.objects: o.hide_render=o not in meshes
    for target in meshes:
        bpy.ops.object.select_all(action='DESELECT'); target.select_set(True)
        bpy.context.view_layer.objects.active=target
        target.data.color_attributes.new(name='Occlusion',type='FLOAT_COLOR',domain='CORNER')
        bpy.ops.object.bake(type='AO',target='VERTEX_COLORS')
        # Broad mineral staining and low moss accompany actual self-occlusion.
        colors=target.data.color_attributes.active_color
        offset=sum(ord(c) for c in target.name)*.017
        for polygon in target.data.polygons:
            family=target.data.materials[polygon.material_index].name
            if 'stone' not in family: continue
            for corner in polygon.loop_indices:
                vertex=target.data.vertices[target.data.loops[corner].vertex_index]
                p=vertex.co
                stain=noise.noise(Vector((p.x*.8+offset,p.y*.8,p.z*.65)))
                mineral=.86+stain*.12
                damp=max(0,noise.noise(Vector((p.x*2.1,p.y*2.1+offset,p.z*.8)))-.10)
                moss=min(.42,damp*1.8)*math.exp(-max(0,p.z)*1.15)
                color=colors.data[corner].color
                for channel,tint in enumerate([.46,.61,.34]):
                    color[channel]*=min(1,mineral)*(1-moss)+tint*moss
    for o,value in hidden.items(): o.hide_render=value
    scene.render.bake.target='IMAGE_TEXTURES'
