import * as cd from "./canvas.js"
import * as wiki from "./wiki.js"
import * as util from "./util.js"
import * as math from "./math.js"
import { clearDebugPrint, debugPrint, renderDebugPrint } from './debug_print.js'
import { GpuComputeRenderer } from "./gpu.js"

export class DocNode {
    static nodeIdMax: number = 0

    static getNewNodeId(): number {
        const id = DocNode.nodeIdMax + 1
        DocNode.nodeIdMax += 1
        return id
    }

    // NOTE:
    // !!!!!!!!!!!   IMPORTANT   !!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    // gpu also needs to figure out raidus from a mass
    // so if you are going to change this code,
    // change the code in gpu shader code in gpu.ts as well
    // !!!!!!!!!!!   IMPORTANT   !!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    static nodeMassToRadius(mass: number): number {
        return 8 + mass * 0.1
    }

    posX: number = 0
    posY: number = 0

    forceX: number = 0
    forceY: number = 0

    temp: number = 1

    mass: number = 0

    id: number = 0

    title: string = ""

    doDraw: boolean = true

    constructor() {
        this.id = DocNode.getNewNodeId()
    }

    getRadius(): number {
        return DocNode.nodeMassToRadius(this.mass)
    }
}

class Connection {
    nodeIndexA: number
    nodeIndexB: number

    doDraw: boolean = true

    constructor(nodeIndexA: number, nodeIndexB: number) {
        this.nodeIndexA = nodeIndexA
        this.nodeIndexB = nodeIndexB
    }
}

export class NodeManager {
    _connectionMatrix: Map<number, boolean> = new Map()

    _connections: Array<Connection> = []

    _length: number = 0
    _capacity: number = 0

    _nodes: Array<DocNode> = []
    _titleToNodes: Map<string, number> = new Map()
    _idToNodeIndex: Map<number, number> = new Map()

    constructor() {
        this.reset()
    }

    reset() {
        const initCapacity = 512

        this._connectionMatrix = new Map()

        this._connections = []

        this._length = 0
        this._capacity = initCapacity

        this._nodes = Array(initCapacity)
        this._titleToNodes = new Map()

        this._idToNodeIndex = new Map()
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

                for (let i = 0; i < this._connections.length; i++) {
                    const con = this._connections[i]
                    if (con.nodeIndexA === nodeIndexA && con.nodeIndexB === nodeIndexB) {
                        toRemoveAt = i
                        break
                    }
                }

                if (toRemoveAt >= 0) {
                    if (this._connections.length > 0) {
                        this._connections[toRemoveAt] = this._connections[this._connections.length - 1]
                    }
                    this._connections.length = this._connections.length - 1
                }
            } else { // we have to add connection
                this._connections.push(new Connection(nodeIndexA, nodeIndexB))
            }

            //this._connectionMatrix[index] = connected
            this._connectionMatrix.set(index, connected)
        }
    }

    getConnections(): Array<Connection> {
        return this._connections
    }

    getNodeAt(index: number): DocNode {
        return this._nodes[index]
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
        return this._getConMatIndexImpl(nodeIndexA, nodeIndexB, this._capacity)
    }

    pushNode(node: DocNode) {
        if (this._length >= this._capacity) {
            const oldCap = this._capacity
            const newCap = this._capacity * 2

            const minCap = Math.min(oldCap, newCap)

            // grow connection matrix
            {
                this._connectionMatrix.clear()

                for (const con of this._connections) {
                    const index = this._getConMatIndexImpl(con.nodeIndexA, con.nodeIndexB, newCap)
                    this._connectionMatrix.set(index, true)
                }
            }

            // grow nodes
            {
                this._nodes.length = newCap
            }

            this._capacity = newCap
        }

        this._nodes[this._length] = node
        this._titleToNodes.set(node.title, this._length)
        this._idToNodeIndex.set(node.id, this._length)
        this._length++
    }

    findNodeFromTitle(title: string): number {
        const index = this._titleToNodes.get(title)
        if (index === undefined) {
            return -1
        }
        return index
    }

    length(): number {
        return this._length
    }

    cap(): number {
        return this._capacity
    }
}

const test = new GpuComputeRenderer()

const testLoop = () => {
    clearDebugPrint()
    test.render()
    requestAnimationFrame(testLoop)
    renderDebugPrint()
}

testLoop()

