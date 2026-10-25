"""Headless Ruins benchmark build. Run via npm run assets:build."""
import bpy
import sys
import json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import common
import materials
import ruins
import characters
import biomes

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/assets/v05'
OUT.mkdir(parents=True,exist_ok=True)
BAKES=ROOT/'.cache/bakes/v05'
BAKES.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
m=materials.sources()
materials.bake(m,BAKES,'--rebake' in sys.argv)
materials.runtime_materials(m)
manifest={'version':'0.5.0','blender':bpy.app.version_string,'units':'meters','materials':{},'assets':{},'packs':{}}
characters_only='--characters-only' in sys.argv
if characters_only: manifest=json.loads((OUT/'manifest.json').read_text())
for name,values in materials.FAMILIES.items():
    if characters_only and name in manifest['materials']: continue
    manifest['materials'][name]={'baseColor':f'{name}_baseColor.png','normal':f'{name}_normal.png','roughness':f'{name}_roughness.png','ao':f'{name}_ao.png','metalness':values[3],'resolution':1024}

def export_pack(name,assets):
    keep=set()
    for asset,obj in assets.items():
        common.bake_occlusion(obj)
        levels=[]
        for level,ratio in enumerate([1,.55,.25]):
            if level==0: copy=obj
            else:
                copy=obj.copy(); copy.data=obj.data.copy() if obj.data else None
                bpy.context.collection.objects.link(copy)
                if obj.type=='ARMATURE':
                    for child in obj.children:
                        c=child.copy(); c.data=child.data.copy(); bpy.context.collection.objects.link(c); c.parent=copy
                        for mod in c.modifiers:
                            if mod.type=='ARMATURE': mod.object=copy
                targets=[copy] if copy.type=='MESH' else [c for c in copy.children if c.type=='MESH']
                for target in targets:
                    dec=target.modifiers.new('Runtime LOD','DECIMATE'); dec.ratio=ratio
                    bpy.context.view_layer.objects.active=target
                    bpy.ops.object.modifier_apply(modifier=dec.name)
            copy.name=f'{asset}_LOD{level}'
            bpy.context.view_layer.update()
            targets=[copy] if copy.type=='MESH' else [c for c in copy.children if c.type=='MESH']
            triangles=sum(sum(len(p.vertices)-2 for p in t.data.polygons) for t in targets)
            assert 0<triangles<40000,(asset,level,triangles)
            levels.append({'node':copy.name,'triangles':triangles})
            keep.add(copy)
            keep.update(copy.children_recursive)
        manifest['assets'][asset]={'pack':name,'kind':'character' if obj.type=='ARMATURE' else 'environment','biome':biomes.NAMES.index(name) if name in biomes.NAMES else 0,'lods':levels,'reference':'v07/03-locomotion-combat-world-detail.png' if asset=='shinobi' else '01-ruins-materials-and-characters.png'}
    bpy.ops.object.select_all(action='DESELECT')
    for obj in keep: obj.select_set(True)
    path=OUT/f'{name}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_apply=False,export_extras=True,export_vertex_color='ACTIVE',export_all_vertex_colors=False)
    families=sorted({material.name for obj in keep if obj.type=='MESH' for material in obj.data.materials})
    manifest['packs'][name]={'file':path.name,'bytes':path.stat().st_size,'materials':families}
    for obj in keep: bpy.data.objects.remove(obj,do_unlink=True)

if not characters_only: export_pack('ruins',ruins.build(m))
export_pack('pilgrims',characters.build(m))
if not characters_only:
    for biome in range(1,5): export_pack(biomes.NAMES[biome],biomes.build(m,biome))
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('HOLLOW CANTICLE ASSET BUILD:',len(manifest['assets']),'assets; Blender',bpy.app.version_string)
