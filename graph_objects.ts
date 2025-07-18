import * as util from "./util.js"
import * as color from "./color.js"

export class DocNode {
    static nodeIdMax: number = 0

    static getNewNodeId(): number {
        const id = DocNode.nodeIdMax + 1
        DocNode.nodeIdMax += 1
        return id
    }
    static nodeMassToRadius(mass: number): number {
        return 15 + mass * 0.5
    }

    static nodeMassToRadiusGLSL: string =
        'float node_mass_to_radius(float m) {\n' +
        '    return 15.0f + m * 0.5;\n' +
        '}\n'


    // ====================
    // physics
    // ====================
    posX: number = 0
    posY: number = 0

    temp: number = 0

    mass: number = 0

    // ====================
    // styles
    // ====================
    color: color.Color = new color.Color()

    renderX: number = 0
    renderY: number = 0

    renderRadius: number = 0
    renderRadiusMin: number = 0

    glow: number = 0
    glowMin: number = 0

    drawOnTop: boolean = false

    // ====================
    // misc
    // ====================
    syncedToRender: boolean = false

    id: number = 0
    index: number = 0 // index of this node in node manager

    title: string = ""

    constructor() {
        this.id = DocNode.getNewNodeId()
    }

    getRadius(): number {
        return DocNode.nodeMassToRadius(this.mass)
    }

    wishRenderRadius(radius: number) {
        this.renderRadiusMin = Math.max(radius, this.renderRadiusMin)
    }

    wishGlow(glow: number) {
        this.glowMin = Math.max(glow, this.glowMin)
    }

    wishDrawOnTop() {
        this.drawOnTop = true
    }
}

export class NodeConnection {
    readonly nodeIndexA: number
    readonly nodeIndexB: number

    constructor(nodeIndexA: number, nodeIndexB: number) {
        let min = Math.min(nodeIndexA, nodeIndexB)
        let max = Math.max(nodeIndexA, nodeIndexB)
        this.nodeIndexA = min
        this.nodeIndexB = max
    }
}

export class NodeManager {
    _connectionMatrix: Map<number, boolean> = new Map()
    _matrixCapacity: number = 128

    nodes: Array<DocNode> = []

    _titleToNodes: Map<string, number> = new Map()
    _idToNodeIndex: Map<number, number> = new Map()

    connections: Array<NodeConnection> = []

    constructor() {
        this.reset()
    }

    reset() {
        this._connectionMatrix = new Map()

        this._titleToNodes = new Map()
        this._idToNodeIndex = new Map()

        this.nodes.length = 0
        this.connections.length = 0
    }

    isConnected(nodeIndexA: number, nodeIndexB: number): boolean {
        if (nodeIndexA === nodeIndexB) {
            return false
        }
        return this._connectionMatrix.has(this.getConMatIndex(nodeIndexA, nodeIndexB))
    }

    setConnected(
        nodeIndexA: number, nodeIndexB: number,
        connected: boolean
    ): void {
        if (nodeIndexA === nodeIndexB) {
            return
        }

        const index = this.getConMatIndex(nodeIndexA, nodeIndexB)
        const wasConnedted = this._connectionMatrix.has(index)

        if (wasConnedted != connected) {
            if (wasConnedted) { // we have to remove connection
                let toRemoveAt = -1

                for (let i = 0; i < this.connections.length; i++) {
                    const con = this.connections[i]
                    if (con.nodeIndexA === nodeIndexA && con.nodeIndexB === nodeIndexB) {
                        toRemoveAt = i
                        break
                    }
                }

                if (toRemoveAt >= 0) {
                    util.arrayRemoveFast(this.connections, toRemoveAt)
                }
            } else { // we have to add connection
                this.connections.push(new NodeConnection(nodeIndexA, nodeIndexB))
            }

            this._connectionMatrix.set(index, connected)
        }
    }

    _getConMatIndexImpl(
        nodeIndexA: number, nodeIndexB: number,
        capacity: number
    ): number {
        if (nodeIndexA === nodeIndexB) {
            return -1
        }

        const minId = Math.min(nodeIndexA, nodeIndexB)
        const maxId = Math.max(nodeIndexA, nodeIndexB)

        let index = 0

        if (minId > 0) {
            index = util.calculateSum(capacity - minId, capacity - 1)
        }
        index += maxId - (minId + 1)

        return index
    }

    getConMatIndex(nodeIndexA: number, nodeIndexB: number): number {
        return this._getConMatIndexImpl(nodeIndexA, nodeIndexB, this._matrixCapacity)
    }

    pushNode(node: DocNode) {
        if (this._matrixCapacity <= this.nodes.length) {
            const newCap = this._matrixCapacity * 2

            // grow connection matrix
            this._connectionMatrix.clear()

            for (let i = 0; i < this.connections.length; i++) {
                const con = this.connections[i]
                const index = this._getConMatIndexImpl(con.nodeIndexA, con.nodeIndexB, newCap)
                this._connectionMatrix.set(index, true)
            }

            this._matrixCapacity = newCap
        }

        this._titleToNodes.set(node.title, this.nodes.length)
        this._idToNodeIndex.set(node.id, this.nodes.length)
        node.index = this.nodes.length
        this.nodes.push(node)
    }

    findNodeFromTitle(title: string): number {
        const index = this._titleToNodes.get(title)
        if (index === undefined) {
            return -1
        }
        return index
    }
}

export class DocNodeContainer {
    posX: number = 0
    posY: number = 0

    title: string = ""
}

export class NodeConnectionContainer {
    nodeIndexA: number = 0
    nodeIndexB: number = 0
}

export class SerializationContainer {
    nodes: Array<DocNodeContainer> = []
    connections: Array<NodeConnectionContainer> = []

    offsetX: number = 0
    offsetY: number = 0

    zoom: number = 0
}

export function isSerializationContainer(obj: any): boolean {
    if (typeof obj !== 'object') {
        return false
    }

    if (!util.objHasMatchingKeys(obj, new SerializationContainer(), false)) {
        return false
    }

    if (obj.nodes.length > 0) {
        const dummyNode = new DocNodeContainer()

        for (const objNode of obj.nodes) {
            if (!util.objHasMatchingKeys(objNode, dummyNode, false)) {
                return false
            }
        }
    }

    if (obj.connections.length > 0) {
        const dummyCon = new NodeConnectionContainer()

        for (const objCon of obj.connections) {
            if (!util.objHasMatchingKeys(objCon, dummyCon, false)) {
                return false
            }
        }
    }

    return true
}
