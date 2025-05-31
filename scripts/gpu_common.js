var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export const glslCommon = `
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
export class LocationGroup {
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
function createShader(gl, type, src) {
    const shader = gl.createShader(type);
    let shader_type = 'vertex';
    if (type == gl.FRAGMENT_SHADER) {
        let shader_type = 'fragment';
    }
    if (shader === null) {
        throw new Error(`failed to create a ${shader_type} shader`);
    }
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        let log = gl.getShaderInfoLog(shader);
        if (log === null) {
            log = `failed to create a ${shader_type} shader`;
        }
        throw new Error(log);
    }
    return shader;
}
export function createRenderUnit(gl, vShaderSrc, fShaderSrc, name) {
    console.log(`creating ${name} RenderUnit`);
    const program = gl.createProgram();
    const vShader = createShader(gl, gl.VERTEX_SHADER, vShaderSrc);
    const fShader = createShader(gl, gl.FRAGMENT_SHADER, fShaderSrc);
    gl.attachShader(program, vShader);
    gl.attachShader(program, fShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        let log = gl.getProgramInfoLog(program);
        if (log === null) {
            log = 'failed to link program';
        }
        throw new Error(log);
    }
    const locs = new LocationGroup(gl, program);
    const vao = gl.createVertexArray();
    return {
        program: program,
        locs: locs,
        vao: vao
    };
}
export function bindBufferToVAO(gl, buffer, unit, locName, size, type, normalized, stride = 0, offset = 0) {
    gl.bindVertexArray(unit.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(unit.locs.aLoc(locName));
    gl.vertexAttribPointer(unit.locs.aLoc(locName), // location
    size, // size
    type, // type
    normalized, // normalize
    stride, // stride
    offset);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
}
export function disableMips(gl) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
let textureUnitCounter = 0;
function getNewTextureUnitNumber() {
    let toReturn = textureUnitCounter;
    textureUnitCounter += 1;
    return textureUnitCounter;
}
export function resetTextureUnitCounter() {
    textureUnitCounter = 0;
}
export function createDataTexture(gl, internalformat, w, h, format, type) {
    const texture = gl.createTexture();
    let unit = getNewTextureUnitNumber();
    // set up texture parameters
    // set the filtering so we don't need mips
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    disableMips(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, // level
    internalformat, w, h, // width, height
    0, // border
    format, type, null // data
    );
    return {
        texture: texture,
        unit: unit,
        width: w, height: h
    };
}
export function createFramebuffer(gl, tex) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.texture, 0);
    return fb;
}
export function useTexture(gl, renderUnit, tex, name) {
    gl.activeTexture(gl.TEXTURE0 + tex.unit);
    gl.bindTexture(gl.TEXTURE_2D, tex.texture);
    gl.uniform1i(renderUnit.locs.uLoc(name), tex.unit);
}
export function setDataTextureData(gl, tex, internalformat, width, height, format, type, data) {
    gl.activeTexture(gl.TEXTURE0 + tex.unit);
    gl.bindTexture(gl.TEXTURE_2D, tex.texture);
    if (width === tex.width && height === tex.height) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, // level
        0, 0, width, height, // x, y, width, height
        format, type, data);
    }
    else {
        gl.texImage2D(gl.TEXTURE_2D, 0, // level
        internalformat, width, height, // width, height
        0, // border
        format, type, data);
    }
    tex.width = width;
    tex.height = height;
}
// below functions are copy pasted from https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
export function clientWaitAsync(gl, sync, interval_ms) {
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
export function getBufferSubDataAsync(gl_1, target_1, buffer_1, srcByteOffset_1, dstBuffer_1) {
    return __awaiter(this, arguments, void 0, function* (gl, target, buffer, srcByteOffset, dstBuffer, dstOffset = 0, length = 0) {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (sync === null) {
            throw new Error('failed to create WebGLSync');
        }
        gl.flush();
        yield clientWaitAsync(gl, sync, 1);
        gl.deleteSync(sync);
        gl.bindBuffer(target, buffer);
        gl.getBufferSubData(target, srcByteOffset, dstBuffer, dstOffset, length);
        gl.bindBuffer(target, null);
        return dstBuffer;
    });
}
export function readPixelsAsync(gl, x, y, w, h, format, type, dest) {
    return __awaiter(this, void 0, void 0, function* () {
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf);
        gl.bufferData(gl.PIXEL_PACK_BUFFER, dest.byteLength, gl.STREAM_READ);
        gl.readPixels(x, y, w, h, format, type, 0);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        yield getBufferSubDataAsync(gl, gl.PIXEL_PACK_BUFFER, buf, 0, dest);
        gl.deleteBuffer(buf);
        return dest;
    });
}
export function capacityToEdge(cap) {
    return Math.ceil(Math.sqrt(cap));
}
