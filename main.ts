import * as cd from "./canvas.js"
import * as wiki from "./wiki.js"
import * as util from "./util.js"
import * as math from "./math.js"
import * as assets from "./assets.js"
import * as color from "./color.js"
import { GpuComputeRenderer, SimulationParameter, DataSyncFlags } from "./gpu.js"
import { clearDebugPrint, debugPrint, renderDebugPrint } from './debug_print.js'
import { NodeManager, DocNode, NodeConnection } from "./graph_objects.js"

const FirstTitle = "English language"
//const FirstTitle = "Miss Meyers"

interface ExpandRequest {
    node: DocNode
    links: Array<string> | null
    doneRequesting: boolean
}

class App {
    mainCanvas: HTMLCanvasElement
    overlayCanvas: HTMLCanvasElement

    width: number = 0
    height: number = 0

    zoom: number = 1
    offset: math.Vector2 = new math.Vector2(0, 0)

    globalTick: number = 0

    gpu: GpuComputeRenderer

    nodeManager: NodeManager

    overlayCtx: CanvasRenderingContext2D

    _doUpdateNodePositions: boolean = false
    _nodePositionsUpdated: boolean = false
    _updatingNodePositions: boolean = false
    _onNodePostionsUpdated: Array<() => void> = []

    _expandRequests: Array<ExpandRequest> = []

    // ========================
    // input states
    // ========================
    draggingCanvas: boolean = false
    pDrag: math.Vector2 = new math.Vector2(0, 0)

    mouse: math.Vector2 = new math.Vector2(0, 0)

    pMouse: math.Vector2 = new math.Vector2(0, 0)

    isMouseDown: boolean = false

    readyToExpandNodeOnRelease: boolean = false
    tappedPos: math.Vector2 = new math.Vector2(0, 0)
    lastPosBeforeRelease: math.Vector2 = new math.Vector2(0, 0)

    isPinching: boolean = false
    pinch: number = 0
    pinchPos: math.Vector2 = new math.Vector2(0, 0)

    // ========================
    // simulation parameters
    // ========================
    simParam: SimulationParameter = new SimulationParameter()

    constructor(
        mainCanvas: HTMLCanvasElement,
        overlayCanvas: HTMLCanvasElement,
    ) {
        this.mainCanvas = mainCanvas
        this.overlayCanvas = overlayCanvas

        {
            const ctx = overlayCanvas.getContext('2d')
            if (ctx === null) {
                throw new Error('failed to get CanvasRenderingContext2D')
            }
            this.overlayCtx = ctx
        }

        this.updateWidthAndHeight()

        this.nodeManager = new NodeManager()
        this.gpu = new GpuComputeRenderer(this.mainCanvas)

        this.gpu.simParam = this.simParam

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
            this.mainCanvas.addEventListener(eName, (e) => {
                e.preventDefault()
                this.handleEvent(e)
            })
        }

        // TEST TEST TEST TEST
        const testNode = new DocNode()
        testNode.posX = this.width / 2
        testNode.posY = this.height / 2
        testNode.title = FirstTitle
        testNode.color = color.getRandomColor()
        testNode.color.a = 255
        this.nodeManager.pushNode(testNode)
        // TEST TEST TEST TEST

        this.gpu.submitNodeManager(
            this.nodeManager,
            DataSyncFlags.Everything
        )
    }

    handleEvent(e: Event) {
        const focusLoseDist = 100

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

        const handlePointerDown = (x: number, y: number) => {
            startDragging(x, y)
            this.readyToExpandNodeOnRelease = true
            this.tappedPos.x = x
            this.tappedPos.y = y
            this.lastPosBeforeRelease.x = x
            this.lastPosBeforeRelease.y = y
        }

        const handlePointerMove = (x: number, y: number) => {
            if (this.draggingCanvas) {
                doDrag(x, y)
            }

            if (this.readyToExpandNodeOnRelease) {
                this.lastPosBeforeRelease.x = x
                this.lastPosBeforeRelease.y = y

                const dist = math.dist(
                    x - this.tappedPos.x,
                    y - this.tappedPos.y,
                )

                if (dist > focusLoseDist) {
                    this.readyToExpandNodeOnRelease = false
                }
            }
        }

        const handlePointerUp = () => {
            if (this.readyToExpandNodeOnRelease) {
                this.updateNodePositions(() => {
                    // check if we clicked on node
                    let clickedOnNode = false
                    let nodeIndex = -1

                    const pos = this.viewportToWorld(
                        this.lastPosBeforeRelease.x,
                        this.lastPosBeforeRelease.y,
                    )

                    for (let i = 0; i < this.nodeManager.nodes.length; i++) {
                        const node = this.nodeManager.nodes[i]
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

                    // if we clicked on node, expand it
                    if (clickedOnNode) {
                        this.expandNode(nodeIndex)
                    }
                })
            }

            this.readyToExpandNodeOnRelease = false
            this.draggingCanvas = false
        }

        const touchPos = (touch: Touch): math.Vector2 => {
            let canvasRect = this.mainCanvas.getBoundingClientRect();
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

                handlePointerMove(this.mouse.x, this.mouse.y)
            } break

            case "mousedown": {
                const mouseEvent = e as MouseEvent

                this.isMouseDown = true

                handlePointerDown(this.mouse.x, this.mouse.y)
            } break

            case "mouseup": {
                this.isMouseDown = false

                handlePointerUp()
            } break

            case "mouseleave": {
                endDragging()
                this.readyToExpandNodeOnRelease = false
            } break

            case "touchstart": {
                const touchEvent = e as TouchEvent
                const touches = touchEvent.touches

                if (touches.length == 1) {
                    const touch = touchPos(touches[0])
                    handlePointerDown(touch.x, touch.y)
                } else {
                    this.readyToExpandNodeOnRelease = false
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

                    handlePointerMove(touch.x, touch.y)
                } else {
                    this.readyToExpandNodeOnRelease = false
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
                    handlePointerUp()
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

    update(deltaTime: DOMHighResTimeStamp) {
        this.updateWidthAndHeight()
        this.globalTick++

        // debug print stuff
        {
            let estimate = 1000.0 / deltaTime
            debugPrint('FPS', Math.round(estimate).toString())
        }
        debugPrint('node count', this.nodeManager.nodes.length.toString())
        debugPrint('connection count', this.nodeManager.connections.length.toString())
        debugPrint('zoom', this.zoom.toFixed(2))

        // ================================
        // handle expand requests
        // ================================
        {
            let finished: Array<ExpandRequest> = []
            let unfinished: Array<ExpandRequest> = []

            for (const req of this._expandRequests) {
                if (req.doneRequesting) {
                    finished.push(req)
                } else {
                    unfinished.push(req)
                }
            }

            // =======================================
            // actually add nodes from links we got
            // =======================================
            for (const req of finished) {
                this.updateNodePositions(() => {
                    if (req.links === null) {
                        return
                    }

                    const angle: number = Math.PI * 2 / req.links.length

                    // not an accurate mass of node that will expand
                    // but good enough
                    const offsetV = { x: 0, y: - (100 + DocNode.nodeMassToRadius(req.node.mass + req.links.length)) }

                    let index = this.nodeManager.getIndexFromId(req.node.id)

                    for (let i = 0; i < req.links.length; i++) {
                        const link = req.links[i]

                        const otherIndex = this.nodeManager.findNodeFromTitle(link)

                        if (index === otherIndex) {
                            continue;
                        }

                        if (otherIndex < 0) { // we have to make a new node
                            const newNode = new DocNode()
                            const newNodeIndex = this.nodeManager.nodes.length
                            newNode.title = link

                            const v = math.vector2Rotate(offsetV, angle * i)
                            newNode.posX = req.node.posX + v.x
                            newNode.posY = req.node.posY + v.y

                            this.nodeManager.pushNode(newNode)
                            this.nodeManager.setConnected(index, newNodeIndex, true)

                            req.node.mass += 1
                            newNode.mass += 1

                            // TEST TEST TEST TEST TEST
                            newNode.color = color.getRandomColor()
                            newNode.color.a = 255
                            // TEST TEST TEST TEST TEST
                        } else if (!this.nodeManager.isConnected(index, otherIndex)) { // we have to make a new connection
                            const otherNode = this.nodeManager.nodes[otherIndex]
                            this.nodeManager.setConnected(index, otherIndex, true)
                            req.node.mass += 1
                            otherNode.mass += 1
                        }
                    }

                    this.gpu.submitNodeManager(
                        this.nodeManager,
                        DataSyncFlags.Everything
                    )
                })
            }

            // =====================================================
            // nodes with finished request are no longer expanding
            // =====================================================
            for (const req of finished) {
                req.node.isExpanding = false
            }
            if (finished.length > 0) {
                // tell gpu that nodes aren't expanding
                this.gpu.submitNodeManager(
                    this.nodeManager,
                    DataSyncFlags.NodeInfos
                )
            }

            this._expandRequests = unfinished
        }

        // ================================
        // node position updating
        // ================================
        if (this._doUpdateNodePositions) {
            if (!this._updatingNodePositions) {
                this._updatingNodePositions = true
                this.gpu.updateNodePhysicsToNodeManager(this.nodeManager).then(() => {
                    this._updatingNodePositions = false
                    this._nodePositionsUpdated = true

                    for (const cb of this._onNodePostionsUpdated) {
                        cb()
                    }
                    this._onNodePostionsUpdated.length = 0
                })
            }
        } else {
            this._nodePositionsUpdated = false
        }
        this._doUpdateNodePositions = false

        // ================================
        // handle callbacks on updates
        // ================================
        if (this._nodePositionsUpdated) {
            for (const cb of this._onNodePostionsUpdated) {
                cb()
            }
            this._onNodePostionsUpdated.length = 0
        }

        this.gpu.zoom = this.zoom
        this.gpu.offset.x = this.offset.x
        this.gpu.offset.y = this.offset.y
        this.gpu.mouse.x = this.mouse.x
        this.gpu.mouse.y = this.mouse.y
        this.gpu.globalTick = this.globalTick
    }

    draw(deltaTime: DOMHighResTimeStamp) {
        this.gpu.render()

        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height)

        // =========================
        // draw texts
        // =========================
        // TODO: text is jittery because node position update is delayed
        if (this.zoom > 0.3) {

            this.updateNodePositions()

            if (this.nodePositionsUpdated()) {
                this.overlayCtx.font = `${this.zoom * 12}px sans-serif`
                this.overlayCtx.fillStyle = "black"
                this.overlayCtx.strokeStyle = "white"
                this.overlayCtx.lineWidth = 3 * this.zoom
                this.overlayCtx.textAlign = "center"
                this.overlayCtx.textRendering = "optimizeSpeed"
                this.overlayCtx.textBaseline = "bottom"

                // drawing text for every node is too expensive
                // draw nodes that are only visible

                const viewMin = this.viewportToWorld(0, 0)
                const viewMax = this.viewportToWorld(this.width, this.height)

                const vx = viewMax.x - viewMin.x
                const vy = viewMax.y - viewMin.y

                viewMin.x -= vx * 0.25
                viewMax.x += vx * 0.25

                viewMin.y -= vy * 0.1
                viewMax.y += vy * 0.1

                for (const node of this.nodeManager.nodes) {
                    if (math.posInBox(
                        node.posX, node.posY,
                        viewMin.x, viewMin.y, viewMax.x, viewMax.y
                    )) {
                        const pos = this.worldToViewport(node.posX, node.posY)
                        this.overlayCtx.strokeText(
                            node.title,
                            pos.x, pos.y - (node.getRadius() + 5.0) * this.zoom
                        )
                        this.overlayCtx.fillText(
                            node.title,
                            pos.x, pos.y - (node.getRadius() + 5.0) * this.zoom
                        )
                    }
                }
            }
        }
    }

    updateWidthAndHeight() {
        const rect = this.mainCanvas.getBoundingClientRect()

        this.width = rect.width
        this.height = rect.height

        this.mainCanvas.width = rect.width
        this.mainCanvas.height = rect.height

        this.overlayCanvas.width = rect.width
        this.overlayCanvas.height = rect.height
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

    expandNode = async (nodeIndex: number) => {
        if (!(0 <= nodeIndex && nodeIndex < this.nodeManager.nodes.length)) {
            console.error(`node id ${nodeIndex} out of bound`)
            return
        }

        const node = this.nodeManager.nodes[nodeIndex]

        console.log(`requesting ${node.title}`)

        const request: ExpandRequest = {
            node: node,
            links: null,
            doneRequesting: false
        }

        node.isExpanding = true

        this._expandRequests.push(request)

        this.gpu.submitNodeManager(
            this.nodeManager,
            DataSyncFlags.NodeInfos
        )

        try {
            const regex = / /g
            const links = await wiki.retrieveAllLiks(node.title.replace(regex, "_"))

            request.links = links
        } catch (err) {
            console.error(err)
        } finally {
            request.doneRequesting = true
        }
    }

    serialize(): string {
        const container = new SerializationContainer()

        for (let i = 0; i < this.nodeManager.nodes.length; i++) {
            container.nodes.push(this.nodeManager.nodes[i])
        }
        for (let i = 0; i < this.nodeManager.connections.length; i++) {
            container.connections.push(this.nodeManager.connections[i])
        }

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

    updateNodePositions(cb: (() => void) | null = null) {
        this._doUpdateNodePositions = true
        if (cb !== null) {
            this._onNodePostionsUpdated.push(cb)
        }
    }

    nodePositionsUpdated(): boolean {
        return this._nodePositionsUpdated
    }

    updatingNodePositions(): boolean {
        return this._updatingNodePositions
    }

    reset(addStartingNode: boolean) {
        this._onNodePostionsUpdated.length = 0
        this._expandRequests.length = 0

        this.offset.x = 0
        this.offset.y = 0

        this.zoom = 1

        this.nodeManager.reset()

        this.readyToExpandNodeOnRelease = false

        if (addStartingNode) {
            // TEST TEST TEST TEST
            const testNode = new DocNode()
            testNode.posX = this.width / 2
            testNode.posY = this.height / 2
            testNode.title = FirstTitle
            testNode.color = color.getRandomColor()
            testNode.color.a = 255
            this.nodeManager.pushNode(testNode)
            // TEST TEST TEST TEST
        }

        this.gpu.submitNodeManager(
            this.nodeManager,
            DataSyncFlags.Everything
        )
    }
}

class SerializationContainer {
    nodes: Array<DocNode> = []
    connections: Array<NodeConnection> = []

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
        const dummyCon = new NodeConnection(0, 0)

        for (const objCon of obj.connections) {
            if (!objHasMatchingKeys(objCon, dummyCon)) {
                return false
            }
        }
    }

    return true
}

async function main() {
    const mainCanvas = document.getElementById('main-canvas') as HTMLCanvasElement
    if (mainCanvas === null) {
        throw new Error("failed to get main-canvas")
    }
    const overlayCanvas = document.getElementById('overlay-canvas') as HTMLCanvasElement
    if (overlayCanvas === null) {
        throw new Error("failed to get overlay-canvas")
    }

    await assets.loadAssets()

    const app = new App(mainCanvas, overlayCanvas)

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

            onValueChange(startingValue)
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
            10,
            0, 10,
            0.01,
            "nodeMinDist",
            (value) => { app.simParam.nodeMinDist = value }
        )

        addSlider(
            7000,
            0, 10000,
            1,
            "repulsion",
            (value) => { app.simParam.repulsion = value }
        )

        addSlider(
            5,
            0, 20,
            0.0001,
            "spring",
            (value) => { app.simParam.spring = value }
        )
        addSlider(
            600,
            1, 1000,
            1,
            "springDist",
            (value) => { app.simParam.springDist = value }
        )
        addSlider(
            100,
            1, 1000,
            1,
            "forceCap",
            (value) => { app.simParam.forceCap = value }
        )
    }

    let prevTime: DOMHighResTimeStamp | undefined

    const onFrame = (timestamp: DOMHighResTimeStamp) => {
        //clearDebugPrint()

        if (prevTime === undefined) {
            prevTime = timestamp
        }
        const deltaTime = timestamp - prevTime
        prevTime = timestamp

        app.update(deltaTime)
        app.draw(deltaTime)

        renderDebugPrint()

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


