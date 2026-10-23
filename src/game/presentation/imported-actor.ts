import * as T from 'three';
import { AssetManager } from './assets';
import { JOINTS, type Pose } from './animation';

/** Bind semantic v0.4 rotations to Blender bone rest frames; simulation owns timing. */
export class ImportedActor {
  readonly root: T.Object3D;
  private outline = new T.ShaderMaterial({
    uniforms: { strength: { value: 0 } },
    vertexShader: `#include <common>
      #include <skinning_pars_vertex>
      void main(){
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        transformed+=normalize(objectNormal)*.018;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(transformed,1.);
      }`,
    fragmentShader:
      'uniform float strength;void main(){gl_FragColor=vec4(.82,.65,.33,strength*.8);}',
    transparent: true,
    side: T.BackSide,
    depthWrite: false,
  });
  private shells: T.SkinnedMesh[] = [];
  private bones = new Map<string, { bone: T.Bone; rest: T.Quaternion; frame: T.Quaternion }>();
  constructor(assets: AssetManager, id: string, level: number) {
    this.root = assets.instantiate(id, level)!;
    this.root.updateMatrixWorld(true);
    this.root.traverse((obj) => {
      if (obj instanceof T.Bone)
        this.bones.set(obj.userData.name ?? obj.name, {
          bone: obj,
          rest: obj.quaternion.clone(),
          frame: obj.getWorldQuaternion(new T.Quaternion()),
        });
    });
  }
  private buildOutline() {
    const sources: T.SkinnedMesh[] = [];
    this.root.traverse((obj) => {
      if (obj instanceof T.SkinnedMesh && obj.material !== this.outline) sources.push(obj);
    });
    for (const source of sources) {
      const shell = new T.SkinnedMesh(source.geometry, this.outline);
      shell.position.copy(source.position);
      shell.quaternion.copy(source.quaternion);
      shell.scale.copy(source.scale);
      shell.bind(source.skeleton, source.bindMatrix);
      shell.bindMatrixInverse.copy(source.bindMatrixInverse);
      shell.visible = false;
      source.parent!.add(shell);
      this.shells.push(shell);
    }
  }
  setOutline(strength: number) {
    if (strength > 0 && !this.shells.length) this.buildOutline();
    this.outline.uniforms.strength.value = strength;
    this.shells.forEach((shell) => {
      shell.visible = strength > 0;
    });
  }
  animate(pose: Pose, time: number) {
    for (const joint of JOINTS) {
      const data = this.bones.get(joint);
      if (!data) continue;
      const q = new T.Quaternion().setFromEuler(new T.Euler(...pose[joint]));
      if (joint === 'blade')
        q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2));
      data.bone.quaternion
        .copy(data.rest)
        .multiply(data.frame.clone().invert())
        .multiply(q)
        .multiply(data.frame);
    }
    const torso = this.bones.get('torso');
    if (torso) {
      torso.bone.position.y = 0.94 + pose.lift;
      torso.bone.position.z = pose.advance;
    }
    for (let i = 0; i < 3; i++) {
      const data = this.bones.get('cape' + i);
      if (data)
        data.bone.quaternion
          .copy(data.rest)
          .multiply(
            new T.Quaternion().setFromAxisAngle(
              new T.Vector3(1, 0, 0),
              Math.sin(time * 2.4 + i) * 0.045,
            ),
          );
    }
  }
  dispose() {
    this.shells.forEach((shell) => shell.removeFromParent());
    this.outline.dispose();
    this.root.traverse((obj) => {
      if (obj instanceof T.SkinnedMesh) obj.skeleton.dispose();
    });
    this.root.removeFromParent();
  }
}
