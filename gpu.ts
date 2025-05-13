import * as math from "./math.js"
import { NodeManager, DocNode } from "./main.js"
import { debugPrint } from './debug_print.js'

const repulsionCalcVShaderSrc = `#version 300 es
in vec4 vertex;

void main() {
    gl_Position = vertex;
}
`
const repulsionCalcFShaderSrc = `#version 300 es
precision highp float;

uniform highp usampler2D node_infos_tex;

uniform int node_count;

uniform float node_min_dist;
uniform float repulsion;

out highp uvec4 out_color;

// NOTE:
// !!!!!!!!!!!   IMPORTANT   !!!!!!!!!!!!!!!!!!!!!!!
// cpu also needs to figure out raidus from a mass
// so if you are going to change this code,
// change the code in in main.ts as well
// !!!!!!!!!!!   IMPORTANT   !!!!!!!!!!!!!!!!!!!!!!!
float mass_to_radius(float m) {
    return 8.0f + m * 0.1;
}

vec2 get_node_position_at(int x, int y) {
    return uintBitsToFloat(texelFetch(node_infos_tex, ivec2(x, y), 0).xy);
}

float get_node_mass_at(int x, int y) {
    return uintBitsToFloat(texelFetch(node_infos_tex, ivec2(x, y), 0).z);
}

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

    dist = max(dist, node_min_dist);

    float f = repulsion * mass_a * mass_b / (dist * dist);

    vec2 atob_n = normalize(atob);

    return -atob_n * f;
}

void main() {
    ivec2 texture_size = textureSize(node_infos_tex, 0);
    ivec2 texel_pos = ivec2(gl_FragCoord.xy);

    if (texel_pos.x + texel_pos.y * texture_size.x >= node_count) {
        out_color = uvec4(0, 0, 0, 0);
        return;
    }

    vec2 node_pos = get_node_position_at(texel_pos.x, texel_pos.y);
    float node_mass = get_node_mass_at(texel_pos.x, texel_pos.y);

    int node_index = 0;

    vec2 force_sum = vec2(0.0f , 0.0f);

    for (int y=0; y<texture_size.y; y++) {
        for (int x=0; x<texture_size.x; x++) {
            // skip if it's same node
            if (x == texel_pos.x && y == texel_pos.y) {
                node_index++;
                continue;
            }
            // break if we went past node_count
            if (node_index >= node_count) {
                break;
            }
            node_index++;

            force_sum += calculate_repulsion(
                node_pos, node_mass,
                get_node_position_at(x, y), get_node_mass_at(x, y)
            );
        }
        // break if we went past node_count
        if (node_index >= node_count) {
            break;
        }
    }

    uvec2 force_u = floatBitsToUint(force_sum);

    out_color = uvec4(
        force_u.x, force_u.y, 0, 0
    );
}
`

const forceSumVShaderSrc = `#version 300 es
in vec4 vertex;

void main() {
    gl_Position = vertex;
}
`

const forceSumFShaderSrc = `#version 300 es
precision highp float;

uniform highp usampler2D node_infos_tex;
uniform highp usampler2D repulsion_tex;
// uniform highp usampler2D spring_tex;

out highp uvec4 out_color;

void main() {
    ivec2 texel_pos = ivec2(gl_FragCoord.xy);

    uvec4 info = texelFetch(node_infos_tex, texel_pos, 0);

    uvec4 forceu1 = texelFetch(repulsion_tex, texel_pos, 0);
    //uvec4 forceu2 = texelFetch(spring_tex, texel_pos, 0);
    uvec4 forceu2 = uvec4(0,0,0,0);

    vec2 force1 = uintBitsToFloat(forceu1.xy);
    vec2 force2 = uintBitsToFloat(forceu2.xy);

    vec2 pos = uintBitsToFloat(info.xy);

    //pos += force1 + force2;
    pos += force1;
    uvec2 posu = floatBitsToUint(pos);

    out_color = uvec4(posu.x, posu.y, info.z, info.w);
}`

const drawNodeVShaderSrc = `#version 300 es
in vec4 vertex;

uniform highp usampler2D node_infos_tex;

uniform vec2 screen_size;

out vec4 color;

void main() {
    float x = vertex.x;
    float y = vertex.y;

    // TODO: parameterize using uniform
    x *= 10.0f;
    y *= 10.0f;

    ivec2 texture_size = textureSize(node_infos_tex, 0);

    int info_x = gl_InstanceID % texture_size.x;
    int info_y = gl_InstanceID / texture_size.x;

    vec2 pos = uintBitsToFloat(texelFetch(node_infos_tex, ivec2(info_x, info_y), 0).xy);

    x += pos.x;
    y += pos.y;

    x = ((x / screen_size.x) - 0.5f) * 2.0f;
    y = -((y / screen_size.y) - 0.5f) * 2.0f;

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

export class GpuComputeRenderer {
    capacity: number = 4096

    nodeManager: NodeManager

    canvas: HTMLCanvasElement
    gl: WebGL2RenderingContext

    repulsionCalcProgram: WebGLProgram
    repulsionCalcLocs: LocationGroup
    repulsionCalcVAO: WebGLVertexArrayObject

    forceSumProgram: WebGLProgram
    forceSumLocs: LocationGroup
    forceSumVAO: WebGLVertexArrayObject

    drawNodeProgram: WebGLProgram
    drawNodeLocs: LocationGroup
    drawNodeVAO: WebGLVertexArrayObject

    fullRectBuf: WebGLBuffer
    rect1Buf: WebGLBuffer

    nodeInfosTex0: Texture
    nodeInfosTex1: Texture
    useNodeInfosTex0: boolean = false

    nodeInfosFB0: WebGLFramebuffer
    nodeInfosFB1: WebGLFramebuffer

    forceTex: Texture
    forceFB: WebGLFramebuffer

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

                x += 20;
                y += 10;
            }
        }
        // TEST TEST TEST TEST TEST

        // =========================
        // create program
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

        const createProgram = (vShaderSrc: string, fShaderSrc: string): WebGLProgram => {
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

            return program
        }

        this.repulsionCalcProgram = createProgram(repulsionCalcVShaderSrc, repulsionCalcFShaderSrc)
        this.repulsionCalcLocs = new LocationGroup(this.gl, this.repulsionCalcProgram)

        this.forceSumProgram = createProgram(forceSumVShaderSrc, forceSumFShaderSrc)
        this.forceSumLocs = new LocationGroup(this.gl, this.forceSumProgram)

        this.drawNodeProgram = createProgram(drawNodeVShaderSrc, drawNodeFShaderSrc)
        this.drawNodeLocs = new LocationGroup(this.gl, this.drawNodeProgram)

        // =========================
        // create vao
        // =========================
        this.repulsionCalcVAO = this.gl.createVertexArray()
        this.forceSumVAO = this.gl.createVertexArray()
        this.drawNodeVAO = this.gl.createVertexArray()

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
        this.gl.bindVertexArray(this.repulsionCalcVAO)
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.fullRectBuf)
        this.gl.enableVertexAttribArray(this.repulsionCalcLocs.aLoc('vertex'))
        this.gl.vertexAttribPointer(
            this.repulsionCalcLocs.aLoc('vertex'), // location
            4, // size
            this.gl.FLOAT, // type
            false, // normalize
            0, // stride
            0, // offset
        )
        this.gl.bindVertexArray(null)
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null)

        this.gl.bindVertexArray(this.forceSumVAO)
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.fullRectBuf)
        this.gl.enableVertexAttribArray(this.forceSumLocs.aLoc('vertex'))
        this.gl.vertexAttribPointer(
            this.forceSumLocs.aLoc('vertex'), // location
            4, // size
            this.gl.FLOAT, // type
            false, // normalize
            0, // stride
            0, // offset
        )
        this.gl.bindVertexArray(null)
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null)

        this.gl.bindVertexArray(this.drawNodeVAO)
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.rect1Buf)
        this.gl.enableVertexAttribArray(this.drawNodeLocs.aLoc('vertex'))
        this.gl.vertexAttribPointer(
            this.drawNodeLocs.aLoc('vertex'), // location
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

        const texSize = Math.ceil(Math.sqrt(this.capacity))

        this.nodeInfosTex0 = createDataTexture()
        this.nodeInfosTex1 = createDataTexture()
        this.forceTex = createDataTexture()

        setDataTextureSize(this.nodeInfosTex0, texSize, texSize)
        setDataTextureSize(this.nodeInfosTex1, texSize, texSize)
        setDataTextureSize(this.forceTex, texSize, texSize)

        // TEST TEST TEST TEST TEST
        {
            let data = new Float32Array(texSize * texSize * 4)

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
                texSize, texSize, // width, height
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
                texSize, texSize, // width, height
                0, // border
                this.gl.RGBA_INTEGER, // format
                this.gl.UNSIGNED_INT, // type
                new Uint32Array(data.buffer) // data
            )
        }
        // TEST TEST TEST TEST TEST

        // ===================
        // create forceFB
        // ===================

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

        this.forceFB = createFramebuffer(this.forceTex)

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
        // calculate repulsion
        {
            this.gl.useProgram(this.repulsionCalcProgram)
            this.gl.bindVertexArray(this.repulsionCalcVAO)

            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.forceFB)
            this.gl.viewport(0, 0, this.forceTex.width, this.forceTex.height)

            let infoTex = this.nodeInfosTex0
            if (!this.useNodeInfosTex0) {
                infoTex = this.nodeInfosTex1
            }

            this.gl.activeTexture(this.gl.TEXTURE0 + infoTex.unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, infoTex.texture)
            this.gl.uniform1i(this.repulsionCalcLocs.uLoc('node_infos_tex'), infoTex.unit)

            this.gl.uniform1i(this.repulsionCalcLocs.uLoc('node_count'), this.nodeManager.length())

            this.gl.uniform1f(this.repulsionCalcLocs.uLoc('node_min_dist'), 10) // TODO: expose setting
            this.gl.uniform1f(this.repulsionCalcLocs.uLoc('repulsion'), 500) // TODO: expose setting

            this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);  // draw 2 triangles (6 vertices)
        }

        // sum forces
        {
            this.gl.useProgram(this.forceSumProgram)
            this.gl.bindVertexArray(this.forceSumVAO)

            let fb = this.nodeInfosFB1
            if (!this.useNodeInfosTex0) {
                fb = this.nodeInfosFB0
            }

            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fb)
            this.gl.viewport(0, 0, this.forceTex.width, this.forceTex.height)

            let infoTex = this.nodeInfosTex0
            if (!this.useNodeInfosTex0) {
                infoTex = this.nodeInfosTex1
            }

            this.gl.activeTexture(this.gl.TEXTURE0 + infoTex.unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, infoTex.texture)
            this.gl.uniform1i(this.forceSumLocs.uLoc('node_infos_tex'), infoTex.unit)

            this.gl.activeTexture(this.gl.TEXTURE0 + this.forceTex.unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.forceTex.texture)
            this.gl.uniform1i(this.forceSumLocs.uLoc('repulsion_tex'), this.forceTex.unit)

            this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);  // draw 2 triangles (6 vertices)
        }

        // draw nodes
        {
            this.gl.useProgram(this.drawNodeProgram)
            this.gl.bindVertexArray(this.drawNodeVAO)
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)

            this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);

            let infoTex = this.nodeInfosTex1
            if (!this.useNodeInfosTex0) {
                infoTex = this.nodeInfosTex0
            }

            this.gl.activeTexture(this.gl.TEXTURE0 + infoTex.unit)
            this.gl.bindTexture(this.gl.TEXTURE_2D, infoTex.texture)
            this.gl.uniform1i(this.drawNodeLocs.uLoc('node_infos_tex'), infoTex.unit)

            this.gl.uniform2f(
                this.drawNodeLocs.uLoc('screen_size'), this.gl.canvas.width, this.gl.canvas.height)

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
}
