var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as gpu from './gpu_common.js';
import { DocNode, } from "./graph_objects.js";
const forceCalcVShaderSrc = `#version 300 es
in vec4 a_vertex;

void main() {
    gl_Position = a_vertex;
}
`;
const forceCalcFShaderSrc = `#version 300 es
precision highp float;
precision highp int;

uniform float u_node_min_dist;
uniform float u_repulsion;
uniform float u_spring;
uniform float u_spring_dist;
uniform float u_force_cap;

${gpu.glslCommon}
${DocNode.nodeMassToRadiusGLSL}

uniform int u_node_count;
uniform highp usampler2D u_node_physics_tex;

uniform int u_con_count;
uniform highp usampler2D u_con_infos_tex;
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

vec2 get_node_physics_pos(uvec4 physics) {
    return uintBitsToFloat(physics.xy);
}

float get_node_mass(uvec4 physics) {
    return uintBitsToFloat(physics.z);
}

float get_node_temp(uvec4 physics) {
    return uintBitsToFloat(physics.w);
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
    vec2 node_pos = get_node_physics_pos(node_physics);
    float node_mass = get_node_mass(node_physics);
    float node_temp = get_node_temp(node_physics);

    // mass is too small
    if (node_mass < SMALL_NUMBER) {
        out_color = texelFetch(u_node_physics_tex, ivec2(gl_FragCoord.xy), 0);
        return;
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

        vec2 other_node_pos = get_node_physics_pos(other_node_physics);
        float other_node_mass = get_node_mass(other_node_physics);

        force_sum += calculate_repulsion(
            node_pos, node_mass,
            other_node_pos, other_node_mass
        );
    }

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

            vec2 other_node_pos = get_node_physics_pos(other_node_physics);
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
}`;
export class SimulationParameter {
    constructor() {
        this.nodeMinDist = 10;
        this.repulsion = 7000;
        this.spring = 5;
        this.springDist = 600;
        this.forceCap = 200;
    }
}
export class GpuSimulator {
    constructor(canvas) {
        this.nodeLength = 0;
        this.connectionLength = 0;
        this.simParam = new SimulationParameter();
        // =========================
        // create opengl context
        // =========================
        {
            const gl = canvas.getContext('webgl2');
            if (gl === null) {
                throw new Error('failed to get webgl2 context');
            }
            this.gl = gl;
        }
        // =========================
        // create render units
        // =========================
        this.forceCalcUnit = gpu.createRenderUnit(this.gl, forceCalcVShaderSrc, forceCalcFShaderSrc, 'forceCalcUnit');
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
        // =====================================
        // bind buffers to vao
        // =====================================
        gpu.bindBufferToVAO(this.gl, this.fullRectBuf, this.forceCalcUnit, 'a_vertex', 4, // size
        this.gl.FLOAT, // type
        false, // normalize
        0, // stride
        0);
        // =========================
        // create textures
        // =========================
        const texInitSize = 4;
        // create textures to hold node informations
        this.nodePhysicsTex0 = gpu.createDataTexture(this.gl, this.gl.RGBA32UI, texInitSize, texInitSize, this.gl.RGBA_INTEGER, this.gl.UNSIGNED_INT);
        this.nodePhysicsTex1 = gpu.createDataTexture(this.gl, this.gl.RGBA32UI, texInitSize, texInitSize, this.gl.RGBA_INTEGER, this.gl.UNSIGNED_INT);
        // create textures to hold connection informations
        this.conInfosTex = gpu.createDataTexture(this.gl, this.gl.RGBA32UI, texInitSize, texInitSize, this.gl.RGBA_INTEGER, this.gl.UNSIGNED_INT);
        this.nodeConInfoStartTex = gpu.createDataTexture(this.gl, this.gl.R32I, texInitSize, texInitSize, this.gl.RED_INTEGER, this.gl.INT);
        // ========================
        // create frame buffers
        // ========================
        this.nodePhysicsFB1 = gpu.createFramebuffer(this.gl, this.nodePhysicsTex1);
    }
    simulatePhysics(manager) {
        return __awaiter(this, void 0, void 0, function* () {
            this.submitNodes(manager);
            // =====================
            // calculate forces
            // =====================
            {
                this.gl.disable(this.gl.DITHER);
                // for calculations, disable alpha blending
                this.gl.disable(this.gl.BLEND);
                this.gl.useProgram(this.forceCalcUnit.program);
                this.gl.bindVertexArray(this.forceCalcUnit.vao);
                this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.nodePhysicsFB1);
                this.gl.viewport(0, 0, this.nodePhysicsTex0.width, this.nodePhysicsTex0.height);
                gpu.useTexture(this.gl, this.forceCalcUnit, this.nodePhysicsTex0, 'u_node_physics_tex');
                this.gl.uniform1i(this.forceCalcUnit.locs.uLoc('u_node_count'), this.nodeLength);
                gpu.useTexture(this.gl, this.forceCalcUnit, this.conInfosTex, 'u_con_infos_tex');
                gpu.useTexture(this.gl, this.forceCalcUnit, this.nodeConInfoStartTex, 'u_node_con_infos_start_tex');
                this.gl.uniform1i(this.forceCalcUnit.locs.uLoc('u_con_count'), this.connectionLength);
                this.gl.uniform1f(this.forceCalcUnit.locs.uLoc('u_node_min_dist'), this.simParam.nodeMinDist);
                this.gl.uniform1f(this.forceCalcUnit.locs.uLoc('u_repulsion'), this.simParam.repulsion);
                this.gl.uniform1f(this.forceCalcUnit.locs.uLoc('u_spring'), this.simParam.spring);
                this.gl.uniform1f(this.forceCalcUnit.locs.uLoc('u_spring_dist'), this.simParam.springDist);
                this.gl.uniform1f(this.forceCalcUnit.locs.uLoc('u_force_cap'), this.simParam.forceCap);
                this.gl.drawArrays(this.gl.TRIANGLES, 0, 6); // draw 2 triangles (6 vertices)
            }
            // =====================
            // read pixels
            // =====================
            {
                let fb = this.nodePhysicsFB1;
                let tex = this.nodePhysicsTex1;
                this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fb);
                let nodeInfos = new Uint32Array(tex.width * tex.height * 4);
                yield gpu.readPixelsAsync(this.gl, 0, 0, tex.width, tex.height, this.gl.RGBA_INTEGER, this.gl.UNSIGNED_INT, nodeInfos);
                this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
                nodeInfos = new Float32Array(nodeInfos.buffer);
                const nodeLength = Math.min(this.nodeLength, manager.nodes.length);
                let offset = 0;
                for (let i = 0; i < nodeLength; i++) {
                    const node = manager.nodes[i];
                    node.posX = nodeInfos[offset + 0];
                    node.posY = nodeInfos[offset + 1];
                    // we skip 2, which is mass
                    node.temp = nodeInfos[offset + 3];
                    // NOTE: yes, we are lying and skipping mass
                    // even though function name says updateNodePhysicsToNodeManager
                    // because node manager already knows what mass is
                    // and gpu doesn't touch it
                    offset += 4;
                }
            }
        });
    }
    submitNodes(manager) {
        this.nodeLength = manager.nodes.length;
        // =====================
        // supply node infos
        // =====================
        let nodeTexSize = gpu.capacityToEdge(this.nodeLength);
        let data = new Float32Array(nodeTexSize * nodeTexSize * 4);
        let offset = 0;
        for (let i = 0; i < this.nodeLength; i++) {
            const node = manager.nodes[i];
            data[offset + 0] = node.posX;
            data[offset + 1] = node.posY;
            data[offset + 2] = node.mass;
            data[offset + 3] = node.temp;
            offset += 4;
        }
        gpu.setDataTextureData(this.gl, this.nodePhysicsTex0, this.gl.RGBA32UI, // internal format
        nodeTexSize, nodeTexSize, // width, height
        this.gl.RGBA_INTEGER, // format
        this.gl.UNSIGNED_INT, // type
        new Uint32Array(data.buffer) // data
        );
        gpu.setDataTextureData(this.gl, this.nodePhysicsTex1, this.gl.RGBA32UI, // internal format
        nodeTexSize, nodeTexSize, // width, height
        this.gl.RGBA_INTEGER, // format
        this.gl.UNSIGNED_INT, // type
        new Uint32Array(data.buffer) // data
        );
    }
    submitConnections(manager) {
        this.submitNodes(manager);
        this.connectionLength = manager.connections.length;
        // =======================================
        // sort connections with it's nodeIndexes
        // =======================================
        const conCopy = manager.connections.slice();
        conCopy.sort((conA, conB) => {
            if (conA.nodeIndexA !== conB.nodeIndexA) {
                return conA.nodeIndexA - conB.nodeIndexA;
            }
            return conA.nodeIndexB - conB.nodeIndexB;
        });
        // ===================================
        // collect connections node has
        // ===================================
        const nodeIndexToConIndicies = new Array(this.nodeLength);
        for (let nodeIndex = 0; nodeIndex < this.nodeLength; nodeIndex++) {
            nodeIndexToConIndicies[nodeIndex] = [];
        }
        for (let i = 0; i < this.connectionLength; i++) {
            const con = conCopy[i];
            nodeIndexToConIndicies[con.nodeIndexA].push(i);
            nodeIndexToConIndicies[con.nodeIndexB].push(i);
        }
        // ==========================================
        // write where connection info will start
        // for each node at texture
        // ==========================================
        {
            let texSize = gpu.capacityToEdge(this.nodeLength);
            texSize = Math.max(texSize, 128); // prevent creating empty texture
            let data = new Int32Array(texSize * texSize);
            for (let i = 0; i < this.nodeLength; i++) {
                if (nodeIndexToConIndicies[i].length > 0) {
                    data[i] = nodeIndexToConIndicies[i][0];
                }
                else {
                    data[i] = -1;
                }
            }
            gpu.setDataTextureData(this.gl, this.nodeConInfoStartTex, this.gl.R32I, // internal format
            texSize, texSize, // width, height
            this.gl.RED_INTEGER, // format
            this.gl.INT, // type
            data // data
            );
        }
        // ==========================================
        // write main connection data
        // ==========================================
        {
            let texSize = gpu.capacityToEdge(this.connectionLength);
            texSize = Math.max(texSize, 128); // prevent creating empty texture
            let data = new Uint32Array(texSize * texSize * 4);
            // write connections
            let offset = 0;
            for (let i = 0; i < this.connectionLength; i++) {
                const con = conCopy[i];
                data[offset + 0] = con.nodeIndexA;
                data[offset + 1] = con.nodeIndexB;
                offset += 4;
            }
            // write relative pointers
            for (let nodeIndex = 0; nodeIndex < this.nodeLength; nodeIndex++) {
                const conIndicies = nodeIndexToConIndicies[nodeIndex];
                for (let i = 0; i < conIndicies.length; i++) {
                    let dataOffset = conIndicies[i] * 4;
                    let dist = 0;
                    if (i + 1 < conIndicies.length) {
                        dist = conIndicies[i + 1] - conIndicies[i];
                    }
                    let realCon = conCopy[conIndicies[i]];
                    if (realCon.nodeIndexA === nodeIndex) {
                        data[dataOffset + 2] = dist;
                    }
                    else {
                        data[dataOffset + 3] = dist;
                    }
                }
            }
            gpu.setDataTextureData(this.gl, this.conInfosTex, this.gl.RGBA32UI, // internal format
            texSize, texSize, // width, height
            this.gl.RGBA_INTEGER, // format
            this.gl.UNSIGNED_INT, // type
            new Uint32Array(data.buffer) // data
            );
        }
    }
}
