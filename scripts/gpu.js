import * as math from "./math.js";
const vertexShaderSrc = `#version 300 es

uniform sampler2D node_positions;
uniform int node_count;

in int index;

in vec2 position;

out vec2 force;

void main() {
    float sumX = 0.0f;
    float sumY = 0.0f;

    for (int i=0; i<node_count; i++) {
        if (i == index) {
            continue;
        }

        vec2 node_pos = texelFetch(node_positions, ivec2(i, 0), 0).rg;
        sumX += node_pos.x;
        sumY += node_pos.y;
    }

    force = vec2(sumX * position.x, sumY * position.y);
    //force = texelFetch(node_positions, ivec2(index, 0), 0).rg;
}
`;
const fragmentShaderSrc = `#version 300 es

void main() {}
`;
export class GpuComputer {
    constructor() {
        this.capacity = 512;
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
        this.nodePositionsLoc = this.gl.getUniformLocation(this.program, 'node_positions');
        this.nodeCountLoc = this.gl.getUniformLocation(this.program, 'node_count');
        this.indexLoc = this.gl.getAttribLocation(this.program, 'index');
        this.positionLoc = this.gl.getAttribLocation(this.program, 'position');
        // =========================
        // create vao
        // =========================
        this.vao = this.gl.createVertexArray();
        this.gl.bindVertexArray(this.vao);
        // =========================
        // create buffer
        // =========================
        this.indexBuf = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.indexBuf);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.capacity * 4, this.gl.DYNAMIC_DRAW);
        this.gl.enableVertexAttribArray(this.indexLoc);
        this.gl.vertexAttribIPointer(this.indexLoc, 1, this.gl.INT, 0, 0);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        // create bufPosition
        this.positionBuf = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuf);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.capacity * 8, this.gl.DYNAMIC_DRAW);
        this.gl.enableVertexAttribArray(this.positionLoc);
        this.gl.vertexAttribPointer(this.positionLoc, 2, this.gl.FLOAT, false, 0, 0);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        // create bufForce
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
        // create texture
        this.nodePosTexture = this.gl.createTexture();
        this.gl.activeTexture(this.gl.TEXTURE0 + 0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.nodePosTexture);
        // set up texture parameters
        // set the filtering so we don't need mips
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    }
    calculateForces(positions) {
        const positionBuf = new Float32Array(positions.length * 2);
        {
            let offset = 0;
            for (const pos of positions) {
                positionBuf[offset] = pos.x;
                positionBuf[offset + 1] = pos.y;
                offset += 2;
            }
        }
        // ==================
        // create texture
        // ==================
        {
            this.gl.activeTexture(this.gl.TEXTURE0 + 0);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.nodePosTexture);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, // level
            this.gl.RG32F, // internal format
            positions.length, // width
            1, // height
            0, // border
            this.gl.RG, // format
            this.gl.FLOAT, // type
            positionBuf // data
            );
        }
        // =====================
        // pipe to gpu buffer
        // =====================
        {
            const indexBuf = new Uint32Array(positions.length);
            for (let i = 0; i < positions.length; i++) {
                indexBuf[i] = i;
            }
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.indexBuf);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, indexBuf, this.gl.DYNAMIC_DRAW);
            this.gl.vertexAttribIPointer(this.indexLoc, 1, this.gl.INT, 0, 0);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        }
        {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuf);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, positionBuf, this.gl.DYNAMIC_DRAW);
            this.gl.vertexAttribPointer(this.positionLoc, 2, // size
            this.gl.FLOAT, // type
            false, // normalize
            0, // stride
            0);
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        }
        this.gl.useProgram(this.program);
        this.gl.bindVertexArray(this.vao);
        this.gl.enable(this.gl.RASTERIZER_DISCARD);
        this.gl.uniform1i(this.nodeCountLoc, positions.length);
        this.gl.uniform1i(this.nodePositionsLoc, 0);
        this.gl.bindTransformFeedback(this.gl.TRANSFORM_FEEDBACK, this.tf);
        this.gl.beginTransformFeedback(this.gl.POINTS);
        this.gl.drawArrays(this.gl.POINTS, 0, positions.length);
        this.gl.endTransformFeedback();
        this.gl.bindTransformFeedback(this.gl.TRANSFORM_FEEDBACK, null);
        this.gl.disable(this.gl.RASTERIZER_DISCARD);
        const forceBuf = new Float32Array(positions.length * 2);
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
