"""Bake shared procedural Blender sources; runtime never uses reference pixels."""
import bpy
from pathlib import Path

FAMILIES = {
    'ancient_stone': ((.16,.19,.20),(.43,.42,.36),.9,0,4.8,.13),
    'carved_stone': ((.22,.24,.23),(.53,.51,.42),.76,0,9,.07),
    'moss_stone': ((.08,.12,.08),(.26,.31,.16),.96,0,3.1,.19),
    'worn_iron': ((.07,.09,.10),(.30,.35,.37),.48,.95,18,.035),
    'aged_bronze': ((.10,.08,.04),(.45,.30,.11),.52,.85,7,.045),
    'heavy_cloth': ((.025,.031,.035),(.13,.15,.16),.98,0,80,.035),
    'worn_leather': ((.035,.02,.012),(.19,.105,.05),.82,0,35,.04),
    'crimson_cloth': ((.035,.008,.009),(.19,.035,.028),.95,0,70,.025),
    'pilgrim_linen': ((.18,.17,.13),(.48,.44,.32),.96,0,65,.025),
    'wet_stone': ((.025,.065,.07),(.15,.26,.25),.28,0,7,.075),
    'fungal_skin': ((.035,.015,.055),(.23,.08,.31),.66,0,3,.12),
    'frozen_stone': ((.16,.23,.29),(.42,.57,.65),.49,.08,12,.065),
    'snow_crust': ((.5,.62,.69),(.85,.91,.93),.96,0,35,.11),
    'burnt_stone': ((.018,.014,.012),(.12,.065,.035),.94,0,5,.2),
    'rusted_iron': ((.025,.022,.018),(.29,.10,.035),.77,.8,11,.09),
}

def sources():
    result={}
    for name,(dark,light,rough,metal,scale,depth) in FAMILIES.items():
        mat=bpy.data.materials.new(name)
        mat.use_nodes=True
        n=mat.node_tree.nodes; l=mat.node_tree.links
        bs=n.get('Principled BSDF'); bs.inputs['Metallic'].default_value=metal
        noise=n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=scale
        noise.inputs['Detail'].default_value=5; noise.inputs['Roughness'].default_value=.72
        micro=n.new('ShaderNodeTexNoise'); micro.inputs['Scale'].default_value=scale*13
        micro.inputs['Detail'].default_value=2
        ramp=n.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position=.15; ramp.color_ramp.elements[0].color=(*dark,1)
        ramp.color_ramp.elements[1].position=.85; ramp.color_ramp.elements[1].color=(*light,1)
        l.new(noise.outputs['Fac'],ramp.inputs[0]); l.new(ramp.outputs[0],bs.inputs['Base Color'])
        if 'stone' in name:
            cracks=n.new('ShaderNodeTexVoronoi'); cracks.feature='DISTANCE_TO_EDGE'
            cracks.inputs['Scale'].default_value=5 if name!='carved_stone' else 9
            seam=n.new('ShaderNodeValToRGB')
            seam.color_ramp.elements[0].position=.008; seam.color_ramp.elements[0].color=(.08,.09,.085,1)
            seam.color_ramp.elements[1].position=.04; seam.color_ramp.elements[1].color=(1,1,1,1)
            l.new(cracks.outputs['Distance'],seam.inputs[0])
            mix=n.new('ShaderNodeMixRGB'); mix.blend_type='MULTIPLY'; mix.inputs[0].default_value=.27
            l.new(ramp.outputs[0],mix.inputs[1]); l.new(seam.outputs[0],mix.inputs[2]); l.new(mix.outputs[0],bs.inputs['Base Color'])
        r=n.new('ShaderNodeMapRange'); r.inputs['To Min'].default_value=max(.15,rough-.18)
        r.inputs['To Max'].default_value=min(1,rough+.09)
        l.new(noise.outputs['Fac'],r.inputs['Value']); l.new(r.outputs[0],bs.inputs['Roughness'])
        bump=n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.6
        bump.inputs['Distance'].default_value=depth
        l.new(noise.outputs['Fac'],bump.inputs['Height'])
        if 'stone' in name:
            fissure=n.new('ShaderNodeBump'); fissure.inputs['Distance'].default_value=.012; fissure.inputs['Strength'].default_value=.45
            l.new(seam.outputs[0],fissure.inputs['Height']); l.new(fissure.outputs['Normal'],bump.inputs['Normal'])
        grain=n.new('ShaderNodeBump'); grain.inputs['Strength'].default_value=.3
        grain.inputs['Distance'].default_value=depth*.2
        l.new(micro.outputs['Fac'],grain.inputs['Height']); l.new(bump.outputs['Normal'],grain.inputs['Normal'])
        l.new(grain.outputs['Normal'],bs.inputs['Normal'])
        result[name]=mat
    return result

def bake(materials, output, force=False):
    scene=bpy.context.scene
    scene.render.engine='CYCLES'; scene.cycles.samples=8
    scene.render.bake.use_pass_direct=False; scene.render.bake.use_pass_indirect=False
    scene.render.bake.use_pass_color=True; scene.render.bake.margin=8
    scene.cycles.bake_type='DIFFUSE'
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=32,y_subdivisions=32,size=2)
    plane=bpy.context.object
    color_current=(output/'base-color-v2').exists()
    for mat in materials.values():
        plane.data.materials.clear(); plane.data.materials.append(mat)
        for kind,bake_type in [('baseColor','DIFFUSE'),('normal','NORMAL'),('roughness','ROUGHNESS'),('ao','AO')]:
            path=output/f'{mat.name}_{kind}.png'
            if path.exists() and not force and (kind!='baseColor' or color_current): continue
            image=bpy.data.images.new(f'{mat.name}_{kind}',width=1024,height=1024,alpha=False)
            image.colorspace_settings.name='sRGB' if kind=='baseColor' else 'Non-Color'
            tex=mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=image
            mat.node_tree.nodes.active=tex
            bpy.context.view_layer.objects.active=plane
            plane.select_set(True)
            # Diffuse baking attenuates metallic albedo; emission isolates the source color.
            if kind=='baseColor':
                bs=mat.node_tree.nodes.get('Principled BSDF')
                out=mat.node_tree.nodes.get('Material Output')
                emission=mat.node_tree.nodes.new('ShaderNodeEmission')
                mat.node_tree.links.new(bs.inputs['Base Color'].links[0].from_socket,emission.inputs['Color'])
                mat.node_tree.links.new(emission.outputs[0],out.inputs['Surface'])
                bpy.ops.object.bake(type='EMIT')
                mat.node_tree.links.new(bs.outputs[0],out.inputs['Surface'])
                mat.node_tree.nodes.remove(emission)
            else: bpy.ops.object.bake(type=bake_type)
            image.filepath_raw=str(path); image.file_format='PNG'; image.save()
            mat.node_tree.nodes.remove(tex); bpy.data.images.remove(image)
    bpy.data.objects.remove(plane,do_unlink=True)
    (output/'base-color-v2').write_text('Unlit base-color bake, including metallic albedo.\n')

def runtime_materials(materials):
    # Textures are external/shared in the manifest; avoid embedding them in every pack.
    for name,mat in materials.items():
        mat.node_tree.nodes.clear()
        bs=mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        out=mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
        bs.inputs['Base Color'].default_value=(1,1,1,1)
        bs.inputs['Metallic'].default_value=FAMILIES[name][3]
        bs.inputs['Roughness'].default_value=FAMILIES[name][2]
        mat.node_tree.links.new(bs.outputs[0],out.inputs[0])
