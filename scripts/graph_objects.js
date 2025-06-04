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
        this.temp = 0;
        this.mass = 0;
        this.color = new color.Color();
        this.renderX = 0;
        this.renderY = 0;
        this.glow = 0;
        this.renderRadiusScale = 1;
        this.syncedToRender = false;
        this.id = 0;
        this.index = 0; // index of this node in node manager
        this.title = "";
        this.id = DocNode.getNewNodeId();
    }
    getRadius() {
        return DocNode.nodeMassToRadius(this.mass);
    }
    getRenderRadius() {
        return this.getRadius() * this.renderRadiusScale;
    }
}
DocNode.nodeIdMax = 0;
DocNode.nodeMassToRadiusGLSL = 'float node_mass_to_radius(float m) {\n' +
    '    return 15.0f + m * 0.5;\n' +
    '}\n';
export class NodeConnection {
    constructor(nodeIndexA, nodeIndexB) {
        let min = Math.min(nodeIndexA, nodeIndexB);
        let max = Math.max(nodeIndexA, nodeIndexB);
        this.nodeIndexA = min;
        this.nodeIndexB = max;
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
        this.expandingNodes = [];
        this.drawOnTopNodes = [];
        this.reset();
    }
    reset() {
        const initCapacity = 24;
        this._connectionMatrix = new Map();
        this._titleToNodes = new Map();
        this._idToNodeIndex = new Map();
        this.nodes.length = 0;
        this.connections.length = 0;
        this.expandingNodes = [];
        this.drawOnTopNodes = [];
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
                    util.arrayRemoveFast(this.connections, toRemoveAt);
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
        node.index = this.nodes.length;
        this.nodes.push(node);
    }
    findNodeFromTitle(title) {
        const index = this._titleToNodes.get(title);
        if (index === undefined) {
            return -1;
        }
        return index;
    }
    // returns index if node is in array
    // returns -1 if not
    _isNodeInPropertyArr(node, array) {
        for (let i = 0; i < array.length; i++) {
            const other = array[i];
            if (node.id === other.id) {
                return i;
            }
        }
        return -1;
    }
    _addNodeToPropertyArr(node, array) {
        const exists = this._isNodeInPropertyArr(node, array) >= 0;
        if (!exists) {
            array.push(node);
        }
    }
    _removeNodeFromPropertyArr(node, array, maintainOrder) {
        const index = this._isNodeInPropertyArr(node, array);
        if (index >= 0) {
            if (maintainOrder) {
                util.arrayRemove(array, index);
            }
            else {
                util.arrayRemoveFast(array, index);
            }
        }
    }
    setNodeExpanding(node, expanding) {
        if (expanding) {
            this._addNodeToPropertyArr(node, this.expandingNodes);
        }
        else {
            this._removeNodeFromPropertyArr(node, this.expandingNodes, true);
        }
    }
    isNodeExpanding(node) {
        return this._isNodeInPropertyArr(node, this.expandingNodes) >= 0;
    }
    setNodeOnTop(node, onTop) {
        if (onTop) {
            this._addNodeToPropertyArr(node, this.drawOnTopNodes);
        }
        else {
            this._removeNodeFromPropertyArr(node, this.drawOnTopNodes, false);
        }
    }
    isNodeOnTop(node) {
        return this._isNodeInPropertyArr(node, this.drawOnTopNodes) >= 0;
    }
}
export class DocNodeContainer {
    constructor() {
        this.posX = 0;
        this.posY = 0;
        this.title = "";
    }
}
export class NodeConnectionContainer {
    constructor() {
        this.nodeIndexA = 0;
        this.nodeIndexB = 0;
    }
}
export class SerializationContainer {
    constructor() {
        this.nodes = [];
        this.connections = [];
        this.offsetX = 0;
        this.offsetY = 0;
        this.zoom = 0;
    }
}
export function isSerializationContainer(obj) {
    if (typeof obj !== 'object') {
        return false;
    }
    if (!util.objHasMatchingKeys(obj, new SerializationContainer(), false)) {
        return false;
    }
    if (obj.nodes.length > 0) {
        const dummyNode = new DocNodeContainer();
        for (const objNode of obj.nodes) {
            if (!util.objHasMatchingKeys(objNode, dummyNode, false)) {
                return false;
            }
        }
    }
    if (obj.connections.length > 0) {
        const dummyCon = new NodeConnectionContainer();
        for (const objCon of obj.connections) {
            if (!util.objHasMatchingKeys(objCon, dummyCon, false)) {
                return false;
            }
        }
    }
    return true;
}
