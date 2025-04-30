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

    doc: string = ""
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
    ctx.fillText(node.doc, node.posX, node.posY - radius - 2.0)
}

function applyRepulsion(nodeA: DocNode, nodeB: DocNode, force: number) {
    const atobX = nodeB.posX - nodeA.posX
    const atobY = nodeB.posY - nodeA.posY

    const distSquared = atobX * atobX + atobY * atobY
    const dist = Math.sqrt(distSquared)

    const atobNX = atobX / dist
    const atobNY = atobY / dist

    let atobFX = atobNX * (force / distSquared)
    let atobFY = atobNY * (force / distSquared)

    nodeA.forceX -= atobFX
    nodeA.forceY -= atobFY

    nodeB.forceX += atobFX
    nodeB.forceY += atobFY
}

function applySpring(
    nodeA: DocNode, nodeB: DocNode,
    relaxedDist: number,
    force: number
) {
    const atobX = nodeB.posX - nodeA.posX
    const atobY = nodeB.posY - nodeA.posY

    const distSquared = atobX * atobX + atobY * atobY
    const dist = Math.sqrt(distSquared)

    const atobNX = atobX / dist
    const atobNY = atobY / dist

    const delta = relaxedDist - dist

    let atobFX = atobNX * delta * force
    let atobFY = atobNY * delta * force

    nodeA.forceX -= atobFX
    nodeA.forceY -= atobFY

    nodeB.forceX += atobFX
    nodeB.forceY += atobFY
}

function applyForce(node: DocNode) {
    node.posX += node.forceX
    node.posY += node.forceY
}

function resetForce(node: DocNode) {
    node.forceX = 0
    node.forceY = 0
}

function calculateSum(a: number, b: number): number {
    return (b - a + 1) * (a + b) / 2
}

class ConnectionManager {
    _connectionMatrix: Array<boolean>

    _matrixSize: number

    constructor(size: number) {
        const arraySize = calculateSum(1, size - 1)

        this._connectionMatrix = Array(arraySize).fill(false)
        this._matrixSize = size
    }

    isConnected(nodeIdA: number, nodeIdB: number): boolean {
        if (nodeIdA == nodeIdB) {
            return false
        }
        return this._connectionMatrix[this.getMatrixIndex(nodeIdA, nodeIdB)]
    }

    setConnected(
        nodeIdA: number, nodeIdB: number,
        connected: boolean
    ): void {
        if (nodeIdA == nodeIdB) {
            return
        }
        this._connectionMatrix[this.getMatrixIndex(nodeIdA, nodeIdB)] = connected
    }

    getConnections(nodeId: number): Array<number> {
        let connectedIds: Array<number> = []

        for (let otherId = 0; otherId < this._matrixSize; otherId++) {
            if (nodeId == otherId) {
                continue
            }
            if (this.isConnected(nodeId, otherId)) {
                connectedIds.push(otherId)
            }
        }

        return connectedIds
    }

    _getMatrixIndexImpl(
        nodeIdA: number, nodeIdB: number,
        matrixSize: number
    ): number {
        if (nodeIdA == nodeIdB) {
            return -1
        }

        const minId = Math.min(nodeIdA, nodeIdB)
        const maxId = Math.max(nodeIdA, nodeIdB)

        let index = 0

        if (minId > 0) {
            index = calculateSum(matrixSize - minId, matrixSize - 1)
        }
        index += maxId - (minId + 1)

        return index
    }

    getMatrixIndex(nodeIdA: number, nodeIdB: number): number {
        return this._getMatrixIndexImpl(nodeIdA, nodeIdB, this._matrixSize)
    }

    getMatrixSize(): number {
        return this._matrixSize
    }

    setMatrixSize(newSize: number) {
        const oldSize = this._matrixSize
        const newArraySize = calculateSum(1, newSize - 1)

        const oldMatrix = this._connectionMatrix
        const newMatrix = Array(newArraySize).fill(false)

        const minSize = Math.min(newSize, oldSize)

        for (let a = 0; a < minSize; a++) {
            for (let b = a + 1; b < minSize; b++) {
                const oldIndex = this._getMatrixIndexImpl(a, b, oldSize)
                const newIndex = this._getMatrixIndexImpl(a, b, newSize)

                newMatrix[newIndex] = oldMatrix[oldIndex]
            }
        }

        this._matrixSize = newSize
        this._connectionMatrix = newMatrix
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

    nodes: DocNode[] = []

    isRequesting: boolean = false

    // constants
    nodeRadius: number = 8

    conManager: ConnectionManager

    constructor(canvas: HTMLCanvasElement) {
        this.canvasElement = canvas

        const ctx = canvas.getContext('2d')
        if (ctx == null) {
            throw new Error("failed to get canvas context")
        }
        this.ctx = ctx

        this.updateWidthAndHeight()

        this.conManager = new ConnectionManager(16)

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

        // TEST TEST TEST TEST
        const testNode = new DocNode()
        testNode.posX = 150
        testNode.posY = 150
        testNode.doc = "Miss Meyers"
        this.nodes.push(testNode)
        // TEST TEST TEST TEST
    }

    handleEvent(e: Event) {

        //console.log(e)

        switch (e.type) {
            case "keydown":
                const keyEvent = e as KeyboardEvent
                switch (keyEvent.code) {
                    case "KeyW":
                        this.offsetY -= 10
                        break
                    case "KeyS":
                        this.offsetY += 10
                        break
                    case "KeyA":
                        this.offsetX -= 10
                        break
                    case "KeyD":
                        this.offsetX += 10
                        break
                }

                break
            case "wheel":
                const wheelEvent = e as WheelEvent
                this.zoom -= wheelEvent.deltaY * 0.001
                break
            case "pointerdown":
                const pointerEvent = e as PointerEvent

                const pos = this.viewportToWorld(
                    pointerEvent.offsetX, pointerEvent.offsetY)

                for (let i = 0; i < this.nodes.length; i++) {
                    const node = this.nodes[i]

                    const dx = pos.x - node.posX
                    const dy = pos.y - node.posY

                    const distSquared = dx * dx + dy * dy

                    if (distSquared < this.nodeRadius * this.nodeRadius) {
                        //console.log(`clicked ${node.doc}`)
                        this.expandNode(i)
                        break
                    }
                }
                break
        }
    }

    expandNode = async (nodeId: number) => {
        if (this.isRequesting) {
            console.log("busy")
            return
        }

        if (!(0 <= nodeId && nodeId < this.nodes.length)) {
            console.error(`node id ${nodeId} out of bound`)
            return
        }

        const node = this.nodes[nodeId]

        console.log(`requesting ${node.doc}`)

        this.isRequesting = true


        try {
            const regex = / /g
            const links = await wiki.retrieveAllLiks(node.doc.replace(regex, "_"))

            if (links.length > 0) {
                const angle: number = Math.PI * 2 / links.length

                const offsetV = { x: 0, y: - 50 }

                let newNodeId = this.nodes.length

                //for (const link of links) {
                for (let i = 0; i < links.length; i++) {
                    const link = links[i]
                    const newNode = new DocNode()
                    newNode.doc = link

                    const v = vector2Rotate(offsetV, angle * i)
                    newNode.posX = node.posX + v.x
                    newNode.posY = node.posY + v.y

                    this.addNode(newNode)

                    this.conManager.setConnected(nodeId, newNodeId, true)

                    newNodeId++
                }
            }
        } catch (err) {
            console.error(err)
        } finally {
            this.isRequesting = false
        }
    }

    addNode(node: DocNode) {
        if (this.nodes.length >= this.conManager.getMatrixSize()) {
            this.conManager.setMatrixSize(this.conManager.getMatrixSize() * 2)
        }
        this.nodes.push(node)
    }

    update() {
        this.updateWidthAndHeight()
    }

    draw() {
        // draw circles
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i]
            const pos = this.worldToViewport(node.posX, node.posY)

            const radius = this.nodeRadius * this.zoom

            cd.fillCircle(this.ctx, pos.x, pos.y, radius, "grey")
        }

        // draw texts
        this.ctx.font = `${this.zoom * 12}px sans-serif`
        this.ctx.textAlign = "center"
        this.ctx.textRendering = "optimizeSpeed"
        this.ctx.textBaseline = "bottom"
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i]
            const pos = this.worldToViewport(node.posX, node.posY)

            this.ctx.fillText(node.doc, pos.x, pos.y - (this.nodeRadius + 5.0) * this.zoom)
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
        x *= this.zoom
        y *= this.zoom

        x += this.offsetX
        y += this.offsetY

        return { x: x, y: y }
    }

    viewportToWorld(x: number, y: number): Vector2 {
        x -= this.offsetX
        y -= this.offsetY

        x /= this.zoom
        y /= this.zoom

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

    const onFrame = () => {
        app.update()
        app.draw()

        // TODO: very bad way of keeping a 60 frames per second
        setTimeout(() => {
            requestAnimationFrame(onFrame)
        }, 1000 / 60)
    }

    requestAnimationFrame(onFrame)
}

function main2() {
    let ctx: CanvasRenderingContext2D

    const WIDTH = 300
    const HEIGHT = 300

    {
        const canvas = document.createElement('canvas')

        canvas.width = WIDTH
        canvas.height = HEIGHT

        canvas.style.width = `${WIDTH}px`
        canvas.style.height = `${HEIGHT}px`

        const tmp = canvas.getContext('2d')
        if (tmp == null) {
            throw new Error('failed to get canvas context')
        }
        ctx = tmp

        document.body.appendChild(canvas)
    }

    let nodes: Array<DocNode> = []

    for (let i = 0; i < 5; i++) {
        const node = new DocNode()

        node.posY = HEIGHT / 2
        node.posX = 20 + i * 40

        node.posX += Math.random() * 30
        node.posY += Math.random() * 40

        node.doc = `node ${i}`

        nodes.push(node)
    }

    const nodeCount = nodes.length

    const conManager = new ConnectionManager(nodeCount)

    conManager.setConnected(0, 1, true)
    conManager.setConnected(2, 4, true)
    conManager.setConnected(2, 3, true)
    conManager.setConnected(0, 2, true)

    const REPULSION = 2000
    const SPRING_DIST = 30
    const SPRING = 0.01

    let doLog = true

    const onFrame = () => {
        ctx.clearRect(0, 0, 300, 300)

        for (let a = 0; a < nodeCount; a++) {
            for (let b = a + 1; b < nodeCount; b++) {
                applyRepulsion(nodes[a], nodes[b], REPULSION)
                if (conManager.isConnected(a, b)) {
                    applySpring(nodes[a], nodes[b], SPRING_DIST, SPRING)
                }

                if (doLog) {
                    console.log(`${a}, ${b}`)
                }
            }
        }

        if (doLog && conManager.isConnected(1, 2)) {
            console.log("is connected")
        }

        doLog = false

        for (let i = 0; i < nodeCount; i++) {
            applyForce(nodes[i])
            resetForce(nodes[i])
        }

        for (let a = 0; a < nodeCount; a++) {
            for (let b = a + 1; b < nodeCount; b++) {
                if (conManager.isConnected(a, b)) {
                    cd.strokeLine(
                        ctx,
                        nodes[a].posX, nodes[a].posY,
                        nodes[b].posX, nodes[b].posY,
                        2, "grey"
                    )
                }
            }
        }

        for (let i = 0; i < nodeCount; i++) {
            drawDocNode(ctx, nodes[i])
        }

        // TODO: very bad way of keeping a 60 frames per second
        setTimeout(() => {
            requestAnimationFrame(onFrame)
        }, 1000 / 60)
    }

    requestAnimationFrame(onFrame)
}

main()

