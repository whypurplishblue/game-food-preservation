"""
Preservation Panic — Blender food builder.

Builds the food items that the procedural versions could not carry, in the
faceted low-poly style of the supplied reference art, and exports one GLB per
food straight into the game:

    blender --background --python tools/blender/build_foods.py
    # -> public/assets/models/foods/fish.glb, prawns.glb, squid.glb, chicken.glb

WHY THESE ARE MODELLED AND NOT CODED
Silhouette is the whole job. A food is seen at counter size, at a shallow angle,
next to five others, and the child has to name it in about a second. Fish, prawn
and squid were all built in code from the same soft blob primitive with a face
decal on the front, so they differed mainly in colour and collapsed into each
other. A forked tail, a segmented curl with a fan, a mantle with trailing arms:
those are shapes, and shapes are what Blender is for.

NO FACE DECALS
The reference art carries a single anatomical eye, not a smiley. Spoilage is
still signalled four ways — colour desaturation, mould patches, stink wisps and
the microbe swarm — so nothing is lost by dropping the cartoon face, and the
silhouette stops being interrupted by a camera-facing plane in its middle.

CONVENTIONS
  * Blender Z-up; the exporter converts to glTF/three.js Y-up.
  * Length runs along X, up is +Z, and the camera side ends up +Z in three, so
    eyes are built on both flanks and the model reads from either side.
  * Every model is normalised at export: bounds centred on the origin and scaled
    to a per-food target size, so the game's `scale` values keep working.
  * Flat shading everywhere. The facets ARE the style; smooth shading turns
    these into the soft blobs they are replacing.
"""

import bpy
import bmesh
import math
import os
from mathutils import Vector

# Foods NOT to rebuild, because the repo's version is better than this script's.
# prawns.glb is a credited CC-BY model (see public/assets/models/credits.txt)
# that was downloaded, resized and committed by hand — and a previous run of
# this script silently overwrote it. Anything listed here is left alone unless
# PP_FOOD_ONLY names it explicitly.
SKIP = {"prawns"}

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
OUT_DIR = os.environ.get("PP_FOOD_OUT_DIR") or os.path.normpath(
    os.path.join(HERE, "..", "..", "public", "assets", "models", "foods"))

def _lin(c):
    """sRGB -> linear. Blender's Base Color is linear, so feeding it sRGB
    numbers is what turned a deep orange prawn into a pale yellow one."""
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(hexcode):
    r = (hexcode >> 16) & 255
    g = (hexcode >> 8) & 255
    b = hexcode & 255
    return (_lin(r / 255), _lin(g / 255), _lin(b / 255), 1.0)


# Colours read off the reference art.
PALETTE = {
    "fish_back":   rgb(0x3E6F96),
    "fish_mid":    rgb(0x9FC2DA),
    "fish_belly":  rgb(0xEDF2F5),
    "fish_fin":    rgb(0x4B82AC),
    "prawn":       rgb(0xF07C28),
    "prawn_deep":  rgb(0xE24E22),
    "prawn_pale":  rgb(0xF9A059),
    "squid":       rgb(0xD97FB4),
    "squid_deep":  rgb(0xC05C93),
    "squid_pale":  rgb(0xEFB9D5),
    "chicken":     rgb(0xC9852A),
    "chicken_top": rgb(0xE0A03A),
    "bone":        rgb(0xF3F1EC),
    "banana":      rgb(0xF3C63F),
    "banana_deep": rgb(0xD9A62E),
    "banana_tip":  rgb(0x6B4A22),
    "banana_stem": rgb(0x8A6A3A),
    "eye_white":   rgb(0xFFFFFF),
    "eye_black":   rgb(0x14141A),
}

_materials = {}


def mat(name, rough=0.52):
    if name in _materials:
        return _materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = PALETTE[name]
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = 0.0
    m.diffuse_color = PALETTE[name]
    _materials[name] = m
    return m


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for item in list(block):
            if item.users == 0:
                block.remove(item)
    _materials.clear()


def _finish(o, name, material):
    o.name = name
    o.data.materials.append(mat(material))
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_flat()
    return o


# ------------------------------------------------------------------ primitives

def ico(name, radius, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0),
        material="fish_mid", subdiv=2):
    """Low-poly ball. Subdiv 2 is 80 faces — enough to read round, few enough
    that every facet is visible, which is the look the reference has."""
    bpy.ops.mesh.primitive_ico_sphere_add(radius=radius, subdivisions=subdiv,
                                          location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return _finish(o, name, material)


def cylinder(name, r1, r2, depth, loc=(0, 0, 0), rot=(0, 0, 0),
             material="fish_mid", verts=8):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth,
                                    vertices=verts, location=loc, rotation=rot)
    return _finish(bpy.context.object, name, material)


def wedge(name, radius, depth, thickness, loc=(0, 0, 0), rot=(0, 0, 0),
          material="fish_fin", verts=3):
    """A flattened cone: the reference's fins and tail lobes are all flat
    triangles, not volumes."""
    bpy.ops.mesh.primitive_cone_add(radius1=radius, radius2=0, depth=depth,
                                    vertices=verts, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = (1, thickness, 1)
    bpy.ops.object.transform_apply(scale=True)
    return _finish(o, name, material)


# ------------------------------------------------------------------- modifiers

def taper(o, profile, axis=0):
    """
    Reshape an object by scaling each vertex's other two axes by `profile(t)`,
    where t is 0..1 along `axis`. This is what turns a ball into a fish: a body
    that swells behind the head and pinches to a wrist before the tail.
    """
    me = o.data
    lo = min(v.co[axis] for v in me.vertices)
    hi = max(v.co[axis] for v in me.vertices)
    span = max(1e-6, hi - lo)
    others = [i for i in (0, 1, 2) if i != axis]
    for v in me.vertices:
        s = profile((v.co[axis] - lo) / span)
        for i in others:
            v.co[i] *= s
    me.update()
    return o


def bend(o, amount, axis=0, up=2):
    """Curve an object along `axis` — the prawn's tail curl."""
    me = o.data
    lo = min(v.co[axis] for v in me.vertices)
    hi = max(v.co[axis] for v in me.vertices)
    span = max(1e-6, hi - lo)
    for v in me.vertices:
        t = (v.co[axis] - lo) / span - 0.5
        v.co[up] += amount * (t * t) * 4
    me.update()
    return o


def paint_below(o, material, z, axis=2):
    """Give the faces under a height their own material — the fish's pale belly
    without modelling a second shell that z-fights with the first."""
    m = mat(material)
    if m.name not in [s.name for s in o.data.materials]:
        o.data.materials.append(m)
    idx = list(o.data.materials).index(m)
    for poly in o.data.polygons:
        if poly.center[axis] < z:
            poly.material_index = idx
    o.data.update()
    return o


def curve(points):
    """
    A radius profile from (t, r) control points, smoothstepped between them.

    Hand-written trig profiles are how the first pass went wrong: one of them
    went negative past pi and produced NaN vertices, which is why the drumstick
    came out as a sphere. Control points cannot do that.
    """
    def f(t):
        t = min(1.0, max(0.0, t))
        for i in range(len(points) - 1):
            t0, r0 = points[i]
            t1, r1 = points[i + 1]
            if t <= t1:
                k = (t - t0) / max(1e-6, t1 - t0)
                k = k * k * (3 - 2 * k)
                return r0 + (r1 - r0) * k
        return points[-1][1]
    return f


def eyes(parts, radius, x, z, spread):
    """
    One eye per flank, mostly sunk into the head so only the cap shows.

    The reference art has a single round eye with a big pupil, and that eye is
    doing real work: it tells the child which end is the head, which is what
    makes a silhouette parse as an animal rather than a lump.
    """
    for s in (-1, 1):
        parts.append(ico(f"eye_w{s}", radius, (x, s * spread, z),
                         material="eye_white", subdiv=2))
        parts.append(ico(f"eye_b{s}", radius * 0.55,
                         (x + radius * 0.16, s * (spread + radius * 0.60), z),
                         material="eye_black", subdiv=2))
    return parts


def join(name, objs):
    objs = [o for o in objs if o is not None]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    bpy.ops.object.convert(target="MESH")
    return o


# --------------------------------------------------------------------- builders

def build_fish():
    """
    Tuna: deep body, pinched wrist, big forked tail, dorsal and pectoral fins.
    The tail fork and the dark back are what make it a fish rather than an
    ellipsoid — the body shape alone carries almost nothing.
    """
    parts = []

    body = ico("body", 0.5, scale=(2.02, 0.52, 0.80), material="fish_mid", subdiv=3)
    # A long thin wrist in front of the tail is what stops the fork reading as
    # part of the body — the first pass pinched too late and the lobes vanished.
    taper(body, curve([(0.0, 0.10), (0.22, 0.36), (0.48, 1.00), (0.78, 0.84), (1.0, 0.22)]))
    paint_below(body, "fish_belly", -0.055)
    m = mat("fish_back")
    body.data.materials.append(m)
    idx = list(body.data.materials).index(m)
    for poly in body.data.polygons:
        if poly.center[2] > 0.11:
            poly.material_index = idx
    parts.append(body)

    # Forked tail off the wrist: two lobes splayed in the vertical plane.
    for s in (1, -1):
        # The lobes must START inside the wrist. Floating them clear of the body
        # is what made the first fork read as two loose triangles.
        parts.append(wedge(f"tail{s}", 0.32, 0.72, 0.16, (-0.98, 0, s * 0.21),
                           rot=(0, math.radians(-90 - s * 32), 0), material="fish_fin"))
    parts.append(wedge("dorsal", 0.22, 0.38, 0.14, (0.02, 0, 0.30),
                       rot=(0, math.radians(-26), 0), material="fish_fin"))
    parts.append(wedge("anal", 0.14, 0.26, 0.14, (-0.36, 0, -0.20),
                       rot=(0, math.radians(206), 0), material="fish_fin"))
    for s in (-1, 1):
        parts.append(wedge(f"pect{s}", 0.14, 0.30, 0.16, (0.20, s * 0.15, -0.05),
                           rot=(math.radians(s * 70), 0, math.radians(-112)),
                           material="fish_fin"))
    eyes(parts, 0.082, 0.66, 0.13, 0.125)
    return join("fish", parts)


def build_prawns():
    """
    One big prawn: fat carapace at the head, overlapping shell plates curling
    away on a flat arc, a fan tail, legs and long antennae.

    The plates are stretched ALONG the curve and spaced closer than their own
    width, so they overlap like armour. Equal beads spaced by their radius read
    as a caterpillar (pass 2), and one smooth bent tube reads as a bird (pass 4);
    overlap is what makes the difference.
    """
    parts = []
    RX, RZ, N = 0.74, 0.30, 12
    A0, A1 = -0.55, 2.78                     # head low-right, tail curling left

    def at(u):
        a = A0 + (A1 - A0) * u
        return a, (math.cos(a) * RX, 0.0, math.sin(a) * RZ)

    a_head, p_head = at(0.0)
    parts.append(ico("head", 0.265, p_head, scale=(1.34, 0.94, 1.00),
                     rot=(0, math.radians(-14), 0), material="prawn", subdiv=3))
    parts.append(wedge("rostrum", 0.085, 0.48, 0.34,
                       (p_head[0] + 0.34, 0, p_head[2] + 0.12),
                       rot=(0, math.radians(106), 0), material="prawn_deep"))

    for i in range(1, N):
        u = i / (N - 1)
        a, p = at(u)
        r = 0.235 * (1.0 - 0.56 * u)
        parts.append(ico(f"plate{i}", r, p, scale=(1.45, 0.92, 1.02),
                         rot=(0, -a * 0.45, 0),
                         material="prawn" if i % 2 else "prawn_deep", subdiv=2))

    a_t, p_t = at(1.0)
    for k, off in enumerate((-1, 0, 1)):
        parts.append(wedge(f"fan{k}", 0.15, 0.46, 0.16,
                           (p_t[0] - 0.16, off * 0.09, p_t[2] + 0.02),
                           rot=(math.radians(off * 28), math.radians(-122), 0),
                           material="prawn_deep"))

    for i in range(5):
        parts.append(cylinder(f"leg{i}", 0.026, 0.010, 0.26,
                              (p_head[0] - 0.02 - i * 0.13,
                               0.05 * (1 if i % 2 else -1), p_head[2] - 0.23),
                              rot=(0, math.radians(18 - i * 7), 0),
                              material="prawn_deep", verts=5))
    for k, (ln, pitch) in enumerate(((1.10, 60), (0.88, 76))):
        ant = cylinder(f"ant{k}", 0.019, 0.007, ln,
                       (p_head[0] + 0.42 + ln * 0.26, (1 if k else -1) * 0.05,
                        p_head[2] + 0.18 + ln * 0.18),
                       rot=(0, math.radians(pitch + 32), 0), material="prawn_deep", verts=5)
        bend(ant, 0.10, axis=2, up=0)
        parts.append(ant)
    eyes(parts, 0.062, p_head[0] + 0.15, p_head[2] + 0.13, 0.125)
    return join("prawns", parts)


def build_squid():
    """
    Long mantle, triangular fins at the top of it, a head band, eight arms
    fanning down. The old one had a short round mantle and stubby tentacles, so
    the fins read as ears and the whole thing read as a piglet.
    """
    parts = []

    mantle = ico("mantle", 0.34, (0, 0, 0.50), scale=(0.86, 0.86, 1.95),
                 material="squid", subdiv=3)
    taper(mantle, curve([(0.0, 0.50), (0.22, 1.00), (0.62, 0.78), (1.0, 0.10)]), axis=2)
    parts.append(mantle)

    for s in (-1, 1):
        parts.append(wedge(f"fin{s}", 0.37, 0.56, 0.13, (0, s * 0.15, 0.90),
                           rot=(math.radians(s * 62), 0, 0), material="squid_deep"))

    parts.append(ico("head", 0.24, (0, 0, 0.02), scale=(1.0, 1.0, 0.70),
                     material="squid_pale", subdiv=2))
    for i in range(8):
        ang = (i / 8) * math.tau
        long = i % 2 == 0
        ln = 0.66 if long else 0.46
        lean = 0.46 if long else 0.32
        arm = cylinder(f"arm{i}", 0.060, 0.018, ln,
                       (math.cos(ang) * 0.17 * (1 + lean),
                        math.sin(ang) * 0.17 * (1 + lean),
                        -0.17 - ln * 0.42),
                       rot=(math.radians(math.sin(ang) * 24),
                            math.radians(-math.cos(ang) * 24), 0),
                       material="squid" if i % 3 else "squid_deep", verts=6)
        bend(arm, 0.11 if long else 0.07, axis=2, up=0)
        parts.append(arm)
    eyes(parts, 0.085, 0.0, 0.02, 0.185)
    return join("squid", parts)


def build_chicken():
    """
    A drumstick: fat teardrop of meat, a shank, and a white knuckle of bone.
    The bone is the entire recognition cue — without it the shape is a pear.
    """
    parts = []

    meat = ico("meat", 0.46, scale=(1.20, 1.0, 1.0), material="chicken", subdiv=3)
    taper(meat, curve([(0.0, 1.00), (0.30, 0.97), (0.66, 0.60), (1.0, 0.17)]))
    m = mat("chicken_top")
    meat.data.materials.append(m)
    idx = list(meat.data.materials).index(m)
    for poly in meat.data.polygons:
        if poly.center[2] > 0.10:
            poly.material_index = idx
    parts.append(meat)

    parts.append(cylinder("shank", 0.085, 0.072, 0.30, (0.60, 0, 0),
                          rot=(0, math.radians(90), 0), material="bone", verts=8))
    for s in (-1, 1):
        parts.append(ico(f"knuckle{s}", 0.115, (0.80, s * 0.075, s * 0.02),
                         scale=(0.95, 1.0, 0.92), material="bone", subdiv=2))
    return join("chicken", parts)


def build_bananas():
    """
    A hand of three bananas on a stem — §5H's third example.

    One banana alone reads as a comma at counter size; three fanned from a
    common stem gives the shape its own outline, and the brown tips are what
    stop it looking like a pepper.
    """
    parts = []
    for i, (yaw, tilt, ln) in enumerate(((-0.30, 0.05, 1.05), (0.0, 0.0, 1.15), (0.30, -0.05, 1.00))):
        b = cylinder(f"banana{i}", 0.135, 0.115, ln, (0, i * 0.055 - 0.055, 0),
                     rot=(0, math.radians(90), yaw), material="banana", verts=8)
        taper(b, curve([(0.0, 0.35), (0.22, 0.95), (0.78, 0.95), (1.0, 0.30)]))
        bend(b, 0.26 + tilt, axis=0, up=2)
        # A darker ridge along the underside: bananas are not round.
        paint_below(b, "banana_deep", -0.05)
        parts.append(b)
        # Brown tip at the flower end.
        parts.append(ico(f"tip{i}", 0.055, (-ln * 0.5 + 0.02, i * 0.055 - 0.055, 0.07),
                         scale=(1.3, 1.0, 1.0), material="banana_tip", subdiv=1))

    # Common stem at the stalk end, which is what makes it a hand and not three
    # loose bananas.
    parts.append(cylinder("stem", 0.10, 0.075, 0.30, (0.60, 0, 0.06),
                          rot=(0, math.radians(90), 0), material="banana_stem", verts=7))
    return join("bananas", parts)


BUILDERS = {
    "fish":    (build_fish, 1.62),
    "prawns":  (build_prawns, 1.34),
    "squid":   (build_squid, 1.46),
    "chicken": (build_chicken, 1.18),
    "bananas": (build_bananas, 1.30),
}


# ---------------------------------------------------------------------- export

def face_camera(o):
    """
    Blender +Y maps to glTF -Z, so a model authored facing +Y arrives with its
    back to the three.js camera. Mirror in Y and reverse the winding, which
    keeps left and right where they were and the normals pointing out.
    """
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(rotation=True, scale=True)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for v in bm.verts:
        v.co.y = -v.co.y
    bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()
    return o


def normalise(o, target):
    """Centre on the origin and scale to a target longest edge, so the game's
    per-food `scale` numbers keep meaning what they meant."""
    verts = [v.co.copy() for v in o.data.vertices]
    lo = Vector((min(v.x for v in verts), min(v.y for v in verts), min(v.z for v in verts)))
    hi = Vector((max(v.x for v in verts), max(v.y for v in verts), max(v.z for v in verts)))
    centre = (lo + hi) * 0.5
    size = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
    k = target / max(1e-6, size)
    for v in o.data.vertices:
        v.co = (v.co - centre) * k
    o.data.update()
    return o


def export_food(name, target):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name + ".glb")
    o = bpy.context.object
    face_camera(o)
    normalise(o, target)
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_cameras=False, export_lights=False,
    )
    o.data.calc_loop_triangles()
    tris = len(o.data.loop_triangles)
    kb = os.path.getsize(path) / 1024 if os.path.exists(path) else 0
    return tris, kb


def main():
    print("\n" + "=" * 64)
    print("Preservation Panic - building food assets")
    print("=" * 64)
    only = {n for n in (os.environ.get("PP_FOOD_ONLY") or "").split(",") if n}
    total_t = total_kb = 0
    for name, (builder, target) in BUILDERS.items():
        if only and name not in only:
            continue
        if not only and name in SKIP:
            print("  %-10s skipped (hand-curated; PP_FOOD_ONLY=%s to force)" % (name, name))
            continue
        clear_scene()
        builder()
        tris, kb = export_food(name, target)
        total_t += tris
        total_kb += kb
        print("  %-10s %5d tris  %6.1f KB" % (name, tris, kb))
    print("-" * 64)
    print("  total %d tris, %.1f KB -> %s" % (total_t, total_kb, OUT_DIR))
    print("=" * 64 + "\n")


if __name__ == "__main__":
    main()
