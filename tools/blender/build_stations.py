"""
Preservation Panic — Blender asset builder.

Builds the six preservation machines and exports each as an optimised GLB that
drops straight into the game. Run it either way:

    # headless, no Blender window needed
    blender --background --python tools/blender/build_stations.py

    # or: open Blender, Scripting tab, Open this file, Run Script

Output lands in  public/assets/models/stations/  as one GLB per station class,
named exactly as the game names it, because src/world/AssetRegistry.js looks the
file up by station id:

    DryingRack.glb  Freezer.glb  VacuumSealer.glb
    PicklingJar.glb  SaltTable.glb  Pasteuriser.glb

WHY THE PROPORTIONS ARE FIXED
Each machine is modelled to the same envelope the procedural version uses, with
its origin at the centre of the base:

    width  X  ±1.15      depth  Z  ±0.95      height Y   0 .. 2.45

The game's Station.build() scales the whole body by 1.22 and sits it on a
counter island, so anything outside that envelope will clip the island or the
name plate. Keep new parts inside it.

Blender is Z-up and the game is Y-up; the glTF exporter converts automatically
(+Y up), so model in normal Blender orientation and it arrives correct.
"""

import bpy
import bmesh
import math
import os
from mathutils import Vector

# --------------------------------------------------------------------- setup

# `__file__` is absent when the script is exec'd from a string (which is how the
# Blender MCP bridge runs it), so fall back to the blend file's folder and let
# PP_OUT_DIR override either way.
HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
OUT_DIR = os.environ.get("PP_OUT_DIR") or os.path.normpath(
    os.path.join(HERE, "..", "..", "public", "assets", "models", "stations"))

# Palette mirrors src/world/Palette.js so the GLBs match the procedural look.
PALETTE = {
    "wood":          (0.66, 0.42, 0.19, 1),
    "wood_dark":     (0.48, 0.27, 0.12, 1),
    "steel":         (0.78, 0.81, 0.85, 1),
    "steel_dark":    (0.42, 0.46, 0.51, 1),
    "plastic_white": (0.94, 0.96, 0.98, 1),
    "rubber":        (0.20, 0.22, 0.26, 1),
    "brass":         (0.85, 0.64, 0.25, 1),
    "glass":         (0.78, 0.90, 0.95, 0.35),
    "drying":        (1.00, 0.65, 0.15, 1),
    "freezing":      (0.26, 0.65, 0.96, 1),
    "freezing_deep": (0.09, 0.41, 0.72, 1),
    "vacuum":        (0.67, 0.28, 0.74, 1),
    "pickling":      (0.40, 0.73, 0.42, 1),
    "pickling_deep": (0.18, 0.42, 0.20, 1),
    "salting":       (0.94, 0.33, 0.31, 1),
    "hot":           (1.00, 0.44, 0.26, 1),
    "cold":          (0.16, 0.71, 0.96, 1),
    "dried_fish":    (0.66, 0.45, 0.18, 1),
    "salt":          (0.99, 0.99, 1.00, 1),
}

_materials = {}


def mat(name, rough=0.45, metal=0.0):
    """One material per palette entry, reused across every machine."""
    key = (name, rough, metal)
    if key in _materials:
        return _materials[key]
    m = bpy.data.materials.new(f"pp_{name}")
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    col = PALETTE[name]
    bsdf.inputs["Base Color"].default_value = col
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if len(col) > 3 and col[3] < 1.0:
        bsdf.inputs["Alpha"].default_value = col[3]
        m.blend_method = "BLEND"
    _materials[key] = m
    return m


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for item in list(block):
            if item.users == 0:
                block.remove(item)
    _materials.clear()


# ------------------------------------------------------------------ primitives

def box(name, size, loc=(0, 0, 0), rot=(0, 0, 0), material="steel",
        bevel=0.02, rough=0.45, metal=0.0):
    """
    Bevelled box. The bevel is what stops everything reading as a placeholder —
    a hard-edged cube is the single fastest way to look unfinished.
    """
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        b = o.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = 2
        b.limit_method = "ANGLE"
        b.angle_limit = math.radians(40)
    o.data.materials.append(mat(material, rough, metal))
    _shade(o)
    return o


def cyl(name, radius, depth, loc=(0, 0, 0), rot=(0, 0, 0), material="steel",
        verts=24, bevel=0.012, rough=0.4, metal=0.0):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, vertices=verts,
                                        location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    if bevel > 0:
        b = o.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = 2
        b.limit_method = "ANGLE"
        b.angle_limit = math.radians(40)
    o.data.materials.append(mat(material, rough, metal))
    _shade(o)
    return o


def sphere(name, radius, loc=(0, 0, 0), scale=(1, 1, 1), material="steel",
           segments=20, rings=12, rough=0.45, metal=0.0):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, segments=segments,
                                         ring_count=rings, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat(material, rough, metal))
    _shade(o)
    return o


def torus(name, major, minor, loc=(0, 0, 0), rot=(0, 0, 0), material="steel",
          rough=0.4, metal=0.0):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=24, minor_segments=10,
                                     location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat(material, rough, metal))
    _shade(o)
    return o


def cone(name, r1, r2, depth, loc=(0, 0, 0), rot=(0, 0, 0), material="steel",
         verts=16, rough=0.45, metal=0.0):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth,
                                    vertices=verts, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat(material, rough, metal))
    _shade(o)
    return o


def _shade(o):
    """Smooth shading with an auto-smooth angle keeps bevels crisp."""
    bpy.ops.object.shade_smooth()
    if hasattr(o.data, "use_auto_smooth"):          # Blender < 4.1
        o.data.use_auto_smooth = True
        o.data.auto_smooth_angle = math.radians(35)


def join(name, objs):
    """
    Merge a group of parts into one named object.

    Each machine exports as a SMALL HIERARCHY, not one welded lump: a static
    shell plus one object per moving part. The game looks those parts up by name
    and animates them, so a door that cannot be separated from its cabinet is
    useless however good it looks.
    """
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    # Apply modifiers so the GLB carries real geometry, not modifier stacks.
    bpy.ops.object.convert(target="MESH")
    return o


def set_pivot(obj, point):
    """
    Move an object's origin to its hinge/axis without moving the geometry.

    A door has to rotate about its hinge, not its centre. The game only sets
    `rotation.y` on the node, so the pivot must be baked here.
    """
    if obj is None:
        return None
    prev = bpy.context.scene.cursor.location.copy()
    bpy.context.scene.cursor.location = Vector(point)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.context.scene.cursor.location = prev
    return obj


def face_front(obj):
    """
    Turn a machine around to face the player.

    Blender is Z-up and glTF is Y-up, and the exporter's conversion sends
    Blender +Y to glTF -Z. The three.js camera looks down +Z, so a machine
    modelled facing +Y (the natural way to author it in Blender's front view)
    arrives with its back to the player: a freezer becomes a blank white box and
    every recognition cue — the snowflake, the dial, the window — is hidden.

    Mirroring in Y rather than rotating keeps left and right where the game's
    animation code expects them (the door still hinges on the same side), so the
    winding order is reversed afterwards to keep the normals pointing out.
    """
    if obj is None:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    # location=True is Blender's default. Explicitly disable it here because
    # movers have already had their origins placed on a hinge by set_pivot().
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for v in bm.verts:
        v.co.y = -v.co.y
    bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    obj.location.y = -obj.location.y
    return obj


# ------------------------------------------------------------------- machines

def build_drying():
    """A-frame rack, hanging fish, sun. Silhouette: an open timber frame."""
    parts = []
    for sx in (-1, 1):
        for sz in (-0.55, 0.55):
            parts.append(cyl(f"leg{sx}{sz}", 0.075, 2.15, (sx * 0.86, sz, 1.08),
                             material="wood_dark", verts=10, rough=0.75))
        parts.append(box(f"foot{sx}", (0.13, 1.35, 0.13), (sx * 0.9, 0, 0.62),
                         material="wood", rough=0.72))
    for sz in (-0.55, 0.55):
        parts.append(cyl(f"bar{sz}", 0.07, 1.95, (0, sz, 2.16),
                         rot=(0, math.radians(90), 0), material="wood", verts=10, rough=0.72))
    parts.append(cyl("spine", 0.06, 1.2, (0, 0, 2.16),
                     rot=(math.radians(90), 0, 0), material="wood", verts=8, rough=0.72))

    # Hooks + fish already hanging: the rack must be recognisable at rest,
    # because Stage 4 asks the child to name the machine with no label.
    for i in (-1, 0, 1):
        parts.append(cyl(f"hook{i}", 0.018, 0.3, (i * 0.52, 0, 1.95),
                         material="steel", verts=6, metal=0.8, rough=0.3))
        parts.append(torus(f"ring{i}", 0.08, 0.02, (i * 0.52, 0, 1.78),
                           rot=(0.2, 0, 0), material="steel", metal=0.8, rough=0.3))
    for i in (-1, 1):
        x = i * 0.52
        parts.append(sphere(f"fish{i}", 1.0, (x, 0, 1.55), (0.42, 0.12, 0.19),
                            material="dried_fish", rough=0.85))
        parts.append(sphere(f"fishback{i}", 1.0, (x, 0, 1.68), (0.34, 0.10, 0.07),
                            material="wood_dark", rough=0.85))
        for lobe in (-1, 1):
            parts.append(cone(f"tail{i}{lobe}", 0.13, 0.0, 0.26,
                              (x - 0.46, 0, 1.55 + lobe * 0.09),
                              rot=(0, math.radians(90) + lobe * 0.45, 0),
                              material="wood_dark", verts=3))

    # Slatted drip tray
    for i in range(7):
        parts.append(box(f"slat{i}", (1.7, 0.09, 0.045), (0, -0.42 + i * 0.14, 0.52),
                         material="wood", rough=0.72, bevel=0.01))

    # Sun — the hero prop and the thing the player drags in-game.
    parts.append(sphere("sun", 0.3, (-1.15, 0.62, 2.1), material="drying", rough=0.35))
    for i in range(10):
        a = (i / 10) * math.tau
        parts.append(cone(f"ray{i}", 0.055, 0.0, 0.24,
                          (-1.15 + math.cos(a) * 0.44, 0.62, 2.1 + math.sin(a) * 0.44),
                          rot=(0, 0, a - math.pi / 2), material="drying", verts=4))
    return split(parts, sun=("sun", "ray"))


def build_freezer():
    """Upright cabinet, glazed door, six-spoke snowflake badge, temperature dial."""
    parts = []
    parts.append(box("cabinet", (2.1, 1.6, 2.25), (0, 0, 1.32),
                     material="plastic_white", bevel=0.09, rough=0.35))
    parts.append(box("header", (2.16, 1.66, 0.34), (0, 0, 2.36),
                     material="freezing", bevel=0.06))
    parts.append(box("kick", (2.2, 1.7, 0.14), (0, 0, 0.28),
                     material="freezing_deep", bevel=0.04))
    parts.append(box("interior", (1.78, 1.2, 1.78), (0, 0.06, 1.28),
                     material="rubber", bevel=0.03, rough=0.7))
    for z in (0.78, 1.5):
        for i in range(6):
            parts.append(cyl(f"shelf{z}{i}", 0.018, 1.6, (0, -0.36 + i * 0.16, z),
                             rot=(0, math.radians(90), 0), material="steel",
                             verts=6, metal=0.8, bevel=0))

    # Door
    parts.append(box("door", (2.02, 0.18, 2.15), (0, 0.8, 1.32),
                     material="plastic_white", bevel=0.07, rough=0.3))
    parts.append(box("window_frame", (1.62, 0.1, 1.66), (0, 0.86, 1.44),
                     material="freezing_deep", bevel=0.05))
    parts.append(box("window", (1.46, 0.07, 1.5), (0, 0.92, 1.44),
                     material="glass", bevel=0.04, rough=0.05))
    parts.append(cyl("handle", 0.06, 1.5, (0.85, 1.02, 1.32),
                     rot=(math.radians(90), 0, 0), material="steel", metal=0.85, rough=0.28))
    for z in (-0.62, 0.62):
        parts.append(cyl(f"handle_mount{z}", 0.045, 0.26, (0.85, 0.92, 1.32 + z),
                         rot=(math.radians(90), 0, 0), material="steel_dark", metal=0.8))

    # Snowflake badge — six spokes with branches. Three crossed bars read as an
    # asterisk, which is not a recognition cue.
    for i in range(6):
        a = (i / 6) * math.tau
        parts.append(box(f"flake{i}", (0.34, 0.03, 0.055),
                         (math.cos(a) * 0.17, 0.9, 0.5 + math.sin(a) * 0.17),
                         rot=(0, 0, a), material="freezing_deep", bevel=0.01))
        for b in (-1, 1):
            parts.append(box(f"branch{i}{b}", (0.14, 0.03, 0.042),
                             (math.cos(a) * 0.26 + math.cos(a + b * 1.05) * 0.06, 0.9,
                              0.5 + math.sin(a) * 0.26 + math.sin(a + b * 1.05) * 0.06),
                             rot=(0, 0, a + b * 1.05), material="freezing_deep", bevel=0.008))

    # Fascia + dial: the dial is the interaction that teaches 0°C vs 4°C.
    parts.append(box("fascia", (1.5, 0.1, 0.3), (0, 0.86, 2.36),
                     material="rubber", bevel=0.03, rough=0.6))
    parts.append(cyl("dial_ring", 0.26, 0.1, (0.78, 0.86, 1.05),
                     rot=(math.radians(90), 0, 0), material="steel_dark", metal=0.7))
    parts.append(cyl("dial_knob", 0.21, 0.14, (0.78, 0.92, 1.05),
                     rot=(math.radians(90), 0, 0), material="freezing_deep"))
    parts.append(box("dial_pointer", (0.045, 0.06, 0.15), (0.78, 0.98, 1.16),
                     material="plastic_white", bevel=0.01))
    return split(parts,
                 door=("door", "window", "handle", "flake", "branch"),
                 dial=("dial_knob", "dial_pointer"))


def build_vacuum():
    """
    Toy-like countertop chamber sealer.

    Keep the GLB focused on the parts Blender improves: the recognisable shell
    and the three rigid movers. The live gauge face, deforming bag, sealing bar
    and air particles remain procedural because they react continuously to the
    player's hold progress. In particular, do not model a second gauge here --
    the old asset overlapped the procedural gauge and looked unfinished.

    Five shared materials and broad, bevelled forms keep this readable on a
    phone without spending the frame budget on tiny surface detail.
    """
    parts = []

    # Layered wedge body: one strong silhouette, with a dark recessed chamber
    # and purple side cheeks that frame the place where the bag belongs.
    parts.append(box("base", (2.24, 1.42, 0.56), (0, 0, 0.52),
                     material="plastic_white", bevel=0.12, rough=0.38))
    parts.append(box("lower_band", (2.28, 1.45, 0.16), (0, 0, 0.29),
                     material="vacuum", bevel=0.055, rough=0.42))
    parts.append(box("rear_console", (2.08, 0.48, 0.36), (0, -0.43, 0.88),
                     material="plastic_white", bevel=0.09, rough=0.38))
    parts.append(box("chamber", (1.68, 0.82, 0.11), (0, 0.08, 0.84),
                     material="rubber", bevel=0.045, rough=0.72))
    parts.append(box("front_band", (2.10, 0.16, 0.30), (0, 0.64, 0.91),
                     material="vacuum", bevel=0.055, rough=0.42))
    for x in (-1.01, 1.01):
        parts.append(box(f"side_cheek{x}", (0.20, 1.18, 0.32), (x, -0.02, 0.84),
                         material="vacuum", bevel=0.065, rough=0.42))

    # Three simple status lamps make the front panel feel intentional without
    # a texture lookup. They share existing materials, so they add no draw-call
    # category after joining.
    for i, material in enumerate(("vacuum", "plastic_white", "rubber")):
        parts.append(cyl(f"status{i}", 0.045, 0.035, (0.34 + i * 0.15, 0.735, 0.96),
                         rot=(math.radians(90), 0, 0), material=material,
                         verts=8, bevel=0.006,
                         rough=0.42 if material == "vacuum" else (0.38 if material == "plastic_white" else 0.72)))

    # Closed lid authored around the same rear hinge used by the procedural
    # station. Four frame rails leave a real transparent cut-out instead of
    # stacking glass over an opaque panel.
    parts.append(box("lid_rear", (2.14, 0.22, 0.17), (0, -0.57, 1.12),
                     material="vacuum", bevel=0.065, rough=0.42))
    parts.append(box("lid_front", (2.14, 0.25, 0.17), (0, 0.55, 1.12),
                     material="vacuum", bevel=0.065, rough=0.42))
    for x in (-0.98, 0.98):
        parts.append(box(f"lid_side{x}", (0.18, 1.02, 0.17), (x, 0, 1.12),
                         material="vacuum", bevel=0.06, rough=0.42))
    parts.append(box("lid_window", (1.78, 0.86, 0.055), (0, -0.01, 1.105),
                     material="glass", bevel=0.025, rough=0.08))
    parts.append(box("lid_grip", (1.04, 0.13, 0.13), (0, 0.69, 1.19),
                     material="vacuum", bevel=0.05, rough=0.42))

    # The live canvas gauge remains procedural. Only its needle is replaced,
    # preserving the crisp AIR/SEALED readout while matching the GLB styling.
    parts.append(box("needle", (0.025, 0.02, 0.24), (-0.84, 0.79, 1.22),
                     rot=(math.radians(60), 0, 0), material="salting",
                     bevel=0.005, rough=0.35))

    # Compact pump pod. Broad ribs replace the old seven torus hose pieces,
    # saving triangles and avoiding the visual knot where GLB and procedural
    # pumps previously occupied the same space.
    parts.append(cyl("pump_body", 0.29, 0.47, (0.85, 0.50, 1.36),
                     material="vacuum", verts=12, bevel=0.025, rough=0.42))
    parts.append(cyl("pump_cap", 0.30, 0.09, (0.85, 0.50, 1.62),
                     material="vacuum", verts=12, bevel=0.018, rough=0.42))
    for i in range(3):
        parts.append(box(f"pump_rib{i}", (0.44, 0.08, 0.055),
                         (0.85, 0.79, 1.25 + i * 0.13), material="vacuum",
                         bevel=0.018, rough=0.42))
    parts.append(cyl("pump_button", 0.095, 0.055, (0.85, 0.50, 1.70),
                     material="salting", verts=10, bevel=0.012, rough=0.35))

    return split(parts, lid=("lid",), needle=("needle",), pump=("pump",))


def build_pickling():
    """Bench + the hero jar + three solution bottles (all three are correct)."""
    parts = []
    parts.append(box("bench", (2.3, 1.5, 0.9), (0, 0, 0.66), material="wood_dark", rough=0.78))
    parts.append(box("top", (2.35, 1.55, 0.14), (0, 0, 1.16), material="pickling", bevel=0.04))

    # Jar — scaled to be the dominant shape, because it is the whole station.
    s = 1.12
    parts.append(cyl("jar_body", 0.46 * s, 1.05 * s, (0, 0.16, 1.18 + 0.52 * s),
                     material="glass", verts=28, rough=0.05, bevel=0))
    parts.append(cyl("jar_base", 0.44 * s, 0.05, (0, 0.16, 1.20),
                     material="glass", verts=24, rough=0.05, bevel=0))
    parts.append(torus("jar_rim", 0.46 * s, 0.045, (0, 0.16, 1.18 + 1.03 * s),
                       material="glass", rough=0.05))
    for i in range(3):
        parts.append(torus(f"neck{i}", 0.44 * s, 0.022,
                           (0, 0.16, 1.18 + (0.9 + i * 0.05) * s), material="glass", rough=0.05))
    parts.append(cyl("lid", 0.5 * s, 0.16, (0, 0.16, 1.18 + 1.12 * s),
                     material="pickling_deep", verts=26))
    for i in range(20):
        a = (i / 20) * math.tau
        parts.append(box(f"knurl{i}", (0.035, 0.035, 0.15),
                         (math.cos(a) * 0.49 * s, 0.16 + math.sin(a) * 0.49 * s,
                          1.18 + 1.12 * s), material="pickling_deep", bevel=0.005))

    # Three bottles: vinegar, sugar solution, salt solution — §5C lists all three.
    for i, colour in enumerate(("brass", "pickling", "plastic_white")):
        x = -0.78 + i * 0.78
        parts.append(cyl(f"bottle{i}", 0.15, 0.46, (x, -0.72, 1.49),
                         material="glass", verts=14, rough=0.05, bevel=0))
        parts.append(cyl(f"fill{i}", 0.135, 0.3, (x, -0.72, 1.44), material=colour, verts=14))
        parts.append(cone(f"neck_b{i}", 0.15, 0.06, 0.16, (x, -0.72, 1.80),
                          material="glass", verts=12))
        parts.append(cyl(f"cap{i}", 0.07, 0.07, (x, -0.72, 1.90), material="wood_dark"))
    return split(parts, lid=("lid", "knurl"),
                 bottle_a=("bottle0", "fill0", "neck_b0", "cap0"),
                 bottle_b=("bottle1", "fill1", "neck_b1", "cap1"),
                 bottle_c=("bottle2", "fill2", "neck_b2", "cap2"))


def build_salting():
    """Rustic table, an open crate heaped with salt, a big shaker, a scoop."""
    parts = []
    parts.append(box("table", (2.3, 1.5, 0.16), (0, 0, 1.12), material="wood", rough=0.8))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box(f"leg{sx}{sy}", (0.16, 0.16, 1.0),
                             (sx * 0.98, sy * 0.6, 0.62), material="wood_dark", rough=0.82))
    parts.append(box("edge", (2.3, 0.1, 0.1), (0, 0.72, 1.21), material="salting", bevel=0.02))

    # Open crate, so the salt inside reads as a mass — §5F stresses "a large
    # quantity of salt", and a shallow tray did not communicate that.
    cx, cy = -0.6, 0.0
    parts.append(box("crate_floor", (1.35, 1.1, 0.1), (cx, cy, 1.25), material="wood", rough=0.8))
    for dx, dy, w, d in ((0, -0.55, 1.35, 0.1), (0, 0.55, 1.35, 0.1),
                         (-0.68, 0, 0.1, 1.1), (0.68, 0, 0.1, 1.1)):
        parts.append(box(f"crate_wall{dx}{dy}", (w, d, 0.5), (cx + dx, cy + dy, 1.48),
                         material="wood", rough=0.8))
    parts.append(sphere("heap", 1.0, (cx, cy, 1.64), (0.66, 0.54, 0.42),
                        material="salt", rough=0.9))
    for i in range(22):
        a = (i / 22) * math.tau * 3
        r = 0.15 + (i % 5) * 0.11
        parts.append(box(f"grain{i}", (0.05, 0.05, 0.05),
                         (cx + math.cos(a) * r, cy + math.sin(a) * r * 0.8, 1.72 + (i % 3) * 0.05),
                         rot=(a, a * 0.5, a * 0.3), material="salt", bevel=0.006))

    # Shaker — the recognition silhouette.
    parts.append(cone("shaker", 0.26, 0.32, 0.72, (0.86, -0.3, 1.56),
                      material="plastic_white", verts=16, rough=0.35))
    parts.append(cyl("shaker_cap", 0.27, 0.2, (0.86, -0.3, 2.0), material="steel", metal=0.8))
    for i in range(5):
        a = (i / 5) * math.tau
        parts.append(cyl(f"hole{i}", 0.022, 0.05,
                         (0.86 + math.cos(a) * 0.1, -0.3 + math.sin(a) * 0.1, 2.1),
                         material="steel_dark", verts=6, bevel=0))
    parts.append(box("shaker_label", (0.24, 0.02, 0.24), (0.86, -0.61, 1.56),
                     material="salting", bevel=0.01))

    # Scoop
    parts.append(sphere("scoop_bowl", 0.17, (-0.62, 0.35, 1.55), (1, 1, 0.55),
                        material="steel", metal=0.8, rough=0.3))
    parts.append(cyl("scoop_handle", 0.03, 0.4, (-0.38, 0.35, 1.67),
                     rot=(0, math.radians(40), 0), material="salting", verts=8))
    return split(parts, scoop=("scoop",))


def build_pasteuriser():
    """
    Split hot/cold machine. The two-tone body IS the recognition cue: half the
    machine is red pipes, half is blue fins, joined by a transfer pipe.
    """
    parts = []
    parts.append(box("body", (2.25, 1.4, 1.5), (0, 0, 0.98),
                     material="plastic_white", bevel=0.08, rough=0.3))
    parts.append(box("hot_cap", (1.12, 1.45, 0.34), (-0.56, 0, 1.84), material="hot", bevel=0.05))
    parts.append(box("cold_cap", (1.12, 1.45, 0.34), (0.56, 0, 1.84), material="cold", bevel=0.05))
    parts.append(box("hot_face", (1.1, 0.12, 1.0), (-0.56, 0.72, 0.5), material="hot", bevel=0.03))
    parts.append(box("cold_face", (1.1, 0.12, 1.0), (0.56, 0.72, 0.5), material="cold", bevel=0.03))

    # Heating coils (left)
    for i in range(4):
        parts.append(torus(f"coil{i}", 0.24, 0.045, (-0.56, 0, 0.7 + i * 0.22),
                           material="hot", rough=0.5, metal=0.25))
    parts.append(box("hot_window", (0.9, 0.05, 1.1), (-0.56, 0.71, 1.05),
                     material="glass", bevel=0.02, rough=0.05))

    # Cooling fins (right)
    for i in range(6):
        parts.append(box(f"fin{i}", (0.85, 0.9, 0.05), (0.56, 0, 0.55 + i * 0.2),
                         material="steel", metal=0.6, rough=0.35, bevel=0.01))
    parts.append(box("cold_window", (0.9, 0.05, 1.1), (0.56, 0.71, 1.05),
                     material="glass", bevel=0.02, rough=0.05))

    # Transfer pipe hot -> cold. Kept low and flat: a tall arc read as a tap.
    for i in range(9):
        t = i / 8.0
        x = -0.56 + t * 1.12
        z = 1.9 + math.sin(t * math.pi) * 0.18
        parts.append(sphere(f"pipe{i}", 0.12, (x, 0.1, z), material="steel",
                            segments=12, rings=8, metal=0.8, rough=0.3))

    # Indicator strips, warm on the left and cold on the right.
    for i in range(3):
        parts.append(box(f"hot_led{i}", (0.09, 0.06, 0.5), (-0.86 + i * 0.3, 0.79, 0.5),
                         material="drying", bevel=0.01))
        parts.append(box(f"cold_led{i}", (0.09, 0.06, 0.5), (0.26 + i * 0.3, 0.79, 0.5),
                         material="cold", bevel=0.01))
    return split(parts, coils=("coil",))


def split(parts, **groups):
    """
    Split a flat part list into named export groups by object-name prefix.

    Builders stay simple flat lists; the grouping happens here, so making a part
    animatable is one prefix away rather than a structural rewrite.
    """
    taken, out = set(), {}
    for gname, prefixes in groups.items():
        picked = [o for o in parts
                  if o is not None and o.name.startswith(tuple(prefixes)) and id(o) not in taken]
        for o in picked:
            taken.add(id(o))
        out[gname] = picked
    out["shell"] = [o for o in parts if o is not None and id(o) not in taken]
    return out


# Keys are the game's station ids: the GLB filename and the loader key are the
# same string, so there is nothing to keep in sync by hand.
BUILDERS = {
    "DryingRack": build_drying,
    "Freezer": build_freezer,
    "VacuumSealer": build_vacuum,
    "PicklingJar": build_pickling,
    "SaltTable": build_salting,
    "Pasteuriser": build_pasteuriser,
}


# --------------------------------------------------------------------- export

# Rotation axis for each mover, in the machine's local space. A door has to
# hinge, not spin about its own centre.
PIVOTS = {
    "DryingRack":   {"sun": (-1.15, 0.62, 2.1)},
    "Freezer":      {"door": (-0.98, 0.8, 1.32), "dial": (0.78, 0.86, 1.05)},
    "VacuumSealer": {
        "lid": (0.0, -0.72, 1.1),
        "needle": (-0.84, 0.79, 1.15),
        "pump": (0.85, 0.50, 1.15),
    },
    "PicklingJar":  {"lid": (0.0, 0.16, 2.43)},
    "SaltTable":    {"scoop": (-0.62, 0.35, 1.55)},
}


def export_machine(name, groups):
    """
    Write one GLB holding a `shell` mesh plus one node per moving part.
    The game finds movers by node name and drives them directly.
    """
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name + ".glb")

    built = {}
    for gname, objs in groups.items():
        merged = join(gname, objs)
        if merged is None:
            continue
        pivot = PIVOTS.get(name, {}).get(gname)
        if pivot:
            set_pivot(merged, pivot)
        face_front(merged)
        built[gname] = merged

    # Drop the machine so its base sits at z=0, but preserve object locations.
    # Mover geometry is local to the hinge origin established by set_pivot();
    # baking locations here would put those coordinates back into the vertices.
    # The game re-parents movers onto equivalent procedural pivots, so baked
    # coordinates would apply every mover's placement twice.
    all_objs = list(built.values())
    lo = min(min((o.matrix_world @ v.co).z for v in o.data.vertices) for o in all_objs)
    for o in all_objs:
        o.location.z -= lo

    # Fail the build if a later refactor silently bakes mover locations again.
    # face_front() mirrors Blender Y, while the base drop changes only Z.
    for gname, pivot in PIVOTS.get(name, {}).items():
        obj = built.get(gname)
        if obj is None:
            continue
        expected = Vector((pivot[0], -pivot[1], pivot[2] - lo))
        if (obj.location - expected).length > 1e-4:
            raise RuntimeError(
                "%s.%s lost its pivot: expected %s, got %s"
                % (name, gname, tuple(expected), tuple(obj.location)))

    bpy.ops.object.select_all(action="DESELECT")
    for o in all_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = all_objs[0]

    kwargs = dict(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        # join() has already converted every object to a mesh, so modifiers are
        # baked. Keeping this false is essential: Blender's glTF "apply" option
        # also folds node transforms into vertex data and destroys mover pivots.
        export_apply=False,
        export_yup=True,             # Blender Z-up -> glTF/three.js Y-up
        export_cameras=False,
        export_lights=False,
    )
    # No Draco. Each machine is a few thousand triangles, so compression would
    # save less than the decoder costs the player to download, and the game is
    # meant to work offline.
    bpy.ops.export_scene.gltf(**kwargs)

    tris = 0
    for o in all_objs:
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
    size_kb = os.path.getsize(path) / 1024 if os.path.exists(path) else 0
    return path, tris, size_kb, sorted(built.keys())


def main():
    print("\n" + "=" * 68)
    print("Preservation Panic - building station assets")
    print("=" * 68)
    total_tris = total_kb = 0
    only = os.environ.get("PP_ONLY")
    builders = BUILDERS.items()
    if only:
        if only not in BUILDERS:
            raise ValueError("Unknown PP_ONLY station: " + only)
        builders = ((only, BUILDERS[only]),)
    for name, builder in builders:
        clear_scene()
        groups = builder()
        path, tris, size_kb, names = export_machine(name, groups)
        total_tris += tris
        total_kb += size_kb
        movers = [n for n in names if n != "shell"]
        print("  %-13s %6d tris  %7.1f KB   parts: shell + %s"
              % (name, tris, size_kb, ", ".join(movers) if movers else "(none)"))

    print("-" * 68)
    print("  total %d tris, %.1f KB" % (total_tris, total_kb))
    print("  written to " + OUT_DIR)
    print("=" * 68 + "\n")


if __name__ == "__main__":
    main()
