var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as wiki from "./wiki.js";
import * as util from "./util.js";
import * as math from "./math.js";
import * as assets from "./assets.js";
import { GpuComputeRenderer, SimulationParameter } from "./gpu.js";
import { debugPrint, renderDebugPrint } from './debug_print.js';
import { NodeManager, DocNode, QuadTreeBuilder, NodeConnection } from "./graph_objects.js";
const FirstTitle = "English language";
//const FirstTitle = "Miss Meyers"
class App {
    constructor(mainCanvas, overlayCanvas) {
        this.width = 0;
        this.height = 0;
        this.zoom = 1;
        this.offset = new math.Vector2(0, 0);
        this.isRequesting = false;
        this.requestingNodeIndex = -1;
        // quadTreeRoot: QuadTree = new QuadTree()
        this.treeBuilder = new QuadTreeBuilder();
        this.nodePositionsUpdated = false;
        this.updatingNodePositions = false;
        // ========================
        // input states
        // ========================
        this.draggingCanvas = false;
        this.pDrag = new math.Vector2(0, 0);
        this.mouse = new math.Vector2(0, 0);
        this.pMouse = new math.Vector2(0, 0);
        this.isMouseDown = false;
        this.readyToExpandNodeOnRelease = false;
        this.tappedPos = new math.Vector2(0, 0);
        this.lastPosBeforeRelease = new math.Vector2(0, 0);
        this.isPinching = false;
        this.pinch = 0;
        this.pinchPos = new math.Vector2(0, 0);
        // ========================
        // simulation parameters
        // ========================
        this.simParam = new SimulationParameter();
        this.expandNode = (nodeIndex) => __awaiter(this, void 0, void 0, function* () {
            if (this.isRequesting) {
                console.log("busy");
                return;
            }
            if (!(0 <= nodeIndex && nodeIndex < this.nodeManager.nodes.length)) {
                console.error(`node id ${nodeIndex} out of bound`);
                return;
            }
            this.requestingNodeIndex = nodeIndex;
            const node = this.nodeManager.nodes[nodeIndex];
            console.log(`requesting ${node.title}`);
            this.isRequesting = true;
            try {
                const regex = / /g;
                const links = yield wiki.retrieveAllLiks(node.title.replace(regex, "_"));
                if (links.length > 0) {
                    const angle = Math.PI * 2 / links.length;
                    // not an accurate mass of node that will expand
                    // but good enough
                    const offsetV = { x: 0, y: -(100 + DocNode.nodeMassToRadius(links.length)) };
                    if (links.length > 0) {
                        yield this.gpu.updateNodePositionsAndTempsToNodeManager(this.nodeManager);
                        //for (const link of links) {
                        for (let i = 0; i < links.length; i++) {
                            const link = links[i];
                            const otherNodeIndex = this.nodeManager.findNodeFromTitle(link);
                            if (otherNodeIndex < 0) {
                                const newNode = new DocNode();
                                const newNodeId = this.nodeManager.nodes.length;
                                newNode.title = link;
                                const v = math.vector2Rotate(offsetV, angle * i);
                                newNode.posX = node.posX + v.x; //
                                newNode.posY = node.posY + v.y; //
                                this.nodeManager.pushNode(newNode);
                                this.nodeManager.setConnected(nodeIndex, newNodeId, true);
                                node.mass += 1;
                                newNode.mass += 1;
                            }
                            else {
                                if (!this.nodeManager.isConnected(nodeIndex, otherNodeIndex)) {
                                    const otherNode = this.nodeManager.nodes[otherNodeIndex];
                                    this.nodeManager.setConnected(nodeIndex, otherNodeIndex, true);
                                    node.mass += 1;
                                    otherNode.mass += 1;
                                }
                            }
                        }
                        this.gpu.submitNodeManager(this.nodeManager);
                    }
                }
            }
            catch (err) {
                console.error(err);
            }
            finally {
                this.isRequesting = false;
            }
        });
        this.mainCanvas = mainCanvas;
        this.overlayCanvas = overlayCanvas;
        {
            const ctx = overlayCanvas.getContext('2d');
            if (ctx === null) {
                throw new Error('failed to get CanvasRenderingContext2D');
            }
            this.overlayCtx = ctx;
        }
        this.updateWidthAndHeight();
        this.nodeManager = new NodeManager();
        this.gpu = new GpuComputeRenderer(this.mainCanvas);
        this.gpu.simParam = this.simParam;
        // NOTE: we have to add it to window because canvas
        // doesn't take keyboard input
        // TODO: put canvas inside a div
        window.addEventListener("keydown", (e) => {
            this.handleEvent(e);
        });
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
                e.preventDefault();
                this.handleEvent(e);
            });
        }
        // TEST TEST TEST TEST
        const testNode = new DocNode();
        testNode.posX = this.width / 2;
        testNode.posY = this.height / 2;
        testNode.title = FirstTitle;
        this.nodeManager.pushNode(testNode);
        // TEST TEST TEST TEST
        this.gpu.submitNodeManager(this.nodeManager);
    }
    handleEvent(e) {
        const focusLoseDist = 100;
        const startDragging = (x, y) => {
            this.draggingCanvas = true;
            this.pDrag.x = x;
            this.pDrag.y = y;
        };
        const doDrag = (x, y) => {
            if (!this.draggingCanvas) {
                return;
            }
            const pPos = this.viewportToWorld(this.pDrag.x, this.pDrag.y);
            const pos = this.viewportToWorld(x, y);
            const toPos = math.vector2Sub(pos, pPos);
            this.offset.x += toPos.x;
            this.offset.y += toPos.y;
            this.pDrag.x = x;
            this.pDrag.y = y;
        };
        const endDragging = () => {
            this.draggingCanvas = false;
        };
        const handlePointerDown = (x, y) => {
            startDragging(x, y);
            this.readyToExpandNodeOnRelease = true;
            this.tappedPos.x = x;
            this.tappedPos.y = y;
            this.lastPosBeforeRelease.x = x;
            this.lastPosBeforeRelease.y = y;
        };
        const handlePointerMove = (x, y) => {
            if (this.draggingCanvas) {
                doDrag(x, y);
            }
            if (this.readyToExpandNodeOnRelease) {
                this.lastPosBeforeRelease.x = x;
                this.lastPosBeforeRelease.y = y;
                const dist = math.dist(x - this.tappedPos.x, y - this.tappedPos.y);
                if (dist > focusLoseDist) {
                    this.readyToExpandNodeOnRelease = false;
                }
            }
        };
        const handlePointerUp = () => {
            if (this.readyToExpandNodeOnRelease) {
                this.gpu.updateNodePositionsAndTempsToNodeManager(this.nodeManager).then(() => {
                    // check if we clicked on node
                    let clickedOnNode = false;
                    let nodeIndex = -1;
                    const pos = this.viewportToWorld(this.lastPosBeforeRelease.x, this.lastPosBeforeRelease.y);
                    for (let i = 0; i < this.nodeManager.nodes.length; i++) {
                        const node = this.nodeManager.nodes[i];
                        if (math.posInCircle(pos.x, pos.y, node.posX, node.posY, node.getRadius())) {
                            clickedOnNode = true;
                            nodeIndex = i;
                            break;
                        }
                    }
                    // if we clicked on node, expand it
                    if (clickedOnNode) {
                        this.expandNode(nodeIndex);
                    }
                });
            }
            this.readyToExpandNodeOnRelease = false;
            this.draggingCanvas = false;
        };
        const touchPos = (touch) => {
            let canvasRect = this.mainCanvas.getBoundingClientRect();
            return new math.Vector2(touch.clientX - canvasRect.x, touch.clientY - canvasRect.y);
        };
        switch (e.type) {
            case "wheel":
                {
                    const wheelEvent = e;
                    const zoomOrigin = this.viewportToWorld(this.mouse.x, this.mouse.y);
                    let newZoom = this.zoom;
                    if (wheelEvent.deltaY < 0) {
                        newZoom *= 1.1;
                    }
                    else {
                        newZoom *= 0.9;
                    }
                    this.zoom = newZoom;
                    const newZoomOrigin = this.viewportToWorld(this.mouse.x, this.mouse.y);
                    this.offset.x += (newZoomOrigin.x - zoomOrigin.x);
                    this.offset.y += (newZoomOrigin.y - zoomOrigin.y);
                }
                break;
            case "mousemove":
                {
                    const mouseEvent = e;
                    this.pMouse.x = this.mouse.x;
                    this.pMouse.y = this.mouse.y;
                    this.mouse.x = mouseEvent.offsetX;
                    this.mouse.y = mouseEvent.offsetY;
                    handlePointerMove(this.mouse.x, this.mouse.y);
                }
                break;
            case "mousedown":
                {
                    const mouseEvent = e;
                    this.isMouseDown = true;
                    handlePointerDown(this.mouse.x, this.mouse.y);
                }
                break;
            case "mouseup":
                {
                    this.isMouseDown = false;
                    handlePointerUp();
                }
                break;
            case "mouseleave":
                {
                    endDragging();
                    this.readyToExpandNodeOnRelease = false;
                }
                break;
            case "touchstart":
                {
                    const touchEvent = e;
                    const touches = touchEvent.touches;
                    if (touches.length == 1) {
                        const touch = touchPos(touches[0]);
                        handlePointerDown(touch.x, touch.y);
                    }
                    else {
                        this.readyToExpandNodeOnRelease = false;
                        endDragging();
                    }
                    if (touches.length == 2) {
                        this.isPinching = true;
                        const touch0 = touchPos(touches[0]);
                        const touch1 = touchPos(touches[1]);
                        this.pinch = math.dist(touch0.x - touch1.x, touch0.y - touch1.y);
                        this.pinchPos.x = (touch0.x + touch1.x) * 0.5;
                        this.pinchPos.y = (touch0.y + touch1.y) * 0.5;
                    }
                    else {
                        this.isPinching = false;
                    }
                }
                break;
            case "touchmove":
                {
                    const touchEvent = e;
                    const touches = touchEvent.touches;
                    if (touches.length == 1) {
                        const touch = touchPos(touches[0]);
                        handlePointerMove(touch.x, touch.y);
                    }
                    else {
                        this.readyToExpandNodeOnRelease = false;
                        endDragging();
                    }
                    if (touches.length === 2) {
                        if (this.isPinching) {
                            const touch0 = touchPos(touches[0]);
                            const touch1 = touchPos(touches[1]);
                            const newPinch = math.dist(touch0.x - touch1.x, touch0.y - touch1.y);
                            const newPinchPos = new math.Vector2((touch0.x + touch1.x) * 0.5, (touch0.y + touch1.y) * 0.5);
                            const pinchRatio = newPinch / this.pinch;
                            const newZoom = this.zoom * pinchRatio;
                            const pwOld = this.viewportToWorld(this.pinchPos.x, this.pinchPos.y);
                            this.zoom = newZoom;
                            const pwNew = this.viewportToWorld(newPinchPos.x, newPinchPos.y);
                            this.offset = math.vector2Add(math.vector2Sub(pwNew, pwOld), this.offset);
                            this.pinch = newPinch;
                            this.pinchPos = newPinchPos;
                        }
                    }
                }
                break;
            case "touchcancel":
                {
                }
                break;
            case "touchend":
                {
                    const touchEvent = e;
                    if (touchEvent.touches.length === 0) {
                        handlePointerUp();
                    }
                    if (touchEvent.touches.length !== 1) {
                        endDragging();
                    }
                    if (touchEvent.touches.length !== 2) {
                        this.isPinching = false;
                    }
                }
                break;
        }
    }
    update(deltaTime) {
        this.updateWidthAndHeight();
        // debug print stuff
        {
            let estimate = 1000.0 / deltaTime;
            debugPrint('FPS', Math.round(estimate).toString());
        }
        debugPrint('node count', this.nodeManager.nodes.length.toString());
        debugPrint('connection count', this.nodeManager.connections.length.toString());
        debugPrint('zoom', this.zoom.toFixed(2));
        this.gpu.zoom = this.zoom;
        this.gpu.offset.x = this.offset.x;
        this.gpu.offset.y = this.offset.y;
    }
    draw(deltaTime) {
        this.gpu.render();
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        // =========================
        // draw texts
        // =========================
        // TODO: text is jittery because node position update is delayed
        if (this.zoom > 0.3) {
            if (this.nodePositionsUpdated) {
                this.overlayCtx.font = `${this.zoom * 12}px sans-serif`;
                this.overlayCtx.fillStyle = "blue";
                this.overlayCtx.textAlign = "center";
                this.overlayCtx.textRendering = "optimizeSpeed";
                this.overlayCtx.textBaseline = "bottom";
                // drawing text for every node is too expensive
                // use QuadTree to filter nodes that are not visible
                const root = this.treeBuilder.buildTree(this.nodeManager);
                const viewMin = this.viewportToWorld(0, 0);
                const viewMax = this.viewportToWorld(this.width, this.height);
                const vx = viewMax.x - viewMin.x;
                const vy = viewMax.y - viewMin.y;
                viewMin.x -= vx * 0.25;
                viewMax.x += vx * 0.25;
                viewMin.y -= vy * 0.1;
                viewMax.y += vy * 0.1;
                const toRecurse = (tree) => {
                    if (math.boxIntersects(viewMin.x, viewMin.y, viewMax.x, viewMax.y, tree.minX, tree.minY, tree.maxX, tree.maxY)) {
                        if (tree.node !== null) {
                            const pos = this.worldToViewport(tree.node.posX, tree.node.posY);
                            this.overlayCtx.fillText(tree.node.title, pos.x, pos.y - (tree.node.getRadius() + 5.0) * this.zoom);
                        }
                        else {
                            for (const childTree of tree.childrenTrees) {
                                if (childTree !== null) {
                                    toRecurse(childTree);
                                }
                            }
                        }
                    }
                };
                toRecurse(root);
            }
            if (!this.updatingNodePositions) {
                this.updatingNodePositions = true;
                this.gpu.updateNodePositionsAndTempsToNodeManager(this.nodeManager).then(() => {
                    this.updatingNodePositions = false;
                    this.nodePositionsUpdated = true;
                });
            }
        }
        else {
            this.nodePositionsUpdated = false;
        }
    }
    updateWidthAndHeight() {
        const rect = this.mainCanvas.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
        this.mainCanvas.width = rect.width;
        this.mainCanvas.height = rect.height;
        this.overlayCanvas.width = rect.width;
        this.overlayCanvas.height = rect.height;
    }
    worldToViewport(x, y) {
        x += this.offset.x;
        y += this.offset.y;
        x *= this.zoom;
        y *= this.zoom;
        return new math.Vector2(x, y);
    }
    viewportToWorld(x, y) {
        x /= this.zoom;
        y /= this.zoom;
        x -= this.offset.x;
        y -= this.offset.y;
        return new math.Vector2(x, y);
    }
    serialize() {
        const container = new SerializationContainer();
        for (let i = 0; i < this.nodeManager.nodes.length; i++) {
            container.nodes.push(this.nodeManager.nodes[i]);
        }
        for (let i = 0; i < this.nodeManager.connections.length; i++) {
            container.connections.push(this.nodeManager.connections[i]);
        }
        container.offsetX = this.offset.x;
        container.offsetY = this.offset.y;
        container.zoom = this.zoom;
        return JSON.stringify(container);
    }
    deserialize(jsonString) {
        try {
            const jsonObj = JSON.parse(jsonString);
            if (!isSerializationContainer(jsonObj)) {
                throw new Error("json object is not a SerializationContainer");
            }
            const container = jsonObj;
            this.reset(false);
            for (const node of container.nodes) {
                const nodeCopy = new DocNode();
                nodeCopy.posX = node.posX;
                nodeCopy.posY = node.posY;
                // we don't need to deserialize force
                // it will be handled by at later tick
                nodeCopy.title = node.title;
                this.nodeManager.pushNode(nodeCopy);
            }
            for (const con of container.connections) {
                this.nodeManager.setConnected(con.nodeIndexA, con.nodeIndexB, true);
            }
            this.offset.x = container.offsetX;
            this.offset.y = container.offsetY;
            this.zoom = container.zoom;
        }
        catch (err) {
            console.error(err);
        }
    }
    reset(addStartingNode) {
        this.offset.x = 0;
        this.offset.y = 0;
        this.zoom = 1;
        this.nodeManager.reset();
        if (addStartingNode) {
            // TEST TEST TEST TEST
            const testNode = new DocNode();
            testNode.posX = this.width / 2;
            testNode.posY = this.height / 2;
            testNode.title = FirstTitle;
            this.nodeManager.pushNode(testNode);
            // TEST TEST TEST TEST
        }
    }
}
class SerializationContainer {
    constructor() {
        this.nodes = [];
        this.connections = [];
        this.offsetX = 0;
        this.offsetY = 0;
        this.zoom = 0;
    }
}
function isSerializationContainer(obj) {
    if (typeof obj !== 'object') {
        return false;
    }
    function objHasMatchingKeys(obj, instance) {
        const keys = Reflect.ownKeys(instance);
        for (const key of keys) {
            const instanceType = typeof instance[key];
            const objType = typeof obj[key];
            if (instanceType !== objType) {
                return false;
            }
            if (instanceType == "object") {
                if (Array.isArray(instance[key])) {
                    if (!Array.isArray(obj[key])) {
                        return false;
                    }
                }
                else {
                    if (!objHasMatchingKeys(instance[key], obj[key])) {
                        return false;
                    }
                }
            }
        }
        return true;
    }
    if (!objHasMatchingKeys(obj, new SerializationContainer())) {
        return false;
    }
    if (obj.nodes.length > 0) {
        const dummyNode = new DocNode();
        for (const objNode of obj.nodes) {
            if (!objHasMatchingKeys(objNode, dummyNode)) {
                return false;
            }
        }
    }
    if (obj.connections.length > 0) {
        const dummyCon = new NodeConnection(0, 0);
        for (const objCon of obj.connections) {
            if (!objHasMatchingKeys(objCon, dummyCon)) {
                return false;
            }
        }
    }
    return true;
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const mainCanvas = document.getElementById('main-canvas');
        if (mainCanvas === null) {
            throw new Error("failed to get main-canvas");
        }
        const overlayCanvas = document.getElementById('overlay-canvas');
        if (overlayCanvas === null) {
            throw new Error("failed to get overlay-canvas");
        }
        yield assets.loadAssets();
        const app = new App(mainCanvas, overlayCanvas);
        // set up debug UI elements
        {
            const downloadButton = document.getElementById('download-button');
            downloadButton.onclick = () => {
                const jsonString = app.serialize();
                util.saveBlob(new Blob([jsonString], { type: 'application/json' }), 'graph.json');
            };
            const uploadInput = document.getElementById('upload-input');
            uploadInput.addEventListener('change', (ev) => __awaiter(this, void 0, void 0, function* () {
                if (uploadInput.files !== null) {
                    if (uploadInput.files.length > 0) {
                        try {
                            const file = uploadInput.files[0];
                            const text = yield file.text();
                            app.deserialize(text);
                        }
                        catch (err) {
                            console.error(err);
                        }
                    }
                }
            }));
            let debugUICounter = 0;
            const getUIid = () => {
                debugUICounter++;
                return `debug-ui-id-${debugUICounter}`;
            };
            const addSlider = (startingValue, min, max, step, labelText, onValueChange) => {
                let debugUIdiv = document.getElementById('debug-ui-div');
                if (debugUIdiv === null) {
                    return;
                }
                let div = document.createElement('div');
                div.classList.add('debug-ui-container');
                const id = getUIid();
                let label = document.createElement('label');
                label.innerText = `${labelText}: ${startingValue}`;
                label.htmlFor = id;
                let input = document.createElement('input');
                input.type = 'range';
                input.min = min.toString();
                input.max = max.toString();
                input.step = step.toString();
                input.value = startingValue.toString();
                input.id = id;
                input.addEventListener('input', (ev) => __awaiter(this, void 0, void 0, function* () {
                    label.innerText = `${labelText}: ${input.value}`;
                    onValueChange(parseFloat(input.value));
                }));
                div.appendChild(input);
                div.appendChild(label);
                debugUIdiv.appendChild(div);
                onValueChange(startingValue);
            };
            const addCheckBox = (startingValue, labelText, onValueChange) => {
                let debugUIdiv = document.getElementById('debug-ui-div');
                if (debugUIdiv === null) {
                    return;
                }
                let div = document.createElement('div');
                div.classList.add('debug-ui-container');
                const id = getUIid();
                let label = document.createElement('label');
                label.innerText = `${labelText}`;
                label.htmlFor = id;
                let checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = startingValue;
                checkbox.id = id;
                checkbox.addEventListener('input', (ev) => __awaiter(this, void 0, void 0, function* () {
                    label.innerText = `${labelText}`;
                    onValueChange(checkbox.checked);
                }));
                div.appendChild(checkbox);
                div.appendChild(label);
                debugUIdiv.appendChild(div);
            };
            const addButton = (text, onclick) => {
                let debugUIdiv = document.getElementById('debug-ui-div');
                if (debugUIdiv === null) {
                    return;
                }
                let div = document.createElement('div');
                div.classList.add('debug-ui-container');
                let button = document.createElement('button');
                button.innerText = text;
                button.onclick = onclick;
                div.appendChild(button);
                debugUIdiv.appendChild(div);
            };
            addButton('reset', () => { app.reset(true); });
            addSlider(10, 0, 10, 0.01, "nodeMinDist", (value) => { app.simParam.nodeMinDist = value; });
            addSlider(7000, 0, 10000, 1, "repulsion", (value) => { app.simParam.repulsion = value; });
            addSlider(5, 0, 20, 0.0001, "spring", (value) => { app.simParam.spring = value; });
            addSlider(600, 1, 1000, 1, "springDist", (value) => { app.simParam.springDist = value; });
        }
        let prevTime;
        const onFrame = (timestamp) => {
            //clearDebugPrint()
            if (prevTime === undefined) {
                prevTime = timestamp;
            }
            const deltaTime = timestamp - prevTime;
            prevTime = timestamp;
            app.update(deltaTime);
            app.draw(deltaTime);
            renderDebugPrint();
            requestAnimationFrame(onFrame);
            /*
            // TODO: very bad way of keeping a 60 frames per second
            setTimeout(() => {
            requestAnimationFrame(onFrame)
            }, 1000 / 60)
            */
        };
        requestAnimationFrame(onFrame);
    });
}
main();
