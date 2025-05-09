var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as cd from "./canvas.js";
import * as wiki from "./wiki.js";
import * as util from "./util.js";
import * as math from "./math.js";
import { GpuComputer } from "./gpu.js";
import { clearDebugPrint, debugPrint, renderDebugPrint } from './debug_print.js';
const FirstTitle = "English language";
//const FirstTitle = "Miss Meyers"
class DocNode {
    static getNewNodeId() {
        const id = DocNode.nodeIdMax + 1;
        DocNode.nodeIdMax += 1;
        return id;
    }
    // NOTE:
    // !!!!!!!!!!!   IMPORTANT   !!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    // gpu also needs to figure out raidus from a mass
    // so if you are going to change this code,
    // change the code in gpu shader code in gpu.ts as well
    // !!!!!!!!!!!   IMPORTANT   !!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    static nodeMassToRadius(mass) {
        return 8 + mass * 0.1;
    }
    constructor() {
        this.posX = 0;
        this.posY = 0;
        this.forceX = 0;
        this.forceY = 0;
        this.temp = 1;
        this.mass = 0;
        this.id = 0;
        this.title = "";
        this.doDraw = true;
        this.id = DocNode.getNewNodeId();
    }
    getRadius() {
        return DocNode.nodeMassToRadius(this.mass);
    }
}
DocNode.nodeIdMax = 0;
class Connection {
    constructor(nodeIndexA, nodeIndexB) {
        this.nodeIndexA = nodeIndexA;
        this.nodeIndexB = nodeIndexB;
    }
}
export class NodeManager {
    constructor() {
        this._connectionMatrix = new Map();
        this._connections = [];
        this._length = 0;
        this._capacity = 0;
        this._nodes = [];
        this._titleToNodes = new Map();
        this._idToNodeIndex = new Map();
        this.reset();
    }
    reset() {
        const initCapacity = 512;
        this._connectionMatrix = new Map();
        this._connections = [];
        this._length = 0;
        this._capacity = initCapacity;
        this._nodes = Array(initCapacity);
        this._titleToNodes = new Map();
        this._idToNodeIndex = new Map();
    }
    getIndexFromId(id) {
        const index = this._idToNodeIndex.get(id);
        if (index === undefined) {
            return -1;
        }
        return index;
    }
    isConnected(nodeIndexA, nodeIndexB) {
        if (nodeIndexA === nodeIndexB) {
            return false;
        }
        return this._connectionMatrix.has(this.getConMatIndex(nodeIndexA, nodeIndexB));
    }
    setConnected(nodeIndexA, nodeIndexB, connected) {
        if (nodeIndexA === nodeIndexB) {
            return;
        }
        const index = this.getConMatIndex(nodeIndexA, nodeIndexB);
        const wasConnedted = this._connectionMatrix.has(index);
        if (wasConnedted != connected) {
            if (wasConnedted) { // we have to remove connection
                let toRemoveAt = -1;
                for (let i = 0; i < this._connections.length; i++) {
                    const con = this._connections[i];
                    if (con.nodeIndexA === nodeIndexA && con.nodeIndexB === nodeIndexB) {
                        toRemoveAt = i;
                        break;
                    }
                }
                if (toRemoveAt >= 0) {
                    if (this._connections.length > 0) {
                        this._connections[toRemoveAt] = this._connections[this._connections.length - 1];
                    }
                    this._connections.length = this._connections.length - 1;
                }
            }
            else { // we have to add connection
                this._connections.push(new Connection(nodeIndexA, nodeIndexB));
            }
            //this._connectionMatrix[index] = connected
            this._connectionMatrix.set(index, connected);
        }
    }
    getConnections() {
        return this._connections;
    }
    getNodeAt(index) {
        return this._nodes[index];
    }
    _getConMatIndexImpl(nodeIndexA, nodeIndexB, capacity) {
        if (nodeIndexA === nodeIndexB) {
            return -1;
        }
        const minId = Math.min(nodeIndexA, nodeIndexB);
        const maxId = Math.max(nodeIndexA, nodeIndexB);
        let index = 0;
        if (minId > 0) {
            index = util.calculateSum(capacity - minId, capacity - 1);
        }
        index += maxId - (minId + 1);
        return index;
    }
    getConMatIndex(nodeIndexA, nodeIndexB) {
        return this._getConMatIndexImpl(nodeIndexA, nodeIndexB, this._capacity);
    }
    pushNode(node) {
        if (this._length >= this._capacity) {
            const oldCap = this._capacity;
            const newCap = this._capacity * 2;
            const minCap = Math.min(oldCap, newCap);
            // grow connection matrix
            {
                this._connectionMatrix.clear();
                for (const con of this._connections) {
                    const index = this._getConMatIndexImpl(con.nodeIndexA, con.nodeIndexB, newCap);
                    this._connectionMatrix.set(index, true);
                }
            }
            // grow nodes
            {
                this._nodes.length = newCap;
            }
            this._capacity = newCap;
        }
        this._nodes[this._length] = node;
        this._titleToNodes.set(node.title, this._length);
        this._idToNodeIndex.set(node.id, this._length);
        this._length++;
    }
    findNodeFromTitle(title) {
        const index = this._titleToNodes.get(title);
        if (index === undefined) {
            return -1;
        }
        return index;
    }
    length() {
        return this._length;
    }
    cap() {
        return this._capacity;
    }
}
class App {
    constructor(canvas) {
        this.width = 0;
        this.height = 0;
        this.offset = new math.Vector2(0, 0);
        this.zoom = 1;
        this.isPinching = false;
        this.pinch = 0;
        this.pinchPos = new math.Vector2(0, 0);
        this.isRequesting = false;
        this.requestingNodeIndex = -1;
        // ========================
        // input states
        // ========================
        this.draggingCanvas = false;
        this.pDrag = new math.Vector2(0, 0);
        this.mouse = new math.Vector2(0, 0);
        this.pMouse = new math.Vector2(0, 0);
        this.isMouseDown = false;
        this.isFocusedOnNode = false;
        this.focusedNodeIndex = -1;
        this.focusPos = new math.Vector2(0, 0);
        // ========================
        // simulation parameters
        // ========================
        this.nodeMinDist = 10;
        this.repulsion = 5000;
        this.spring = 5;
        this.springDist = 200;
        this.expandNode = (nodeIndex) => __awaiter(this, void 0, void 0, function* () {
            if (this.isRequesting) {
                console.log("busy");
                return;
            }
            if (!(0 <= nodeIndex && nodeIndex < this.nodeManager.length())) {
                console.error(`node id ${nodeIndex} out of bound`);
                return;
            }
            this.requestingNodeIndex = nodeIndex;
            const node = this.nodeManager.getNodeAt(nodeIndex);
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
                    let index = 0;
                    const addNodeOneByOne = false;
                    const addNode = () => {
                        if (index >= links.length) {
                            return;
                        }
                        const link = links[index];
                        const otherNodeIndex = this.nodeManager.findNodeFromTitle(link);
                        if (otherNodeIndex < 0) {
                            const newNode = new DocNode();
                            const newNodeId = this.nodeManager.length();
                            newNode.title = link;
                            const v = math.vector2Rotate(offsetV, angle * index);
                            newNode.posX = node.posX + v.x; // + (Math.random() - 0.5) * 20
                            newNode.posY = node.posY + v.y; // + (Math.random() - 0.5) * 20
                            this.nodeManager.pushNode(newNode);
                            this.nodeManager.setConnected(nodeIndex, newNodeId, true);
                            node.mass += 1;
                            newNode.mass += 1;
                        }
                        else {
                            if (!this.nodeManager.isConnected(nodeIndex, otherNodeIndex)) {
                                const otherNode = this.nodeManager.getNodeAt(otherNodeIndex);
                                this.nodeManager.setConnected(nodeIndex, otherNodeIndex, true);
                                node.mass += 1;
                                otherNode.mass += 1;
                            }
                        }
                        index += 1;
                        if (addNodeOneByOne) {
                            setTimeout(addNode, 3);
                        }
                        else {
                            addNode();
                        }
                    };
                    if (addNodeOneByOne) {
                        setTimeout(addNode, 3);
                    }
                    else {
                        addNode();
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
        this.canvasElement = canvas;
        const ctx = canvas.getContext('2d');
        if (ctx === null) {
            throw new Error("failed to get canvas context");
        }
        this.ctx = ctx;
        this.ctx.imageSmoothingEnabled = false;
        this.updateWidthAndHeight();
        this.nodeManager = new NodeManager();
        this.gpuComputer = new GpuComputer(this.nodeManager);
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
            this.canvasElement.addEventListener(eName, (e) => {
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
        this.gpuComputer.startSimulating();
    }
    handleEvent(e) {
        const focusLoseDist = 25;
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
        const handlePointClick = (x, y) => {
            let clickedOnNode = false;
            let nodeIndex = -1;
            // check if we clicked on node
            {
                const pos = this.viewportToWorld(x, y);
                for (let i = 0; i < this.nodeManager.length(); i++) {
                    const node = this.nodeManager.getNodeAt(i);
                    if (math.posInCircle(pos.x, pos.y, node.posX, node.posY, node.getRadius())) {
                        clickedOnNode = true;
                        nodeIndex = i;
                        break;
                    }
                }
            }
            if (clickedOnNode) {
                this.isFocusedOnNode = true;
                this.focusedNodeIndex = nodeIndex;
                this.focusPos.x = x;
                this.focusPos.y = y;
            }
            else {
                startDragging(x, y);
            }
        };
        const touchPos = (touch) => {
            let canvasRect = this.canvasElement.getBoundingClientRect();
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
                    if (this.draggingCanvas) {
                        doDrag(this.mouse.x, this.mouse.y);
                    }
                    else if (this.isFocusedOnNode) {
                        const dist = math.dist(this.mouse.x - this.focusPos.x, this.mouse.y - this.focusPos.y);
                        if (dist > focusLoseDist) {
                            this.isFocusedOnNode = false;
                            if (this.isMouseDown) {
                                startDragging(this.mouse.x, this.mouse.y);
                            }
                        }
                    }
                }
                break;
            case "mousedown":
                {
                    const mouseEvent = e;
                    this.isMouseDown = true;
                    handlePointClick(this.mouse.x, this.mouse.y);
                }
                break;
            case "mouseup":
                {
                    this.isMouseDown = false;
                    if (this.isFocusedOnNode) {
                        this.expandNode(this.focusedNodeIndex);
                    }
                    this.isFocusedOnNode = false;
                    endDragging();
                }
                break;
            case "mouseleave":
                {
                    endDragging();
                    this.isFocusedOnNode = false;
                    this.isMouseDown = false;
                }
                break;
            case "touchstart":
                {
                    const touchEvent = e;
                    const touches = touchEvent.touches;
                    if (touches.length == 1) {
                        const touch = touchPos(touches[0]);
                        handlePointClick(touch.x, touch.y);
                    }
                    else {
                        this.isFocusedOnNode = false;
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
                        if (this.draggingCanvas) {
                            doDrag(touch.x, touch.y);
                        }
                        else if (this.isFocusedOnNode) {
                            const dist = math.dist(touch.x - this.focusPos.x, touch.y - this.focusPos.y);
                            if (dist > focusLoseDist) {
                                this.isFocusedOnNode = false;
                                startDragging(touch.x, touch.y);
                            }
                        }
                    }
                    else {
                        this.isFocusedOnNode = false;
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
                        if (this.isFocusedOnNode) {
                            this.expandNode(this.focusedNodeIndex);
                            this.isFocusedOnNode = false;
                        }
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
        // debug print fps
        {
            let estimate = 1000.0 / deltaTime;
            debugPrint('FPS', Math.round(estimate).toString());
        }
        // debug print nodecount
        debugPrint('node count', this.nodeManager.length().toString());
    }
    draw(deltaTime) {
        // draw connections
        this.nodeManager.getConnections().forEach((con) => {
            const nodeA = this.nodeManager.getNodeAt(con.nodeIndexA);
            const nodeB = this.nodeManager.getNodeAt(con.nodeIndexB);
            const posA = this.worldToViewport(nodeA.posX, nodeA.posY);
            const posB = this.worldToViewport(nodeB.posX, nodeB.posY);
            cd.strokeLine(this.ctx, posA.x, posA.y, posB.x, posB.y, 2 * this.zoom, "grey");
        });
        // draw circles
        for (let i = 0; i < this.nodeManager.length(); i++) {
            const node = this.nodeManager.getNodeAt(i);
            if (node.doDraw) {
                const pos = this.worldToViewport(node.posX, node.posY);
                if (this.isRequesting && i === this.requestingNodeIndex) {
                    cd.fillCircle(this.ctx, pos.x, pos.y, node.getRadius() * this.zoom, "red");
                }
                else {
                    cd.fillCircle(this.ctx, pos.x, pos.y, node.getRadius() * this.zoom, "PaleTurquoise");
                }
            }
        }
        // draw texts
        this.ctx.font = `${this.zoom * 12}px sans-serif`;
        this.ctx.fillStyle = "black";
        this.ctx.textAlign = "center";
        this.ctx.textRendering = "optimizeSpeed";
        this.ctx.textBaseline = "bottom";
        for (let i = 0; i < this.nodeManager.length(); i++) {
            const node = this.nodeManager.getNodeAt(i);
            if (node.doDraw) {
                const pos = this.worldToViewport(node.posX, node.posY);
                this.ctx.fillText(node.title, pos.x, pos.y - (node.getRadius() + 5.0) * this.zoom);
            }
        }
        // draw mouse pointer
        {
            let pos = this.viewportToWorld(this.mouse.x, this.mouse.y);
            pos = this.worldToViewport(pos.x, pos.y);
            cd.fillCircle(this.ctx, pos.x, pos.y, 10 * this.zoom, "red");
        }
    }
    updateWidthAndHeight() {
        const rect = this.canvasElement.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
        this.canvasElement.width = rect.width;
        this.canvasElement.height = rect.height;
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
        for (let i = 0; i < this.nodeManager.length(); i++) {
            container.nodes.push(this.nodeManager.getNodeAt(i));
        }
        container.connections = this.nodeManager.getConnections();
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
        const dummyCon = new Connection(0, 0);
        for (const objCon of obj.connections) {
            if (!objHasMatchingKeys(objCon, dummyCon)) {
                return false;
            }
        }
    }
    return true;
}
function main() {
    const canvas = document.getElementById('my-canvas');
    if (canvas === null) {
        throw new Error("failed to get canvas context");
    }
    const app = new App(canvas);
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
        addSlider(app.nodeMinDist, 0, 10, 0.01, "nodeMinDist", (value) => { app.nodeMinDist = value; });
        addSlider(app.repulsion, 0, 10000, 1, "repulsion", (value) => { app.repulsion = value; });
        addSlider(app.spring, 0, 5, 0.0001, "spring", (value) => { app.spring = value; });
        addSlider(app.springDist, 1, 1000, 1, "springDist", (value) => { app.springDist = value; });
    }
    let prevTime;
    const onFrame = (timestamp) => {
        clearDebugPrint();
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
}
main();
