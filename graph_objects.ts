import * as util from "./util.js"

export class DocNode {
    static nodeIdMax: number = 0

    static getNewNodeId(): number {
        const id = DocNode.nodeIdMax + 1
        DocNode.nodeIdMax += 1
        return id
    }
    static nodeMassToRadius(mass: number): number {
        return 8 + mass * 0.1
    }

    static nodeMassToRadiusGLSL: string =
        'float node_mass_to_radius(float m) {\n' +
        '    return 8.0f + m * 0.1;\n' +
        '}\n'


    posX: number = 0
    posY: number = 0

    forceX: number = 0
    forceY: number = 0

    temp: number = 1

    mass: number = 0

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

export enum Direction {
    TopLeft = 0,
    TopRight,
    BottomLeft,
    BottomRight,
}

export class QuadTree {
    minX: number = 0
    minY: number = 0

    maxX: number = 0
    maxY: number = 0

    centerX: number = 0
    centerY: number = 0

    hasChildren: boolean = false
    childrenTrees: Array<QuadTree | null> = new Array(4).fill(null)

    node: DocNode | null = null

    reset() {
        this.minX = 0
        this.minY = 0

        this.maxX = 0
        this.maxY = 0

        this.centerX = 0
        this.centerY = 0

        this.hasChildren = false
        this.childrenTrees.fill(null)

        this.node = null
    }

    setRect(minX: number, minY: number, maxX: number, maxY: number) {
        this.minX = minX
        this.minY = minY

        this.maxX = maxX
        this.maxY = maxY

        this.centerX = (this.minX + this.maxX) * 0.5
        this.centerY = (this.minY + this.maxY) * 0.5
    }

    getPosDirection(posX: number, posY: number): Direction {
        let onLeft = false
        let onTop = false

        if (posX < this.centerX) {
            onLeft = true
        }
        if (posY < this.centerY) {
            onTop = true
        }

        if (onLeft) { // left
            if (onTop) { // top
                return Direction.TopLeft
            } else { // bottom
                return Direction.BottomLeft
            }
        } else { // right
            if (onTop) { // top
                return Direction.TopRight
            } else { // bottom
                return Direction.BottomRight
            }
        }
    }
}

export class QuadTreeBuilder {
    _treePool: Array<QuadTree>
    _treePoolCursor: number = 0

    constructor() {
        const initCapacity = 512

        this._treePool = new Array(initCapacity)

        for (let i = 0; i < initCapacity; i++) {
            this._treePool[i] = new QuadTree()
        }
    }

    getNewTree(): QuadTree {
        if (this._treePoolCursor >= this._treePool.length) {
            const oldLen = this._treePool.length
            const newLen = oldLen * 2

            this._treePool.length = newLen

            for (let i = oldLen; i < newLen; i++) {
                this._treePool[i] = new QuadTree()
            }
        }
        const tree = this._treePool[this._treePoolCursor]
        tree.reset()
        this._treePoolCursor++
        return tree
    }

    _createTreeChild(tree: QuadTree, dir: Direction): QuadTree {
        const child = this.getNewTree()

        switch (dir) {
            case Direction.TopLeft: {
                child.setRect(
                    tree.minX, tree.minY,
                    tree.centerX, tree.centerY
                )
            } break
            case Direction.TopRight: {
                child.setRect(
                    tree.centerX, tree.minY,
                    tree.maxX, tree.centerY
                )
            } break
            case Direction.BottomLeft: {
                child.setRect(
                    tree.minX, tree.centerY,
                    tree.centerX, tree.maxY
                )
            } break
            case Direction.BottomRight: {
                child.setRect(
                    tree.centerX, tree.centerY,
                    tree.maxX, tree.maxY
                )
            } break
        }

        return child
    }

    _pushNodeToTree(tree: QuadTree, node: DocNode) {
        if (tree.node === null && !tree.hasChildren) {
            tree.node = node
            return
        }

        tree.hasChildren = true

        if (tree.node !== null) {
            const ogNode = tree.node
            tree.node = null

            const ogNodeDirection = tree.getPosDirection(ogNode.posX, ogNode.posY)
            if (tree.childrenTrees[ogNodeDirection] === null) {
                tree.childrenTrees[ogNodeDirection] = this._createTreeChild(tree, ogNodeDirection)
            }
            this._pushNodeToTree(tree.childrenTrees[ogNodeDirection], ogNode)
        }

        const nodeDirection = tree.getPosDirection(node.posX, node.posY)
        if (tree.childrenTrees[nodeDirection] === null) {
            tree.childrenTrees[nodeDirection] = this._createTreeChild(tree, nodeDirection)
        }
        this._pushNodeToTree(tree.childrenTrees[nodeDirection], node)
    }

    buildTree(nodeManager: NodeManager) {
        this._treePoolCursor = 0

        if (nodeManager.nodes.length <= 0) {
            const tree = this.getNewTree()
            tree.setRect(0, 0, 0, 0)
            return tree
        }

        const root = this.getNewTree()

        // calculate root rect
        {
            let minX: number = Number.MAX_VALUE
            let minY: number = Number.MAX_VALUE

            let maxX: number = -Number.MAX_VALUE
            let maxY: number = -Number.MAX_VALUE

            for (let i = 0; i < nodeManager.nodes.length; i++) {
                const node = nodeManager.nodes[i]

                minX = Math.min(node.posX, minX)
                minY = Math.min(node.posY, minY)

                maxX = Math.max(node.posX, maxX)
                maxY = Math.max(node.posY, maxY)
            }

            const width = maxX - minX
            const height = maxY - minY

            const maxD = Math.max(width, height)

            const centerX = minX + width * 0.5
            const centerY = minY + height * 0.5

            root.setRect(
                centerX - maxD * 0.5, centerY - maxD * 0.5,
                centerX + maxD * 0.5, centerY + maxD * 0.5,
            )
        }

        for (let i = 0; i < nodeManager.nodes.length; i++) {
            const node = nodeManager.nodes[i]
            this._pushNodeToTree(root, node)
        }

        return root
    }
}
