import * as T from 'three';
import { AssetManager } from './assets';
import { JOINTS, type Pose } from './animation';
import { GUARDIANS } from '../realms';

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
  private revelation = { value: 0 };
  private rotation = new T.Quaternion();
  private euler = new T.Euler();
  private bossMaterials = new Map<T.Material, T.Material>();
  private bones = new Map<
    string,
    { bone: T.Bone; rest: T.Quaternion; frame: T.Quaternion; position: T.Vector3 }
  >();
  constructor(assets: AssetManager, id: string, level: number) {
    this.root = assets.instantiate(id, level)!;
    const realm = GUARDIANS.find((g) => g.key === id);
    if (id === 'saint' || realm) {
      const copies = new Map<T.Material, T.Material>();
      this.root.traverse((obj) => {
        if (!(obj instanceof T.Mesh)) return;
        const copy = (source: T.Material) => {
          if (copies.has(source)) return copies.get(source)!;
          const material = source.clone();
          const compile = source.onBeforeCompile.bind(source);
          material.onBeforeCompile = (shader, renderer) => {
            compile(shader, renderer);
            shader.uniforms.uRevelation = this.revelation;
            shader.uniforms.uRealmTint = { value: new T.Color(realm?.color ?? '#d08a51') };
            shader.fragmentShader =
              'uniform float uRevelation;uniform vec3 uRealmTint;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <emissivemap_fragment>',
              '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=uRealmTint*uRevelation*pow(1.-abs(dot(normal,normalize(vViewPosition))),2.);',
            );
          };
          material.customProgramCacheKey = () =>
            source.customProgramCacheKey() + ':guardian-revelation:' + id;
          copies.set(source, material);
          this.bossMaterials.set(source, material);
          return material;
        };
        obj.material = Array.isArray(obj.material) ? obj.material.map(copy) : copy(obj.material);
      });
    }
    this.root.updateMatrixWorld(true);
    this.root.traverse((obj) => {
      if (obj instanceof T.Bone)
        this.bones.set(obj.userData.name ?? obj.name, {
          bone: obj,
          rest: obj.quaternion.clone(),
          frame: obj.getWorldQuaternion(new T.Quaternion()),
          position: obj.position.clone(),
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
  animate(pose: Pose, time: number, aimForward = false, phase = 1, hipYaw = 0, cloth = 0) {
    for (const [source, material] of this.bossMaterials)
      if (
        source instanceof T.MeshStandardMaterial &&
        material instanceof T.MeshStandardMaterial &&
        source.map !== material.map
      ) {
        Object.assign(material, {
          map: source.map,
          normalMap: source.normalMap,
          roughnessMap: source.roughnessMap,
          aoMap: source.aoMap,
        });
        material.needsUpdate = true;
      }
    this.revelation.value = phase === 2 ? 0.65 + Math.sin(time * 3) * 0.12 : 0;
    for (const joint of JOINTS) {
      const data = this.bones.get(joint);
      if (!data) continue;
      const q = this.rotation.setFromEuler(this.euler.set(...pose[joint]));
      if (joint === 'rightArm' && ['spear', 'great'].includes(this.root.userData.weapon))
        q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), 0.5));
      if (joint === 'blade' && !['bow', 'bell'].includes(this.root.userData.weapon))
        q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2));
      data.bone.quaternion
        .copy(data.rest)
        .multiply(data.frame.clone().invert())
        .multiply(q)
        .multiply(data.frame);
    }
    const offhand = this.bones.get('offhand');
    if (offhand)
      offhand.bone.quaternion
        .copy(offhand.rest)
        .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2));
    const torso = this.bones.get('torso');
    const pelvis = this.bones.get('root');
    if (pelvis) {
      // Torso and thighs are siblings: locomotion belongs to their common ancestor.
      pelvis.bone.position.copy(pelvis.position).add(new T.Vector3(0, pose.lift, pose.advance));
      pelvis.bone.quaternion
        .copy(pelvis.rest)
        .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), hipYaw));
    }
    this.root.updateWorldMatrix(true, true);
    const soleFrame = this.root.getWorldQuaternion(new T.Quaternion());
    for (const name of ['rightFoot', 'leftFoot']) {
      const foot = this.bones.get(name)?.bone;
      if (foot?.parent)
        foot.quaternion
          .copy(foot.parent.getWorldQuaternion(new T.Quaternion()).invert())
          .multiply(soleFrame);
    }
    const blade = this.bones.get('blade')?.bone;
    if ((aimForward || this.root.userData.weapon === 'bell') && blade?.parent) {
      this.root.updateWorldMatrix(true, true);
      const desired = this.root.getWorldQuaternion(new T.Quaternion());
      if (this.root.userData.weapon !== 'bell')
        desired.multiply(
          new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(0, 0, 1)),
        );
      blade.quaternion
        .copy(blade.parent.getWorldQuaternion(new T.Quaternion()).invert())
        .multiply(desired);
    }
    if (['spear', 'great'].includes(this.root.userData.weapon) && blade && torso) {
      this.root.updateWorldMatrix(true, true);
      const upper = this.bones.get('leftArm')?.bone,
        fore = this.bones.get('leftForearm')?.bone;
      if (upper && fore) {
        const target = blade.localToWorld(
          new T.Vector3(0, this.root.userData.weapon === 'spear' ? 0.35 : 0.04, 0),
        );
        torso.bone.worldToLocal(target);
        const direction = target.sub(upper.position);
        const a = fore.position.length(),
          b = 0.35,
          length = Math.max(0.05, Math.min(a + b - 0.001, direction.length()));
        direction.normalize();
        const along = (a * a - b * b + length * length) / (2 * length);
        const pole = new T.Vector3(0, 0, -1).cross(direction).normalize();
        const elbow = direction
          .clone()
          .multiplyScalar(along)
          .addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
        upper.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), elbow.clone().normalize());
        const lower = direction
          .multiplyScalar(length)
          .sub(elbow)
          .applyQuaternion(upper.quaternion.clone().invert());
        fore.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), lower.normalize());
      }
    }
    for (let i = 0; i < 3; i++) {
      const data = this.bones.get('cape' + i);
      if (data)
        data.bone.quaternion
          .copy(data.rest)
          .multiply(
            new T.Quaternion().setFromAxisAngle(
              new T.Vector3(1, 0, 0),
              Math.sin(time * 2.4 + i) * 0.035 +
                cloth * (i + 1) * 0.28 -
                (i === 0 ? pose.torso[0] * 0.48 + (phase === 2 ? 0.25 : 0) : 0),
            ),
          );
    }
  }
  dispose() {
    this.shells.forEach((shell) => shell.removeFromParent());
    this.outline.dispose();
    this.bossMaterials.forEach((material) => material.dispose());
    this.root.traverse((obj) => {
      if (obj instanceof T.SkinnedMesh) obj.skeleton.dispose();
    });
    this.root.removeFromParent();
  }
}
