import * as util from "./util.js";
import * as color from "./color.js";
export class DocNode {
    static getNewNodeId() {
        const id = DocNode.nodeIdMax + 1;
        DocNode.nodeIdMax += 1;
        return id;
    }
    static nodeMassToRadius(mass) {
        return 15 + mass * 0.5;
    }
    constructor() {
        this.posX = 0;
        this.posY = 0;
        this.temp = 1;
        this.mass = 0;
        this.color = new color.Color();
        this.isExpanding = false;
        this.id = 0;
        this.title = "";
        this.id = DocNode.getNewNodeId();
    }
    getRadius() {
        return DocNode.nodeMassToRadius(this.mass);
    }
}
DocNode.nodeIdMax = 0;
DocNode.nodeMassToRadiusGLSL = 'float node_mass_to_radius(float m) {\n' +
    '    return 15.0f + m * 0.5;\n' +
    '}\n';
export class NodeConnection {
    constructor(nodeIndexA, nodeIndexB) {
        this.nodeIndexA = nodeIndexA;
        this.nodeIndexB = nodeIndexB;
    }
}
export class NodeManager {
    constructor() {
        this._connectionMatrix = new Map();
        this._matrixCapacity = 128;
        this.nodes = [];
        this._titleToNodes = new Map();
        this._idToNodeIndex = new Map();
        this.connections = [];
        this.reset();
    }
    reset() {
        const initCapacity = 24;
        this._connectionMatrix = new Map();
        this._titleToNodes = new Map();
        this._idToNodeIndex = new Map();
        this.nodes.length = 0;
        this.connections.length = 0;
    }
    getIndexFromId(id) {
        const index = this._idToNodeIndex.get(id);
        if (index === undefined) {
            return -1;
        }
        return index;
    }
    isConnected(nodeIndexA, nodeIndexB) {
        if (nodeIndexA === nodeIndexB) {
            return false;
        }
        return this._connectionMatrix.has(this.getConMatIndex(nodeIndexA, nodeIndexB));
    }
    setConnected(nodeIndexA, nodeIndexB, connected) {
        if (nodeIndexA === nodeIndexB) {
            return;
        }
        const index = this.getConMatIndex(nodeIndexA, nodeIndexB);
        const wasConnedted = this._connectionMatrix.has(index);
        if (wasConnedted != connected) {
            if (wasConnedted) { // we have to remove connection
                let toRemoveAt = -1;
                for (let i = 0; i < this.connections.length; i++) {
                    const con = this.connections[i];
                    if (con.nodeIndexA === nodeIndexA && con.nodeIndexB === nodeIndexB) {
                        toRemoveAt = i;
                        break;
                    }
                }
                if (toRemoveAt >= 0) {
                    if (this.connections.length > 0) {
                        this.connections[toRemoveAt] = this.connections[this.connections.length - 1];
                    }
                    this.connections.length--;
                }
            }
            else { // we have to add connection
                this.connections.push(new NodeConnection(nodeIndexA, nodeIndexB));
            }
            this._connectionMatrix.set(index, connected);
        }
    }
    _getConMatIndexImpl(nodeIndexA, nodeIndexB, capacity) {
        if (nodeIndexA === nodeIndexB) {
            return -1;
        }
        const minId = Math.min(nodeIndexA, nodeIndexB);
        const maxId = Math.max(nodeIndexA, nodeIndexB);
        let index = 0;
        if (minId > 0) {
            index = util.calculateSum(capacity - minId, capacity - 1);
        }
        index += maxId - (minId + 1);
        return index;
    }
    getConMatIndex(nodeIndexA, nodeIndexB) {
        return this._getConMatIndexImpl(nodeIndexA, nodeIndexB, this._matrixCapacity);
    }
    pushNode(node) {
        if (this._matrixCapacity <= this.nodes.length) {
            const oldCap = this._matrixCapacity;
            const newCap = this._matrixCapacity * 2;
            // grow connection matrix
            this._connectionMatrix.clear();
            for (let i = 0; i < this.connections.length; i++) {
                const con = this.connections[i];
                const index = this._getConMatIndexImpl(con.nodeIndexA, con.nodeIndexB, newCap);
                this._connectionMatrix.set(index, true);
            }
            this._matrixCapacity = newCap;
        }
        this._titleToNodes.set(node.title, this.nodes.length);
        this._idToNodeIndex.set(node.id, this.nodes.length);
        this.nodes.push(node);
    }
    findNodeFromTitle(title) {
        const index = this._titleToNodes.get(title);
        if (index === undefined) {
            return -1;
        }
        return index;
    }
}
