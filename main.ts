import * as cd from "./canvas.js"
import * as wiki from "./wiki.js"

interface Vector2 {
    x: number
    y: number
}

function vector2Rotate(v: Vector2, rot: number): Vector2 {
    const sin = Math.sin(rot)
    const cos = Math.cos(rot)

    return {
        x: v.x * cos - v.y * sin,
        y: v.x * sin + v.y * cos,
    }
}

class DocNode {
    posX: number = 0
    posY: number = 0

    forceX: number = 0
    forceY: number = 0

    title: string = ""
}

function drawDocNode(
    ctx: CanvasRenderingContext2D,
    node: DocNode,
) {
    const radius = 8
    cd.fillCircle(ctx, node.posX, node.posY, radius, "rgb(100, 100, 100)")

    ctx.font = "12px sans-serif"
    ctx.textAlign = "center"
    ctx.textRendering = "optimizeSpeed"
    ctx.textBaseline = "bottom"
    ctx.fillText(node.title, node.posX, node.posY - radius - 2.0)
}

function applyRepulsion(nodeA: DocNode, nodeB: DocNode, force: number, minDist: number) {
    const atobX = nodeB.posX - nodeA.posX
    const atobY = nodeB.posY - nodeA.posY

    let distSquared = atobX * atobX + atobY * atobY
    if (distSquared < 0.001) {
        return
    }

    distSquared = Math.max(distSquared, minDist * minDist)

    const dist = Math.sqrt(distSquared)

    const atobNX = atobX / dist
    const atobNY = atobY / dist

    let atobFX = atobNX * (force / distSquared)
    let atobFY = atobNY * (force / distSquared)

    nodeA.posX -= atobFX
    nodeA.posY -= atobFY

    nodeB.posX += atobFX
    nodeB.posY += atobFY
}

function applySpring(
    nodeA: DocNode, nodeB: DocNode,
    relaxedDist: number,
    force: number,
    minDist: number
) {
    const atobX = nodeB.posX - nodeA.posX
    const atobY = nodeB.posY - nodeA.posY

    let distSquared = atobX * atobX + atobY * atobY
    if (distSquared < 0.001) {
        return
    }

    distSquared = Math.max(distSquared, minDist * minDist)

    const dist = Math.sqrt(distSquared)

    const atobNX = atobX / dist
    const atobNY = atobY / dist

    let delta = relaxedDist - dist

    let atobFX = atobNX * delta * force
    let atobFY = atobNY * delta * force

    nodeA.posX -= atobFX
    nodeA.posY -= atobFY

    nodeB.posX += atobFX
    nodeB.posY += atobFY
}

function applyForce(node: DocNode) {
    node.posX += node.forceX
    node.posY += node.forceY
}

function resetForce(node: DocNode) {
    node.forceX *= 0
    node.forceY *= 0
}

function calculateSum(a: number, b: number): number {
    return (b - a + 1) * (a + b) / 2
}

class Connection {
    nodeIdA: number
    nodeIdB: number

    constructor(nodeIdA: number, nodeIdB: number) {
        this.nodeIdA = nodeIdA
        this.nodeIdB = nodeIdB
    }
}

class NodeManager {
    _connectionMatrix: Array<boolean>

    _connections: Array<Connection> = []

    _length: number = 0
    _capacity: number

    _nodes: Array<DocNode>
    _titleToNodes: Record<string, number> = {}

    constructor() {
        const initCapacity = 16
        const matrixSize = calculateSum(1, initCapacity - 1)

        this._connectionMatrix = Array(matrixSize).fill(false)
        this._nodes = Array(matrixSize)
        this._capacity = initCapacity
    }

    isConnected(nodeIdA: number, nodeIdB: number): boolean {
        if (nodeIdA === nodeIdB) {
            return false
        }
        return this._connectionMatrix[this.getConMatIndex(nodeIdA, nodeIdB)]
    }

    setConnected(
        nodeIdA: number, nodeIdB: number,
        connected: boolean
    ): void {
        if (nodeIdA === nodeIdB) {
            return
        }

        const index = this.getConMatIndex(nodeIdA, nodeIdB)
        const wasConnedted = this._connectionMatrix[index]

        if (wasConnedted != connected) {
            if (wasConnedted) { // we have to remove connection
                let toRemoveAt = -1

                for (let i = 0; i < this._connections.length; i++) {
                    const con = this._connections[i]
                    if (con.nodeIdA === nodeIdA && con.nodeIdB === nodeIdB) {
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
                this._connections.push(new Connection(nodeIdA, nodeIdB))
            }

            this._connectionMatrix[index] = connected
        }
    }

    getConnections(): Array<Connection> {
        return this._connections
    }

    getNodeAt(index: number): DocNode {
        return this._nodes[index]
    }

    _getConMatIndexImpl(
        nodeIdA: number, nodeIdB: number,
        capacity: number
    ): number {
        if (nodeIdA === nodeIdB) {
            return -1
        }

        const minId = Math.min(nodeIdA, nodeIdB)
        const maxId = Math.max(nodeIdA, nodeIdB)

        let index = 0

        if (minId > 0) {
            index = calculateSum(capacity - minId, capacity - 1)
        }
        index += maxId - (minId + 1)

        return index
    }

    getConMatIndex(nodeIdA: number, nodeIdB: number): number {
        return this._getConMatIndexImpl(nodeIdA, nodeIdB, this._capacity)
    }

    pushNode(node: DocNode) {
        if (this._length >= this._capacity) {
            const oldCap = this._capacity
            const newCap = this._capacity * 2

            const minCap = Math.min(oldCap, newCap)

            // grow connection matrix
            {
                const newMatrixSize = calculateSum(1, newCap - 1)

                const oldMatrix = this._connectionMatrix
                const newMatrix = Array(newMatrixSize).fill(false)


                for (let a = 0; a < minCap; a++) {
                    for (let b = a + 1; b < minCap; b++) {
                        const oldIndex = this._getConMatIndexImpl(a, b, oldCap)
                        const newIndex = this._getConMatIndexImpl(a, b, newCap)

                        newMatrix[newIndex] = oldMatrix[oldIndex]
                    }
                }

                this._connectionMatrix = newMatrix
            }
            // grow nodes
            {
                const oldNodes = this._nodes
                const newNodes = Array(newCap)

                for (let i = 0; i < minCap; i++) {
                    newNodes[i] = oldNodes[i]
                }
                this._nodes = newNodes
            }

            this._capacity = newCap
        }

        this._nodes[this._length] = node
        this._titleToNodes[node.title] = this._length
        this._length++
    }

    findNodeFromTitle(title: string): number {
        if (title in this._titleToNodes) {
            return this._titleToNodes[title]
        }
        return -1
    }

    length(): number {
        return this._length
    }

    cap(): number {
        return this._capacity
    }
}

class App {
    canvasElement: HTMLCanvasElement
    ctx: CanvasRenderingContext2D

    width: number = 0
    height: number = 0

    offsetX: number = 0
    offsetY: number = 0

    zoom: number = 1

    isRequesting: boolean = false

    nodeManager: NodeManager

    mouseX: number = 0
    mouseY: number = 0

    // constants
    nodeRadius: number = 8

    repulsion = 3000
    springDist = 200
    spring = 0.002

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

        this.canvasElement.addEventListener("wheel", (e) => {
            this.handleEvent(e)
        })

        this.canvasElement.addEventListener("pointerdown", (e) => {
            this.handleEvent(e)
        })

        this.canvasElement.addEventListener("pointermove", (e) => {
            this.handleEvent(e)
        })

        // TEST TEST TEST TEST
        const testNode = new DocNode()
        testNode.posX = 150
        testNode.posY = 150
        testNode.title = "Miss Meyers"
        this.nodeManager.pushNode(testNode)
        // TEST TEST TEST TEST
    }

    handleEvent(e: Event) {

        //console.log(e)

        switch (e.type) {
            case "keydown": {
                const keyEvent = e as KeyboardEvent
                switch (keyEvent.code) {
                    case "KeyW":
                        this.offsetY += 10
                        break
                    case "KeyS":
                        this.offsetY -= 10
                        break
                    case "KeyA":
                        this.offsetX += 10
                        break
                    case "KeyD":
                        this.offsetX -= 10
                        break
                }

                console.log(`x:${this.offsetX}, y:${this.offsetY}`)

            } break

            case "wheel": {
                const wheelEvent = e as WheelEvent

                const zoomOrigin = this.viewportToWorld(this.mouseX, this.mouseY)
                let newZoom = this.zoom

                if (wheelEvent.deltaY < 0) {
                    newZoom *= 1.1
                } else {
                    newZoom *= 0.9
                }

                this.zoom = newZoom

                const newZoomOrigin = this.viewportToWorld(this.mouseX, this.mouseY)

                this.offsetX += (newZoomOrigin.x - zoomOrigin.x)
                this.offsetY += (newZoomOrigin.y - zoomOrigin.y)

            } break

            case "pointermove": {
                const pointerEvent = e as PointerEvent

                this.mouseX = pointerEvent.offsetX
                this.mouseY = pointerEvent.offsetY
            } break

            case "pointerdown": {
                const pointerEvent = e as PointerEvent

                const pos = this.viewportToWorld(this.mouseX, this.mouseY)

                for (let i = 0; i < this.nodeManager.length(); i++) {
                    const node = this.nodeManager.getNodeAt(i)

                    const dx = pos.x - node.posX
                    const dy = pos.y - node.posY

                    const distSquared = dx * dx + dy * dy

                    if (distSquared < this.nodeRadius * this.nodeRadius) {
                        //console.log(`clicked ${node.doc}`)
                        this.expandNode(i)
                        break
                    }
                }
            } break
        }
    }

    expandNode = async (nodeId: number) => {
        if (this.isRequesting) {
            console.log("busy")
            return
        }

        if (!(0 <= nodeId && nodeId < this.nodeManager.length())) {
            console.error(`node id ${nodeId} out of bound`)
            return
        }

        const node = this.nodeManager.getNodeAt(nodeId)

        console.log(`requesting ${node.title}`)

        this.isRequesting = true

        try {
            const regex = / /g
            const links = await wiki.retrieveAllLiks(node.title.replace(regex, "_"))

            if (links.length > 0) {
                const angle: number = Math.PI * 2 / links.length

                const offsetV = { x: 0, y: - 100 }
                let index = 0;

                const addNode = () => {
                    if (index >= links.length) {
                        return
                    }

                    const link = links[index]
                    const existingNodeId = this.nodeManager.findNodeFromTitle(link)

                    if (existingNodeId < 0) {
                        const newNode = new DocNode()
                        const newNodeId = this.nodeManager.length()
                        newNode.title = link

                        const v = vector2Rotate(offsetV, angle * index)
                        newNode.posX = node.posX + v.x + (Math.random() - 0.5) * 20
                        newNode.posY = node.posY + v.y + (Math.random() - 0.5) * 20

                        this.nodeManager.pushNode(newNode)
                        this.nodeManager.setConnected(nodeId, newNodeId, true)
                    } else {
                        this.nodeManager.setConnected(nodeId, existingNodeId, true)
                    }

                    index += 1

                    setTimeout(addNode, 3)
                }
                setTimeout(addNode, 3)
            }
        } catch (err) {
            console.error(err)
        } finally {
            this.isRequesting = false
        }
    }

    update(deltaTime: DOMHighResTimeStamp) {
        this.updateWidthAndHeight()

        for (let a = 0; a < this.nodeManager.length(); a++) {
            for (let b = a + 1; b < this.nodeManager.length(); b++) {
                const nodeA = this.nodeManager.getNodeAt(a)
                const nodeB = this.nodeManager.getNodeAt(b)

                applyRepulsion(nodeA, nodeB, this.repulsion, this.nodeRadius)
            }
        }

        this.nodeManager.getConnections().forEach((con) => {
            const nodeA = this.nodeManager.getNodeAt(con.nodeIdA)
            const nodeB = this.nodeManager.getNodeAt(con.nodeIdB)
            applySpring(nodeA, nodeB, this.springDist, this.spring, this.nodeRadius)
        })

        for (let i = 0; i < this.nodeManager.length(); i++) {
            const node = this.nodeManager.getNodeAt(i)

            applyForce(node)
            resetForce(node)
        }
    }

    draw(deltaTime: DOMHighResTimeStamp) {
        // draw connections
        this.nodeManager.getConnections().forEach((con) => {
            const nodeA = this.nodeManager.getNodeAt(con.nodeIdA)
            const nodeB = this.nodeManager.getNodeAt(con.nodeIdB)

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
            const pos = this.worldToViewport(node.posX, node.posY)

            const radius = this.nodeRadius * this.zoom

            cd.fillCircle(this.ctx, pos.x, pos.y, radius, "PaleTurquoise")
        }

        // draw texts
        this.ctx.font = `${this.zoom * 12}px sans-serif`
        this.ctx.fillStyle = "black"
        this.ctx.textAlign = "center"
        this.ctx.textRendering = "optimizeSpeed"
        this.ctx.textBaseline = "bottom"
        for (let i = 0; i < this.nodeManager.length(); i++) {
            const node = this.nodeManager.getNodeAt(i)
            const pos = this.worldToViewport(node.posX, node.posY)

            this.ctx.fillText(node.title, pos.x, pos.y - (this.nodeRadius + 5.0) * this.zoom)
        }

        // draw circles
        {
            let pos = this.viewportToWorld(this.mouseX, this.mouseY)
            pos = this.worldToViewport(pos.x, pos.y)
            cd.fillCircle(this.ctx, pos.x, pos.y, 10 * this.zoom, "red")
        }

        // draw fps estimate
        {
            let estimate = 1000.0 / deltaTime

            this.ctx.font = `16px sans-serif`
            this.ctx.fillStyle = "red"
            this.ctx.textAlign = "start"
            this.ctx.textRendering = "optimizeSpeed"
            this.ctx.textBaseline = "top"
            this.ctx.fillText(Math.round(estimate).toString(), 0, 0)
        }
    }

    updateWidthAndHeight() {
        const rect = this.canvasElement.getBoundingClientRect()

        this.width = rect.width
        this.height = rect.height

        this.canvasElement.width = rect.width
        this.canvasElement.height = rect.height
    }

    worldToViewport(x: number, y: number): Vector2 {
        x += this.offsetX
        y += this.offsetY

        x *= this.zoom
        y *= this.zoom

        return { x: x, y: y }
    }

    viewportToWorld(x: number, y: number): Vector2 {
        x /= this.zoom
        y /= this.zoom

        x -= this.offsetX
        y -= this.offsetY


        return { x: x, y: y }
    }
}

function main() {
    const canvas = document.createElement('canvas')

    document.body.appendChild(canvas)

    canvas.style.width = "500px"
    canvas.style.height = "500px"
    canvas.style.border = 'solid'

    const app = new App(canvas)

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

