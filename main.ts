import * as cd from "./canvas.js"
import * as wiki from "./wiki.js"
import * as util from "./util.js"
import * as math from "./math.js"
import { GpuComputer } from "./gpu.js"

const FirstTitle = "English language"
//const FirstTitle = "Miss Meyers"

class DocNode {
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

    constructor(nodeIndexA: number, nodeIndexB: number) {
        this.nodeIndexA = nodeIndexA
        this.nodeIndexB = nodeIndexB
    }
}

class NodeManager {
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

function calculateNodeForces(
    manager: NodeManager,

    gpuComputer: GpuComputer,

    // forces get significantly large
    // when nodes get too close
    // clamp dist
    nodeMinDist: number,

    repulsion: number,

    spring: number,
    springDist: number,
) {
    // apply repulsion
    /*
    for (let a = 0; a < manager.length(); a++) {
        for (let b = 0; b < manager.length(); b++) {
            if (a == b) {
                continue
            }

            const nodeA = manager.getNodeAt(a)
            const nodeB = manager.getNodeAt(b)

            const atobX = nodeB.posX - nodeA.posX
            const atobY = nodeB.posY - nodeA.posY

            const distSquared = math.distSquared(atobX, atobY)
            if (math.closeToZero(distSquared)) {
                continue
            }

            let dist = Math.sqrt(distSquared)

            const atobNX = atobX / dist
            const atobNY = atobY / dist

            dist -= nodeA.getRadius()
            dist -= nodeB.getRadius()

            dist = Math.max(dist, nodeMinDist)

            let force = repulsion * nodeA.mass * nodeB.mass / (dist * dist)
            force = math.clampAbs(force, repulsionMax)

            nodeA.forceX -= force * atobNX
            nodeA.forceY -= force * atobNY

            nodeB.forceX += force * atobNX
            nodeB.forceY += force * atobNY
        }
    }
    */

    let repulsionForce = gpuComputer.calculateForces(
        manager,
        nodeMinDist,
        repulsion,
    )
    for (let i = 0; i < manager.length(); i++) {
        const node = manager.getNodeAt(i)
        const force = repulsionForce[i]

        node.forceX += force.x
        node.forceY += force.y
    }

    if (repulsionForce.length > 1) {
        let meme = 0
    }


    // apply spring
    for (const con of manager.getConnections()) {
        const nodeA = manager.getNodeAt(con.nodeIndexA)
        const nodeB = manager.getNodeAt(con.nodeIndexB)

        const aPos = new math.Vector2(nodeA.posX, nodeA.posY)
        const bPos = new math.Vector2(nodeB.posX, nodeB.posY)

        const atob = math.vector2Sub(bPos, aPos)

        let distSquared = math.vector2DistSquared(atob)
        if (math.closeToZero(distSquared)) {
            continue
        }

        let dist = Math.sqrt(distSquared)

        const atobN = math.vector2Scale(atob, 1 / dist)

        dist = dist - (nodeA.getRadius() + nodeB.getRadius())
        dist = Math.max(dist, nodeMinDist)

        let force = Math.log(dist / springDist) * spring

        let atobF = math.vector2Scale(atobN, force)

        nodeA.forceX += atobF.x
        nodeA.forceY += atobF.y

        nodeB.forceX -= atobF.x
        nodeB.forceY -= atobF.y
    }
}

class App {
    canvasElement: HTMLCanvasElement
    ctx: CanvasRenderingContext2D

    width: number = 0
    height: number = 0

    offset: math.Vector2 = new math.Vector2(0, 0)

    zoom: number = 1

    isPinching: boolean = false
    pinch: number = 0
    pinchPos: math.Vector2 = new math.Vector2(0, 0)

    isRequesting: boolean = false
    requestingNodeIndex: number = -1

    gpuComputer: GpuComputer = new GpuComputer()

    nodeManager: NodeManager

    debugMsgs: Map<string, string> = new Map()

    // ========================
    // input states
    // ========================
    draggingCanvas: boolean = false
    pDrag: math.Vector2 = new math.Vector2(0, 0)

    mouse: math.Vector2 = new math.Vector2(0, 0)

    pMouse: math.Vector2 = new math.Vector2(0, 0)

    isMouseDown: boolean = false

    focusedOnNode: boolean = false
    focusedNodeIndex: number = -1

    // ========================
    // simulation parameters
    // ========================
    nodeMinDist: number = 10

    repulsion: number = 5000

    spring: number = 5
    springDist: number = 200

    constructor(canvas: HTMLCanvasElement) {
        this.canvasElement = canvas

        const ctx = canvas.getContext('2d')
        if (ctx === null) {
            throw new Error("failed to get canvas context")
        }
        this.ctx = ctx

        this.ctx.imageSmoothingEnabled = false

        this.updateWidthAndHeight()

        this.nodeManager = new NodeManager()

        // NOTE: we have to add it to window because canvas
        // doesn't take keyboard input
        // TODO: put canvas inside a div
        window.addEventListener("keydown", (e) => {
            this.handleEvent(e)
        })

        for (const eName of [
            "wheel",

            "mousedown",
            "mouseup",
            "mousemove",
            "mouseleave",

            "touchcancel",
            "touchend",
            "touchmove",
            "touchstart",
        ]) {
            this.canvasElement.addEventListener(eName, (e) => {
                e.preventDefault()
                this.handleEvent(e)
            })
        }

        // TEST TEST TEST TEST
        const testNode = new DocNode()
        testNode.posX = this.width / 2
        testNode.posY = this.height / 2
        testNode.title = FirstTitle
        this.nodeManager.pushNode(testNode)
        // TEST TEST TEST TEST
    }

    handleEvent(e: Event) {
        const startDragging = (x: number, y: number) => {
            this.draggingCanvas = true
            this.pDrag.x = x
            this.pDrag.y = y
        }

        const doDrag = (x: number, y: number) => {
            if (!this.draggingCanvas) {
                return
            }
            const pPos = this.viewportToWorld(this.pDrag.x, this.pDrag.y)
            const pos = this.viewportToWorld(x, y)

            const toPos = math.vector2Sub(pos, pPos)

            this.offset.x += toPos.x
            this.offset.y += toPos.y

            this.pDrag.x = x
            this.pDrag.y = y
        }

        const endDragging = () => {
            this.draggingCanvas = false
        }

        const handlePointClick = (x: number, y: number) => {
            let clickedOnNode = false
            let nodeIndex = -1

            // check if we clicked on node
            {
                const pos = this.viewportToWorld(x, y)

                for (let i = 0; i < this.nodeManager.length(); i++) {
                    const node = this.nodeManager.getNodeAt(i)
                    if (math.posInCircle(
                        pos.x, pos.y,
                        node.posX, node.posY,
                        node.getRadius()
                    )) {
                        clickedOnNode = true
                        nodeIndex = i
                        break
                    }
                }
            }

            if (clickedOnNode) {
                this.focusedOnNode = true
                this.focusedNodeIndex = nodeIndex
            } else {
                startDragging(x, y)
            }
        }

        const touchPos = (touch: Touch): math.Vector2 => {
            let canvasRect = this.canvasElement.getBoundingClientRect();
            return new math.Vector2(
                touch.clientX - canvasRect.x,
                touch.clientY - canvasRect.y,
            )
        }

        switch (e.type) {
            case "wheel": {
                const wheelEvent = e as WheelEvent

                const zoomOrigin = this.viewportToWorld(this.mouse.x, this.mouse.y)
                let newZoom = this.zoom

                if (wheelEvent.deltaY < 0) {
                    newZoom *= 1.1
                } else {
                    newZoom *= 0.9
                }

                this.zoom = newZoom

                const newZoomOrigin = this.viewportToWorld(this.mouse.x, this.mouse.y)

                this.offset.x += (newZoomOrigin.x - zoomOrigin.x)
                this.offset.y += (newZoomOrigin.y - zoomOrigin.y)

            } break

            case "mousemove": {
                const mouseEvent = e as MouseEvent

                this.pMouse.x = this.mouse.x
                this.pMouse.y = this.mouse.y

                this.mouse.x = mouseEvent.offsetX
                this.mouse.y = mouseEvent.offsetY

                if (this.draggingCanvas) {
                    doDrag(this.mouse.x, this.mouse.y)
                } else if (this.focusedOnNode) {
                    const node = this.nodeManager.getNodeAt(this.focusedNodeIndex)
                    const mw = this.viewportToWorld(this.mouse.x, this.mouse.y)

                    if (!math.posInCircle(
                        mw.x, mw.y,
                        node.posX, node.posY,
                        node.getRadius()
                    )) {
                        this.focusedOnNode = false
                        if (this.isMouseDown) {
                            startDragging(this.mouse.x, this.mouse.y)
                        }
                    }
                }
            } break

            case "mousedown": {
                const mouseEvent = e as MouseEvent

                this.isMouseDown = true

                handlePointClick(this.mouse.x, this.mouse.y)
            } break

            case "mouseup": {
                this.isMouseDown = false

                if (this.focusedOnNode) {
                    this.expandNode(this.focusedNodeIndex)
                }
                this.focusedOnNode = false

                endDragging()
            } break

            case "mouseleave": {
                endDragging()
                this.focusedOnNode = false
                this.isMouseDown = false
            } break

            case "touchstart": {
                const touchEvent = e as TouchEvent
                const touches = touchEvent.touches

                if (touches.length == 1) {
                    const touch = touchPos(touches[0])
                    handlePointClick(touch.x, touch.y)
                } else {
                    this.focusedOnNode = false
                    endDragging()
                }

                if (touches.length == 2) {
                    this.isPinching = true

                    const touch0 = touchPos(touches[0])
                    const touch1 = touchPos(touches[1])

                    this.pinch = math.dist(
                        touch0.x - touch1.x,
                        touch0.y - touch1.y
                    )

                    this.pinchPos.x = (touch0.x + touch1.x) * 0.5
                    this.pinchPos.y = (touch0.y + touch1.y) * 0.5

                } else {
                    this.isPinching = false
                }
            } break

            case "touchmove": {
                const touchEvent = e as TouchEvent
                const touches = touchEvent.touches

                if (touches.length == 1) {
                    const touch = touchPos(touches[0])

                    if (this.draggingCanvas) {
                        doDrag(touch.x, touch.y)
                    } else if (this.focusedOnNode) {
                        const node = this.nodeManager.getNodeAt(this.focusedNodeIndex)
                        const tw = this.viewportToWorld(touch.x, touch.y)

                        if (!math.posInCircle(
                            tw.x, tw.y,
                            node.posX, node.posY,
                            node.getRadius()
                        )) {
                            this.focusedOnNode = false
                            startDragging(touch.x, touch.y)
                        }
                    }
                } else {
                    this.focusedOnNode = false
                    endDragging()
                }

                if (touches.length === 2) {
                    if (this.isPinching) {
                        const touch0 = touchPos(touches[0])
                        const touch1 = touchPos(touches[1])

                        const newPinch = math.dist(
                            touch0.x - touch1.x,
                            touch0.y - touch1.y
                        )

                        const newPinchPos = new math.Vector2(
                            (touch0.x + touch1.x) * 0.5,
                            (touch0.y + touch1.y) * 0.5
                        )

                        const pinchRatio = newPinch / this.pinch
                        const newZoom = this.zoom * pinchRatio

                        const pwOld = this.viewportToWorld(this.pinchPos.x, this.pinchPos.y)
                        this.zoom = newZoom
                        const pwNew = this.viewportToWorld(newPinchPos.x, newPinchPos.y)

                        this.offset = math.vector2Add(math.vector2Sub(pwNew, pwOld), this.offset)

                        this.pinch = newPinch
                        this.pinchPos = newPinchPos
                    }
                }
            } break

            case "touchcancel": {
            } break

            case "touchend": {
                const touchEvent = e as TouchEvent

                if (touchEvent.touches.length === 0) {
                    if (this.focusedOnNode) {
                        this.expandNode(this.focusedNodeIndex)
                        this.focusedOnNode = false
                    }
                }

                if (touchEvent.touches.length !== 1) {
                    endDragging()
                }

                if (touchEvent.touches.length !== 2) {
                    this.isPinching = false
                }
            } break
        }
    }

    debugPrint(key: string, value: string) {
        this.debugMsgs.set(key, value)
    }

    expandNode = async (nodeIndex: number) => {
        if (this.isRequesting) {
            console.log("busy")
            return
        }

        if (!(0 <= nodeIndex && nodeIndex < this.nodeManager.length())) {
            console.error(`node id ${nodeIndex} out of bound`)
            return
        }

        this.requestingNodeIndex = nodeIndex
        const node = this.nodeManager.getNodeAt(nodeIndex)

        console.log(`requesting ${node.title}`)

        this.isRequesting = true

        try {
            const regex = / /g
            const links = await wiki.retrieveAllLiks(node.title.replace(regex, "_"))

            if (links.length > 0) {
                const angle: number = Math.PI * 2 / links.length

                // not an accurate mass of node that will expand
                // but good enough
                const offsetV = { x: 0, y: - (100 + DocNode.nodeMassToRadius(links.length)) }
                let index = 0;

                const addNodeOneByOne = false

                const addNode = () => {
                    if (index >= links.length) {
                        return
                    }

                    const link = links[index]
                    const otherNodeIndex = this.nodeManager.findNodeFromTitle(link)

                    if (otherNodeIndex < 0) {
                        const newNode = new DocNode()
                        const newNodeId = this.nodeManager.length()
                        newNode.title = link

                        const v = math.vector2Rotate(offsetV, angle * index)
                        newNode.posX = node.posX + v.x // + (Math.random() - 0.5) * 20
                        newNode.posY = node.posY + v.y // + (Math.random() - 0.5) * 20

                        this.nodeManager.pushNode(newNode)
                        this.nodeManager.setConnected(nodeIndex, newNodeId, true)

                        node.mass += 1
                        newNode.mass += 1
                    } else {
                        if (!this.nodeManager.isConnected(nodeIndex, otherNodeIndex)) {
                            const otherNode = this.nodeManager.getNodeAt(otherNodeIndex)
                            this.nodeManager.setConnected(nodeIndex, otherNodeIndex, true)
                            node.mass += 1
                            otherNode.mass += 1
                        }
                    }

                    index += 1

                    if (addNodeOneByOne) {
                        setTimeout(addNode, 3)
                    } else {
                        addNode()
                    }
                }
                if (addNodeOneByOne) {
                    setTimeout(addNode, 3)
                } else {
                    addNode()
                }
            }
        } catch (err) {
            console.error(err)
        } finally {
            this.isRequesting = false
        }
    }

    update(deltaTime: DOMHighResTimeStamp) {
        this.updateWidthAndHeight()
        this.debugMsgs.clear() // clear debug messages

        // debug print fps
        {
            let estimate = 1000.0 / deltaTime
            this.debugPrint('FPS', Math.round(estimate).toString())
        }
        // debug print nodecount
        this.debugPrint('node count', this.nodeManager.length().toString())

        calculateNodeForces(
            this.nodeManager,

            this.gpuComputer,

            this.nodeMinDist,

            this.repulsion,

            this.spring,
            this.springDist,
        )

        for (let i = 0; i < this.nodeManager.length(); i++) {
            const node = this.nodeManager.getNodeAt(i)

            // node.velocityX += node.forceX
            // node.velocityY += node.forceY
            //
            // node.posX += node.velocityX
            // node.posY += node.velocityY
            if (node.mass <= 0) {
                continue
            }

            node.forceX /= node.mass
            node.forceY /= node.mass

            if (math.distSquared(node.forceX, node.forceY) > 1 * 1) {
                node.temp += 0.01
            } else {
                node.temp -= 0.01
            }
            node.temp = math.clamp(node.temp, 0, 1)

            node.posX += node.forceX * node.temp
            node.posY += node.forceY * node.temp
            //
            // node.velocityX *= 0.5
            // node.velocityY *= 0.5

            node.forceX = 0
            node.forceY = 0
        }
    }

    draw(deltaTime: DOMHighResTimeStamp) {
        // draw connections
        this.nodeManager.getConnections().forEach((con) => {
            const nodeA = this.nodeManager.getNodeAt(con.nodeIndexA)
            const nodeB = this.nodeManager.getNodeAt(con.nodeIndexB)

            const posA = this.worldToViewport(nodeA.posX, nodeA.posY)
            const posB = this.worldToViewport(nodeB.posX, nodeB.posY)

            cd.strokeLine(
                this.ctx,
                posA.x, posA.y,
                posB.x, posB.y,
                2 * this.zoom, "grey"
            )
        })

        // draw circles
        for (let i = 0; i < this.nodeManager.length(); i++) {
            const node = this.nodeManager.getNodeAt(i)
            if (node.doDraw) {
                const pos = this.worldToViewport(node.posX, node.posY)

                if (this.isRequesting && i === this.requestingNodeIndex) {
                    cd.fillCircle(
                        this.ctx, pos.x, pos.y,
                        node.getRadius() * this.zoom,
                        "red"
                    )
                } else {
                    cd.fillCircle(
                        this.ctx, pos.x, pos.y,
                        node.getRadius() * this.zoom,
                        "PaleTurquoise"
                    )
                }
            }
        }

        // draw texts
        this.ctx.font = `${this.zoom * 12}px sans-serif`
        this.ctx.fillStyle = "black"
        this.ctx.textAlign = "center"
        this.ctx.textRendering = "optimizeSpeed"
        this.ctx.textBaseline = "bottom"
        for (let i = 0; i < this.nodeManager.length(); i++) {
            const node = this.nodeManager.getNodeAt(i)
            if (node.doDraw) {
                const pos = this.worldToViewport(node.posX, node.posY)

                // TEST TEST TEST TEST
                //this.ctx.fillText(node.title, pos.x, pos.y - (this.nodeRadius + 5.0) * this.zoom)
                // TEST TEST TEST TEST
                this.ctx.fillText(node.mass.toString(), pos.x, pos.y - (node.getRadius() + 5.0) * this.zoom)
            }
        }

        // draw mouse pointer
        {
            let pos = this.viewportToWorld(this.mouse.x, this.mouse.y)
            pos = this.worldToViewport(pos.x, pos.y)
            cd.fillCircle(this.ctx, pos.x, pos.y, 10 * this.zoom, "red")
        }

        // debug print stuff
        {
            this.ctx.font = `16px 'Courier New', monospace`
            this.ctx.fillStyle = "red"
            this.ctx.textAlign = "start"
            this.ctx.textRendering = "optimizeSpeed"
            this.ctx.textBaseline = "top"

            let offsetY = 0

            this.debugMsgs.forEach((
                value: string, key: string,
                map: Map<string, string>
            ) => {
                this.ctx.fillText(`${key}: ${value}`, 0, offsetY)
                offsetY += 20
            })
        }
    }

    updateWidthAndHeight() {
        const rect = this.canvasElement.getBoundingClientRect()

        this.width = rect.width
        this.height = rect.height

        this.canvasElement.width = rect.width
        this.canvasElement.height = rect.height
    }

    worldToViewport(x: number, y: number): math.Vector2 {
        x += this.offset.x
        y += this.offset.y

        x *= this.zoom
        y *= this.zoom

        return new math.Vector2(x, y)
    }

    viewportToWorld(x: number, y: number): math.Vector2 {
        x /= this.zoom
        y /= this.zoom

        x -= this.offset.x
        y -= this.offset.y


        return new math.Vector2(x, y)
    }

    serialize(): string {
        const container = new SerializationContainer()

        for (let i = 0; i < this.nodeManager.length(); i++) {
            container.nodes.push(this.nodeManager.getNodeAt(i))
        }
        container.connections = this.nodeManager.getConnections()

        container.offsetX = this.offset.x
        container.offsetY = this.offset.y

        container.zoom = this.zoom

        return JSON.stringify(container)
    }

    deserialize(jsonString: string) {
        try {
            const jsonObj = JSON.parse(jsonString)
            if (!isSerializationContainer(jsonObj)) {
                throw new Error("json object is not a SerializationContainer")
            }
            const container = jsonObj as SerializationContainer

            this.reset(false)

            for (const node of container.nodes) {
                const nodeCopy = new DocNode()

                nodeCopy.posX = node.posX
                nodeCopy.posY = node.posY

                // we don't need to deserialize force
                // it will be handled by at later tick

                nodeCopy.title = node.title

                this.nodeManager.pushNode(nodeCopy)
            }

            for (const con of container.connections) {
                this.nodeManager.setConnected(
                    con.nodeIndexA, con.nodeIndexB, true,
                )
            }

            this.offset.x = container.offsetX
            this.offset.y = container.offsetY

            this.zoom = container.zoom
        } catch (err) {
            console.error(err)
        }
    }

    reset(addStartingNode: boolean) {
        this.offset.x = 0
        this.offset.y = 0

        this.zoom = 1

        this.nodeManager.reset()

        if (addStartingNode) {
            // TEST TEST TEST TEST
            const testNode = new DocNode()
            testNode.posX = this.width / 2
            testNode.posY = this.height / 2
            testNode.title = FirstTitle
            this.nodeManager.pushNode(testNode)
            // TEST TEST TEST TEST
        }
    }
}

class SerializationContainer {
    nodes: Array<DocNode> = []
    connections: Array<Connection> = []

    offsetX: number = 0
    offsetY: number = 0

    zoom: number = 0
}


function isSerializationContainer(obj: any): boolean {
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
        const dummyNode = new DocNode()

        for (const objNode of obj.nodes) {
            if (!objHasMatchingKeys(objNode, dummyNode)) {
                return false
            }
        }
    }

    if (obj.connections.length > 0) {
        const dummyCon = new Connection(0, 0)

        for (const objCon of obj.connections) {
            if (!objHasMatchingKeys(objCon, dummyCon)) {
                return false
            }
        }
    }

    return true
}

function main() {
    const canvas = document.getElementById('my-canvas') as HTMLCanvasElement
    if (canvas === null) {
        throw new Error("failed to get canvas context")
    }

    const app = new App(canvas)

    // set up debug UI elements
    {
        const downloadButton = document.getElementById('download-button') as HTMLButtonElement
        downloadButton.onclick = () => {
            const jsonString = app.serialize()
            util.saveBlob(new Blob([jsonString], { type: 'application/json' }), 'graph.json')
        }

        const uploadInput = document.getElementById('upload-input') as HTMLInputElement

        uploadInput.addEventListener('change', async (ev: Event) => {
            if (uploadInput.files !== null) {
                if (uploadInput.files.length > 0) {
                    try {
                        const file = uploadInput.files[0]
                        const text = await file.text()
                        app.deserialize(text)
                    } catch (err) {
                        console.error(err)
                    }
                }
            }
        })

        let debugUICounter = 0

        const getUIid = (): string => {
            debugUICounter++;
            return `debug-ui-id-${debugUICounter}`
        }

        const addSlider = (
            startingValue: number,
            min: number, max: number,
            step: number,
            labelText: string,
            onValueChange: (input: number) => void
        ) => {
            let debugUIdiv = document.getElementById('debug-ui-div')
            if (debugUIdiv === null) {
                return
            }

            let div = document.createElement('div')
            div.classList.add('debug-ui-container')

            const id = getUIid()

            let label = document.createElement('label')
            label.innerText = `${labelText}: ${startingValue}`
            label.htmlFor = id

            let input = document.createElement('input')
            input.type = 'range'
            input.min = min.toString()
            input.max = max.toString()
            input.step = step.toString()
            input.value = startingValue.toString()
            input.id = id
            input.addEventListener('input', async (ev: Event) => {
                label.innerText = `${labelText}: ${input.value}`
                onValueChange(parseFloat(input.value))
            })

            div.appendChild(input)
            div.appendChild(label)
            debugUIdiv.appendChild(div)
        }

        const addCheckBox = (
            startingValue: boolean,
            labelText: string,
            onValueChange: (input: boolean) => void
        ) => {
            let debugUIdiv = document.getElementById('debug-ui-div')
            if (debugUIdiv === null) {
                return
            }

            let div = document.createElement('div')
            div.classList.add('debug-ui-container')

            const id = getUIid()

            let label = document.createElement('label')
            label.innerText = `${labelText}`
            label.htmlFor = id

            let checkbox = document.createElement('input')
            checkbox.type = 'checkbox'
            checkbox.checked = startingValue
            checkbox.id = id
            checkbox.addEventListener('input', async (ev: Event) => {
                label.innerText = `${labelText}`
                onValueChange(checkbox.checked)
            })

            div.appendChild(checkbox)
            div.appendChild(label)
            debugUIdiv.appendChild(div)
        }

        const addButton = (
            text: string,
            onclick: () => void
        ) => {
            let debugUIdiv = document.getElementById('debug-ui-div')
            if (debugUIdiv === null) {
                return
            }

            let div = document.createElement('div')
            div.classList.add('debug-ui-container')

            let button = document.createElement('button')
            button.innerText = text

            button.onclick = onclick

            div.appendChild(button)
            debugUIdiv.appendChild(div)
        }

        addButton(
            'reset', () => { app.reset(true) }
        )

        addSlider(
            app.nodeMinDist,
            0, 10,
            0.01,
            "nodeMinDist",
            (value) => { app.nodeMinDist = value }
        )

        addSlider(
            app.repulsion,
            0, 10000,
            1,
            "repulsion",
            (value) => { app.repulsion = value }
        )

        addSlider(
            app.spring,
            0, 5,
            0.0001,
            "spring",
            (value) => { app.spring = value }
        )
        addSlider(
            app.springDist,
            1, 1000,
            1,
            "springDist",
            (value) => { app.springDist = value }
        )
    }

    let prevTime: DOMHighResTimeStamp | undefined

    const onFrame = (timestamp: DOMHighResTimeStamp) => {
        if (prevTime === undefined) {
            prevTime = timestamp
        }
        const deltaTime = timestamp - prevTime
        prevTime = timestamp

        app.update(deltaTime)
        app.draw(deltaTime)
        requestAnimationFrame(onFrame)

        /*
        // TODO: very bad way of keeping a 60 frames per second
        setTimeout(() => {
            requestAnimationFrame(onFrame)
        }, 1000 / 60)
        */
    }

    requestAnimationFrame(onFrame)
}

main()

