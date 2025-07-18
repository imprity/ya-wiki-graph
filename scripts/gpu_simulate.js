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
import * as util from './util.js';
import { debugPrint } from './debug_print.js';
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

uniform float u_bh_threshold;

uniform int u_tree_count;
uniform highp usampler2D u_tree_boundary_tex;
uniform highp usampler2D u_tree_center_of_mass_tex;
uniform highp usampler2D u_tree_nodes_header_tex;
uniform highp usampler2D u_tree_nodes_tex;

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
    // for (int i=0; i<u_node_count; i++) {
    //     if (i == node_index) {
    //         continue;
    //     }
    //
    //     uvec4 other_node_physics = get_data_from_tex(u_node_physics_tex, i);
    //
    //     vec2 other_node_pos = get_node_physics_pos(other_node_physics);
    //     float other_node_mass = get_node_mass(other_node_physics);
    //
    //     force_sum += calculate_repulsion(
    //         node_pos, node_mass,
    //         other_node_pos, other_node_mass
    //     );
    // }

    for (int i=0; i<u_tree_count; i++) {
        uvec4 tree_center_of_mass = get_data_from_tex(u_tree_center_of_mass_tex, i);

        vec2 tcm_pos = uintBitsToFloat(tree_center_of_mass.xy);
        float tcm_mass = uintBitsToFloat(tree_center_of_mass.z);

        uvec4 tree_box = get_data_from_tex(u_tree_boundary_tex, i);
        float tree_box_width = uintBitsToFloat(tree_box.z) - uintBitsToFloat(tree_box.x);

        vec2 to_tcm_pos = tcm_pos - node_pos;
        float to_tcm_dist = length(to_tcm_pos);

        if (tree_box_width / to_tcm_dist < u_bh_threshold) {
            force_sum += calculate_repulsion(
                node_pos, node_mass,
                tcm_pos, tcm_mass
            );
        }else {
            uvec4 tree_header = get_data_from_tex(u_tree_nodes_header_tex, i);
            int tree_nodes_start = int(tree_header.x);
            int tree_nodes_size = int(tree_header.y);
            int tree_nodes_end = tree_nodes_start + tree_nodes_size;

            for (int j=tree_nodes_start; j<tree_nodes_end; j++) {
                int other_node_index = int(get_data_from_tex(u_tree_nodes_tex, j).x);
                if (other_node_index == node_index) {
                    continue;
                }

                uvec4 other_node_physics = get_data_from_tex(u_node_physics_tex, other_node_index);

                vec2 other_node_pos = get_node_physics_pos(other_node_physics);
                float other_node_mass = get_node_mass(other_node_physics);

                force_sum += calculate_repulsion(
                    node_pos, node_mass,
                    other_node_pos, other_node_mass
                );
            }
        }
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
export class QuadTree {
    constructor() {
        this.id = -1;
        this.minX = 0;
        this.minY = 0;
        this.maxX = 0;
        this.maxY = 0;
        this.centerX = 0;
        this.centerY = 0;
        this.centerOfMassX = 0;
        this.centerOfMassY = 0;
        this.mass = 0;
        //nodes: Array<DocNode> | null = null
        this.nodes = null;
        this.lastLink = null;
    }
    reset() {
        this.minX = 0;
        this.minY = 0;
        this.maxX = 0;
        this.maxY = 0;
        this.centerX = 0;
        this.centerY = 0;
        this.centerOfMassX = 0;
        this.centerOfMassY = 0;
        this.mass = 0;
        this.id = -1;
        this.nodes = null;
        this.lastLink = null;
    }
    setRect(minX, minY, maxX, maxY) {
        this.minX = minX;
        this.minY = minY;
        this.maxX = maxX;
        this.maxY = maxY;
        this.centerX = (this.minX + this.maxX) * 0.5;
        this.centerY = (this.minY + this.maxY) * 0.5;
    }
    dx() {
        return this.maxX - this.minX;
    }
    dy() {
        return this.maxY - this.minY;
    }
}
export class QuadTreeBuilder {
    constructor() {
        this._treePoolCursor = 0;
        this._linkedListPoolCursor = 0;
        this.minD = 1000;
        const initCapacity = 512;
        this._treePool = new Array(initCapacity);
        this._returnArray = new Array(initCapacity);
        this._linkedListPool = new Array(initCapacity);
        for (let i = 0; i < initCapacity; i++) {
            this._treePool[i] = new QuadTree();
        }
    }
    createNewTree() {
        if (this._treePoolCursor >= this._treePool.length) {
            this._treePool.length *= 2;
        }
        let tree = this._treePool[this._treePoolCursor];
        if (tree === undefined) {
            tree = new QuadTree();
            this._treePool[this._treePoolCursor] = tree;
        }
        else {
            tree.reset();
        }
        tree.id = this._treePoolCursor;
        this._treePoolCursor++;
        return tree;
    }
    getNewLinkedList(node) {
        if (this._linkedListPoolCursor >= this._linkedListPool.length) {
            this._linkedListPool.length *= 2;
        }
        let link = this._linkedListPool[this._linkedListPoolCursor];
        if (link === undefined) {
            link = new util.LinkedList(node);
            this._linkedListPool[this._linkedListPoolCursor] = link;
        }
        else {
            link.value = node;
            link.next = null;
        }
        this._linkedListPoolCursor++;
        return link;
    }
    _cacheCenterOfMass(tree) {
        if (tree.nodes === null) {
            return;
        }
        let x = 0;
        let y = 0;
        let mass = 0;
        //for (const node of tree.nodes) {
        for (let link = tree.nodes; link !== null; link = link.next) {
            const node = link.value;
            x += node.posX * node.mass;
            y += node.posY * node.mass;
            mass += node.mass;
        }
        tree.centerOfMassX = x / mass;
        tree.centerOfMassY = y / mass;
        tree.mass = mass;
    }
    buildTree(nodeManager, knownNodeLength) {
        this._treePoolCursor = 0;
        this._linkedListPoolCursor = 0;
        if (knownNodeLength <= 0) {
            const tree = this.createNewTree();
            tree.setRect(0, 0, 0, 0);
            return new util.ArrayView(this._treePool, 0, 1);
        }
        // calculate node boundary
        let boundMinX = Number.MAX_VALUE;
        let boundMinY = Number.MAX_VALUE;
        let boundMaxX = -Number.MAX_VALUE;
        let boundMaxY = -Number.MAX_VALUE;
        for (let i = 0; i < knownNodeLength; i++) {
            const node = nodeManager.nodes[i];
            boundMinX = Math.min(node.posX, boundMinX);
            boundMinY = Math.min(node.posY, boundMinY);
            boundMaxX = Math.max(node.posX, boundMaxX);
            boundMaxY = Math.max(node.posY, boundMaxY);
        }
        // make boundary from rectangle to square
        {
            const centerX = (boundMinX + boundMaxX) * 0.5;
            const centerY = (boundMinY + boundMaxY) * 0.5;
            let dimension = Math.max(boundMaxX - boundMinX, boundMaxY - boundMinY);
            dimension += 50;
            dimension = Math.max(dimension, this.minD);
            boundMinX = centerX - dimension * 0.5;
            boundMinY = centerY - dimension * 0.5;
            boundMaxX = centerX + dimension * 0.5;
            boundMaxY = centerY + dimension * 0.5;
        }
        const boundWidth = boundMaxX - boundMinX;
        const boundHeight = boundMaxY - boundMinY;
        const gridWidth = Math.ceil(boundWidth / this.minD);
        const gridHeight = Math.ceil(boundHeight / this.minD);
        const cellWidth = boundWidth / gridWidth;
        const cellHeight = boundHeight / gridHeight;
        // create trees
        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                const tree = this.createNewTree();
                tree.setRect(boundMinX + x * cellWidth, boundMinY + y * cellHeight, boundMinX + (x + 1) * cellWidth, boundMinY + (y + 1) * cellHeight);
            }
        }
        const pushNodeToTree = (node, tree) => {
            const link = this.getNewLinkedList(node);
            if (tree.nodes === null) {
                tree.nodes = link;
                tree.lastLink = link;
            }
            else if (tree.lastLink !== null) {
                tree.lastLink.next = link;
                tree.lastLink = link;
            }
        };
        // push nodes to trees
        //for (const node of nodeManager.nodes) {
        for (let i = 0; i < knownNodeLength; i++) {
            const node = nodeManager.nodes[i];
            let x = node.posX;
            let y = node.posY;
            x -= boundMinX;
            y -= boundMinY;
            x = Math.floor(x / cellWidth);
            y = Math.floor(y / cellHeight);
            let treeIndex = x + y * gridWidth;
            const tree = this._treePool[treeIndex];
            pushNodeToTree(node, tree);
        }
        // cache center of mass
        for (let i = 0; i < this._treePoolCursor; i++) {
            const tree = this._treePool[i];
            this._cacheCenterOfMass(tree);
        }
        // filter trees without nodes
        let treesWithNodes = 0;
        const pushTree = (tree) => {
            if (treesWithNodes >= this._returnArray.length) {
                this._returnArray.length *= 2;
            }
            this._returnArray[treesWithNodes] = tree;
            treesWithNodes++;
        };
        for (let i = 0; i < this._treePoolCursor; i++) {
            const tree = this._treePool[i];
            if (tree.nodes !== null) {
                pushTree(tree);
            }
        }
        debugPrint('tree pool count', `${this._treePoolCursor}`);
        debugPrint('tree pool size ', `${this._treePool.length}`);
        return new util.ArrayView(this._returnArray, 0, treesWithNodes);
    }
}
export class SimulationParameter {
    constructor() {
        this.nodeMinDist = 10;
        this.repulsion = 7000;
        this.spring = 5;
        this.springDist = 600;
        this.forceCap = 200;
        this.bhThreshold = 0.1;
    }
}
export class GpuSimulator {
    constructor(canvas) {
        this.nodeLength = 0;
        this.connectionLength = 0;
        this.simParam = new SimulationParameter();
        this.treeBuilder = new QuadTreeBuilder();
        this._updateTimer = 0;
        this.gpuReadBuf = new util.ByteBuffer(Uint32Array);
        this._nodePhysicsTexBuf = new util.ByteBuffer(Float32Array);
        this._treeBoundaryBuf = new util.ByteBuffer(Float32Array);
        this._treeCenterOfMassBuf = new util.ByteBuffer(Float32Array);
        this._treeNodesHeaderBuf = new util.ByteBuffer(Uint32Array);
        this._treeNodesBuf = new util.ByteBuffer(Uint32Array);
        // =========================
        // create opengl context
        // =========================
        {
            const gl = canvas.getContext('webgl2', {
                'desynchronized': true,
                'preserveDrawingBuffer': true,
            });
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
        gpu.resetTextureUnitCounter();
        const texInitSize = 4;
        // ===========================================
        // create textures to hold node informations
        // ===========================================
        this.nodePhysicsTex0 = gpu.createDataTexture(this.gl, this.gl.RGBA32UI, texInitSize, texInitSize, this.gl.RGBA_INTEGER, this.gl.UNSIGNED_INT);
        this.nodePhysicsTex1 = gpu.createDataTexture(this.gl, this.gl.RGBA32UI, texInitSize, texInitSize, this.gl.RGBA_INTEGER, this.gl.UNSIGNED_INT);
        // ===========================================
        // create textures to hold connection informations
        // ===========================================
        this.conInfosTex = gpu.createDataTexture(this.gl, this.gl.RGBA32UI, texInitSize, texInitSize, this.gl.RGBA_INTEGER, this.gl.UNSIGNED_INT);
        this.nodeConInfoStartTex = gpu.createDataTexture(this.gl, this.gl.R32I, texInitSize, texInitSize, this.gl.RED_INTEGER, this.gl.INT);
        // ===========================================
        // create textures to hold tree informations
        // ===========================================
        this.treeBoundaryTex = gpu.createDataTexture(this.gl, this.gl.RGBA32UI, texInitSize, texInitSize, this.gl.RGBA_INTEGER, this.gl.UNSIGNED_INT);
        this.treeCenterOfMassTex = gpu.createDataTexture(this.gl, this.gl.RGBA32UI, texInitSize, texInitSize, this.gl.RGBA_INTEGER, this.gl.UNSIGNED_INT);
        this.treeNodesHeaderTex = gpu.createDataTexture(this.gl, this.gl.RGBA32UI, texInitSize, texInitSize, this.gl.RGBA_INTEGER, this.gl.UNSIGNED_INT);
        this.treeNodesTex = gpu.createDataTexture(this.gl, this.gl.R32UI, texInitSize, texInitSize, this.gl.RED_INTEGER, this.gl.UNSIGNED_INT);
        // ========================
        // create frame buffers
        // ========================
        this.nodePhysicsFB1 = gpu.createFramebuffer(this.gl, this.nodePhysicsTex1);
    }
    simulatePhysics(manager) {
        return __awaiter(this, void 0, void 0, function* () {
            {
                const now = Date.now();
                const delta = now - this._updateTimer;
                const fps = 1000 / delta;
                debugPrint('SIM FPS', Math.round(fps).toString());
                this._updateTimer = now;
            }
            this.submitNodes(manager);
            const trees = this.treeBuilder.buildTree(manager, this.nodeLength);
            this.writeTreeInfosToTexture(trees, manager);
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
                // node textures and uniforms
                gpu.useTexture(this.gl, this.forceCalcUnit, this.nodePhysicsTex0, 'u_node_physics_tex');
                this.gl.uniform1i(this.forceCalcUnit.locs.uLoc('u_node_count'), this.nodeLength);
                // connection textures and uniforms
                gpu.useTexture(this.gl, this.forceCalcUnit, this.conInfosTex, 'u_con_infos_tex');
                gpu.useTexture(this.gl, this.forceCalcUnit, this.nodeConInfoStartTex, 'u_node_con_infos_start_tex');
                this.gl.uniform1i(this.forceCalcUnit.locs.uLoc('u_con_count'), this.connectionLength);
                // tree textures and uniforms
                gpu.useTexture(this.gl, this.forceCalcUnit, this.treeBoundaryTex, 'u_tree_boundary_tex');
                gpu.useTexture(this.gl, this.forceCalcUnit, this.treeCenterOfMassTex, 'u_tree_center_of_mass_tex');
                gpu.useTexture(this.gl, this.forceCalcUnit, this.treeNodesHeaderTex, 'u_tree_nodes_header_tex');
                gpu.useTexture(this.gl, this.forceCalcUnit, this.treeNodesTex, 'u_tree_nodes_tex');
                this.gl.uniform1i(this.forceCalcUnit.locs.uLoc('u_tree_count'), trees.length);
                this.gl.uniform1f(this.forceCalcUnit.locs.uLoc('u_bh_threshold'), this.simParam.bhThreshold);
                // physics parameters
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
                // let nodeInfos: any = new Uint32Array(
                //     tex.width * tex.height * 4);
                this.gpuReadBuf.setLength(tex.width * tex.height * 4);
                yield gpu.readPixelsAsync(this.gl, 0, 0, tex.width, tex.height, this.gl.RGBA_INTEGER, this.gl.UNSIGNED_INT, 
                //nodeInfos
                this.gpuReadBuf.cast(Uint32Array));
                this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
                // nodeInfos = new Float32Array(nodeInfos.buffer)
                const nodeInfos = this.gpuReadBuf.cast(Float32Array);
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
        let nodeTexSize = Math.max(gpu.capacityToEdge(this.nodeLength), 128);
        this._nodePhysicsTexBuf.setLength(nodeTexSize * nodeTexSize * 4);
        let offset = 0;
        for (let i = 0; i < this.nodeLength; i++) {
            const node = manager.nodes[i];
            this._nodePhysicsTexBuf.set(offset + 0, node.posX);
            this._nodePhysicsTexBuf.set(offset + 1, node.posY);
            this._nodePhysicsTexBuf.set(offset + 2, node.mass);
            this._nodePhysicsTexBuf.set(offset + 3, node.temp);
            offset += 4;
        }
        gpu.setDataTextureData(this.gl, this.nodePhysicsTex0, this.gl.RGBA32UI, // internal format
        nodeTexSize, nodeTexSize, // width, height
        this.gl.RGBA_INTEGER, // format
        this.gl.UNSIGNED_INT, // type
        this._nodePhysicsTexBuf.cast(Uint32Array));
        gpu.allocDataTexture(this.gl, this.nodePhysicsTex1, this.gl.RGBA32UI, // internal format
        nodeTexSize, nodeTexSize, // width, height
        this.gl.RGBA_INTEGER, // format
        this.gl.UNSIGNED_INT);
    }
    submitConnections(manager) {
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
    submitNodeManager(manager) {
        this.submitNodes(manager);
        this.submitConnections(manager);
    }
    writeTreeInfosToTexture(trees, manager) {
        const texSize = Math.max(gpu.capacityToEdge(trees.length), 128);
        // =========================
        // treeBoundaryTex
        // =========================
        {
            this._treeBoundaryBuf.setLength(texSize * texSize * 4);
            let offset = 0;
            for (let i = 0; i < trees.length; i++) {
                const tree = trees.get(i);
                this._treeBoundaryBuf.set(offset + 0, tree.minX);
                this._treeBoundaryBuf.set(offset + 1, tree.minY);
                this._treeBoundaryBuf.set(offset + 2, tree.maxX);
                this._treeBoundaryBuf.set(offset + 3, tree.maxY);
                offset += 4;
            }
            gpu.setDataTextureData(this.gl, this.treeBoundaryTex, this.gl.RGBA32UI, // internal format
            texSize, texSize, // width, height
            this.gl.RGBA_INTEGER, // format
            this.gl.UNSIGNED_INT, // type
            this._treeBoundaryBuf.cast(Uint32Array));
        }
        // =========================
        // treeCenterOfMassTex
        // =========================
        {
            this._treeCenterOfMassBuf.setLength(texSize * texSize * 4);
            let offset = 0;
            for (let i = 0; i < trees.length; i++) {
                const tree = trees.get(i);
                this._treeBoundaryBuf.set(offset + 0, tree.centerOfMassX);
                this._treeBoundaryBuf.set(offset + 1, tree.centerOfMassY);
                this._treeBoundaryBuf.set(offset + 2, tree.mass);
                this._treeBoundaryBuf.set(offset + 3, 0); // reserved
                offset += 4;
            }
            gpu.setDataTextureData(this.gl, this.treeCenterOfMassTex, this.gl.RGBA32UI, // internal format
            texSize, texSize, // width, height
            this.gl.RGBA_INTEGER, // format
            this.gl.UNSIGNED_INT, // type
            this._treeBoundaryBuf.cast(Uint32Array));
        }
        // ==================================
        // treeNodesHeaderTex & treeNodesTex
        // ==================================
        {
            const nodesTexSize = Math.max(gpu.capacityToEdge(this.nodeLength), 128);
            this._treeNodesBuf.setLength(nodesTexSize * nodesTexSize);
            this._treeNodesHeaderBuf.setLength(texSize * texSize * 4);
            let nodesDataCursor = 0;
            let headerOffset = 0;
            for (let i = 0; i < trees.length; i++) {
                const tree = trees.get(i);
                if (tree === null) {
                    continue;
                }
                if (tree.nodes === null) {
                    continue;
                }
                this._treeNodesHeaderBuf.set(headerOffset + 0, nodesDataCursor);
                let treeNodeLength = 0;
                for (let link = tree.nodes; link !== null; link = link.next) {
                    const node = link.value;
                    treeNodeLength++;
                    this._treeNodesBuf.set(nodesDataCursor, node.index);
                    nodesDataCursor++;
                }
                this._treeNodesHeaderBuf.set(headerOffset + 1, treeNodeLength);
                this._treeNodesHeaderBuf.set(headerOffset + 2, 0); // reserved
                this._treeNodesHeaderBuf.set(headerOffset + 3, 0); // reserved
                headerOffset += 4;
            }
            gpu.setDataTextureData(this.gl, this.treeNodesHeaderTex, this.gl.RGBA32UI, // internal format
            texSize, texSize, // width, height
            this.gl.RGBA_INTEGER, // format
            this.gl.UNSIGNED_INT, // type
            this._treeNodesHeaderBuf.cast(Uint32Array));
            gpu.setDataTextureData(this.gl, this.treeNodesTex, this.gl.R32UI, // internal format
            nodesTexSize, nodesTexSize, // width, height
            this.gl.RED_INTEGER, // format
            this.gl.UNSIGNED_INT, // type
            this._treeNodesBuf.cast(Uint32Array));
        }
    }
}
