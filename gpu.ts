import * as math from "./math.js"
import { NodeManager, DocNode } from "./main.js"
import * as assets from "./assets.js"
import { debugPrint } from './debug_print.js'

// NOTE:
// !!!!!!!!!!!   IMPORTANT   !!!!!!!!!!!!!!!!!!!!!!!
// cpu also needs to figure out raidus from a mass
// so if you are going to change this code,
// change the code in in main.ts as well
// !!!!!!!!!!!   IMPORTANT   !!!!!!!!!!!!!!!!!!!!!!!
const nodeMassToRadiusGLSL = `
float node_mass_to_radius(float m) {
    return 8.0f + m * 0.1;
}
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

uniform int u_node_count;
uniform highp usampler2D u_node_infos_tex;

uniform int u_con_count;
uniform highp usampler2D u_con_infos_tex;

uniform float u_node_min_dist;
uniform float u_repulsion;
uniform float u_spring;
uniform float u_spring_dist;

out uvec4 out_color;

${nodeMassToRadiusGLSL}

/*
vec2 get_node_position_at(int x, int y) {
    return uintBitsToFloat(texelFetch(u_node_infos_tex, ivec2(x, y), 0).xy);
}

float get_node_mass_at(int x, int y) {
    return uintBitsToFloat(texelFetch(u_node_infos_tex, ivec2(x, y), 0).z);
}
*/

// returns force that A should recieve
vec2 calculate_repulsion(
    vec2 pos_a, float mass_a,
    vec2 pos_b, float mass_b
) {
    float raidus_a = node_mass_to_radius(mass_a);
    float raidus_b = node_mass_to_radius(mass_b);

    vec2 atob = pos_b - pos_a;

    float dist = length(atob);

    if (dist < 0.001f) {
        return vec2(0.0f, 0.0f);
    }

    dist -= raidus_a;
    dist -= raidus_b;

    dist = max(dist, u_node_min_dist);

    float f = u_repulsion * mass_a * mass_b / (dist * dist);

    vec2 atob_n = normalize(atob);

    return -atob_n * f;
}

// returns force that A should recieve
vec2 calculate_spring(
    vec2 pos_a, float mass_a,
    vec2 pos_b, float mass_b
) {
    float raidus_a = node_mass_to_radius(mass_a);
    float raidus_b = node_mass_to_radius(mass_b);

    vec2 atob = pos_b - pos_a;

    float dist = length(atob);

    if (dist < 0.001f) {
        return vec2(0.0f, 0.0f);
    }

    dist -= raidus_a;
    dist -= raidus_b;

    dist = max(dist, u_node_min_dist);

    float f = log(dist / u_spring_dist) * u_spring;

    vec2 atob_n = normalize(atob);

    return atob_n * f;
}

void main() {
    ivec2 texel_pos = ivec2(gl_FragCoord.xy);

    ivec2 node_tex_size = textureSize(u_node_infos_tex, 0);

    // node count out of bound
    if (texel_pos.x + texel_pos.y * node_tex_size.x >= u_node_count) {
        out_color = uvec4(0, 0, 0, 0);
        return;
    }

    ivec2 con_tex_size = textureSize(u_con_infos_tex, 0);

    uvec4 node_info = texelFetch(u_node_infos_tex, texel_pos, 0);

    vec2 node_pos = uintBitsToFloat(node_info.xy);
    float node_mass = uintBitsToFloat(node_info.z);
    float node_temp = uintBitsToFloat(node_info.w);
    int node_index = texel_pos.y * node_tex_size.x + texel_pos.x;

     // mass is too small
    if (node_mass < 0.001f) {
        out_color = texelFetch(u_node_infos_tex, texel_pos, 0);
        return;
    }

    vec2 force_sum = vec2(0.0f , 0.0f);

    int counter = 0;

    // =====================
    // calculate repulsions
    // =====================
    for (int y=0; y<node_tex_size.y; y++) {
        for (int x=0; x<node_tex_size.x; x++) {
            counter++;
            // skip if it's same node
            if (node_index + 1 == counter) {
                continue;
            }
            // break if we went past u_node_count
            if (counter > u_node_count) {
                break;
            }

            uvec4 other_node_info = texelFetch(u_node_infos_tex, ivec2(x, y), 0);
            vec2 other_node_pos = uintBitsToFloat(other_node_info.xy);
            float other_node_mass = uintBitsToFloat(other_node_info.z);

            force_sum += calculate_repulsion(
                node_pos, node_mass,
                other_node_pos, other_node_mass
            );
        }
        // break if we went past u_node_count
        if (counter > u_node_count) {
            break;
        }
    }

    counter = 0;

    // =====================
    // calculate springs
    // =====================
    for (int y=0; y<con_tex_size.y; y++) {
        for (int x=0; x<con_tex_size.x; x++) {
            counter++;
            // break if we went past u_node_count
            if (counter > u_con_count) {
                break;
            }

            ivec2 index_ab = ivec2(texelFetch(u_con_infos_tex, ivec2(x, y), 0).xy);

            if (index_ab.x == node_index || index_ab.y == node_index) {
                int other_node_index = index_ab.x;
                if (other_node_index == node_index) {
                    other_node_index = index_ab.y;
                }

                int other_x = other_node_index % node_tex_size.x;
                int other_y = other_node_index / node_tex_size.x;

                uvec4 other_node_info = texelFetch(u_node_infos_tex, ivec2(other_x, other_y), 0);
                vec2 other_node_pos = uintBitsToFloat(other_node_info.xy);
                float other_node_mass = uintBitsToFloat(other_node_info.z);

                force_sum += calculate_spring(
                    node_pos, node_mass,
                    other_node_pos, other_node_mass
                );
            }
        }
        // break if we went past u_node_count
        if (counter > u_con_count) {
            break;
        }
    }

    // =====================
    // apply force
    // =====================
    {
        float force_size = length(force_sum);
        float temp_fall_point = 1.0f; // TODO: parameterize
        float temp_change_rate = 0.01f; // TODO: parameterize

        if (force_size < temp_fall_point) {
            node_temp -= temp_change_rate;
        }else {
            node_temp += temp_change_rate;
        }

        node_temp = clamp(node_temp, 0.0f, 1.0f);

        node_pos += force_sum * node_temp / node_mass;
    }

    uvec2 pos_u = floatBitsToUint(node_pos);
    uint temp_u = floatBitsToUint(node_temp);

    out_color = uvec4(
        pos_u.x, pos_u.y, node_info.z, temp_u
    );

    return;
}
`

const worldToViewport = `
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
`

const drawNodeVShaderSrc = `#version 300 es
in vec4 a_vertex;
in vec2 a_uv;

uniform highp usampler2D u_node_infos_tex;

out vec4 v_color;
out vec2 v_uv;

${worldToViewport}

${nodeMassToRadiusGLSL}

void main() {
    float x = a_vertex.x;
    float y = a_vertex.y;

    ivec2 texture_size = textureSize(u_node_infos_tex, 0);

    int info_x = gl_InstanceID % texture_size.x;
    int info_y = gl_InstanceID / texture_size.x;

    vec2 node_pos = uintBitsToFloat(texelFetch(u_node_infos_tex, ivec2(info_x, info_y), 0).xy);
    float node_mass = uintBitsToFloat(texelFetch(u_node_infos_tex, ivec2(info_x, info_y), 0).z);

    float node_raidus = node_mass_to_radius(node_mass);

    x *= node_raidus * 2.0f;
    y *= node_raidus * 2.0f;

    x += node_pos.x;
    y += node_pos.y;

    vec2 pos = vec2(x, y);
    pos = world_to_viewport(pos);

    gl_Position = vec4(
        pos.x, pos.y, 0, 1
    );

    v_color = vec4(175.0f/255.0f, 238.0f/255.0f, 238.0f/255.0f, 1);
    v_uv = a_uv;
}
`

const drawNodeFShaderSrc = `#version 300 es
precision highp float;

in vec4 v_color;
in vec2 v_uv;

uniform sampler2D u_node_tex;

out vec4 out_color;

void main() {
    vec4 tex_color = texture(u_node_tex, v_uv);
    out_color = v_color * tex_color;
}
`;

const drawConVSahderSrc = `#version 300 es
#define PI 3.14159265359

in vec4 a_vertex;
in vec2 a_uv;

uniform highp usampler2D u_node_infos_tex;
uniform highp usampler2D u_con_infos_tex;

${worldToViewport}

out vec4 v_color;
out vec2 v_uv;

vec2 get_node_pos(int node_index) {
    ivec2 node_tex_size = textureSize(u_node_infos_tex, 0);

    int x = node_index % node_tex_size.x;
    int y = node_index / node_tex_size.x;
    return uintBitsToFloat(texelFetch(u_node_infos_tex, ivec2(x, y), 0).xy);
}

void main() {
    float x = a_vertex.x;
    float y = a_vertex.y;

    ivec2 con_tex_size = textureSize(u_con_infos_tex, 0);
    int con_x = gl_InstanceID % con_tex_size.x;
    int con_y = gl_InstanceID / con_tex_size.x;
    uvec4 con_info = texelFetch(u_con_infos_tex, ivec2(con_x, con_y), 0);

    vec2 pos_a = get_node_pos(int(con_info.x));
    vec2 pos_b = get_node_pos(int(con_info.y));

    pos_a = world_to_viewport(pos_a);
    pos_b = world_to_viewport(pos_b);

    vec2 atob = pos_b - pos_a;

    float angle = atan(atob.y, atob.x);
    float len = length(atob);
    vec2 center = (pos_a + pos_b) * 0.5;

    float pixel_height = 2.0 / u_screen_size.y;

    float line_thickness = pixel_height * (2.0) * u_zoom; // line thickness TODO: parameterize
    float line_alpha = 1.0;
    float line_limit = 2.0;

    // if line becomes thinnner than line_limit,
    // instead of making lines thinner,
    // reduce the line_alpha
    if (line_thickness < pixel_height * line_limit) {
        line_alpha =  line_thickness / (pixel_height * line_limit);
        line_thickness = pixel_height * line_limit;
    }

    // scale
    x *= len;
    y *= line_thickness;

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

    // switch (gl_VertexID){
    //     case 0:
    //     case 3:
    //     case 5:
    //         color = color_a;
    //         break;
    //     case 1:
    //     case 2:
    //     case 4:
    //         color = color_b;
    //         break;

    v_color = vec4(0.5, 0.5, 0.5, 1.0) * line_alpha;
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

    canvas: HTMLCanvasElement
    gl: WebGL2RenderingContext

    zoom: number = 1
    offset: math.Vector2 = new math.Vector2(0, 0)

    simParam: SimulationParameter = new SimulationParameter()

    forceCalcUnit: RenderUnit
    drawNodeUnit: RenderUnit
    drawConUint: RenderUnit

    fullRectBuf: WebGLBuffer
    rect1Buf: WebGLBuffer

    rectUVBuf: WebGLBuffer

    nodeInfosTex0: Texture
    nodeInfosTex1: Texture
    useNodeInfosTex0: boolean = false

    nodeInfosFB0: WebGLFramebuffer
    nodeInfosFB1: WebGLFramebuffer

    conInfosTex: Texture

    circleTex: Texture

    textureUnitMax: number = -1

    constructor(canvas: HTMLCanvasElement) {
        // =========================
        // create opengl context
        // =========================
        this.canvas = canvas
        {
            const gl = this.canvas.getContext('webgl2', {
                'antialias': true,
                'premultipliedAlpha': true,
                'alpha': false,
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
        const createDataTexture = (): Texture => {
            const texture = this.gl.createTexture()

            this.textureUnitMax += 1
            let unit = this.textureUnitMax

            // set up texture parameters
            // set the filtering so we don't need mips
            this.gl.activeTexture(this.gl.TEXTURE0 + unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture)

            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

            return {
                texture: texture,
                unit: unit,
                width: 0, height: 0
            }
        }

        const setDataTextureSize = (
            tex: Texture,
            w: number, h: number
        ) => {
            this.gl.activeTexture(this.gl.TEXTURE0 + tex.unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, tex.texture)
            this.gl.texImage2D(
                this.gl.TEXTURE_2D,
                0, // level
                this.gl.RGBA32UI, // internal format
                w, h, // width, height
                0, // border
                this.gl.RGBA_INTEGER, // format
                this.gl.UNSIGNED_INT, // type
                null // data
            )

            tex.width = w
            tex.height = h
        }

        const texInitSize = 128

        // create textures to hold node informations

        this.nodeInfosTex0 = createDataTexture()
        this.nodeInfosTex1 = createDataTexture()

        setDataTextureSize(this.nodeInfosTex0, texInitSize, texInitSize)
        setDataTextureSize(this.nodeInfosTex1, texInitSize, texInitSize)

        // create textures to hold connection informations
        this.conInfosTex = createDataTexture()
        setDataTextureSize(this.conInfosTex, texInitSize, texInitSize)

        // create dummy texture
        let dummyTexture: Texture
        {
            const texture = this.gl.createTexture()

            this.textureUnitMax += 1
            let unit = this.textureUnitMax

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
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.REPEAT);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.REPEAT);

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

            this.textureUnitMax += 1
            let unit = this.textureUnitMax

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

        this.nodeInfosFB0 = createFramebuffer(this.nodeInfosTex0)
        this.nodeInfosFB1 = createFramebuffer(this.nodeInfosTex1)
    }

    render() {
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

            let fb = this.nodeInfosFB1
            if (!this.useNodeInfosTex0) {
                fb = this.nodeInfosFB0
            }

            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fb)
            this.gl.viewport(0, 0, this.nodeInfosTex0.width, this.nodeInfosTex0.height)

            let infoTex = this.nodeInfosTex0
            if (!this.useNodeInfosTex0) {
                infoTex = this.nodeInfosTex1
            }

            this.gl.activeTexture(this.gl.TEXTURE0 + infoTex.unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, infoTex.texture)
            this.gl.uniform1i(this.forceCalcUnit.locs.uLoc('u_node_infos_tex'), infoTex.unit)

            this.gl.activeTexture(this.gl.TEXTURE0 + this.conInfosTex.unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.conInfosTex.texture)
            this.gl.uniform1i(this.forceCalcUnit.locs.uLoc('u_con_infos_tex'), this.conInfosTex.unit)

            this.gl.uniform1i(this.forceCalcUnit.locs.uLoc('u_node_count'), this.nodeLength)
            this.gl.uniform1i(this.forceCalcUnit.locs.uLoc('u_con_count'), this.connectionLength)

            this.gl.uniform1f(this.forceCalcUnit.locs.uLoc('u_node_min_dist'), this.simParam.nodeMinDist)

            this.gl.uniform1f(this.forceCalcUnit.locs.uLoc('u_repulsion'), this.simParam.repulsion)

            this.gl.uniform1f(this.forceCalcUnit.locs.uLoc('u_spring'), this.simParam.spring)
            this.gl.uniform1f(this.forceCalcUnit.locs.uLoc('u_spring_dist'), this.simParam.springDist)

            this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);  // draw 2 triangles (6 vertices)
        }

        // enable alpha blending
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);

        // clear background
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
        this.gl.clearColor(1, 1, 1, 1)
        this.gl.clear(this.gl.COLOR_BUFFER_BIT)

        // draw connections
        {
            this.gl.useProgram(this.drawConUint.program)
            this.gl.bindVertexArray(this.drawConUint.vao)
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)

            this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);

            let infoTex = this.nodeInfosTex1
            if (!this.useNodeInfosTex0) {
                infoTex = this.nodeInfosTex0
            }

            this.gl.activeTexture(this.gl.TEXTURE0 + infoTex.unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, infoTex.texture)
            this.gl.uniform1i(this.drawConUint.locs.uLoc('u_node_infos_tex'), infoTex.unit)

            this.gl.activeTexture(this.gl.TEXTURE0 + this.conInfosTex.unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.conInfosTex.texture)
            this.gl.uniform1i(this.drawConUint.locs.uLoc('u_con_infos_tex'), this.conInfosTex.unit)

            this.gl.uniform2f(
                this.drawConUint.locs.uLoc('u_screen_size'), this.gl.canvas.width, this.gl.canvas.height)
            this.gl.uniform1f(
                this.drawConUint.locs.uLoc('u_zoom'), this.zoom)
            this.gl.uniform2f(
                this.drawConUint.locs.uLoc('u_offset'), this.offset.x, this.offset.y)

            this.gl.drawArraysInstanced(
                this.gl.TRIANGLES,
                0, // offset
                6, // num vertices per instance
                this.connectionLength // num instances
            )
        }

        // draw nodes
        {
            this.gl.useProgram(this.drawNodeUnit.program)
            this.gl.bindVertexArray(this.drawNodeUnit.vao)
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)

            this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);

            let infoTex = this.nodeInfosTex1
            if (!this.useNodeInfosTex0) {
                infoTex = this.nodeInfosTex0
            }

            this.gl.activeTexture(this.gl.TEXTURE0 + infoTex.unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, infoTex.texture)
            this.gl.uniform1i(this.drawNodeUnit.locs.uLoc('u_node_infos_tex'), infoTex.unit)

            this.gl.activeTexture(this.gl.TEXTURE0 + this.circleTex.unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.circleTex.texture)
            this.gl.uniform1i(this.drawNodeUnit.locs.uLoc('u_node_tex'), this.circleTex.unit)

            this.gl.uniform2f(
                this.drawNodeUnit.locs.uLoc('u_screen_size'), this.gl.canvas.width, this.gl.canvas.height)
            this.gl.uniform1f(
                this.drawNodeUnit.locs.uLoc('u_zoom'), this.zoom)
            this.gl.uniform2f(
                this.drawNodeUnit.locs.uLoc('u_offset'), this.offset.x, this.offset.y)

            this.gl.drawArraysInstanced(
                this.gl.TRIANGLES,
                0, // offset
                6, // num vertices per instance
                this.nodeLength // num instances
            )
        }

        this.useNodeInfosTex0 = !this.useNodeInfosTex0
    }

    submitNodeManager(manager: NodeManager) {
        this.nodeLength = manager.length()
        this.connectionLength = manager.getConnections().length

        // supply texture with node infos
        {
            let nodeDataTexSize = this.capacityToEdge(this.nodeLength)
            nodeDataTexSize = Math.max(nodeDataTexSize, 128) // prevent creating empty texture

            let data = new Float32Array(nodeDataTexSize * nodeDataTexSize * 4)

            let offset = 0
            for (let i = 0; i < manager.length(); i++) {
                const node = manager.getNodeAt(i)
                data[offset] = node.posX
                data[offset + 1] = node.posY
                data[offset + 2] = node.mass
                data[offset + 3] = node.temp

                offset += 4
            }

            this.gl.activeTexture(this.gl.TEXTURE0 + this.nodeInfosTex0.unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.nodeInfosTex0.texture)
            this.gl.texImage2D(
                this.gl.TEXTURE_2D,
                0, // level
                this.gl.RGBA32UI, // internal format
                nodeDataTexSize, nodeDataTexSize, // width, height
                0, // border
                this.gl.RGBA_INTEGER, // format
                this.gl.UNSIGNED_INT, // type
                new Uint32Array(data.buffer) // data
            )

            this.gl.activeTexture(this.gl.TEXTURE0 + this.nodeInfosTex1.unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.nodeInfosTex1.texture)
            this.gl.texImage2D(
                this.gl.TEXTURE_2D,
                0, // level
                this.gl.RGBA32UI, // internal format
                nodeDataTexSize, nodeDataTexSize, // width, height
                0, // border
                this.gl.RGBA_INTEGER, // format
                this.gl.UNSIGNED_INT, // type
                new Uint32Array(data.buffer) // data
            )
        }

        // supply texture with connection infos
        {
            let conDataTexSize = this.capacityToEdge(this.connectionLength)
            conDataTexSize = Math.max(conDataTexSize, 128) // prevent creating empty texture

            let data = new Uint32Array(conDataTexSize * conDataTexSize * 4)
            let offset = 0

            manager.getConnections().forEach((con) => {
                data[offset] = con.nodeIndexA
                data[offset + 1] = con.nodeIndexB
                data[offset + 2] = 0 // reserved
                data[offset + 3] = 0 // reserved

                offset += 4
            })

            this.gl.activeTexture(this.gl.TEXTURE0 + this.conInfosTex.unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.conInfosTex.texture)
            this.gl.texImage2D(
                this.gl.TEXTURE_2D,
                0, // level
                this.gl.RGBA32UI, // internal format
                conDataTexSize, conDataTexSize, // width, height
                0, // border
                this.gl.RGBA_INTEGER, // format
                this.gl.UNSIGNED_INT, // type
                data // data
            )
        }
    }

    async updateNodePositionsAndTempsToNodeManager(manager: NodeManager) {
        if (this.nodeLength !== manager.length()) {
            console.error(`node length is different : ${this.nodeLength}, ${manager.length()}`)
        }

        const nodeLength = Math.min(this.nodeLength, manager.length())

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.nodeInfosFB1)

        let nodeInfos: any = new Uint32Array(
            this.nodeInfosTex0.width * this.nodeInfosTex0.height * 4);

        await readPixelsAsync(
            this.gl,
            0, 0, this.nodeInfosTex0.width, this.nodeInfosTex0.height,
            this.gl.RGBA_INTEGER,
            this.gl.UNSIGNED_INT,
            nodeInfos
        )

        nodeInfos = new Float32Array(nodeInfos.buffer)

        let offset = 0

        for (let i = 0; i < nodeLength; i++) {
            const node = manager.getNodeAt(i)
            node.posX = nodeInfos[offset]
            node.posY = nodeInfos[offset + 1]
            // we skip 2, which is mass
            node.temp = nodeInfos[offset + 3]

            offset += 4
        }

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
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

    await clientWaitAsync(gl, sync, 0.1);
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
