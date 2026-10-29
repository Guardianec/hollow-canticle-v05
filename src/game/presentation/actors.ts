import * as T from 'three';
import type { Enemy, Player } from '../world';
import { Materials } from './materials';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BODY_PROFILES } from './profiles';
import { JOINTS } from './animation';
import { AnimationStateMachine } from './animation-state';
import { characterFor } from '../characters';
import { AssetManager, characterAsset } from './assets';
import { ImportedActor } from './imported-actor';

export class Actor {
  readonly root = new T.Group();
  private body = new T.Group();
  readonly torso = new T.Group();
  readonly head = new T.Group();
  readonly rightArm = new T.Group();
  readonly leftArm = new T.Group();
  readonly rightForearm = new T.Group();
  readonly leftForearm = new T.Group();
  readonly rightLeg = new T.Group();
  readonly leftLeg = new T.Group();
  readonly rightShin = new T.Group();
  readonly leftShin = new T.Group();
  readonly blade = new T.Group();
  readonly offhand = new T.Group();
  readonly detail = new T.Group();
  readonly mantle = new T.Group();
  readonly revelation = new T.Group();
  private profile;
  readonly animation = new AnimationStateMachine();
  private turning = 0;
  private previousAdvance = 0;
  private lastPosition?: T.Vector3;
  private contact: T.Mesh;
  private cape: T.Mesh;
  private cloak: T.MeshStandardMaterial;
  private weaponId = '';
  private ownedGeometry = new Set<T.BufferGeometry>();
  private steel: T.MeshStandardMaterial;
  private outline?: T.ShaderMaterial;
  private outlineStrength = -1;
  private imported?: ImportedActor;
  private importedLevel = -1;
  constructor(
    private materials: Materials,
    readonly id: string,
    readonly player: boolean,
    private assets?: AssetManager,
    private model?: string,
  ) {
    const m = materials;
    const profile = (this.profile = BODY_PROFILES[id] ?? BODY_PROFILES.warden);
    const shinobi = id === 'player-shinobi';
    const contactGeometry = new T.PlaneGeometry(1, 1);
    this.ownedGeometry.add(contactGeometry);
    this.contact = new T.Mesh(
      contactGeometry,
      new T.MeshBasicMaterial({
        map: m.glow,
        color: '#000000',
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    );
    this.contact.rotation.x = -Math.PI / 2;
    this.contact.position.y = 0.025;
    this.contact.scale.set(profile.chest[0] * 1.2, 0.85, 1);
    this.root.add(this.contact);
    this.steel = new T.MeshStandardMaterial({
      color: shinobi ? '#111922' : player ? '#899d9f' : '#657783',
      map: m.weave,
      metalness: shinobi ? 0.4 : 0.68,
      roughness: shinobi ? 0.65 : 0.38,
      flatShading: true,
    });
    const dark = new T.MeshStandardMaterial({
      color: shinobi
        ? '#0c1118'
        : player
          ? '#17232b'
          : id === 'monk'
            ? '#858376'
            : id === 'assassin'
              ? '#302932'
              : '#2d333a',
      roughness: 0.93,
    });
    this.cloak = new T.MeshStandardMaterial({
      color: shinobi
        ? '#090e14'
        : player
          ? id === 'player-twins'
            ? '#49364f'
            : id === 'player-spear'
              ? '#435463'
              : id === 'player-great'
                ? '#514739'
                : '#34434c'
          : id === 'monk'
            ? '#b7b3a0'
            : id === 'duelist'
              ? '#5a292a'
              : '#252a30',
      map: m.weave,
      bumpMap: m.weave,
      bumpScale: 0.035,
      roughness: 1,
      side: T.DoubleSide,
    });
    const leather = new T.MeshStandardMaterial({
      color: shinobi ? '#191c20' : '#4b392c',
      roughness: 0.9,
    });
    const skin = new T.MeshStandardMaterial({
      color: player ? '#79604b' : '#776a58',
      roughness: 1,
    });
    const mesh = (
      parent: T.Group,
      geometry: T.BufferGeometry,
      material: T.Material,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
    ) => {
      const obj = new T.Mesh(geometry, material);
      obj.position.set(x, y, z);
      obj.scale.set(sx, sy, sz);
      obj.castShadow = obj.receiveShadow = true;
      parent.add(obj);
      return obj;
    };
    this.root.add(this.body);
    this.body.add(this.torso, this.rightLeg, this.leftLeg);
    this.torso.position.y = profile.hip;
    mesh(this.torso, m.sphere, dark, 0, 0.21, 0, 0.77, 0.93, 0.49);
    mesh(
      this.torso,
      id === 'monk' ? m.sphere : m.rounded,
      shinobi || id === 'monk' ? this.cloak : id === 'beast' ? m.items.moss : this.steel,
      0,
      0.26,
      0.08,
      0.63,
      0.6,
      0.37,
    );
    mesh(this.torso, m.rounded, leather, 0, -0.02, 0, 0.75, 0.11, 0.46);
    mesh(this.torso, m.rounded, m.items.bronze, 0, -0.01, 0.25, 0.14, 0.12, 0.045);
    for (let i = 0; i < 5; i++) {
      const angle = (i - 2) * 0.4;
      const plate = mesh(
        this.torso,
        m.rounded,
        this.cloak,
        Math.sin(angle) * 0.32,
        -0.29,
        Math.cos(angle) * 0.15,
        0.27,
        0.45,
        0.09,
      );
      plate.rotation.z = -angle * 0.35;
    }
    this.head.position.y = id === 'brute' ? 0.58 : id === 'beast' ? 0.48 : 0.69 * profile.chest[1];
    this.head.position.z = id === 'beast' ? 0.42 : id === 'brute' ? 0.14 : 0;
    this.head.scale.set(...profile.head);
    this.torso.add(this.head);
    mesh(this.head, m.sphere, skin, 0, 0.08, 0.04, 0.37, 0.46, 0.36);
    if (player || id === 'assassin' || id === 'monk' || id === 'archer' || id === 'hexer') {
      mesh(this.head, m.sphere, this.cloak, 0, 0.12, -0.035, 0.54, 0.62, 0.5);
      mesh(this.head, m.sphere, dark, 0, 0.08, 0.205, 0.34, 0.39, 0.06);
      mesh(this.head, m.box, skin, 0, 0.1, 0.247, 0.22, 0.045, 0.01);
      mesh(this.head, m.box, leather, 0, -0.04, 0.25, 0.26, 0.15, 0.02);
    } else if (id !== 'beast') {
      mesh(this.head, m.sphere, this.steel, 0, 0.16, 0, 0.5, 0.59, 0.46);
      mesh(this.head, m.rounded, m.items.iron, 0, 0.1, 0.235, 0.36, 0.07, 0.07);
      mesh(this.head, m.sphere, this.steel, 0, -0.035, 0.2, 0.34, 0.24, 0.18);
      mesh(this.head, m.rounded, this.steel, 0, 0.03, 0.275, 0.035, 0.22, 0.035);
      if (id !== 'warden' && id !== 'spear')
        for (const side of [-1, 1]) {
          const ridge = mesh(
            this.head,
            m.cone,
            m.items.bronze,
            side * 0.19,
            0.35,
            -0.03,
            0.12,
            0.4,
            0.13,
          );
          ridge.rotation.z = -side * 0.25;
        }
    }
    if (id === 'boss')
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        mesh(
          this.head,
          m.cone,
          m.items.bronze,
          Math.sin(a) * 0.24,
          0.51,
          Math.cos(a) * 0.24,
          0.08,
          0.45,
          0.08,
        );
      }
    this.rightArm.position.set(-profile.shoulder, 0.48 * profile.chest[1], 0);
    this.leftArm.position.set(profile.shoulder, 0.48 * profile.chest[1], 0);
    this.torso.add(this.rightArm, this.leftArm);
    for (const [i, arm] of [this.rightArm, this.leftArm].entries()) {
      const forearm = i === 0 ? this.rightForearm : this.leftForearm;
      const heavy = shinobi
        ? i === 0
          ? 0.55
          : 0.8
        : id === 'brute'
          ? 1.45
          : id === 'shield' && i === 1
            ? 1.3
            : id === 'duelist'
              ? 0.7
              : 1;
      mesh(
        arm,
        m.rounded,
        id === 'beast' ? m.items.moss : this.steel,
        0,
        -0.035,
        0,
        0.4 * heavy,
        0.29,
        0.42 * heavy,
      );
      mesh(
        arm,
        m.cylinder,
        dark,
        0,
        -0.18 * profile.arms,
        0,
        0.21 * heavy,
        0.32 * profile.arms,
        0.23 * heavy,
      );
      forearm.position.y = -0.34 * profile.arms;
      arm.add(forearm);
      mesh(
        forearm,
        m.rounded,
        id === 'monk' ? this.cloak : this.steel,
        0,
        -0.16 * profile.arms,
        0.025,
        0.22 * heavy,
        0.3 * profile.arms,
        0.23 * heavy,
      );
      mesh(forearm, m.sphere, leather, 0, -0.35 * profile.arms, 0.035, 0.18, 0.19, 0.19);
    }
    this.rightForearm.add(this.blade);
    this.blade.position.set(0, -0.35 * profile.arms, 0.035);
    this.leftForearm.add(this.offhand);
    this.offhand.position.copy(this.blade.position);
    const stance = id === 'brute' ? 0.31 : id === 'boss' ? 0.24 : 0.19;
    this.rightLeg.position.set(-stance, 0.86 * profile.legs, id === 'spear' ? -0.18 : 0);
    this.leftLeg.position.set(stance, 0.86 * profile.legs, id === 'spear' ? 0.22 : 0);
    for (const [i, leg] of [this.rightLeg, this.leftLeg].entries()) {
      const shin = i === 0 ? this.rightShin : this.leftShin;
      const thick = id === 'brute' ? 1.25 : id === 'duelist' || id === 'monk' ? 0.75 : 1;
      mesh(
        leg,
        m.cylinder,
        dark,
        0,
        -0.2 * profile.legs,
        0,
        0.25 * thick,
        0.4 * profile.legs,
        0.28,
      );
      mesh(leg, m.sphere, this.steel, 0, -0.4 * profile.legs, 0.06, 0.27 * thick, 0.23, 0.3);
      shin.position.y = -0.4 * profile.legs;
      leg.add(shin);
      mesh(
        shin,
        m.rounded,
        this.steel,
        0,
        -0.21 * profile.legs,
        0.02,
        0.22 * thick,
        0.36 * profile.legs,
        0.25,
      );
      mesh(shin, m.rounded, leather, 0, -0.4 * profile.legs, 0.12, 0.26 * thick, 0.16, 0.44);
    }
    // Torn cloth is a deformed surface, rather than a scaled icon or a rigid cone.
    const capeGeometry = new T.PlaneGeometry(0.9, 1.32, 8, 10);
    const verts = capeGeometry.attributes.position;
    for (let i = 0; i < verts.count; i++) {
      const y = verts.getY(i),
        u = (0.66 - y) / 1.32;
      verts.setX(i, verts.getX(i) * (0.72 + u * 0.4));
      if (u > 0.9) verts.setY(i, y + Math.sin(i * 2.7) * 0.09);
    }
    this.cape = new T.Mesh(capeGeometry, this.cloak);
    this.cape.position.set(0, 0.1, -0.27);
    this.cape.rotation.x = 0.12;
    this.cape.castShadow = true;
    this.cape.scale.set(...profile.cape);
    this.torso.add(this.cape);
    if (player) {
      const sash = mesh(this.torso, m.rounded, leather, 0.03, 0.35, 0.25, 0.13, 0.82, 0.07);
      sash.rotation.z = 0.7;
      const pauldron = mesh(this.leftArm, m.rounded, this.steel, 0.07, 0.015, 0, 0.52, 0.13, 0.52);
      pauldron.rotation.z = 0.22;
      if (shinobi) {
        mesh(this.head, m.cone, this.steel, 0, 0.32, 0, 0.82, 0.16, 0.7);
        mesh(this.head, m.cylinder, this.cloak, 0, 0.25, 0, 0.84, 0.025, 0.72);
      } else mesh(this.head, m.cone, this.cloak, 0, 0.37, -0.07, 0.35, 0.25, 0.33);
    }
    if (id === 'shield') {
      const shield = new T.Group();
      this.leftForearm.add(shield);
      shield.position.set(0.12, -0.18, 0.25);
      shield.scale.set(1.3, 1.2, 1);
      mesh(shield, m.sphere, m.items.iron, 0, 0, 0, 0.78, 1.18, 0.2);
      mesh(shield, m.sphere, this.steel, 0, 0.02, 0.1, 0.65, 1.03, 0.09);
      mesh(shield, m.rounded, m.items.bronze, 0, 0, 0.16, 0.05, 0.83, 0.04);
      mesh(shield, m.rounded, m.items.bronze, 0, 0.17, 0.16, 0.47, 0.05, 0.04);
    }
    if (id === 'beast') {
      mesh(this.head, m.sphere, m.items.moss, 0, 0.08, 0.18, 0.4, 0.33, 0.6);
      for (let i = 0; i < 7; i++) {
        const growth = mesh(
          this.torso,
          m.mushroom,
          m.items.moss,
          (i % 2 ? -1 : 1) * (0.2 + i * 0.04),
          0.35 - i * 0.08,
          -0.2,
          0.25 + i * 0.02,
          0.3 + (i % 3) * 0.2,
          0.3,
        );
        growth.rotation.z = i * 0.3;
      }
      for (const side of [-1, 1]) {
        const horn = mesh(
          this.head,
          m.cone,
          m.items.moss,
          side * 0.25,
          0.24,
          -0.05,
          0.19,
          0.7,
          0.22,
        );
        horn.rotation.z = -side * 0.6;
      }
    }
    if (id === 'monk') {
      mesh(this.torso, m.cone, this.cloak, 0, -0.32, 0, 0.9, 1.25, 0.72).rotation.z = Math.PI;
      mesh(this.head, m.cone, this.cloak, 0, 0.4, -0.02, 0.42, 0.65, 0.38);
      for (const side of [-1, 1])
        mesh(this.torso, m.rounded, m.items.bronze, side * 0.18, 0.15, 0.25, 0.07, 0.78, 0.035);
    }
    if (id === 'boss') {
      this.torso.add(this.mantle, this.revelation);
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const plate = mesh(
            this.mantle,
            m.rounded,
            this.steel,
            side * (0.45 + i * 0.09),
            0.55 - i * 0.13,
            -i * 0.04,
            0.5,
            0.12,
            0.64,
          );
          plate.rotation.z = -side * (0.15 + i * 0.12);
        }
        for (let i = 0; i < 3; i++)
          mesh(
            this.revelation,
            m.cone,
            m.items.trim,
            side * (0.4 + i * 0.17),
            0.5 + i * 0.12,
            -0.2,
            0.12,
            0.75,
            0.13,
          ).rotation.z = -side * 0.8;
      }
      const haloGeometry = new T.TorusGeometry(0.5, 0.035, 4, 24);
      this.ownedGeometry.add(haloGeometry);
      mesh(this.head, haloGeometry, m.items.bronze, 0, 0.25, -0.21, 1, 1, 1);
      mesh(this.head, m.rounded, m.items.trim, 0, 0.12, 0.24, 0.06, 0.52, 0.04);
    }
    // Scale rigid torso surfaces independently of the articulated limb hierarchy.
    for (const child of this.torso.children)
      if (child instanceof T.Mesh && child !== this.cape) {
        child.scale.multiply(new T.Vector3(...profile.chest));
        child.position.x *= profile.chest[0];
      }
    this.torso.add(this.detail);
    // Combat LOD adds segmented armor, buckles, chainmail and rivets at close scale.
    for (const side of [-1, 1])
      for (let i = 0; i < 4; i++) {
        mesh(
          this.detail,
          m.rounded,
          this.steel,
          side * 0.31,
          0.03 + i * 0.12,
          0.14,
          0.15,
          0.085,
          0.22,
        );
        mesh(
          this.detail,
          m.sphere,
          m.items.bronze,
          side * 0.28,
          0.1 + i * 0.13,
          0.255,
          0.035,
          0.035,
          0.035,
        );
      }
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 8; col++)
        mesh(
          this.detail,
          m.sphere,
          m.items.iron,
          (col - 3.5) * 0.065,
          -0.18 - row * 0.065,
          0.2,
          0.045,
          0.06,
          0.025,
        );
    for (let i = 0; i < 4; i++)
      mesh(this.detail, m.rounded, leather, 0.25, -0.02 - i * 0.1, -0.23, 0.15, 0.08, 0.1);
    this.setWeapon(
      id === 'spear'
        ? 'spear'
        : ['brute', 'boss'].includes(id)
          ? 'great'
          : id === 'assassin'
            ? 'twins'
            : 'sword',
    );
    if (id === 'beast') {
      this.blade.clear();
      for (const hand of [this.blade, this.offhand])
        for (let i = 0; i < 3; i++) {
          const claw = mesh(
            hand,
            m.cone,
            m.items.bronze,
            (i - 1) * 0.1,
            0.1,
            0.14,
            0.075,
            0.45,
            0.07,
          );
          claw.rotation.x = 0.5;
        }
    }
    if (id === 'player-great') {
      for (const side of [-1, 1])
        mesh(this.torso, m.cone, m.items.bronze, side * 0.33, -0.26, 0.23, 0.18, 0.22, 0.18);
    } else if (id === 'player-spear') {
      mesh(this.torso, m.rounded, this.cloak, 0.24, 0.5, 0.18, 0.22, 0.8, 0.11);
      mesh(this.head, m.rounded, m.items.trim, 0, 0.3, 0.22, 0.35, 0.06, 0.06);
    } else if (id === 'player-twins') {
      for (const side of [-1, 1]) {
        const wing = mesh(
          this.mantle,
          m.rounded,
          this.cloak,
          side * 0.32,
          -0.12,
          -0.24,
          0.32,
          0.7,
          0.06,
        );
        wing.rotation.z = side * 0.3;
      }
    }
    this.mergeRigidParts(this.root);
    if (player) this.createOutline();
    if (id === 'archer' || id === 'hexer') this.setWeapon(id === 'archer' ? 'bow' : 'bell');
  }

  private createOutline(): void {
    if (!this.outline) {
      this.outline = new T.ShaderMaterial({
        uniforms: {
          color: {
            value: new T.Color(
              this.player ? characterFor(this.id.replace('player-', '')).color : '#e7d5ab',
            ),
          },
          thickness: { value: 0.012 },
          strength: { value: 0.55 },
        },
        vertexShader:
          'uniform float thickness; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * thickness, 1.0); }',
        fragmentShader:
          'uniform vec3 color; uniform float strength; void main(){ gl_FragColor = vec4(color, strength); }',
        side: T.BackSide,
        transparent: true,
        depthWrite: false,
      });
      this.addOutline(this.root);
    }
  }

  private addOutline(root: T.Group): void {
    if (!this.outline) return;
    const meshes: T.Mesh[] = [];
    root.traverse((o) => {
      if (o instanceof T.Mesh && o !== this.contact && o.material !== this.outline) meshes.push(o);
    });
    for (const source of meshes) {
      const shell = new T.Mesh(source.geometry, this.outline);
      shell.visible = this.outlineStrength !== 0;
      shell.position.copy(source.position);
      shell.rotation.copy(source.rotation);
      shell.scale.copy(source.scale);
      source.parent!.add(shell);
    }
  }
  setOutline(strength: number): void {
    if (this.imported) {
      this.outlineStrength = strength;
      this.imported.setOutline(strength);
      return;
    }
    if (this.outlineStrength === strength) return;
    this.outlineStrength = strength;
    if (strength > 0) this.createOutline();
    if (this.outline) {
      this.outline.uniforms.strength.value = strength;
      this.outline.uniforms.thickness.value = strength > 0.8 ? 0.026 : 0.014;
      this.root.traverse((o) => {
        if (o instanceof T.Mesh && o.material === this.outline) o.visible = strength > 0;
      });
    }
  }
  setEmphasis(selected: boolean): void {
    this.steel.color.set(selected ? '#899d9f' : '#39474b');
  }

  private mergeRigidParts(parent: T.Group): void {
    const groups = new Map<T.Material, T.Mesh[]>();
    for (const child of [...parent.children]) {
      if (child instanceof T.Group) this.mergeRigidParts(child);
      else if (child instanceof T.Mesh && child !== this.cape && child !== this.contact) {
        const material = child.material as T.Material;
        const group = groups.get(material) ?? [];
        group.push(child);
        groups.set(material, group);
      }
    }
    for (const [material, meshes] of groups)
      if (meshes.length > 1) {
        const pieces = meshes.map((mesh) => {
          mesh.updateMatrix();
          const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
          g.applyMatrix4(mesh.matrix);
          return g;
        });
        const merged = mergeGeometries(pieces);
        pieces.forEach((g) => g.dispose());
        if (!merged) continue;
        this.ownedGeometry.add(merged);
        for (const mesh of meshes) parent.remove(mesh);
        const mesh = new T.Mesh(merged, material);
        mesh.castShadow = mesh.receiveShadow = true;
        parent.add(mesh);
      }
  }

  setWeapon(id: string): void {
    if (this.weaponId === id) return;
    this.weaponId = id;
    const releaseGeometry = (obj: T.Object3D) => {
      if (obj instanceof T.Mesh && this.ownedGeometry.has(obj.geometry)) {
        obj.geometry.dispose();
        this.ownedGeometry.delete(obj.geometry);
      }
    };
    this.blade.traverse(releaseGeometry);
    this.offhand.traverse(releaseGeometry);
    this.blade.clear();
    this.offhand.clear();
    const m = this.materials;
    const piece = (
      geometry: T.BufferGeometry,
      material: T.Material,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
    ) => {
      const mesh = new T.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      this.blade.add(mesh);
      return mesh;
    };
    if (id === 'bow' || id === 'bell') {
      if (id === 'bow') {
        const curve = new T.EllipseCurve(0, 0, 0.35, 0.8, -Math.PI / 2, Math.PI / 2, false, 0);
        const points = curve.getPoints(16).map((p) => new T.Vector3(p.x, p.y, 0));
        const geometry = new T.TubeGeometry(new T.CatmullRomCurve3(points), 16, 0.035, 5, false);
        this.ownedGeometry.add(geometry);
        piece(geometry, m.items.wood, 0, 0.3, 0, 1, 1, 1);
        piece(m.cylinder, m.items.trim, 0, 0.3, 0, 0.008, 1.6, 0.008);
      } else {
        piece(m.cylinder, m.items.wood, 0, 0.5, 0, 0.07, 1.5, 0.07);
        piece(m.cone, m.items.bronze, 0, 1.3, 0, 0.4, 0.45, 0.4);
      }
      this.blade.rotation.x = 0;
      return;
    }
    piece(m.cylinder, m.items.wood, 0, 0.08, 0, 0.08, id === 'spear' ? 1.8 : 0.29, 0.08);
    piece(m.sphere, m.items.bronze, 0, -0.1, 0, 0.14, 0.14, 0.14);
    const length = id === 'spear' ? 0.55 : id === 'great' ? 1.38 : id === 'twins' ? 0.65 : 1.04,
      base = id === 'spear' ? 1 : 0.27;
    piece(m.rounded, m.items.bronze, 0, base, 0, id === 'great' ? 0.38 : 0.3, 0.065, 0.09);
    piece(
      m.rounded,
      this.steel,
      0,
      base + length * 0.45,
      0,
      id === 'great' ? 0.22 : 0.115,
      length,
      0.043,
    );
    piece(
      m.cone,
      this.steel,
      0,
      base + length * 0.97,
      0,
      id === 'great' ? 0.22 : 0.115,
      0.2,
      0.043,
    );
    piece(m.rounded, m.items.trim, -0.047, base + length * 0.45, 0.027, 0.018, length * 0.85, 0.01);
    if (this.id === 'boss') {
      piece(m.rounded, m.items.bronze, 0, base + length * 0.45, 0, 0.6, 0.08, 0.08);
      for (const side of [-1, 1])
        piece(m.cone, m.items.bronze, side * 0.15, base + length * 0.86, 0, 0.09, 0.5, 0.09);
    }
    this.blade.rotation.x = Math.PI * 0.5;
    if (id === 'twins') {
      const second = this.blade.clone(true);
      second.position.set(0, 0, 0);
      second.rotation.x = Math.PI * 0.5;
      this.offhand.add(second);
    }
    this.mergeRigidParts(this.blade);
    this.mergeRigidParts(this.offhand);
    if (this.outline) {
      this.addOutline(this.blade);
      this.addOutline(this.offhand);
    }
  }

  animate(
    entity: Player | Enemy,
    time: number,
    visualTime: number,
    walking: boolean,
    duel: number,
    weapon: string,
    options?: {
      clip: string;
      clipTime: number;
      freeze: boolean;
      reducedMotion?: boolean;
      wind?: number;
      executionVariant?: number;
      velocity?: number;
      turnRate?: number;
      targetFacing?: number;
    },
  ) {
    if (this.player) this.setWeapon(weapon);
    if (this.lastPosition)
      walking = walking && this.root.position.distanceToSquared(this.lastPosition) > 0.000002;
    this.lastPosition ??= new T.Vector3();
    this.lastPosition.copy(this.root.position);
    const preview = options?.freeze;
    const sample = this.animation.sample(this.id, entity, time, this.weaponId, duel > 0.1, {
      clip: preview ? options.clip : 'live',
      time: options?.clipTime ?? 0,
      variant: options?.executionVariant,
      velocity: options?.velocity,
      turnRate: options?.turnRate,
      targetFacing: options?.targetFacing,
      reducedMotion: options?.reducedMotion,
    });
    const pose = sample.pose;
    const facing = -this.animation.facing + Math.PI / 2;
    this.turning = this.animation.cloth;
    this.root.rotation.y = facing;
    for (const joint of JOINTS) {
      this[joint].rotation.set(...pose[joint]);
    }
    if (this.weaponId !== 'bow' && this.weaponId !== 'bell') this.blade.rotation.x += Math.PI / 2;
    this.root.rotation.z = pose.lean;
    this.contact.visible = entity.state !== 'dead';
    this.body.position.set(0, pose.lift, pose.advance);
    this.body.rotation.y = this.animation.hips;
    const phase = 'phase' in entity ? entity.phase : 1;
    this.mantle.visible = phase === 1;
    this.revelation.visible = phase === 2;
    if (this.id === 'boss')
      this.cape.scale.set(phase === 2 ? 1.1 : 1.8, phase === 2 ? 0.85 : 1.5, 1);
    this.detail.visible = duel > 0.15 && this.id !== 'beast';
    if (this.weaponId === 'spear' || sample.name.includes('/thrust/')) {
      this.root.updateMatrixWorld(true);
      const swing =
        'strike' in entity && entity.strike.kind === 'sweep'
          ? pose.torso[1] - this.profile.turn
          : 0;
      const direction = new T.Vector3(
        Math.cos(entity.facing - swing),
        0.03,
        Math.sin(entity.facing - swing),
      ).normalize();
      const parentRotation = this.rightForearm.getWorldQuaternion(new T.Quaternion()).invert();
      this.blade.quaternion
        .copy(parentRotation)
        .multiply(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), direction));
    }
    if (this.weaponId === 'spear' || this.weaponId === 'great') this.supportGrip();
    const acceleration = Math.abs(pose.advance - this.previousAdvance);
    this.previousAdvance = pose.advance;
    const positions = this.cape.geometry.attributes.position;
    const clock = options?.freeze || options?.reducedMotion ? time : visualTime;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i),
        u = (0.66 - y) / 1.32;
      positions.setZ(
        i,
        Math.sin(clock * 3 + positions.getX(i) * 5 + u * 3) *
          u *
          (0.07 + Math.abs(options?.wind ?? 0) * 0.035) +
          u * u * (0.16 + (walking ? 0.16 : 0) + Math.min(0.3, acceleration * 2)),
      );
    }
    this.cape.rotation.z = Math.max(-0.25, Math.min(0.25, -this.turning * 1.2));
    positions.needsUpdate = true;
    if (duel > 0.1) this.cape.geometry.computeVertexNormals();
    const asset = this.model ?? characterAsset(this.id);
    if (asset && this.assets?.has(asset)) {
      const level = duel > 0.45 && this.assets.highDetail ? 0 : 1;
      if (!this.imported || this.importedLevel !== level) {
        this.imported?.dispose();
        this.root.traverse((obj) => {
          if (obj instanceof T.Mesh && obj !== this.contact) obj.visible = false;
        });
        this.imported = new ImportedActor(this.assets, asset, level);
        this.imported.setOutline(this.outlineStrength > 0 ? this.outlineStrength : 0);
        this.root.add(this.imported.root);
        this.importedLevel = level;
      }
      this.imported.animate(
        pose,
        options?.reducedMotion ? 0 : clock,
        this.weaponId === 'spear' || sample.name.includes('/thrust/'),
        phase,
        this.animation.hips,
        this.animation.cloth +
          (options?.reducedMotion ? 0 : (options?.wind ?? 0) * 0.06 * Math.sin(clock * 1.5)),
      );
    }
    return sample;
  }

  private supportGrip(): void {
    this.root.updateMatrixWorld(true);
    const target = this.blade.localToWorld(
      new T.Vector3(0, this.weaponId === 'spear' ? 0.35 : 0.04, 0),
    );
    this.torso.worldToLocal(target);
    const shoulder = this.leftArm.position;
    const direction = target.sub(shoulder);
    const upper = 0.34 * this.profile.arms,
      lower = 0.35 * this.profile.arms;
    const length = Math.max(0.05, Math.min(upper + lower - 0.001, direction.length()));
    direction.normalize();
    const along = (upper * upper - lower * lower + length * length) / (2 * length);
    const outward = new T.Vector3(0, 0, -1).cross(direction).normalize();
    const elbow = direction
      .clone()
      .multiplyScalar(along)
      .addScaledVector(outward, Math.sqrt(Math.max(0, upper * upper - along * along)));
    this.leftArm.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), elbow.clone().normalize());
    const fore = direction
      .multiplyScalar(length)
      .sub(elbow)
      .applyQuaternion(this.leftArm.quaternion.clone().invert());
    this.leftForearm.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), fore.normalize());
  }
  dispose(): void {
    this.imported?.dispose();
    const shared = Object.values(this.materials.items),
      owned = new Set<T.Material>();
    this.root.traverse((obj) => {
      if (obj instanceof T.Mesh) {
        const mat = obj.material as T.Material;
        if (!shared.includes(mat as T.MeshStandardMaterial)) owned.add(mat);
      }
    });
    owned.forEach((m) => m.dispose());
    this.ownedGeometry.forEach((g) => g.dispose());
    this.cape.geometry.dispose();
  }
}
