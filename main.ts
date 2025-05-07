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
    repulsionMax: number,

    spring: number,
    springDist: number,
    springMax: number
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

    let repulsionForce = gpuComputer.calculateForces(manager)
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
        force = math.clampAbs(force, springMax)

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

    offsetX: number = 0
    offsetY: number = 0

    zoom: number = 1

    isRequesting: boolean = false

    gpuComputer: GpuComputer = new GpuComputer()

    nodeManager: NodeManager

    mouseX: number = 0
    mouseY: number = 0

    debugMsgs: Map<string, string> = new Map()

    nodeMinDist: number = 0.1

    repulsion: number = 16500
    repulsionMax: number = 1000

    spring: number = 0.002
    springDist: number = 350
    springMax: number = 1000

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
        testNode.posX = this.width / 2
        testNode.posY = this.height / 2
        testNode.title = FirstTitle
        this.nodeManager.pushNode(testNode)
        // TEST TEST TEST TEST
    }

    handleEvent(e: Event) {
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

                    const radius = node.getRadius()

                    if (distSquared < radius * radius) {
                        this.expandNode(i)
                        break
                    }
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
            this.repulsionMax,

            this.spring,
            this.springDist,
            this.springMax,
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

                cd.fillCircle(this.ctx, pos.x, pos.y, node.getRadius() * this.zoom, "PaleTurquoise")
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
            let pos = this.viewportToWorld(this.mouseX, this.mouseY)
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
        x += this.offsetX
        y += this.offsetY

        x *= this.zoom
        y *= this.zoom

        return new math.Vector2(x, y)
    }

    viewportToWorld(x: number, y: number): math.Vector2 {
        x /= this.zoom
        y /= this.zoom

        x -= this.offsetX
        y -= this.offsetY


        return new math.Vector2(x, y)
    }

    serialize(): string {
        const container = new SerializationContainer()

        for (let i = 0; i < this.nodeManager.length(); i++) {
            container.nodes.push(this.nodeManager.getNodeAt(i))
        }
        container.connections = this.nodeManager.getConnections()

        container.offsetX = this.offsetX
        container.offsetY = this.offsetY

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

            this.offsetX = container.offsetX
            this.offsetY = container.offsetY

            this.zoom = container.zoom
        } catch (err) {
            console.error(err)
        }
    }

    reset(addStartingNode: boolean) {
        this.offsetX = 0
        this.offsetY = 0

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

            const uuid = self.crypto.randomUUID();

            let label = document.createElement('label')
            label.innerText = `${labelText}: ${startingValue}`
            label.htmlFor = uuid.toString()

            let input = document.createElement('input')
            input.type = 'range'
            input.min = min.toString()
            input.max = max.toString()
            input.step = step.toString()
            input.value = startingValue.toString()
            input.id = uuid.toString()
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

            const uuid = self.crypto.randomUUID();

            let label = document.createElement('label')
            label.innerText = `${labelText}`
            label.htmlFor = uuid.toString()

            let checkbox = document.createElement('input')
            checkbox.type = 'checkbox'
            checkbox.checked = startingValue
            checkbox.id = uuid.toString()
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
            app.repulsionMax,
            0, 10000,
            1,
            "repulsionMax",
            (value) => { app.repulsionMax = value }
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
        addSlider(
            app.springMax,
            1, 1000,
            1,
            "springMax",
            (value) => { app.springMax = value }
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

