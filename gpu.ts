import * as math from "./math.js"

const vertexShaderSrc = `#version 300 es

uniform sampler2D node_positions;
uniform int node_count;

in int index;

in vec2 position;
in float mass;

out vec2 force;

void main() {
    vec2 repulsion = vec2(0.0f, 0.0f);

    for (int i=0; i<node_count; i++) {
        if (i == index) {
            continue;
        }

        vec2 otherPos = texelFetch(node_positions, ivec2(i, 0), 0).rg;
        vec2 toOther = otherPos - position;

        float dist = length(toOther);
        if (dist > 5000.0f) {
            continue;
        }else if (dist < 0.1f) {
            continue;
        }

        vec2 toOtherN = toOther / dist;

        float f = (5000.0f / (dist * dist));

        vec2 fv = toOtherN * f;

        repulsion -= fv;
    }

    force = repulsion;
}
`

const fragmentShaderSrc = `#version 300 es

void main() {}
`;

export class GpuComputer {
    capacity: number

    gl: WebGL2RenderingContext
    program: WebGLProgram
    vao: WebGLVertexArrayObject
    tf: WebGLTransformFeedback

    nodePosTexture: WebGLTexture

    // locations
    nodePositionsLoc: number
    nodeCountLoc: number
    indexLoc: number
    massLoc: number
    positionLoc: number

    indexBuf: WebGLBuffer
    positionBuf: WebGLBuffer
    massBuf: WebGLBuffer
    forceBuf: WebGLBuffer

    constructor() {
        this.capacity = 8192

        // =========================
        // create opengl context
        // =========================
        const canvas = document.createElement('canvas')

        {
            const gl = canvas.getContext('webgl2')
            if (gl === null) {
                throw new Error('failed to get webgl2 context')
            }
            this.gl = gl
        }

        // =========================
        // create shaders
        // =========================
        const createShader = (type: number, src: string): WebGLShader => {
            const shader = this.gl.createShader(type);
            if (shader === null) {
                throw new Error('failed to create a shader')
            }
            this.gl.shaderSource(shader, src);
            this.gl.compileShader(shader);
            if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
                let log = this.gl.getShaderInfoLog(shader)
                if (log === null) {
                    log = 'failed to create a shader'
                }
                throw new Error(log);
            }
            return shader;
        }

        const vertexShader = createShader(this.gl.VERTEX_SHADER, vertexShaderSrc)
        const fragmentShader = createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSrc)

        // =========================
        // create program
        // =========================
        this.program = this.gl.createProgram()

        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);

        this.gl.transformFeedbackVaryings(
            this.program,
            ['force'],
            this.gl.SEPARATE_ATTRIBS,
        );
        this.gl.linkProgram(this.program);
        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            let log = this.gl.getProgramInfoLog(this.program)
            if (log === null) {
                log = 'failed to link program'
            }
            throw new Error(log);
        }

        // =========================
        // get locations
        // =========================
        this.nodePositionsLoc = this.gl.getUniformLocation(this.program, 'node_positions') as number
        this.nodeCountLoc = this.gl.getUniformLocation(this.program, 'node_count') as number
        this.indexLoc = this.gl.getAttribLocation(this.program, 'index') as number
        this.massLoc = this.gl.getAttribLocation(this.program, 'mass') as number
        this.positionLoc = this.gl.getAttribLocation(this.program, 'position') as number

        // =========================
        // create vao
        // =========================
        this.vao = this.gl.createVertexArray()
        this.gl.bindVertexArray(this.vao)

        // =========================
        // create buffer
        // =========================
        // create indexBuf
        this.indexBuf = this.gl.createBuffer()
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.indexBuf)
        this.gl.enableVertexAttribArray(this.indexLoc)
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null)

        // create positionBuf
        this.positionBuf = this.gl.createBuffer()
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuf)
        this.gl.enableVertexAttribArray(this.positionLoc)
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null)

        // create massBuf
        this.massBuf = this.gl.createBuffer()
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.massBuf)
        this.gl.enableVertexAttribArray(this.massLoc)
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null)

        // create forceBuf
        this.forceBuf = this.gl.createBuffer()
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.forceBuf)
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.capacity * 8, this.gl.DYNAMIC_DRAW)
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null)

        // =========================
        // create transform feedback
        // =========================
        this.tf = this.gl.createTransformFeedback()
        this.gl.bindTransformFeedback(this.gl.TRANSFORM_FEEDBACK, this.tf)
        // bind the buffers to the transform feedback
        this.gl.bindBufferBase(this.gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.forceBuf)
        this.gl.bindTransformFeedback(this.gl.TRANSFORM_FEEDBACK, null)

        // =========================
        // create texture
        // =========================

        // create texture
        this.nodePosTexture = this.gl.createTexture()
        this.gl.activeTexture(this.gl.TEXTURE0 + 0)
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.nodePosTexture)

        // set up texture parameters
        // set the filtering so we don't need mips
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    }

    calculateForces(nodeManager: any): Array<math.Vector2> {
        const positionBuf: Float32Array = new Float32Array(nodeManager.length() * 2)
        {
            let offset = 0
            for (let i = 0; i < nodeManager.length(); i++) {
                const node = nodeManager.getNodeAt(i)
                positionBuf[offset] = node.posX
                positionBuf[offset + 1] = node.posY

                offset += 2
            }
        }
        const massBuf: Float32Array = new Float32Array(nodeManager.length())
        {
            for (let i = 0; i < nodeManager.length(); i++) {
                const node = nodeManager.getNodeAt(i)
                massBuf[i] = node.mass
            }
        }

        // ==================
        // create texture
        // ==================
        {
            this.gl.activeTexture(this.gl.TEXTURE0 + 0);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.nodePosTexture)
            this.gl.texImage2D(
                this.gl.TEXTURE_2D,
                0, // level
                this.gl.RG32F, // internal format
                nodeManager.length(), // width
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
            // pipe index
            const indexBuf = new Uint32Array(nodeManager.length())
            for (let i = 0; i < nodeManager.length(); i++) {
                indexBuf[i] = i
            }
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.indexBuf)
            this.gl.bufferData(this.gl.ARRAY_BUFFER, indexBuf, this.gl.DYNAMIC_DRAW)
            this.gl.vertexAttribIPointer(
                this.indexLoc,
                1,
                this.gl.INT,
                0,
                0,
            )
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null)
        }
        {
            // pipe position
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuf)
            this.gl.bufferData(this.gl.ARRAY_BUFFER, positionBuf, this.gl.DYNAMIC_DRAW)
            this.gl.vertexAttribPointer(
                this.positionLoc,
                2, // size
                this.gl.FLOAT, // type
                false, // normalize
                0, // stride
                0, // offset
            )
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null)
        }
        {
            const massBuf = new Float32Array(nodeManager.length())
            // pipe mass
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.massBuf)
            this.gl.bufferData(this.gl.ARRAY_BUFFER, massBuf, this.gl.DYNAMIC_DRAW)
            this.gl.vertexAttribPointer(
                this.massLoc,
                1, // size
                this.gl.FLOAT, // type
                false, // normalize
                0, // stride
                0, // offset
            )
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null)
        }

        this.gl.useProgram(this.program)
        this.gl.bindVertexArray(this.vao)
        this.gl.enable(this.gl.RASTERIZER_DISCARD);

        this.gl.uniform1i(this.nodeCountLoc, nodeManager.length())
        this.gl.uniform1i(this.nodePositionsLoc, 0)

        this.gl.bindTransformFeedback(this.gl.TRANSFORM_FEEDBACK, this.tf);
        this.gl.beginTransformFeedback(this.gl.POINTS);
        this.gl.drawArrays(this.gl.POINTS, 0, nodeManager.length());
        this.gl.endTransformFeedback();
        this.gl.bindTransformFeedback(this.gl.TRANSFORM_FEEDBACK, null);
        this.gl.disable(this.gl.RASTERIZER_DISCARD)

        const forceBuf = new Float32Array(nodeManager.length() * 2)

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.forceBuf)
        this.gl.getBufferSubData(
            this.gl.ARRAY_BUFFER,
            0,    // byte offset into GPU buffer,
            forceBuf,
        );

        const forceVBuf: Array<math.Vector2> = []

        for (let i = 0; i < forceBuf.length; i += 2) {
            forceVBuf.push(new math.Vector2(forceBuf[i], forceBuf[i + 1]))
        }

        return forceVBuf
    }
}
