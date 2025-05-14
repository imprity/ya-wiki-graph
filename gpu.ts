import * as math from "./math.js"
import { NodeManager, DocNode } from "./main.js"
import { debugPrint } from './debug_print.js'

const forceCalcVShaderSrc = `#version 300 es
in vec4 vertex;

void main() {
    gl_Position = vertex;
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

// NOTE:
// !!!!!!!!!!!   IMPORTANT   !!!!!!!!!!!!!!!!!!!!!!!
// cpu also needs to figure out raidus from a mass
// so if you are going to change this code,
// change the code in in main.ts as well
// !!!!!!!!!!!   IMPORTANT   !!!!!!!!!!!!!!!!!!!!!!!
float mass_to_radius(float m) {
    return 8.0f + m * 0.1;
}

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
    float raidus_a = mass_to_radius(mass_a);
    float raidus_b = mass_to_radius(mass_b);

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
    float raidus_a = mass_to_radius(mass_a);
    float raidus_b = mass_to_radius(mass_b);

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

        node_pos += force_sum * node_temp;
    }

    uvec2 pos_u = floatBitsToUint(node_pos);
    uint temp_u = floatBitsToUint(node_temp);

    out_color = uvec4(
        pos_u.x, pos_u.y, node_info.z, temp_u
    );

    return;
}
`

const drawNodeVShaderSrc = `#version 300 es
in vec4 vertex;

uniform highp usampler2D u_node_infos_tex;

uniform vec2 u_screen_size;

out vec4 color;

void main() {
    float x = vertex.x;
    float y = vertex.y;

    // TODO: parameterize using uniform
    x *= 10.0f;
    y *= 10.0f;

    ivec2 texture_size = textureSize(u_node_infos_tex, 0);

    int info_x = gl_InstanceID % texture_size.x;
    int info_y = gl_InstanceID / texture_size.x;

    vec2 pos = uintBitsToFloat(texelFetch(u_node_infos_tex, ivec2(info_x, info_y), 0).xy);

    x += pos.x;
    y += pos.y;

    x = ((x / u_screen_size.x) - 0.5f) * 2.0f;
    y = -((y / u_screen_size.y) - 0.5f) * 2.0f;

    gl_Position = vec4(
        x, y, 0, 1
    );

    color = vec4(1, 0, 0, 1);
}
`

const drawNodeFShaderSrc = `#version 300 es
precision highp float;

in vec4 color;

out vec4 out_color;

void main() {
  out_color = color;
}
`;

const drawConVSahderSrc = `#version 300 es
#define PI 3.14159265359

in vec4 vertex;

uniform vec2 u_screen_size;

uniform highp usampler2D u_node_infos_tex;
uniform highp usampler2D u_con_infos_tex;

out vec4 color;

vec2 get_node_pos(int node_index) {
    ivec2 node_tex_size = textureSize(u_node_infos_tex, 0);

    int x = node_index % node_tex_size.x;
    int y = node_index / node_tex_size.x;
    return uintBitsToFloat(texelFetch(u_node_infos_tex, ivec2(x, y), 0).xy);
}

void main() {
    float x = vertex.x;
    float y = vertex.y;

    ivec2 con_tex_size = textureSize(u_con_infos_tex, 0);
    int con_x = gl_InstanceID % con_tex_size.x;
    int con_y = gl_InstanceID / con_tex_size.x;
    uvec4 con_info = texelFetch(u_con_infos_tex, ivec2(con_x, con_y), 0);

    vec2 pos_a = get_node_pos(int(con_info.x));
    vec2 pos_b = get_node_pos(int(con_info.y));

    vec2 atob = pos_b - pos_a;

    float angle = atan(atob.y, atob.x);
    float len = length(atob);
    vec2 center = (pos_a + pos_b) * 0.5;

    angle = angle;

    // scale
    x *= len;
    y *= 3.0f; // line thickness TODO: parameterize

    // rotate
    float sinv = sin(angle);
    float cosv = cos(angle);

    float x2 = x * cosv - y * sinv;
    float y2 = x * sinv + y * cosv;

    x = x2;
    y = y2;

    // translate
    x += center.x;
    y += center.y;

    x = ((x / u_screen_size.x) - 0.5f) * 2.0f;
    y = -((y / u_screen_size.y) - 0.5f) * 2.0f;

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

    color = vec4(1, 0, 0, 1);
}`

const drawConFSahderSrc = `#version 300 es
precision highp float;

in vec4 color;

out vec4 out_color;

void main() {
  out_color = color;
}
`

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
    nodeCapacity: number = 4096
    conCapacity: number = 4096

    nodeManager: NodeManager

    canvas: HTMLCanvasElement
    gl: WebGL2RenderingContext

    forceCalcUnit: RenderUnit
    drawNodeUnit: RenderUnit
    drawConUint: RenderUnit

    fullRectBuf: WebGLBuffer
    rect1Buf: WebGLBuffer

    nodeInfosTex0: Texture
    nodeInfosTex1: Texture
    useNodeInfosTex0: boolean = false

    nodeInfosFB0: WebGLFramebuffer
    nodeInfosFB1: WebGLFramebuffer

    conInfosTex: Texture

    textureUnitMax: number = -1

    constructor() {
        this.nodeManager = new NodeManager()

        // =========================
        // create opengl context
        // =========================
        {
            const id = 'my-canvas'
            const canvas = document.getElementById(id) as HTMLCanvasElement
            if (canvas === null) {
                throw new Error(`failed to get canvas id ${id}`)
            }
            this.canvas = canvas
        }
        {
            const gl = this.canvas.getContext('webgl2')
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

        // TEST TEST TEST TEST TEST
        // push test nodes
        {
            let x = this.canvas.width * 0.5
            let y = this.canvas.height * 0.5

            for (let i = 0; i < 5; i++) {
                const node = new DocNode()
                node.posX = x
                node.posY = y
                node.mass = 1

                this.nodeManager.pushNode(node)

                x += 10
                y += 5 * i * i
            }

            this.nodeManager.setConnected(0, 1, true)
            this.nodeManager.setConnected(0, 3, true)
        }
        // TEST TEST TEST TEST TEST

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

        const createRenderUnit = (vShaderSrc: string, fShaderSrc: string): RenderUnit => {
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

        this.forceCalcUnit = createRenderUnit(forceCalcVShaderSrc, forceCalcFShaderSrc)
        this.drawNodeUnit = createRenderUnit(drawNodeVShaderSrc, drawNodeFShaderSrc)
        this.drawConUint = createRenderUnit(drawConVSahderSrc, drawConFSahderSrc)

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

        // =====================================
        // bind buffers to vao
        // =====================================
        this.gl.bindVertexArray(this.forceCalcUnit.vao)
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.fullRectBuf)
        this.gl.enableVertexAttribArray(this.forceCalcUnit.locs.aLoc('vertex'))
        this.gl.vertexAttribPointer(
            this.forceCalcUnit.locs.aLoc('vertex'), // location
            4, // size
            this.gl.FLOAT, // type
            false, // normalize
            0, // stride
            0, // offset
        )
        this.gl.bindVertexArray(null)
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null)

        this.gl.bindVertexArray(this.drawNodeUnit.vao)
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.rect1Buf)
        this.gl.enableVertexAttribArray(this.drawNodeUnit.locs.aLoc('vertex'))
        this.gl.vertexAttribPointer(
            this.drawNodeUnit.locs.aLoc('vertex'), // location
            4, // size
            this.gl.FLOAT, // type
            false, // normalize
            0, // stride
            0, // offset
        )
        this.gl.bindVertexArray(null)
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null)

        this.gl.bindVertexArray(this.drawConUint.vao)
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.rect1Buf)
        this.gl.enableVertexAttribArray(this.drawConUint.locs.aLoc('vertex'))
        this.gl.vertexAttribPointer(
            this.drawConUint.locs.aLoc('vertex'), // location
            4, // size
            this.gl.FLOAT, // type
            false, // normalize
            0, // stride
            0, // offset
        )
        this.gl.bindVertexArray(null)
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null)

        // =========================
        // create texture
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

        // create textures to hold node informations
        const nodeDataTexSize = this.capacityToEdge(this.nodeCapacity)

        this.nodeInfosTex0 = createDataTexture()
        this.nodeInfosTex1 = createDataTexture()

        setDataTextureSize(this.nodeInfosTex0, nodeDataTexSize, nodeDataTexSize)
        setDataTextureSize(this.nodeInfosTex1, nodeDataTexSize, nodeDataTexSize)

        // TEST TEST TEST TEST TEST
        // supply texture with node infos
        {
            let data = new Float32Array(nodeDataTexSize * nodeDataTexSize * 4)

            let offset = 0
            for (let i = 0; i < this.nodeManager.length(); i++) {
                const node = this.nodeManager.getNodeAt(i)
                data[offset] = node.posX
                data[offset + 1] = node.posY
                data[offset + 2] = node.mass
                data[offset + 3] = 0 // reserved

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
        // TEST TEST TEST TEST TEST

        // create textures to hold connection informations
        const conDataTexSize = this.capacityToEdge(this.conCapacity)
        this.conInfosTex = createDataTexture()
        setDataTextureSize(this.conInfosTex, conDataTexSize, conDataTexSize)

        // TEST TEST TEST TEST TEST
        // supply texture with connection infos
        {
            let data = new Uint32Array(conDataTexSize * conDataTexSize * 4)
            let offset = 0

            this.nodeManager.getConnections().forEach((con) => {
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
        // TEST TEST TEST TEST TEST

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

            this.gl.uniform1i(this.forceCalcUnit.locs.uLoc('u_node_count'), this.nodeManager.length())
            this.gl.uniform1i(this.forceCalcUnit.locs.uLoc('u_con_count'), this.nodeManager.getConnections().length)

            this.gl.uniform1f(this.forceCalcUnit.locs.uLoc('u_node_min_dist'), 10) // TODO: parameterize

            this.gl.uniform1f(this.forceCalcUnit.locs.uLoc('u_repulsion'), 500) // TODO: parameterize

            this.gl.uniform1f(this.forceCalcUnit.locs.uLoc('u_spring'), 0.1) // TODO: parameterize
            this.gl.uniform1f(this.forceCalcUnit.locs.uLoc('u_spring_dist'), 10) // TODO: parameterize

            this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);  // draw 2 triangles (6 vertices)
        }

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

            this.gl.drawArraysInstanced(
                this.gl.TRIANGLES,
                0, // offset
                6, // num vertices per instance
                this.nodeManager.getConnections().length // num instances
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

            this.gl.uniform2f(
                this.drawNodeUnit.locs.uLoc('u_screen_size'), this.gl.canvas.width, this.gl.canvas.height)

            this.gl.drawArraysInstanced(
                this.gl.TRIANGLES,
                0, // offset
                6, // num vertices per instance
                this.nodeManager.length() // num instances
            )
        }

        // TEST TEST TEST TEST TEST
        {
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.nodeInfosFB1)

            // get the result
            let infos: any = new Uint32Array(this.nodeInfosTex0.width * this.nodeInfosTex1.height * 4);
            this.gl.readPixels(0, 0, this.nodeInfosTex0.width, this.nodeInfosTex1.height, this.gl.RGBA_INTEGER, this.gl.UNSIGNED_INT, infos);

            infos = new Float32Array(infos.buffer)

            // print the results
            let offset = 0
            for (let i = 0; i < this.nodeManager.length(); ++i) {
                debugPrint(`node${i}`, `${infos[offset].toFixed(2)}, ${infos[offset + 1].toFixed(2)}, ${infos[offset + 2].toFixed(2)}`)
                offset += 4
            }
        }
        // TEST TEST TEST TEST TEST

        this.useNodeInfosTex0 = !this.useNodeInfosTex0
    }

    capacityToEdge(cap: number): number {
        return Math.ceil(Math.sqrt(cap))
    }
}
