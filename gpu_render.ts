import * as math from "./math.js"
import * as util from "./util.js"
import * as gpu from "./gpu_common.js"
import { NodeManager, DocNode } from "./graph_objects.js"
import * as assets from "./assets.js"
import { ColorTable } from "./color_table.js"

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

const glslNodeCommon = `
#ifndef _GLSL_NODE_HEADER_GUARD_
#define _GLSL_NODE_HEADER_GUARD_

${gpu.glslCommon}

float get_node_glow(uvec4 render) {
    return uintBitsToFloat(render.z);
}

vec2 get_node_render_pos(uvec4 render) {
    return uintBitsToFloat(render.xy);
}

vec4 get_node_color(sampler2D color_tex, int index) {
    ivec2 tex_size = textureSize(color_tex, 0);
    int x = index % tex_size.x;
    int y = index / tex_size.x;

    return texelFetch(color_tex, ivec2(x, y), 0);
}

bool get_node_render_skip(lowp usampler2D skip_tex, int index) {
    ivec2 tex_size = textureSize(skip_tex, 0);
    int x = index % tex_size.x;
    int y = index / tex_size.x;

    return texelFetch(skip_tex, ivec2(x, y), 0).x > uint(0);
}

float get_node_render_radius(uvec4 render) {
    return uintBitsToFloat(render.w);
}

#endif
`

const drawNodeVShaderSrc = `#version 300 es
in vec4 a_vertex;
in vec2 a_uv;

${glslViewportTransform}

${glslNodeCommon}

uniform vec2 u_mouse;

uniform bool u_draw_outline;
uniform vec4 u_outline_color;
uniform float u_outline_width;
uniform bool u_do_hover;

uniform highp usampler2D u_node_render_pos_tex;
uniform sampler2D u_node_colors_tex;
uniform lowp usampler2D u_node_render_skip_tex;

uniform int u_node_index_override;

out vec4 v_color;
out vec2 v_uv;

void main() {
    int node_index = gl_InstanceID;

    if (u_node_index_override >= 0) {
        node_index = u_node_index_override;
    }

    uvec4 node_render = get_data_from_tex(u_node_render_pos_tex, node_index);
    vec2 node_pos = get_node_render_pos(node_render);

    float node_radius = get_node_render_radius(node_render);
    float node_radius_with_outline = node_radius + u_outline_width;

    if (u_draw_outline) {
        node_radius = node_radius_with_outline;
    }

    vec4 node_color = get_node_color(u_node_colors_tex, node_index);

    if (u_draw_outline) {
        node_color.rgb *= 0.8; // TODO: parameterize
    }

    vec2 pos = a_vertex.xy;

    pos *= node_radius * 2.0f;
    pos += node_pos;
    pos = world_to_viewport(pos);

    gl_Position = vec4(
        pos.x, pos.y, 0, 1
    );

    v_color = node_color;
    v_uv = a_uv;

    // if mouse is being hovered, change to different color
    vec2 mouse = viewport_to_world(u_mouse);

    if (u_do_hover && distance_squared(node_pos, mouse) < node_radius_with_outline * node_radius_with_outline) {
        node_color.rgb *= 0.3; // TODO: parameterize
        v_color = node_color;
    }

    v_color *= max(
        step(0.0f, float(u_node_index_override)),
        (1.0 - float(get_node_render_skip(u_node_render_skip_tex, node_index)))
    );
}
`

const drawNodeFShaderSrc = `#version 300 es
precision highp float;

in vec4 v_color;
in vec2 v_uv;

${gpu.glslCommon}

uniform sampler2D u_node_tex;

uniform bool u_draw_outline;

out vec4 out_color;

void main() {
    vec4 node_c = texture(u_node_tex, v_uv) * v_color;

    out_color = node_c;
}
`;

const drawConVSahderSrc = `#version 300 es
in vec4 a_vertex;
in vec2 a_uv;

${gpu.glslCommon}

${glslNodeCommon}

${glslViewportTransform}

uniform float u_line_thickness;

uniform highp usampler2D u_node_render_pos_tex;
uniform sampler2D u_node_colors_tex;

uniform highp usampler2D u_con_infos_tex;

ivec2 get_connected_nodes(int con_index) {
    uvec4 con = get_data_from_tex(u_con_infos_tex, con_index);
    return ivec2(con.xy);
}

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

    // float pixel_height = 2.0 / u_screen_size.y;
    float pixel_height = 0.0;
    {
        vec2 ad = normalize(vec2(atob.y, atob.x));

        ad /= u_screen_size;

        pixel_height = sqrt(dot(ad, ad)) * 2.0f;
    }

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

    vec4 color_a = get_node_color(u_node_colors_tex, node_ab.x);
    vec4 color_b = get_node_color(u_node_colors_tex, node_ab.y);

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

const drawGlowVShaderSrc = `#version 300 es
in vec4 a_vertex;
in vec2 a_uv;

${gpu.glslCommon}

${glslNodeCommon}

${glslViewportTransform}

uniform float u_glow_size;
uniform float u_glow_boost;

uniform highp usampler2D u_node_render_pos_tex;
uniform sampler2D u_node_colors_tex;
uniform lowp usampler2D u_node_render_skip_tex;

uniform int u_node_index_override;

out float v_glow;
out vec4 v_color;
out vec2 v_uv;

void main() {
    int node_index = gl_InstanceID;

    if (u_node_index_override >= 0) {
        node_index = u_node_index_override;
    }

    uvec4 node_render = get_data_from_tex(u_node_render_pos_tex, node_index);
    vec2 node_pos = get_node_render_pos(node_render);
    float node_radius = get_node_render_radius(node_render);
    vec4 node_color = get_node_color(u_node_colors_tex, node_index);
    float node_glow = get_node_glow(node_render);

    vec2 pos = a_vertex.xy;

    // radius * how big glow is to a node
    pos *= node_radius * 2.0f * u_glow_size;
    pos += node_pos;
    pos = world_to_viewport(pos);

    gl_Position = vec4(
        pos.x, pos.y, 0, 1
    );

    v_glow = node_glow;
    v_color = node_color + vec4(1,1,1,1) * u_glow_boost;
    v_uv = a_uv;

    v_color *= max(
        step(0.0f, float(u_node_index_override)),
        (1.0 - float(get_node_render_skip(u_node_render_skip_tex, node_index)))
    );
}
`

const drawGlowFShaderSrc = `#version 300 es
precision highp float;

in float v_glow;
in vec4 v_color;
in vec2 v_uv;

${gpu.glslCommon}

uniform sampler2D u_glow_tex;

out vec4 out_color;

void main() {
    vec4 glow_c = texture(u_glow_tex, v_uv) * v_color * v_glow;

    out_color = glow_c;
}
`

// controls what data to sync with gpu
export enum RenderSyncFlags {
    Connections = 1 << 0, // connections
    NodeColors = 1 << 1, // nodes' colors
    NodeRenderPosAndOrder = 1 << 2, // node render positions
    Everything = ~0
}

export class RenderParameter {
    zoom: number = 1
    offset: math.Vector2 = new math.Vector2(0, 0)

    mouse: math.Vector2 = new math.Vector2(0, 0)

    doHover: boolean = false

    colorTable: ColorTable = new ColorTable()

    nodeOutlineWidth: number = 0
    connectionLineWidth: number = 1

    glowSize: number = 1
    glowBoost: number = 0.2
}

export class GpuRenderer {
    nodeLength: number = 0
    connectionLength: number = 0

    canvas: HTMLCanvasElement
    gl: WebGL2RenderingContext

    drawConUint: gpu.RenderUnit
    drawGlowUnit: gpu.RenderUnit
    drawNodeUnit: gpu.RenderUnit

    nodeColorsTex: gpu.Texture

    nodeRenderPosTex: gpu.Texture

    nodeRenderSkipTex: gpu.Texture

    conInfosTex: gpu.Texture

    fullRectBuf: WebGLBuffer
    rect1Buf: WebGLBuffer

    rectUVBuf: WebGLBuffer

    circleTex: gpu.Texture
    glowTex: gpu.Texture

    nodesToDrawOnTop: util.Stack<DocNode> = new util.Stack<DocNode>()

    // ==========================
    // constrol parameters
    // ==========================
    renderParam: RenderParameter = new RenderParameter()

    constructor(canvas: HTMLCanvasElement) {
        // =========================
        // create opengl context
        // =========================
        this.canvas = canvas
        {
            const gl = this.canvas.getContext('webgl2', {
                'antialias': true,
                'premultipliedAlpha': true,
                'preserveDrawingBuffer': true,
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

        this.drawConUint = gpu.createRenderUnit(
            this.gl, drawConVSahderSrc, drawConFSahderSrc, 'drawConUint')
        this.drawGlowUnit = gpu.createRenderUnit(
            this.gl, drawGlowVShaderSrc, drawGlowFShaderSrc, 'drawGlowUnit')
        this.drawNodeUnit = gpu.createRenderUnit(
            this.gl, drawNodeVShaderSrc, drawNodeFShaderSrc, 'drawNodeUnit')

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
        gpu.bindBufferToVAO(
            this.gl,
            this.rect1Buf, this.drawNodeUnit, 'a_vertex',
            4, // size
            this.gl.FLOAT, // type
            false, // normalize
            0, // stride
            0, // offset
        )

        gpu.bindBufferToVAO(
            this.gl,
            this.rect1Buf, this.drawGlowUnit, 'a_vertex',
            4, // size
            this.gl.FLOAT, // type
            false, // normalize
            0, // stride
            0, // offset
        )

        gpu.bindBufferToVAO(
            this.gl,
            this.rect1Buf, this.drawConUint, 'a_vertex',
            4, // size
            this.gl.FLOAT, // type
            false, // normalize
            0, // stride
            0, // offset
        )

        gpu.bindBufferToVAO(
            this.gl,
            this.rectUVBuf, this.drawConUint, 'a_uv',
            2, // size
            this.gl.FLOAT, // type
            false, // normalize
            0, // stride
            0, // offset
        )

        gpu.bindBufferToVAO(
            this.gl,
            this.rectUVBuf, this.drawGlowUnit, 'a_uv',
            2, // size
            this.gl.FLOAT, // type
            false, // normalize
            0, // stride
            0, // offset
        )

        gpu.bindBufferToVAO(
            this.gl,
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

        gpu.resetTextureUnitCounter()

        const texInitSize = 4

        // create textures to hold node informations
        this.nodeColorsTex = gpu.createDataTexture(
            this.gl,
            this.gl.RGBA8, // internal format
            texInitSize, texInitSize, // width, height
            this.gl.RGBA, // format
            this.gl.UNSIGNED_BYTE, // type
        )

        // create texture to hold node render poses
        this.nodeRenderPosTex = gpu.createDataTexture(
            this.gl,
            this.gl.RGBA32UI,
            texInitSize, texInitSize,
            this.gl.RGBA_INTEGER,
            this.gl.UNSIGNED_INT,
        )

        // create textures to hold node to skip in instance drawing
        this.nodeRenderSkipTex = gpu.createDataTexture(
            this.gl,
            this.gl.R8UI,
            texInitSize, texInitSize,
            this.gl.RED_INTEGER,
            this.gl.UNSIGNED_BYTE,
        )

        // create textures to hold connection informations
        this.conInfosTex = gpu.createDataTexture(
            this.gl,
            this.gl.RGBA32UI,
            texInitSize, texInitSize,
            this.gl.RGBA_INTEGER,
            this.gl.UNSIGNED_INT,
        )

        // create dummy texture
        let dummyTexture: gpu.Texture
        {
            const texture = this.gl.createTexture()

            let unit = gpu.getNewTextureUnitNumber()

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

        const createImageTexture = (image: ImageBitmap | null): gpu.Texture => {
            if (image === null) {
                return dummyTexture
            }
            const texture = this.gl.createTexture()

            let unit = gpu.getNewTextureUnitNumber()

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
        this.glowTex = createImageTexture(assets.glowImage)
    }

    render() {
        const supplyViewportInfo = (renderUnit: gpu.RenderUnit) => {
            this.gl.uniform2f(
                renderUnit.locs.uLoc('u_screen_size'),
                this.gl.canvas.width, this.gl.canvas.height
            )
            this.gl.uniform1f(
                renderUnit.locs.uLoc('u_zoom'), this.renderParam.zoom
            )
            this.gl.uniform2f(
                renderUnit.locs.uLoc('u_offset'),
                this.renderParam.offset.x, this.renderParam.offset.y
            )
        }

        // match canvas width and height to
        // canvas element width and height
        {
            const rect = this.canvas.getBoundingClientRect()
            this.canvas.width = rect.width
            this.canvas.height = rect.height
        }

        this.gl.disable(this.gl.DITHER);

        // enable alpha blending
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);

        // clear background
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
        {
            let bg = this.renderParam.colorTable.background
            bg = bg.getPreMultiplied().getNormalized()
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

            supplyViewportInfo(this.drawConUint)

            gpu.useTexture(this.gl, this.drawConUint, this.nodeRenderPosTex, 'u_node_render_pos_tex')
            gpu.useTexture(this.gl, this.drawConUint, this.nodeColorsTex, 'u_node_colors_tex')

            gpu.useTexture(this.gl, this.drawConUint, this.conInfosTex, 'u_con_infos_tex')

            this.gl.uniform1f(
                this.drawConUint.locs.uLoc('u_line_thickness'),
                this.renderParam.connectionLineWidth)

            this.gl.drawArraysInstanced(
                this.gl.TRIANGLES,
                0, // offset
                6, // num vertices per instance
                this.connectionLength // num instances
            )
        }

        this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);

        // draw nodes
        const drawNodes = (
            drawOutline: boolean,
            drawSpecificNode: number, // if number is >= 0, draw that node
        ) => {
            this.gl.useProgram(this.drawNodeUnit.program)
            this.gl.bindVertexArray(this.drawNodeUnit.vao)
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)

            this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);

            supplyViewportInfo(this.drawNodeUnit)

            gpu.useTexture(this.gl, this.drawNodeUnit, this.nodeRenderPosTex, 'u_node_render_pos_tex')
            gpu.useTexture(this.gl, this.drawNodeUnit, this.nodeColorsTex, 'u_node_colors_tex')

            gpu.useTexture(this.gl, this.drawNodeUnit, this.circleTex, 'u_node_tex')

            gpu.useTexture(this.gl, this.drawNodeUnit, this.nodeRenderSkipTex, 'u_node_render_skip_tex')

            this.gl.uniform2f(
                this.drawNodeUnit.locs.uLoc('u_mouse'),
                this.renderParam.mouse.x, this.renderParam.mouse.y)
            this.gl.uniform1i(
                this.drawNodeUnit.locs.uLoc('u_do_hover'), this.renderParam.doHover ? 1 : 0)

            if (drawOutline) {
                this.gl.uniform1i(
                    this.drawNodeUnit.locs.uLoc('u_draw_outline'), 1)

                let ns = this.renderParam.colorTable.nodeStroke
                ns = ns.getPreMultiplied().getNormalized()

                this.gl.uniform4f(
                    this.drawNodeUnit.locs.uLoc('u_outline_color'),
                    ns.r, ns.g, ns.b, ns.a,
                )
                this.gl.uniform1f(
                    this.drawNodeUnit.locs.uLoc('u_outline_width'),
                    this.renderParam.nodeOutlineWidth
                )
            } else {
                this.gl.uniform1i(
                    this.drawNodeUnit.locs.uLoc('u_draw_outline'), 0)
            }

            this.gl.uniform1i(
                this.drawNodeUnit.locs.uLoc('u_node_index_override'), drawSpecificNode)

            if (drawSpecificNode >= 0) {
                this.gl.drawArrays(
                    this.gl.TRIANGLES,
                    0,
                    6,
                )
            } else {
                this.gl.drawArraysInstanced(
                    this.gl.TRIANGLES,
                    0, // offset
                    6, // num vertices per instance
                    this.nodeLength // num instances
                )
            }
        }

        // ==========================
        // draw nodes instanced
        // ==========================
        drawNodes(true, -1)
        drawNodes(false, -1)

        // draw glows
        this.gl.blendFunc(this.gl.ONE, this.gl.ONE);

        const drawGlow = (
            drawSpecificNode: number, // if number is >= 0, draw that node
        ) => {

            this.gl.useProgram(this.drawGlowUnit.program)
            this.gl.bindVertexArray(this.drawGlowUnit.vao)
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)

            this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
            this.gl.uniform1f(
                this.drawGlowUnit.locs.uLoc('u_glow_size'),
                this.renderParam.glowSize
            )
            this.gl.uniform1f(
                this.drawGlowUnit.locs.uLoc('u_glow_boost'),
                this.renderParam.glowBoost
            )

            supplyViewportInfo(this.drawGlowUnit)

            gpu.useTexture(this.gl, this.drawGlowUnit, this.nodeRenderPosTex, 'u_node_render_pos_tex')
            gpu.useTexture(this.gl, this.drawGlowUnit, this.nodeColorsTex, 'u_node_colors_tex')
            gpu.useTexture(this.gl, this.drawGlowUnit, this.nodeRenderSkipTex, 'u_node_render_skip_tex')
            gpu.useTexture(this.gl, this.drawGlowUnit, this.glowTex, 'u_glow_tex')

            this.gl.uniform1i(
                this.drawGlowUnit.locs.uLoc('u_node_index_override'), drawSpecificNode)

            if (drawSpecificNode >= 0) {
                this.gl.drawArrays(
                    this.gl.TRIANGLES,
                    0,
                    6,
                )
            } else {
                this.gl.drawArraysInstanced(
                    this.gl.TRIANGLES,
                    0, // offset
                    6, // num vertices per instance
                    this.nodeLength // num instances
                )
            }
        }

        drawGlow(-1)

        // =======================================
        // draw nodes that needst to be on top
        // =======================================

        //for (const node of this.nodesToDrawOnTop) {
        for (let i = 0; i < this.nodesToDrawOnTop.length; i++) {
            const node = this.nodesToDrawOnTop.peekAt(i)

            if (node.index < this.nodeLength) {
                this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);

                drawNodes(true, node.index)
                drawNodes(false, node.index)

                this.gl.blendFunc(this.gl.ONE, this.gl.ONE);

                drawGlow(node.index)
            }
        }

    }

    _nodeRenderPosBuf: util.ByteBuffer = new util.ByteBuffer(Float32Array)
    _nodeRenderSkipBuf: util.ByteBuffer = new util.ByteBuffer(Uint8Array)

    submitNodeManager(
        manager: NodeManager,
        flag: RenderSyncFlags
    ) {
        this.nodeLength = manager.nodes.length
        this.connectionLength = manager.connections.length

        let nodeTexSize = gpu.capacityToEdge(this.nodeLength)
        nodeTexSize = Math.max(nodeTexSize, 128) // prevent creating empty texture

        // supply texture with node colors
        if ((flag & RenderSyncFlags.NodeColors) > 0) {
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

            gpu.setDataTextureData(
                this.gl,
                this.nodeColorsTex,
                this.gl.RGBA8, // internal format
                nodeTexSize, nodeTexSize, // width, height
                this.gl.RGBA, // format
                this.gl.UNSIGNED_BYTE, // type
                data // data
            )
        }

        // supply texture with node render positions
        if ((flag & RenderSyncFlags.NodeRenderPosAndOrder) > 0) {
            this.nodesToDrawOnTop.clear()

            this._nodeRenderPosBuf.setLength(nodeTexSize * nodeTexSize * 4)

            this._nodeRenderSkipBuf.setLength(nodeTexSize * nodeTexSize)

            let offset = 0
            for (let i = 0; i < this.nodeLength; i++) {
                const node = manager.nodes[i]
                this._nodeRenderPosBuf.set(offset + 0, node.renderX)
                this._nodeRenderPosBuf.set(offset + 1, node.renderY)
                this._nodeRenderPosBuf.set(offset + 2, node.glow)
                this._nodeRenderPosBuf.set(offset + 3, node.renderRadius)

                offset += 4

                if (node.drawOnTop) {
                    this._nodeRenderSkipBuf.set(i, 1)
                    this.nodesToDrawOnTop.push(node)
                } else {
                    this._nodeRenderSkipBuf.set(i, 0)
                }
            }

            gpu.setDataTextureData(
                this.gl,
                this.nodeRenderPosTex,
                this.gl.RGBA32UI, // internal format
                nodeTexSize, nodeTexSize, // width, height
                this.gl.RGBA_INTEGER, // format
                this.gl.UNSIGNED_INT, // type
                this._nodeRenderPosBuf.cast(Uint32Array)
            )

            this.gl.pixelStorei(this.gl.UNPACK_ALIGNMENT, 1);
            gpu.setDataTextureData(
                this.gl,
                this.nodeRenderSkipTex,
                this.gl.R8UI, // internal format
                nodeTexSize, nodeTexSize, // width, height
                this.gl.RED_INTEGER, // format
                this.gl.UNSIGNED_BYTE, // type
                this._nodeRenderSkipBuf.cast(Uint8Array)
            )
            this.gl.pixelStorei(this.gl.UNPACK_ALIGNMENT, 4);
        }

        // supply texture with connection infos
        if ((flag & RenderSyncFlags.Connections) > 0) {
            let texSize = gpu.capacityToEdge(this.connectionLength)
            texSize = Math.max(texSize, 128) // prevent creating empty texture
            let data = new Uint32Array(texSize * texSize * 4)

            // write connections
            let offset = 0
            for (let i = 0; i < this.connectionLength; i++) {
                const con = manager.connections[i]

                data[offset + 0] = con.nodeIndexA
                data[offset + 1] = con.nodeIndexB
                data[offset + 2] = 0 // reserved
                data[offset + 3] = 0 // reserved

                offset += 4
            }

            gpu.setDataTextureData(
                this.gl,
                this.conInfosTex,
                this.gl.RGBA32UI, // internal format
                texSize, texSize, // width, height
                this.gl.RGBA_INTEGER, // format
                this.gl.UNSIGNED_INT, // type
                new Uint32Array(data.buffer) // data
            )
        }
    }
}
