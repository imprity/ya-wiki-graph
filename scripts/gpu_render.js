import * as math from "./math.js";
import * as assets from "./assets.js";
import { ColorTable } from "./color_table.js";
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
`;
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
`;
const glslNodeUtils = `
#ifndef _GLSL_NODE_HEADER_GUARD_
#define _GLSL_NODE_HEADER_GUARD_

${glslCommon}

uniform int u_node_count;

uniform highp usampler2D u_node_render_pos_tex;
uniform sampler2D u_node_colors_tex;

bool is_node_synced_to_rencer(uvec4 render) {
    return render.z > uint(0);
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

float get_node_render_radius(uvec4 render) {
    return uintBitsToFloat(render.w);
}

#endif
`;
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
`;
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

    uvec4 node_render = get_data_from_tex(u_node_render_pos_tex, gl_InstanceID);

    vec2 node_pos = get_node_render_pos(node_render);

    float node_radius = get_node_render_radius(node_render);
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
`;
const drawNodeFShaderSrc = `#version 300 es
precision highp float;

in vec4 v_color;
in vec2 v_uv;

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
}`;
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
`;
// controls what data to sync with gpu
export var RenderSyncFlags;
(function (RenderSyncFlags) {
    RenderSyncFlags[RenderSyncFlags["Connections"] = 1] = "Connections";
    //NodePhysics = 1 << 1, // nodes' position, mass, temp
    RenderSyncFlags[RenderSyncFlags["NodeColors"] = 4] = "NodeColors";
    RenderSyncFlags[RenderSyncFlags["NodeRenderPos"] = 8] = "NodeRenderPos";
    RenderSyncFlags[RenderSyncFlags["Everything"] = -1] = "Everything";
})(RenderSyncFlags || (RenderSyncFlags = {}));
class LocationGroup {
    constructor(gl, program) {
        this.uniformLocs = new Map();
        this.attribLocs = new Map();
        this.gl = gl;
        this.program = program;
    }
    // uniform locations
    uLoc(name) {
        if (this.uniformLocs.has(name)) {
            return this.uniformLocs.get(name);
        }
        const loc = this.gl.getUniformLocation(this.program, name);
        this.uniformLocs.set(name, loc);
        return loc;
    }
    // attribute locations
    aLoc(name) {
        if (this.attribLocs.has(name)) {
            return this.attribLocs.get(name);
        }
        const loc = this.gl.getAttribLocation(this.program, name);
        this.attribLocs.set(name, loc);
        return loc;
    }
}
export class GpuRenderer {
    constructor(canvas) {
        this.nodeLength = 0;
        this.connectionLength = 0;
        // ==========================
        // constrol parameters
        // ==========================
        this.zoom = 1;
        this.offset = new math.Vector2(0, 0);
        this.mouse = new math.Vector2(0, 0);
        this.doHover = false;
        this.colorTable = new ColorTable();
        this.nodeOutlineWidth = 0;
        this.connectionLineWidth = 1;
        // =========================
        // create opengl context
        // =========================
        this.canvas = canvas;
        {
            const gl = this.canvas.getContext('webgl2', {
                'antialias': true,
                'premultipliedAlpha': true,
                'preserveDrawingBuffer': true,
            });
            if (gl === null) {
                throw new Error('failed to get webgl2 context');
            }
            this.gl = gl;
        }
        // match canvas width and height to
        // canvas element width and height
        {
            const rect = this.canvas.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
        }
        // =========================
        // create render units
        // =========================
        const createShader = (type, src) => {
            const shader = this.gl.createShader(type);
            let shader_type = 'vertex';
            if (type == this.gl.FRAGMENT_SHADER) {
                let shader_type = 'fragment';
            }
            if (shader === null) {
                throw new Error(`failed to create a ${shader_type} shader`);
            }
            this.gl.shaderSource(shader, src);
            this.gl.compileShader(shader);
            if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
                let log = this.gl.getShaderInfoLog(shader);
                if (log === null) {
                    log = `failed to create a ${shader_type} shader`;
                }
                throw new Error(log);
            }
            return shader;
        };
        const createRenderUnit = (vShaderSrc, fShaderSrc, name) => {
            console.log(`creating ${name} RenderUnit`);
            const program = this.gl.createProgram();
            const vShader = createShader(this.gl.VERTEX_SHADER, vShaderSrc);
            const fShader = createShader(this.gl.FRAGMENT_SHADER, fShaderSrc);
            this.gl.attachShader(program, vShader);
            this.gl.attachShader(program, fShader);
            this.gl.linkProgram(program);
            if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
                let log = this.gl.getProgramInfoLog(program);
                if (log === null) {
                    log = 'failed to link program';
                }
                throw new Error(log);
            }
            const locs = new LocationGroup(this.gl, program);
            const vao = this.gl.createVertexArray();
            return {
                program: program,
                locs: locs,
                vao: vao
            };
        };
        this.drawNodeUnit = createRenderUnit(drawNodeVShaderSrc, drawNodeFShaderSrc, 'drawNodeUnit');
        this.drawConUint = createRenderUnit(drawConVSahderSrc, drawConFSahderSrc, 'drawConUint');
        // =========================
        // create buffers
        // =========================
        this.fullRectBuf = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.fullRectBuf);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            -1, +1, 0, 1,
            +1, +1, 0, 1,
            +1, -1, 0, 1,
            -1, +1, 0, 1,
            +1, -1, 0, 1,
            -1, -1, 0, 1,
        ]), this.gl.STATIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        this.rect1Buf = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.rect1Buf);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            -0.5, -0.5, 0, 1,
            +0.5, -0.5, 0, 1,
            +0.5, +0.5, 0, 1,
            -0.5, -0.5, 0, 1,
            +0.5, +0.5, 0, 1,
            -0.5, +0.5, 0, 1,
        ]), this.gl.STATIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        this.rectUVBuf = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.rectUVBuf);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            0.0, 0.0,
            1.0, 0.0,
            1.0, 1.0,
            0.0, 0.0,
            1.0, 1.0,
            0.0, 1.0,
        ]), this.gl.STATIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        // =====================================
        // bind buffers to vao
        // =====================================
        const bindBufferToVAO = (buffer, unit, locName, size, type, normalized, stride = 0, offset = 0) => {
            this.gl.bindVertexArray(unit.vao);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
            this.gl.enableVertexAttribArray(unit.locs.aLoc(locName));
            this.gl.vertexAttribPointer(unit.locs.aLoc(locName), // location
            size, // size
            type, // type
            normalized, // normalize
            stride, // stride
            offset);
            this.gl.bindVertexArray(null);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        };
        bindBufferToVAO(this.rect1Buf, this.drawNodeUnit, 'a_vertex', 4, // size
        this.gl.FLOAT, // type
        false, // normalize
        0, // stride
        0);
        bindBufferToVAO(this.rect1Buf, this.drawConUint, 'a_vertex', 4, // size
        this.gl.FLOAT, // type
        false, // normalize
        0, // stride
        0);
        bindBufferToVAO(this.rectUVBuf, this.drawConUint, 'a_uv', 2, // size
        this.gl.FLOAT, // type
        false, // normalize
        0, // stride
        0);
        bindBufferToVAO(this.rectUVBuf, this.drawNodeUnit, 'a_uv', 2, // size
        this.gl.FLOAT, // type
        false, // normalize
        0, // stride
        0);
        // =========================
        // create textures
        // =========================
        const disableMips = () => {
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        };
        let textureUnitMax = 0;
        const getNewTextureUnitNumber = () => {
            let toReturn = textureUnitMax;
            textureUnitMax += 1;
            return toReturn;
        };
        const createDataTexture = (internalformat, w, h, format, type) => {
            const texture = this.gl.createTexture();
            let unit = getNewTextureUnitNumber();
            // set up texture parameters
            // set the filtering so we don't need mips
            this.gl.activeTexture(this.gl.TEXTURE0 + unit);
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            disableMips();
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, // level
            internalformat, w, h, // width, height
            0, // border
            format, type, null // data
            );
            return {
                texture: texture,
                unit: unit,
                width: w, height: h
            };
        };
        const texInitSize = 4;
        // create textures to hold node informations
        this.nodeColorsTex = createDataTexture(this.gl.RGBA8, // internal format
        texInitSize, texInitSize, // width, height
        this.gl.RGBA, // format
        this.gl.UNSIGNED_BYTE);
        // create texture to hold node render poses
        this.nodeRenderPosTex = createDataTexture(this.gl.RGBA32UI, texInitSize, texInitSize, this.gl.RGBA_INTEGER, this.gl.UNSIGNED_INT);
        // create textures to hold connection informations
        this.conInfosTex = createDataTexture(this.gl.RGBA32UI, texInitSize, texInitSize, this.gl.RGBA_INTEGER, this.gl.UNSIGNED_INT);
        // create dummy texture
        let dummyTexture;
        {
            const texture = this.gl.createTexture();
            let unit = getNewTextureUnitNumber();
            this.gl.activeTexture(this.gl.TEXTURE0 + unit);
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, // level
            this.gl.RGBA8, // internal format
            2, 2, // width, height
            0, // border
            this.gl.RGBA, // format
            this.gl.UNSIGNED_BYTE, // type
            new Uint8Array([
                255, 0, 255, 255,
                0, 0, 0, 255,
                0, 0, 0, 255,
                255, 0, 255, 255,
            ]));
            // set the filtering so we don't need mips
            disableMips();
            dummyTexture = {
                texture: texture,
                unit: unit,
                width: 2, height: 2
            };
        }
        const createImageTexture = (image) => {
            if (image === null) {
                return dummyTexture;
            }
            const texture = this.gl.createTexture();
            let unit = getNewTextureUnitNumber();
            this.gl.activeTexture(this.gl.TEXTURE0 + unit);
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            this.gl.texImage2D(this.gl.TEXTURE_2D, // taget
            0, // level
            this.gl.RGBA, // internal format
            this.gl.RGBA, // format
            this.gl.UNSIGNED_BYTE, // type
            image // source
            );
            this.gl.generateMipmap(this.gl.TEXTURE_2D);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_NEAREST);
            return {
                texture: texture,
                unit: unit,
                width: image.width, height: image.height
            };
        };
        this.circleTex = createImageTexture(assets.circleImage);
    }
    render() {
        const useTexture = (renderUnit, tex, name) => {
            this.gl.activeTexture(this.gl.TEXTURE0 + tex.unit);
            this.gl.bindTexture(this.gl.TEXTURE_2D, tex.texture);
            this.gl.uniform1i(renderUnit.locs.uLoc(name), tex.unit);
        };
        const supplyNodeInfos = (renderUnit) => {
            useTexture(renderUnit, this.nodeRenderPosTex, 'u_node_render_pos_tex');
            useTexture(renderUnit, this.nodeColorsTex, 'u_node_colors_tex');
            this.gl.uniform1i(renderUnit.locs.uLoc('u_node_count'), this.nodeLength);
        };
        const supplyConInfos = (renderUnit) => {
            useTexture(renderUnit, this.conInfosTex, 'u_con_infos_tex');
            this.gl.uniform1i(renderUnit.locs.uLoc('u_con_count'), this.connectionLength);
        };
        // match canvas width and height to
        // canvas element width and height
        {
            const rect = this.canvas.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
        }
        this.gl.disable(this.gl.DITHER);
        // enable alpha blending
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
        // clear background
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        {
            const bg = this.colorTable.background.getPreMultiplied().getNormalized();
            this.gl.clearColor(bg.r, bg.g, bg.b, bg.a);
        }
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        // draw connections
        {
            this.gl.useProgram(this.drawConUint.program);
            this.gl.bindVertexArray(this.drawConUint.vao);
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
            this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
            supplyNodeInfos(this.drawConUint);
            supplyConInfos(this.drawConUint);
            this.gl.uniform2f(this.drawConUint.locs.uLoc('u_screen_size'), this.gl.canvas.width, this.gl.canvas.height);
            this.gl.uniform1f(this.drawConUint.locs.uLoc('u_zoom'), this.zoom);
            this.gl.uniform2f(this.drawConUint.locs.uLoc('u_offset'), this.offset.x, this.offset.y);
            this.gl.uniform1f(this.drawConUint.locs.uLoc('u_line_thickness'), this.connectionLineWidth);
            this.gl.drawArraysInstanced(this.gl.TRIANGLES, 0, // offset
            6, // num vertices per instance
            this.connectionLength // num instances
            );
        }
        // draw nodes
        const drawNodes = (drawOutline) => {
            this.gl.useProgram(this.drawNodeUnit.program);
            this.gl.bindVertexArray(this.drawNodeUnit.vao);
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
            this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
            supplyNodeInfos(this.drawNodeUnit);
            useTexture(this.drawNodeUnit, this.circleTex, 'u_node_tex');
            this.gl.uniform2f(this.drawNodeUnit.locs.uLoc('u_screen_size'), this.gl.canvas.width, this.gl.canvas.height);
            this.gl.uniform1f(this.drawNodeUnit.locs.uLoc('u_zoom'), this.zoom);
            this.gl.uniform2f(this.drawNodeUnit.locs.uLoc('u_offset'), this.offset.x, this.offset.y);
            this.gl.uniform2f(this.drawNodeUnit.locs.uLoc('u_mouse'), this.mouse.x, this.mouse.y);
            this.gl.uniform1i(this.drawNodeUnit.locs.uLoc('u_do_hover'), this.doHover ? 1 : 0);
            if (drawOutline) {
                this.gl.uniform1i(this.drawNodeUnit.locs.uLoc('u_draw_outline'), 1);
                const ns = this.colorTable.nodeStroke.getPreMultiplied().getNormalized();
                this.gl.uniform4f(this.drawNodeUnit.locs.uLoc('u_outline_color'), ns.r, ns.g, ns.b, ns.a);
                this.gl.uniform1f(this.drawNodeUnit.locs.uLoc('u_outline_width'), this.nodeOutlineWidth);
            }
            else {
                this.gl.uniform1i(this.drawNodeUnit.locs.uLoc('u_draw_outline'), 0);
            }
            this.gl.drawArraysInstanced(this.gl.TRIANGLES, 0, // offset
            6, // num vertices per instance
            this.nodeLength // num instances
            );
        };
        drawNodes(true);
        drawNodes(false);
    }
    submitNodeManager(manager, flag) {
        this.nodeLength = manager.nodes.length;
        this.connectionLength = manager.connections.length;
        let nodeTexSize = this.capacityToEdge(this.nodeLength);
        nodeTexSize = Math.max(nodeTexSize, 128); // prevent creating empty texture
        const texImage = (tex, internalformat, width, height, format, type, data) => {
            this.gl.activeTexture(this.gl.TEXTURE0 + tex.unit);
            this.gl.bindTexture(this.gl.TEXTURE_2D, tex.texture);
            if (width === tex.width && height === tex.height) {
                this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, // level
                0, 0, width, height, // x, y, width, height
                format, type, data);
            }
            else {
                this.gl.texImage2D(this.gl.TEXTURE_2D, 0, // level
                internalformat, width, height, // width, height
                0, // border
                format, type, data);
            }
            tex.width = width;
            tex.height = height;
        };
        // supply texture with node colors
        if ((flag & RenderSyncFlags.NodeColors) > 0) {
            let data = new Uint8Array(nodeTexSize * nodeTexSize * 4);
            let offset = 0;
            for (let i = 0; i < this.nodeLength; i++) {
                const node = manager.nodes[i];
                const c = node.color.getPreMultiplied();
                data[offset + 0] = c.r;
                data[offset + 1] = c.g;
                data[offset + 2] = c.b;
                data[offset + 3] = c.a;
                offset += 4;
            }
            texImage(this.nodeColorsTex, this.gl.RGBA8, // internal format
            nodeTexSize, nodeTexSize, // width, height
            this.gl.RGBA, // format
            this.gl.UNSIGNED_BYTE, // type
            data // data
            );
        }
        // supply texture with node render positions
        if ((flag & RenderSyncFlags.NodeRenderPos) > 0) {
            let data = new Float32Array(nodeTexSize * nodeTexSize * 4);
            let offset = 0;
            for (let i = 0; i < this.nodeLength; i++) {
                const node = manager.nodes[i];
                data[offset + 0] = node.renderX;
                data[offset + 1] = node.renderY;
                data[offset + 2] = node.syncedToRender ? 1 : 0;
                data[offset + 3] = node.renderRadiusScale * node.getRadius();
                offset += 4;
            }
            texImage(this.nodeRenderPosTex, this.gl.RGBA32UI, // internal format
            nodeTexSize, nodeTexSize, // width, height
            this.gl.RGBA_INTEGER, // format
            this.gl.UNSIGNED_INT, // type
            new Uint32Array(data.buffer) // data
            );
        }
        // supply texture with connection infos
        if ((flag & RenderSyncFlags.Connections) > 0) {
            let texSize = this.capacityToEdge(this.connectionLength);
            texSize = Math.max(texSize, 128); // prevent creating empty texture
            let data = new Uint32Array(texSize * texSize * 4);
            // write connections
            let offset = 0;
            for (let i = 0; i < this.connectionLength; i++) {
                const con = manager.connections[i];
                data[offset + 0] = con.nodeIndexA;
                data[offset + 1] = con.nodeIndexB;
                data[offset + 2] = 0; // reserved
                data[offset + 3] = 0; // reserved
                offset += 4;
            }
            texImage(this.conInfosTex, this.gl.RGBA32UI, // internal format
            texSize, texSize, // width, height
            this.gl.RGBA_INTEGER, // format
            this.gl.UNSIGNED_INT, // type
            new Uint32Array(data.buffer) // data
            );
        }
    }
    capacityToEdge(cap) {
        return Math.ceil(Math.sqrt(cap));
    }
}
