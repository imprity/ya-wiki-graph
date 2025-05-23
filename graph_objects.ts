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


    posX: number = 0
    posY: number = 0

    temp: number = 0

    mass: number = 0

    color: color.Color = new color.Color()

    renderX: number = 0
    renderY: number = 0

    isExpanding: boolean = false

    syncedToRender: boolean = false

    id: number = 0

    title: string = ""

    constructor() {
        this.id = DocNode.getNewNodeId()
    }

    getRadius(): number {
        return DocNode.nodeMassToRadius(this.mass)
    }
}

export class NodeConnection {
    nodeIndexA: number
    nodeIndexB: number

    constructor(nodeIndexA: number, nodeIndexB: number) {
        this.nodeIndexA = nodeIndexA
        this.nodeIndexB = nodeIndexB
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
        const initCapacity = 24

        this._connectionMatrix = new Map()

        this._titleToNodes = new Map()
        this._idToNodeIndex = new Map()

        this.nodes.length = 0
        this.connections.length = 0
    }

    getIndexFromId(id: number): number {
        const index = this._idToNodeIndex.get(id)
        if (index === undefined) {
            return -1
        }

        return index
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
                    if (this.connections.length > 0) {
                        this.connections[toRemoveAt] = this.connections[this.connections.length - 1]
                    }
                    this.connections.length--
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
            const oldCap = this._matrixCapacity
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

    function objHasMatchingKeys(obj: any, instance: any): boolean {
        const keys = Reflect.ownKeys(instance)

        for (const key of keys) {
            const instanceType = typeof instance[key]
            const objType = typeof obj[key]

            if (instanceType !== objType) {
                return false
            }

            if (instanceType == "object") {
                if (Array.isArray(instance[key])) {
                    if (!Array.isArray(obj[key])) {
                        return false
                    }
                } else {
                    if (!objHasMatchingKeys(instance[key], obj[key])) {
                        return false
                    }
                }
            }
        }

        return true
    }

    if (!objHasMatchingKeys(obj, new SerializationContainer())) {
        return false
    }

    if (obj.nodes.length > 0) {
        const dummyNode = new DocNodeContainer()

        for (const objNode of obj.nodes) {
            if (!objHasMatchingKeys(objNode, dummyNode)) {
                return false
            }
        }
    }

    if (obj.connections.length > 0) {
        const dummyCon = new NodeConnectionContainer()

        for (const objCon of obj.connections) {
            if (!objHasMatchingKeys(objCon, dummyCon)) {
                return false
            }
        }
    }

    return true
}
