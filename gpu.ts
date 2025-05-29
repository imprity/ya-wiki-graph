import * as math from "./math.js"
import { NodeManager, DocNode } from "./graph_objects.js"
import * as assets from "./assets.js"
import * as color from "./color.js"
import { ColorTable } from "./color_table.js"
import { debugPrint } from './debug_print.js'

const glslCommon = `
#ifndef _GLSL_COMMON_HEADER_GUARD_
#define _GLSL_COMMON_HEADER_GUARD_

#define SMALL_NUMBER 0.001f

#define PI 3.14159265359

vec2 rotate_v(vec2 v, float angle) {
    float sinv = sin(angle);
    float cosv = cos(angle);

    float x2 = v.x * cosv - v.y * sinv;
    float y2 = v.x * sinv + v.y * cosv;

    v.x = x2;
    v.y = y2;

    return v;
}

uvec4 get_data_from_tex(highp usampler2D data_tex, int index) {
    ivec2 tex_size = textureSize(data_tex, 0);
    int x = index % tex_size.x;
    int y = index / tex_size.x;

    return texelFetch(data_tex, ivec2(x, y), 0);
}

float length_squared(vec2 v) {
    return dot(v, v);
}

float distance_squared(vec2 v1, vec2 v2) {
    return length_squared(v1 - v2);
}

#endif
`

const glslViewportTransform = `
#ifndef _GLSL_VIEWPORT_HEADER_GUARD_
#define _GLSL_VIEWPORT_HEADER_GUARD_

uniform vec2 u_screen_size;
uniform float u_zoom;
uniform vec2 u_offset;

vec2 world_to_viewport(vec2 pos) {
    pos += u_offset;

    pos *= u_zoom;

    pos.x = ((pos.x / u_screen_size.x) - 0.5f) * 2.0f;
    pos.y = -((pos.y / u_screen_size.y) - 0.5f) * 2.0f;

    return pos;
}

vec2 viewport_to_world(vec2 pos) {
    pos /= u_zoom;
    pos -= u_offset;

    return pos;
}

#endif
`

const glslNodeUtils = `
#ifndef _GLSL_NODE_HEADER_GUARD_
#define _GLSL_NODE_HEADER_GUARD_

${glslCommon}

uniform int u_node_count;

uniform highp usampler2D u_node_physics_tex;
uniform highp usampler2D u_node_render_pos_tex;
uniform sampler2D u_node_colors_tex;

bool is_node_synced_to_rencer(uvec4 render) {
    return render.z > uint(0);
}

vec2 get_node_physics_pos(uvec4 physics, uvec4 render) {
    if (is_node_synced_to_rencer(render)) {
        return uintBitsToFloat(render.xy);
    }
    return uintBitsToFloat(physics.xy);
}

float get_node_mass(uvec4 physics) {
    return uintBitsToFloat(physics.z);
}

float get_node_temp(uvec4 physics) {
    return uintBitsToFloat(physics.w);
}

vec2 get_node_render_pos(uvec4 render) {
    return uintBitsToFloat(render.xy);
}

vec4 get_node_color(int index) {
    ivec2 tex_size = textureSize(u_node_colors_tex, 0);
    int x = index % tex_size.x;
    int y = index / tex_size.x;

    return texelFetch(u_node_colors_tex, ivec2(x, y), 0);
}

${DocNode.nodeMassToRadiusGLSL}

float get_node_render_radius(uvec4 physics, uvec4 render) {
    float mass = get_node_mass(physics);
    float node_render_radius_scale = uintBitsToFloat(render.w);
    return node_mass_to_radius(mass) * node_render_radius_scale;
}

#endif
`

const glslConUtils = `
#ifndef _GLSL_CONNECTION_HEADER_GUARD_
#define _GLSL_CONNECTION_HEADER_GUARD_

${glslCommon}

uniform int u_con_count;

uniform highp usampler2D u_con_infos_tex;

ivec2 get_connected_nodes(int con_index) {
    uvec4 con = get_data_from_tex(u_con_infos_tex, con_index);
    return ivec2(con.xy);
}

#endif
`

const forceCalcVShaderSrc = `#version 300 es
in vec4 a_vertex;

void main() {
    gl_Position = a_vertex;
}
`
const forceCalcFShaderSrc = `#version 300 es
precision highp float;
precision highp int;

uniform float u_node_min_dist;
uniform float u_repulsion;
uniform float u_spring;
uniform float u_spring_dist;
uniform float u_force_cap;

${glslCommon}
${glslNodeUtils}
${glslConUtils}
uniform highp isampler2D u_node_con_infos_start_tex;

out uvec4 out_color;

// returns force that A should recieve
vec2 calculate_repulsion(
    vec2 pos_a, float mass_a,
    vec2 pos_b, float mass_b
) {
    float radius_a = node_mass_to_radius(mass_a);
    float radius_b = node_mass_to_radius(mass_b);

    vec2 atob = pos_b - pos_a;

    float dist = length(atob);

    if (dist < SMALL_NUMBER) {
        return vec2(0.0f, 0.0f);
    }

    vec2 atob_n = atob / dist;

    dist -= radius_a;
    dist -= radius_b;

    dist = max(dist, u_node_min_dist);

    float f = u_repulsion * mass_a * mass_b / (dist * dist);

    return -atob_n * f;
}

// returns force that A should recieve
vec2 calculate_spring(
    vec2 pos_a, float mass_a,
    vec2 pos_b, float mass_b
) {
    float radius_a = node_mass_to_radius(mass_a);
    float radius_b = node_mass_to_radius(mass_b);

    vec2 atob = pos_b - pos_a;

    float dist = length(atob);

    if (dist < SMALL_NUMBER) {
        return vec2(0.0f, 0.0f);
    }

    vec2 atob_n = atob/dist;

    dist -= radius_a;
    dist -= radius_b;

    dist = max(dist, u_node_min_dist);

    float f = log(dist / u_spring_dist) * u_spring;

    return atob_n * f;
}

void main() {
    int node_index = 0;

    // get node_index
    {
        ivec2 tex_size = textureSize(u_node_physics_tex, 0);
        ivec2 texel_pos = ivec2(gl_FragCoord.xy);
        node_index = texel_pos.y * tex_size.x + texel_pos.x;
    }

    if (node_index >= u_node_count) {
        out_color = uvec4(0, 0, 0, 0);
        return;
    }

    uvec4 node_physics = get_data_from_tex(u_node_physics_tex, node_index);
    uvec4 node_render = get_data_from_tex(u_node_render_pos_tex, node_index);
    vec2 node_pos = get_node_physics_pos(node_physics, node_render);
    float node_mass = get_node_mass(node_physics);
    float node_temp = get_node_temp(node_physics);

    // mass is too small
    if (node_mass < SMALL_NUMBER) {
        out_color = texelFetch(u_node_physics_tex, ivec2(gl_FragCoord.xy), 0);
        return;
    }

    // if node is synced to render
    // we skip the calculation and just set the pos to render pos
    {
        if (is_node_synced_to_rencer(node_render)) {
            uvec2 pos_u = node_render.xy;
            uint mass_u = floatBitsToUint(node_mass);
            uint temp_u = floatBitsToUint(node_temp);

            out_color = uvec4(
                node_render.x, node_render.y, node_physics.z, node_physics.w
            );

            return;
        }
    }

    vec2 force_sum = vec2(0.0f , 0.0f);

    // =====================
    // calculate repulsions
    // =====================
    for (int i=0; i<u_node_count; i++) {
        if (i == node_index) {
            continue;
        }

        uvec4 other_node_physics = get_data_from_tex(u_node_physics_tex, i);
        uvec4 other_node_render = get_data_from_tex(u_node_render_pos_tex, i);

        vec2 other_node_pos = get_node_physics_pos(other_node_physics, other_node_render);
        float other_node_mass = get_node_mass(other_node_physics);

        force_sum += calculate_repulsion(
            node_pos, node_mass,
            other_node_pos, other_node_mass
        );
    }

    // =====================
    // calculate springs
    // =====================
    // for (int i=0; i<u_con_count; i++) {
    //     ivec2 index_ab = get_connected_nodes(i);
    //
    //     if (index_ab.x == node_index || index_ab.y == node_index) {
    //         int other_node_index = index_ab.x;
    //         if (other_node_index == node_index) {
    //             other_node_index = index_ab.y;
    //         }
    //
    //         uvec4 other_node_physics = get_data_from_tex(u_node_physics_tex, other_node_index);
    //         uvec4 other_node_render = get_data_from_tex(u_node_render_pos_tex, other_node_index);
    //
    //         vec2 other_node_pos = get_node_physics_pos(other_node_physics, other_node_render);
    //         float other_node_mass = get_node_mass(other_node_physics);
    //
    //         force_sum += calculate_spring(
    //             node_pos, node_mass,
    //             other_node_pos, other_node_mass
    //         );
    //     }
    // }

    int pointer = 0;
    {
        ivec2 tex_size = textureSize(u_node_con_infos_start_tex, 0);
        int x = node_index % tex_size.x;
        int y = node_index / tex_size.x;

        pointer = texelFetch(u_node_con_infos_start_tex, ivec2(x, y), 0).x;
    }
    if (pointer >= 0) {
        while(pointer < u_con_count) {
            ivec4 con_info = ivec4(get_data_from_tex(u_con_infos_tex, pointer));
            ivec2 index_ab = con_info.xy;

            int other_node_index = index_ab.x;
            if (other_node_index == node_index) {
                other_node_index = index_ab.y;
            }

            uvec4 other_node_physics = get_data_from_tex(u_node_physics_tex, other_node_index);
            uvec4 other_node_render = get_data_from_tex(u_node_render_pos_tex, other_node_index);

            vec2 other_node_pos = get_node_physics_pos(other_node_physics, other_node_render);
            float other_node_mass = get_node_mass(other_node_physics);

            force_sum += calculate_spring(
                node_pos, node_mass,
                other_node_pos, other_node_mass
            );

            int pointer_dist = 0;
            if (node_index == index_ab.x) {
                pointer_dist = con_info.z;
            }else {
                pointer_dist = con_info.w;
            }

            if (pointer_dist <= 0) {
                break;
            }

            pointer += pointer_dist;
        }
    }

    // =====================
    // apply force
    // =====================
    {
        float force_size_squared = length_squared(force_sum);
        float temp_fall_point = 1.0f; // TODO: parameterize
        float temp_change_rate = 0.01f; // TODO: parameterize

        if (force_size_squared < temp_fall_point * temp_fall_point) {
            node_temp -= temp_change_rate;
        }else {
            node_temp += temp_change_rate;
        }

        node_temp = clamp(node_temp, 0.0f, 1.0f);

        vec2 fv = force_sum * node_temp / node_mass;
        float fvl2 = length_squared(fv);
        if (fvl2 > u_force_cap * u_force_cap) {
            fv = fv / sqrt(fvl2) * u_force_cap;
        }
        node_pos += fv;
    }

    uvec2 pos_u = floatBitsToUint(node_pos);
    uint mass_u = floatBitsToUint(node_mass);
    uint temp_u = floatBitsToUint(node_temp);

    out_color = uvec4(
        pos_u.x, pos_u.y, mass_u, temp_u
    );

    return;
}`


const drawNodeVShaderSrc = `#version 300 es
in vec4 a_vertex;
in vec2 a_uv;

uniform vec2 u_mouse;

uniform bool u_draw_outline;
uniform vec4 u_outline_color;
uniform float u_outline_width;
uniform bool u_do_hover;

out vec4 v_color;
out vec2 v_uv;

${glslViewportTransform}
${glslNodeUtils}

void main() {
    float x = a_vertex.x;
    float y = a_vertex.y;

    uvec4 node_physics = get_data_from_tex(u_node_physics_tex, gl_InstanceID);
    uvec4 node_render = get_data_from_tex(u_node_render_pos_tex, gl_InstanceID);

    vec2 node_pos = get_node_render_pos(node_render);

    float node_radius = get_node_render_radius(node_physics, node_render);
    float node_radius_with_outline = node_radius + u_outline_width;

    if (u_draw_outline) {
        node_radius = node_radius_with_outline;
    }

    vec4 node_color = get_node_color(gl_InstanceID);

    // if (u_draw_outline) {
    //     node_color = u_outline_color;
    // }
    if (u_draw_outline) {
        node_color.rgb *= 0.8; // TODO: parameterize
    }

    x *= node_radius * 2.0f;
    y *= node_radius * 2.0f;

    x += node_pos.x;
    y += node_pos.y;

    vec2 pos = vec2(x, y);
    pos = world_to_viewport(pos);

    gl_Position = vec4(
        pos.x, pos.y, 0, 1
    );

    v_color = node_color;
    v_uv = a_uv;

    // if mouse is being hovered, change to different color
    vec2 mouse = viewport_to_world(u_mouse);

    if (u_do_hover && distance_squared(node_pos, mouse) < node_radius_with_outline * node_radius_with_outline) {
        //v_color = vec4(0, 0, 0, 1);
        node_color.rgb *= 0.3; // TODO: parameterize
        v_color = node_color;
    }
}
`

const drawNodeFShaderSrc = `#version 300 es
precision highp float;

in vec4 v_color;
in vec2 v_uv;

uniform float u_tick;

uniform sampler2D u_node_tex;

uniform bool u_draw_outline;

out vec4 out_color;

${glslCommon}

void main() {
    vec4 node_c = texture(u_node_tex, v_uv) * v_color;

    out_color = node_c;
}
`;

const drawConVSahderSrc = `#version 300 es
in vec4 a_vertex;
in vec2 a_uv;

uniform float u_line_thickness;

${glslCommon}

${glslNodeUtils}
${glslConUtils}

${glslViewportTransform}

out vec4 v_color;
out vec2 v_uv;

void main() {
    float x = a_vertex.x;
    float y = a_vertex.y;

    ivec2 node_ab = get_connected_nodes(gl_InstanceID);

    uvec4 render_a = get_data_from_tex(u_node_render_pos_tex, node_ab.x);
    uvec4 render_b = get_data_from_tex(u_node_render_pos_tex, node_ab.y);

    vec2 pos_a = get_node_render_pos(render_a);
    vec2 pos_b = get_node_render_pos(render_b);

    pos_a = world_to_viewport(pos_a);
    pos_b = world_to_viewport(pos_b);

    vec2 atob = pos_b - pos_a;

    float angle = atan(atob.y, atob.x);
    float len = length(atob);
    vec2 center = (pos_a + pos_b) * 0.5;

    float pixel_height = 2.0 / u_screen_size.y;

    // NOTE: we multiply u_line_thickness by 2 because
    // it'll be thinner because of antialiasing
    float thickness = pixel_height * u_line_thickness * 2.0 * u_zoom;
    float line_alpha = 1.0;
    float line_limit = 2.0;

    // if line becomes thinnner than line_limit,
    // instead of making lines thinner,
    // reduce the line_alpha
    if (thickness < pixel_height * line_limit) {
        line_alpha =  thickness / (pixel_height * line_limit);
        thickness = pixel_height * line_limit;
    }

    // scale
    x *= len;
    y *= thickness;

    // rotate
    {
        float sinv = sin(angle);
        float cosv = cos(angle);

        float x2 = x * cosv - y * sinv;
        float y2 = x * sinv + y * cosv;

        x = x2;
        y = y2;
    }

    // translate
    x += center.x;
    y += center.y;

    gl_Position = vec4(
        x, y, 0, 1
    );

    vec4 color_a = get_node_color(node_ab.x);
    vec4 color_b = get_node_color(node_ab.y);

    switch (gl_VertexID){
        case 0:
        case 3:
        case 5:
            v_color = color_a  * line_alpha;
            break;
        case 1:
        case 2:
        case 4:
            v_color = color_b  * line_alpha;
            break;
    }

    v_uv = a_uv;
}`

const drawConFSahderSrc = `#version 300 es
precision highp float;

in vec4 v_color;
in vec2 v_uv;

out vec4 out_color;

void main() {
    float dist = abs(v_uv.y - 0.5);
    dist *= 2.0;
    dist = 1.0 - dist;
    float alpha = smoothstep(0.0, 1.0, dist);
    out_color = v_color * alpha;
}
`

export class SimulationParameter {
    nodeMinDist: number = 10

    repulsion: number = 7000

    spring: number = 5
    springDist: number = 600

    forceCap: number = 200
}

// controls what data to sync with gpu
export enum DataSyncFlags {
    Connections = 1 << 0, // connections
    NodePhysics = 1 << 1, // nodes' position, mass, temp
    NodeColors = 1 << 2, // nodes' colors
    NodeRenderPos = 1 << 3, // node render positions
    Everything = ~0
}

class LocationGroup {
    gl: WebGL2RenderingContext
    program: WebGLProgram

    uniformLocs: Map<string, WebGLUniformLocation | null> = new Map()
    attribLocs: Map<string, number> = new Map()

    constructor(gl: WebGL2RenderingContext, program: WebGLProgram) {
        this.gl = gl
        this.program = program
    }

    // uniform locations
    uLoc(name: string): WebGLUniformLocation | null {
        if (this.uniformLocs.has(name)) {
            return this.uniformLocs.get(name) as WebGLUniformLocation | null
        }

        const loc = this.gl.getUniformLocation(this.program, name)
        this.uniformLocs.set(name, loc)

        return loc
    }

    // attribute locations
    aLoc(name: string): number {
        if (this.attribLocs.has(name)) {
            return this.attribLocs.get(name) as number
        }

        const loc = this.gl.getAttribLocation(this.program, name)
        this.attribLocs.set(name, loc)

        return loc
    }
}

interface Texture {
    texture: WebGLTexture
    unit: number

    width: number
    height: number
}

interface RenderUnit {
    program: WebGLProgram
    locs: LocationGroup
    vao: WebGLVertexArrayObject
}

export class GpuComputeRenderer {
    nodeLength: number = 0
    connectionLength: number = 0

    nodeRenderLength: number = 0

    canvas: HTMLCanvasElement
    gl: WebGL2RenderingContext

    forceCalcUnit: RenderUnit
    drawNodeUnit: RenderUnit
    drawConUint: RenderUnit

    fullRectBuf: WebGLBuffer
    rect1Buf: WebGLBuffer

    rectUVBuf: WebGLBuffer

    nodePhysicsTex0: Texture
    nodePhysicsTex1: Texture
    renderToNodePhysicsTex1: boolean = false

    nodeColorsTex: Texture

    nodeRenderPosTex: Texture

    nodePhysicsFB0: WebGLFramebuffer
    nodePhysicsFB1: WebGLFramebuffer

    nodeConInfoStartTex: Texture
    conInfosTex: Texture

    circleTex: Texture

    textureUnitMax: number = -1

    // ==========================
    // constrol parameters
    // ==========================
    zoom: number = 1
    offset: math.Vector2 = new math.Vector2(0, 0)

    mouse: math.Vector2 = new math.Vector2(0, 0)

    globalTick: number = 0

    doHover: boolean = false

    simParam: SimulationParameter = new SimulationParameter()

    colorTable: ColorTable = new ColorTable()

    nodeOutlineWidth: number = 0
    connectionLineWidth: number = 1

    constructor(canvas: HTMLCanvasElement) {
        // =========================
        // create opengl context
        // =========================
        this.canvas = canvas
        {
            const gl = this.canvas.getContext('webgl2', {
                'antialias': true,
                'premultipliedAlpha': true,
            })
            if (gl === null) {
                throw new Error('failed to get webgl2 context')
            }
            this.gl = gl
        }

        // match canvas width and height to
        // canvas element width and height
        {
            const rect = this.canvas.getBoundingClientRect()
            this.canvas.width = rect.width
            this.canvas.height = rect.height
        }

        // =========================
        // create render units
        // =========================
        const createShader = (type: number, src: string): WebGLShader => {
            const shader = this.gl.createShader(type);

            let shader_type = 'vertex'
            if (type == this.gl.FRAGMENT_SHADER) {
                let shader_type = 'fragment'
            }

            if (shader === null) {
                throw new Error(`failed to create a ${shader_type} shader`)
            }
            this.gl.shaderSource(shader, src);
            this.gl.compileShader(shader);
            if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
                let log = this.gl.getShaderInfoLog(shader)
                if (log === null) {
                    log = `failed to create a ${shader_type} shader`
                }
                throw new Error(log);
            }
            return shader;
        }

        const createRenderUnit = (vShaderSrc: string, fShaderSrc: string, name: string): RenderUnit => {
            console.log(`creating ${name} RenderUnit`)
            const program = this.gl.createProgram()

            const vShader = createShader(this.gl.VERTEX_SHADER, vShaderSrc)
            const fShader = createShader(this.gl.FRAGMENT_SHADER, fShaderSrc)

            this.gl.attachShader(program, vShader);
            this.gl.attachShader(program, fShader);

            this.gl.linkProgram(program)
            if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
                let log = this.gl.getProgramInfoLog(program)
                if (log === null) {
                    log = 'failed to link program'
                }
                throw new Error(log);
            }

            const locs = new LocationGroup(this.gl, program)
            const vao = this.gl.createVertexArray()

            return {
                program: program,
                locs: locs,
                vao: vao
            }
        }

        this.forceCalcUnit = createRenderUnit(
            forceCalcVShaderSrc, forceCalcFShaderSrc, 'forceCalcUnit')
        this.drawNodeUnit = createRenderUnit(
            drawNodeVShaderSrc, drawNodeFShaderSrc, 'drawNodeUnit')
        this.drawConUint = createRenderUnit(
            drawConVSahderSrc, drawConFSahderSrc, 'drawConUint')

        // =========================
        // create buffers
        // =========================
        this.fullRectBuf = this.gl.createBuffer()
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.fullRectBuf)
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            -1, +1, 0, 1,
            +1, +1, 0, 1,
            +1, -1, 0, 1,

            -1, +1, 0, 1,
            +1, -1, 0, 1,
            -1, -1, 0, 1,
        ]), this.gl.STATIC_DRAW)
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null)

        this.rect1Buf = this.gl.createBuffer()
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.rect1Buf)
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            -0.5, -0.5, 0, 1,
            +0.5, -0.5, 0, 1,
            +0.5, +0.5, 0, 1,

            -0.5, -0.5, 0, 1,
            +0.5, +0.5, 0, 1,
            -0.5, +0.5, 0, 1,
        ]), this.gl.STATIC_DRAW)
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null)

        this.rectUVBuf = this.gl.createBuffer()
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.rectUVBuf)
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            0.0, 0.0,
            1.0, 0.0,
            1.0, 1.0,

            0.0, 0.0,
            1.0, 1.0,
            0.0, 1.0,
        ]), this.gl.STATIC_DRAW)
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null)

        // =====================================
        // bind buffers to vao
        // =====================================
        const bindBufferToVAO = (
            buffer: WebGLBuffer,
            unit: RenderUnit,
            locName: string,

            size: GLint,
            type: GLenum,
            normalized: GLboolean,
            stride: GLsizei = 0,
            offset: GLintptr = 0
        ) => {
            this.gl.bindVertexArray(unit.vao)
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer)
            this.gl.enableVertexAttribArray(unit.locs.aLoc(locName))
            this.gl.vertexAttribPointer(
                unit.locs.aLoc(locName), // location
                size, // size
                type, // type
                normalized, // normalize
                stride, // stride
                offset, // offset
            )
            this.gl.bindVertexArray(null)
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null)
        }

        bindBufferToVAO(
            this.fullRectBuf, this.forceCalcUnit, 'a_vertex',
            4, // size
            this.gl.FLOAT, // type
            false, // normalize
            0, // stride
            0, // offset
        )

        bindBufferToVAO(
            this.rect1Buf, this.drawNodeUnit, 'a_vertex',
            4, // size
            this.gl.FLOAT, // type
            false, // normalize
            0, // stride
            0, // offset
        )

        bindBufferToVAO(
            this.rect1Buf, this.drawConUint, 'a_vertex',
            4, // size
            this.gl.FLOAT, // type
            false, // normalize
            0, // stride
            0, // offset
        )

        bindBufferToVAO(
            this.rectUVBuf, this.drawConUint, 'a_uv',
            2, // size
            this.gl.FLOAT, // type
            false, // normalize
            0, // stride
            0, // offset
        )

        bindBufferToVAO(
            this.rectUVBuf, this.drawNodeUnit, 'a_uv',
            2, // size
            this.gl.FLOAT, // type
            false, // normalize
            0, // stride
            0, // offset
        )

        // =========================
        // create textures
        // =========================
        const disableMips = () => {
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        }

        const createDataTexture = (
            internalformat: GLint,
            w: number, h: number,
            format: GLenum,
            type: GLenum
        ): Texture => {
            const texture = this.gl.createTexture()

            let unit = this.getNewTextureUnitNumber()

            // set up texture parameters
            // set the filtering so we don't need mips
            this.gl.activeTexture(this.gl.TEXTURE0 + unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture)

            disableMips()

            this.gl.texImage2D(
                this.gl.TEXTURE_2D,
                0, // level
                internalformat,
                w, h, // width, height
                0, // border
                format,
                type,
                null // data
            )

            return {
                texture: texture,
                unit: unit,
                width: w, height: h
            }
        }

        const texInitSize = 128

        // create textures to hold node informations

        this.nodePhysicsTex0 = createDataTexture(
            this.gl.RGBA32UI,
            texInitSize, texInitSize,
            this.gl.RGBA_INTEGER,
            this.gl.UNSIGNED_INT,
        )
        this.nodePhysicsTex1 = createDataTexture(
            this.gl.RGBA32UI,
            texInitSize, texInitSize,
            this.gl.RGBA_INTEGER,
            this.gl.UNSIGNED_INT,
        )

        // create texture to hold node colors
        this.nodeColorsTex = createDataTexture(
            this.gl.RGBA8, // internal format
            texInitSize, texInitSize, // width, height
            this.gl.RGBA, // format
            this.gl.UNSIGNED_BYTE, // type
        )

        // create texture to hold node render poses
        this.nodeRenderPosTex = createDataTexture(
            this.gl.RGBA32UI,
            texInitSize, texInitSize,
            this.gl.RGBA_INTEGER,
            this.gl.UNSIGNED_INT,
        )

        // create textures to hold connection informations
        this.conInfosTex = createDataTexture(
            this.gl.RGBA32UI,
            texInitSize, texInitSize,
            this.gl.RGBA_INTEGER,
            this.gl.UNSIGNED_INT,
        )
        this.nodeConInfoStartTex = createDataTexture(
            this.gl.R32I,
            texInitSize, texInitSize,
            this.gl.RED_INTEGER,
            this.gl.INT,
        )

        // create dummy texture
        let dummyTexture: Texture
        {
            const texture = this.gl.createTexture()

            let unit = this.getNewTextureUnitNumber()

            this.gl.activeTexture(this.gl.TEXTURE0 + unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture)

            this.gl.texImage2D(
                this.gl.TEXTURE_2D,
                0, // level
                this.gl.RGBA8, // internal format
                2, 2, // width, height
                0, // border
                this.gl.RGBA, // format
                this.gl.UNSIGNED_BYTE, // type
                new Uint8Array([ // data
                    255, 0, 255, 255,
                    0, 0, 0, 255,
                    0, 0, 0, 255,
                    255, 0, 255, 255,
                ])
            )
            // set the filtering so we don't need mips
            disableMips()

            dummyTexture = {
                texture: texture,
                unit: unit,
                width: 2, height: 2
            }
        }

        const createImageTexture = (image: ImageBitmap | null): Texture => {
            if (image === null) {
                return dummyTexture
            }
            const texture = this.gl.createTexture()

            let unit = this.getNewTextureUnitNumber()

            this.gl.activeTexture(this.gl.TEXTURE0 + unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
            this.gl.texImage2D(
                this.gl.TEXTURE_2D, // taget
                0, // level
                this.gl.RGBA, // internal format
                this.gl.RGBA, // format
                this.gl.UNSIGNED_BYTE, // type
                image // source
            );

            this.gl.generateMipmap(this.gl.TEXTURE_2D)
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_NEAREST)

            return {
                texture: texture,
                unit: unit,
                width: image.width, height: image.height
            }
        }

        this.circleTex = createImageTexture(assets.circleImage)

        // ========================
        // create frame buffers
        // ========================
        const createFramebuffer = (tex: Texture): WebGLFramebuffer => {
            const fb = this.gl.createFramebuffer();
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fb);
            this.gl.framebufferTexture2D(
                this.gl.FRAMEBUFFER,
                this.gl.COLOR_ATTACHMENT0,
                this.gl.TEXTURE_2D,
                tex.texture,
                0
            );
            return fb;
        }

        this.nodePhysicsFB0 = createFramebuffer(this.nodePhysicsTex0)
        this.nodePhysicsFB1 = createFramebuffer(this.nodePhysicsTex1)

        console.log(`max texture unit: ${this.textureUnitMax}`)
    }

    getNewTextureUnitNumber(): number {
        this.textureUnitMax += 1
        return this.textureUnitMax
    }

    render() {
        const useTexture = (
            renderUnit: RenderUnit,
            tex: Texture,
            name: string
        ) => {
            this.gl.activeTexture(this.gl.TEXTURE0 + tex.unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, tex.texture)
            this.gl.uniform1i(renderUnit.locs.uLoc(name), tex.unit)
        }

        const supplyNodeInfos = (
            renderUnit: RenderUnit,
            physicsTex: Texture
        ) => {
            useTexture(renderUnit, physicsTex, 'u_node_physics_tex')
            useTexture(renderUnit, this.nodeRenderPosTex, 'u_node_render_pos_tex')
            useTexture(renderUnit, this.nodeColorsTex, 'u_node_colors_tex')

            this.gl.uniform1i(renderUnit.locs.uLoc('u_node_count'), this.nodeLength)
        }

        const supplyConInfos = (
            renderUnit: RenderUnit,
        ) => {
            useTexture(renderUnit, this.conInfosTex, 'u_con_infos_tex')

            this.gl.uniform1i(renderUnit.locs.uLoc('u_con_count'), this.connectionLength)
        }

        // match canvas width and height to
        // canvas element width and height
        {
            const rect = this.canvas.getBoundingClientRect()
            this.canvas.width = rect.width
            this.canvas.height = rect.height
        }

        this.gl.disable(this.gl.DITHER);

        // for calculations, disable alpha blending
        this.gl.disable(this.gl.BLEND);

        // calculate force
        {
            this.gl.useProgram(this.forceCalcUnit.program)
            this.gl.bindVertexArray(this.forceCalcUnit.vao)

            let fb = this.nodePhysicsFB1
            if (!this.renderToNodePhysicsTex1) {
                fb = this.nodePhysicsFB0
            }

            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fb)
            this.gl.viewport(0, 0, this.nodePhysicsTex0.width, this.nodePhysicsTex0.height)

            let physicsTex = this.nodePhysicsTex0
            if (!this.renderToNodePhysicsTex1) {
                physicsTex = this.nodePhysicsTex1
            }

            supplyNodeInfos(this.forceCalcUnit, physicsTex)
            supplyConInfos(this.forceCalcUnit)
            useTexture(this.forceCalcUnit, this.nodeConInfoStartTex, 'u_node_con_infos_start_tex')

            this.gl.uniform1f(this.forceCalcUnit.locs.uLoc('u_node_min_dist'), this.simParam.nodeMinDist)
            this.gl.uniform1f(this.forceCalcUnit.locs.uLoc('u_repulsion'), this.simParam.repulsion)
            this.gl.uniform1f(this.forceCalcUnit.locs.uLoc('u_spring'), this.simParam.spring)
            this.gl.uniform1f(this.forceCalcUnit.locs.uLoc('u_spring_dist'), this.simParam.springDist)
            this.gl.uniform1f(this.forceCalcUnit.locs.uLoc('u_force_cap'), this.simParam.forceCap)

            this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);  // draw 2 triangles (6 vertices)
        }

        // enable alpha blending
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);

        // clear background
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
        {
            const bg = this.colorTable.background.getPreMultiplied().getNormalized()
            this.gl.clearColor(
                bg.r, bg.g, bg.b, bg.a
            )
        }
        this.gl.clear(this.gl.COLOR_BUFFER_BIT)

        // draw connections
        {
            this.gl.useProgram(this.drawConUint.program)
            this.gl.bindVertexArray(this.drawConUint.vao)
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)

            this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);

            let physicsTex = this.nodePhysicsTex1
            if (!this.renderToNodePhysicsTex1) {
                physicsTex = this.nodePhysicsTex0
            }

            supplyNodeInfos(this.drawConUint, physicsTex)
            supplyConInfos(this.drawConUint)

            this.gl.uniform2f(
                this.drawConUint.locs.uLoc('u_screen_size'), this.gl.canvas.width, this.gl.canvas.height)
            this.gl.uniform1f(
                this.drawConUint.locs.uLoc('u_zoom'), this.zoom)
            this.gl.uniform2f(
                this.drawConUint.locs.uLoc('u_offset'), this.offset.x, this.offset.y)

            this.gl.uniform1f(
                this.drawConUint.locs.uLoc('u_line_thickness'), this.connectionLineWidth)

            this.gl.drawArraysInstanced(
                this.gl.TRIANGLES,
                0, // offset
                6, // num vertices per instance
                this.connectionLength // num instances
            )
        }

        // draw nodes
        const drawNodes = (drawOutline: boolean) => {
            this.gl.useProgram(this.drawNodeUnit.program)
            this.gl.bindVertexArray(this.drawNodeUnit.vao)
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)

            this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);

            let physicsTex = this.nodePhysicsTex1
            if (!this.renderToNodePhysicsTex1) {
                physicsTex = this.nodePhysicsTex0
            }

            supplyNodeInfos(this.drawNodeUnit, physicsTex)

            useTexture(this.drawNodeUnit, this.circleTex, 'u_node_tex')

            this.gl.uniform2f(
                this.drawNodeUnit.locs.uLoc('u_screen_size'), this.gl.canvas.width, this.gl.canvas.height)
            this.gl.uniform1f(
                this.drawNodeUnit.locs.uLoc('u_zoom'), this.zoom)
            this.gl.uniform2f(
                this.drawNodeUnit.locs.uLoc('u_offset'), this.offset.x, this.offset.y)
            this.gl.uniform2f(
                this.drawNodeUnit.locs.uLoc('u_mouse'), this.mouse.x, this.mouse.y)

            this.gl.uniform1f(
                this.drawNodeUnit.locs.uLoc('u_tick'), this.globalTick)

            this.gl.uniform1i(
                this.drawNodeUnit.locs.uLoc('u_do_hover'), this.doHover ? 1 : 0)

            if (drawOutline) {
                this.gl.uniform1i(
                    this.drawNodeUnit.locs.uLoc('u_draw_outline'), 1)
                const ns = this.colorTable.nodeStroke.getPreMultiplied().getNormalized()
                this.gl.uniform4f(
                    this.drawNodeUnit.locs.uLoc('u_outline_color'),
                    ns.r, ns.g, ns.b, ns.a,
                )
                this.gl.uniform1f(
                    this.drawNodeUnit.locs.uLoc('u_outline_width'),
                    this.nodeOutlineWidth
                )
            } else {
                this.gl.uniform1i(
                    this.drawNodeUnit.locs.uLoc('u_draw_outline'), 0)
            }

            this.gl.drawArraysInstanced(
                this.gl.TRIANGLES,
                0, // offset
                6, // num vertices per instance
                this.nodeLength // num instances
            )
        }

        drawNodes(true)
        drawNodes(false)

        this.renderToNodePhysicsTex1 = !this.renderToNodePhysicsTex1
    }

    submitNodeManager(
        manager: NodeManager,
        flag: DataSyncFlags
    ) {
        this.nodeLength = manager.nodes.length
        this.connectionLength = manager.connections.length

        let nodeTexSize = this.capacityToEdge(this.nodeLength)
        nodeTexSize = Math.max(nodeTexSize, 128) // prevent creating empty texture

        // supply texture with node physics
        if ((flag & DataSyncFlags.NodePhysics) > 0) {
            let data = new Float32Array(nodeTexSize * nodeTexSize * 4)

            let offset = 0
            for (let i = 0; i < this.nodeLength; i++) {
                const node = manager.nodes[i]
                data[offset + 0] = node.posX
                data[offset + 1] = node.posY
                data[offset + 2] = node.mass
                data[offset + 3] = node.temp

                offset += 4
            }

            this.gl.activeTexture(this.gl.TEXTURE0 + this.nodePhysicsTex0.unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.nodePhysicsTex0.texture)
            this.gl.texImage2D(
                this.gl.TEXTURE_2D,
                0, // level
                this.gl.RGBA32UI, // internal format
                nodeTexSize, nodeTexSize, // width, height
                0, // border
                this.gl.RGBA_INTEGER, // format
                this.gl.UNSIGNED_INT, // type
                new Uint32Array(data.buffer) // data
            )
            this.nodePhysicsTex0.width = nodeTexSize
            this.nodePhysicsTex0.height = nodeTexSize

            this.gl.activeTexture(this.gl.TEXTURE0 + this.nodePhysicsTex1.unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.nodePhysicsTex1.texture)
            this.gl.texImage2D(
                this.gl.TEXTURE_2D,
                0, // level
                this.gl.RGBA32UI, // internal format
                nodeTexSize, nodeTexSize, // width, height
                0, // border
                this.gl.RGBA_INTEGER, // format
                this.gl.UNSIGNED_INT, // type
                new Uint32Array(data.buffer) // data
            )
            this.nodePhysicsTex1.width = nodeTexSize
            this.nodePhysicsTex1.height = nodeTexSize
        }

        // supply texture with node colors
        if ((flag & DataSyncFlags.NodeColors) > 0) {
            let data = new Uint8Array(nodeTexSize * nodeTexSize * 4)

            let offset = 0
            for (let i = 0; i < this.nodeLength; i++) {
                const node = manager.nodes[i]
                const c = node.color.getPreMultiplied()
                data[offset + 0] = c.r
                data[offset + 1] = c.g
                data[offset + 2] = c.b
                data[offset + 3] = c.a

                offset += 4
            }

            this.gl.activeTexture(this.gl.TEXTURE0 + this.nodeColorsTex.unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.nodeColorsTex.texture)
            this.gl.texImage2D(
                this.gl.TEXTURE_2D,
                0, // level
                this.gl.RGBA8, // internal format
                nodeTexSize, nodeTexSize, // width, height
                0, // border
                this.gl.RGBA, // format
                this.gl.UNSIGNED_BYTE, // type
                data // data
            )
            this.nodeColorsTex.width = nodeTexSize
            this.nodeColorsTex.height = nodeTexSize
        }

        // supply texture with node render positions
        if ((flag & DataSyncFlags.NodeRenderPos) > 0) {
            let data = new Float32Array(nodeTexSize * nodeTexSize * 4)

            let offset = 0
            for (let i = 0; i < this.nodeLength; i++) {
                const node = manager.nodes[i]
                data[offset + 0] = node.renderX
                data[offset + 1] = node.renderY
                data[offset + 2] = node.syncedToRender ? 1 : 0
                data[offset + 3] = node.renderRadiusScale

                offset += 4
            }

            this.gl.activeTexture(this.gl.TEXTURE0 + this.nodeRenderPosTex.unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.nodeRenderPosTex.texture)
            this.gl.texImage2D(
                this.gl.TEXTURE_2D,
                0, // level
                this.gl.RGBA32UI, // internal format
                nodeTexSize, nodeTexSize, // width, height
                0, // border
                this.gl.RGBA_INTEGER, // format
                this.gl.UNSIGNED_INT, // type
                new Uint32Array(data.buffer) // data
            )
            this.nodeRenderPosTex.width = nodeTexSize
            this.nodeRenderPosTex.height = nodeTexSize
        }

        // supply texture with connection infos
        if ((flag & DataSyncFlags.Connections) > 0) {
            // =======================================
            // sort connections with it's nodeIndexes
            // =======================================
            const conCopy = manager.connections.slice()

            conCopy.sort((conA, conB): number => {
                if (conA.nodeIndexA !== conB.nodeIndexA) {
                    return conA.nodeIndexA - conB.nodeIndexA
                }

                return conA.nodeIndexB - conB.nodeIndexB
            })

            // ===================================
            // collect connections node has
            // ===================================
            const nodeIndexToConIndicies: Array<Array<number>> = new Array(this.nodeLength)

            for (let nodeIndex = 0; nodeIndex < this.nodeLength; nodeIndex++) {
                nodeIndexToConIndicies[nodeIndex] = []
            }

            for (let i = 0; i < this.connectionLength; i++) {
                const con = conCopy[i]
                nodeIndexToConIndicies[con.nodeIndexA].push(i)
                nodeIndexToConIndicies[con.nodeIndexB].push(i)
            }

            // ==========================================
            // write where connection info will start
            // for each node at texture
            // ==========================================
            {
                let texSize = this.capacityToEdge(this.nodeLength)
                texSize = Math.max(texSize, 128) // prevent creating empty texture
                let data = new Int32Array(texSize * texSize)

                for (let i = 0; i < this.nodeLength; i++) {
                    if (nodeIndexToConIndicies[i].length > 0) {
                        data[i] = nodeIndexToConIndicies[i][0]
                    } else {
                        data[i] = -1
                    }
                }

                this.gl.activeTexture(this.gl.TEXTURE0 + this.nodeConInfoStartTex.unit)
                this.gl.bindTexture(this.gl.TEXTURE_2D, this.nodeConInfoStartTex.texture)
                this.gl.texImage2D(
                    this.gl.TEXTURE_2D,
                    0, // level
                    this.gl.R32I, // internal format
                    texSize, texSize, // width, height
                    0, // border
                    this.gl.RED_INTEGER, // format
                    this.gl.INT, // type
                    data // data
                )
                this.nodeConInfoStartTex.width = texSize
                this.nodeConInfoStartTex.height = texSize
            }

            // ==========================================
            // write main connection data
            // ==========================================
            {
                let texSize = this.capacityToEdge(this.connectionLength)
                texSize = Math.max(texSize, 128) // prevent creating empty texture
                let data = new Uint32Array(texSize * texSize * 4)

                // write connections
                let offset = 0
                for (let i = 0; i < this.connectionLength; i++) {
                    const con = conCopy[i]

                    data[offset + 0] = con.nodeIndexA
                    data[offset + 1] = con.nodeIndexB

                    offset += 4
                }

                // write relative pointers
                for (let nodeIndex = 0; nodeIndex < this.nodeLength; nodeIndex++) {
                    const conIndicies = nodeIndexToConIndicies[nodeIndex]

                    for (let i = 0; i < conIndicies.length; i++) {
                        let dataOffset = conIndicies[i] * 4
                        let dist = 0
                        if (i + 1 < conIndicies.length) {
                            dist = conIndicies[i + 1] - conIndicies[i]
                        }
                        let realCon = conCopy[conIndicies[i]]
                        if (realCon.nodeIndexA === nodeIndex) {
                            data[dataOffset + 2] = dist
                        } else {
                            data[dataOffset + 3] = dist
                        }
                    }
                }

                this.gl.activeTexture(this.gl.TEXTURE0 + this.conInfosTex.unit)
                this.gl.bindTexture(this.gl.TEXTURE_2D, this.conInfosTex.texture)
                this.gl.texImage2D(
                    this.gl.TEXTURE_2D,
                    0, // level
                    this.gl.RGBA32UI, // internal format
                    texSize, texSize, // width, height
                    0, // border
                    this.gl.RGBA_INTEGER, // format
                    this.gl.UNSIGNED_INT, // type
                    new Uint32Array(data.buffer) // data
                )
                this.nodeRenderPosTex.width = texSize
                this.nodeRenderPosTex.height = texSize
            }
        }
    }

    async updateNodePhysicsToNodeManager(manager: NodeManager) {
        if (this.nodeLength !== manager.nodes.length) {
            console.error(`node length is different : ${this.nodeLength}, ${manager.nodes.length}`)
        }

        let fb = this.nodePhysicsFB1
        let tex = this.nodePhysicsTex1

        // if (this.renderToNodePhysicsTex1) {
        //     fb = this.nodePhysicsFB0
        //     tex = this.nodePhysicsTex0
        // }

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fb)

        let nodeInfos: any = new Uint32Array(
            tex.width * tex.height * 4);

        await readPixelsAsync(
            this.gl,
            0, 0, tex.width, tex.height,
            this.gl.RGBA_INTEGER,
            this.gl.UNSIGNED_INT,
            nodeInfos
        )

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)

        nodeInfos = new Float32Array(nodeInfos.buffer)

        const nodeLength = Math.min(this.nodeLength, manager.nodes.length)

        let offset = 0

        for (let i = 0; i < nodeLength; i++) {
            const node = manager.nodes[i]
            node.posX = nodeInfos[offset + 0]
            node.posY = nodeInfos[offset + 1]
            // we skip 2, which is mass
            node.temp = nodeInfos[offset + 3]

            // NOTE: yes, we are lying and skipping mass
            // even though function name says updateNodePhysicsToNodeManager
            // because node manager already knows what mass is
            // and gpu doesn't touch it

            offset += 4
        }
    }

    capacityToEdge(cap: number): number {
        return Math.ceil(Math.sqrt(cap))
    }
}

// copy pasted from https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
function clientWaitAsync(
    gl: WebGL2RenderingContext,
    sync: WebGLSync,
    interval_ms: number
): Promise<void> {
    return new Promise((resolve, reject) => {
        function test() {
            const res = gl.clientWaitSync(sync, 0, 0);
            if (res === gl.WAIT_FAILED) {
                reject();
                return;
            }
            if (res === gl.TIMEOUT_EXPIRED) {
                setTimeout(test, interval_ms);
                return;
            }
            resolve();
        }
        test();
    });
}

async function getBufferSubDataAsync(
    gl: WebGL2RenderingContext,
    target: GLenum,
    buffer: WebGLBuffer,
    srcByteOffset: number,
    dstBuffer: ArrayBufferView<ArrayBuffer>,
    dstOffset: number = 0,
    length: number = 0,
) {
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (sync === null) {
        throw new Error('failed to create WebGLSync')
    }

    gl.flush();

    await clientWaitAsync(gl, sync, 1);
    gl.deleteSync(sync);

    gl.bindBuffer(target, buffer);
    gl.getBufferSubData(target, srcByteOffset, dstBuffer, dstOffset, length);
    gl.bindBuffer(target, null);

    return dstBuffer;
}

async function readPixelsAsync(
    gl: WebGL2RenderingContext,
    x: number, y: number,
    w: number, h: number,
    format: GLenum,
    type: GLenum,
    dest: ArrayBufferView<ArrayBuffer>
) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, dest.byteLength, gl.STREAM_READ);
    gl.readPixels(x, y, w, h, format, type, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    await getBufferSubDataAsync(gl, gl.PIXEL_PACK_BUFFER, buf, 0, dest);

    gl.deleteBuffer(buf);
    return dest;
}
