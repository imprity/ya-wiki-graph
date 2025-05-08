import * as math from "./math.js";
const vertexShaderSrc = `#version 300 es

uniform sampler2D node_infos;

uniform int node_count;

uniform float node_min_dist;
uniform float repulsion;

in int index;

in vec2 position;
in float mass;

out vec2 force;

// NOTE:
// !!!!!!!!!!!   IMPORTANT   !!!!!!!!!!!!!!!!!!!!!!!
// cpu also needs to figure out raidus from a mass
// so if you are going to change this code,
// change the code in in main.ts as well
// !!!!!!!!!!!   IMPORTANT   !!!!!!!!!!!!!!!!!!!!!!!

float mass_to_radius(float m) {
    return 8.0f + m * 0.1;
}

void main() {
    vec2 sum = vec2(0.0f, 0.0f);

    for (int i=0; i<node_count; i++) {
        if (i == index) {
            continue;
        }

        vec4 other_node_info = texelFetch(node_infos, ivec2(i, 0), 0);

        vec2 other_pos = other_node_info.rg;
        float other_mass = other_node_info.b;
        float other_radius = mass_to_radius(other_mass);

        vec2 to_other = other_pos - position;

        float dist = length(to_other);

        if (dist < 0.00001f) {
            continue;
        }

        vec2 to_other_n = to_other / dist;

        dist -= mass_to_radius(mass);
        dist -= other_radius;

        dist = max(dist, node_min_dist);

        float f = repulsion * mass * other_mass / (dist * dist);

        vec2 fv = to_other_n * f;

        sum -= fv;
    }

    force = sum;
}
`;
const fragmentShaderSrc = `#version 300 es

void main() {}
`;
var GpuDataType;
(function (GpuDataType) {
    GpuDataType[GpuDataType["Int32"] = 0] = "Int32";
    GpuDataType[GpuDataType["Float32"] = 1] = "Float32";
})(GpuDataType || (GpuDataType = {}));
class VertexAttribute {
    constructor(gl, program, name, type, elementSize) {
        this.loc = gl.getAttribLocation(program, name);
        this.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.enableVertexAttribArray(this.loc);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        this.type = type;
        this.elementSize = elementSize;
    }
    pipeData(gl, data) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        if (this.type === GpuDataType.Int32) {
            gl.vertexAttribIPointer(this.loc, // location
            this.elementSize, // size
            gl.INT, // type
            0, // stride
            0);
        }
        else {
            gl.vertexAttribPointer(this.loc, this.elementSize, // size
            gl.FLOAT, // type
            false, // normalize
            0, // stride
            0);
        }
    }
}
export class GpuComputer {
    constructor() {
        this.capacity = 8192;
        // =========================
        // create opengl context
        // =========================
        const canvas = document.createElement('canvas');
        {
            const gl = canvas.getContext('webgl2');
            if (gl === null) {
                throw new Error('failed to get webgl2 context');
            }
            this.gl = gl;
        }
        // =========================
        // create shaders
        // =========================
        const createShader = (type, src) => {
            const shader = this.gl.createShader(type);
            if (shader === null) {
                throw new Error('failed to create a shader');
            }
            this.gl.shaderSource(shader, src);
            this.gl.compileShader(shader);
            if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
                let log = this.gl.getShaderInfoLog(shader);
                if (log === null) {
                    log = 'failed to create a shader';
                }
                throw new Error(log);
            }
            return shader;
        };
        const vertexShader = createShader(this.gl.VERTEX_SHADER, vertexShaderSrc);
        const fragmentShader = createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSrc);
        // =========================
        // create program
        // =========================
        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.transformFeedbackVaryings(this.program, ['force'], this.gl.SEPARATE_ATTRIBS);
        this.gl.linkProgram(this.program);
        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            let log = this.gl.getProgramInfoLog(this.program);
            if (log === null) {
                log = 'failed to link program';
            }
            throw new Error(log);
        }
        // =========================
        // get locations
        // =========================
        this.nodeCountLoc = this.gl.getUniformLocation(this.program, 'node_count');
        this.nodeMinDistLoc = this.gl.getUniformLocation(this.program, 'node_min_dist');
        this.repulsionLoc = this.gl.getUniformLocation(this.program, 'repulsion');
        // =========================
        // create vao
        // =========================
        this.vao = this.gl.createVertexArray();
        this.gl.bindVertexArray(this.vao);
        this.indexAttrib = new VertexAttribute(this.gl, this.program, 'index', GpuDataType.Int32, 1);
        this.positionAttrib = new VertexAttribute(this.gl, this.program, 'position', GpuDataType.Float32, 2);
        this.massAttrib = new VertexAttribute(this.gl, this.program, 'mass', GpuDataType.Float32, 1);
        // =========================
        // create buffer
        // =========================
        // create forceBuf
        this.forceBuf = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.forceBuf);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.capacity * 8, this.gl.DYNAMIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        // =========================
        // create transform feedback
        // =========================
        this.tf = this.gl.createTransformFeedback();
        this.gl.bindTransformFeedback(this.gl.TRANSFORM_FEEDBACK, this.tf);
        // bind the buffers to the transform feedback
        this.gl.bindBufferBase(this.gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.forceBuf);
        this.gl.bindTransformFeedback(this.gl.TRANSFORM_FEEDBACK, null);
        // =========================
        // create texture
        // =========================
        const createDataTexture = (name, textureNumber) => {
            const loc = this.gl.getUniformLocation(this.program, name);
            const texture = this.gl.createTexture();
            // set up texture parameters
            // set the filtering so we don't need mips
            this.gl.activeTexture(this.gl.TEXTURE0 + textureNumber);
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
            return {
                texture: texture,
                textureNumber: textureNumber,
                loc: loc
            };
        };
        this.nodeInfosTex = createDataTexture('node_infos', 0);
    }
    calculateForces(nodeManager, nodeMinDist, repulsion) {
        const positionBuf = new Float32Array(nodeManager.length() * 2);
        {
            let offset = 0;
            for (let i = 0; i < nodeManager.length(); i++) {
                const node = nodeManager.getNodeAt(i);
                positionBuf[offset] = node.posX;
                positionBuf[offset + 1] = node.posY;
                offset += 2;
            }
        }
        const massesBuf = new Float32Array(nodeManager.length());
        {
            for (let i = 0; i < nodeManager.length(); i++) {
                const node = nodeManager.getNodeAt(i);
                massesBuf[i] = node.mass;
            }
        }
        // ==================
        // pipe to texture
        // ==================
        // pipe to nodeInfosTex
        {
            const nodesInfo = new Float32Array(nodeManager.length() * 3);
            let nodeIndex = 0;
            for (let i = 0; i < nodesInfo.length; i += 3) {
                const node = nodeManager.getNodeAt(nodeIndex);
                nodesInfo[i + 0] = node.posX;
                nodesInfo[i + 1] = node.posY;
                nodesInfo[i + 2] = node.mass;
                nodeIndex += 1;
            }
            this.gl.activeTexture(this.gl.TEXTURE0 + this.nodeInfosTex.textureNumber);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.nodeInfosTex.texture);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, // level
            this.gl.RGB32F, // internal format
            nodeManager.length(), // width
            1, // height
            0, // border
            this.gl.RGB, // format
            this.gl.FLOAT, // type
            nodesInfo // data
            );
        }
        // =====================
        // pipe to gpu buffer
        // =====================
        {
            // pipe index
            const indexBuf = new Uint32Array(nodeManager.length());
            for (let i = 0; i < nodeManager.length(); i++) {
                indexBuf[i] = i;
            }
            this.indexAttrib.pipeData(this.gl, indexBuf);
        }
        {
            // pipe position
            this.positionAttrib.pipeData(this.gl, positionBuf);
        }
        {
            // pipe mass
            this.massAttrib.pipeData(this.gl, massesBuf);
        }
        this.gl.useProgram(this.program);
        this.gl.bindVertexArray(this.vao);
        this.gl.enable(this.gl.RASTERIZER_DISCARD);
        // setup uniforms
        this.gl.uniform1i(this.nodeCountLoc, nodeManager.length());
        this.gl.uniform1f(this.nodeMinDistLoc, nodeMinDist);
        this.gl.uniform1f(this.repulsionLoc, repulsion);
        // setup texture
        this.gl.uniform1i(this.nodeInfosTex.loc, this.nodeInfosTex.textureNumber);
        this.gl.bindTransformFeedback(this.gl.TRANSFORM_FEEDBACK, this.tf);
        this.gl.beginTransformFeedback(this.gl.POINTS);
        this.gl.drawArrays(this.gl.POINTS, 0, nodeManager.length());
        this.gl.endTransformFeedback();
        this.gl.bindTransformFeedback(this.gl.TRANSFORM_FEEDBACK, null);
        this.gl.disable(this.gl.RASTERIZER_DISCARD);
        const forceBuf = new Float32Array(nodeManager.length() * 2);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.forceBuf);
        this.gl.getBufferSubData(this.gl.ARRAY_BUFFER, 0, // byte offset into GPU buffer,
        forceBuf);
        const forceVBuf = [];
        for (let i = 0; i < forceBuf.length; i += 2) {
            forceVBuf.push(new math.Vector2(forceBuf[i], forceBuf[i + 1]));
        }
        return forceVBuf;
    }
}
