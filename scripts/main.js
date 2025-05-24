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
import * as color from "./color.js";
import { GpuComputeRenderer, SimulationParameter, DataSyncFlags } from "./gpu.js";
import { debugPrint, renderDebugPrint } from './debug_print.js';
import { NodeManager, DocNode, SerializationContainer, isSerializationContainer, } from "./graph_objects.js";
const FirstTitle = "English language";
class App {
    constructor(mainCanvas, overlayCanvas) {
        this.width = 0;
        this.height = 0;
        this.zoom = 1;
        this.offset = new math.Vector2(0, 0);
        this.globalTick = 0;
        this._updatingNodePositions = false;
        this._onNodePostionsUpdated = [];
        this._expandRequests = [];
        this._animations = new Map();
        // ========================
        // input states
        // ========================
        this.draggingCanvas = false;
        this.pDrag = new math.Vector2(0, 0);
        this.mouse = new math.Vector2(0, 0);
        this.pMouse = new math.Vector2(0, 0);
        this.isMouseDown = false;
        this.tappedPos = new math.Vector2(0, 0);
        this.isPinching = false;
        this.pinch = 0;
        this.pinchPos = new math.Vector2(0, 0);
        this.focusedNode = null;
        this.focusedTick = 0;
        // how long a user has to hold node
        // before we open the wikipedia link
        this.linkOpenDuration = 1000; // constant
        // ========================
        // simulation parameters
        // ========================
        this.simParam = new SimulationParameter();
        this._nodeVisibilityCache = [];
        this.expandNode = (nodeIndex) => __awaiter(this, void 0, void 0, function* () {
            if (!(0 <= nodeIndex && nodeIndex < this.nodeManager.nodes.length)) {
                console.error(`node id ${nodeIndex} out of bound`);
                return;
            }
            const node = this.nodeManager.nodes[nodeIndex];
            console.log(`requesting ${node.title}`);
            const request = {
                node: node,
                links: null,
                doneRequesting: false
            };
            node.isExpanding = true;
            this._expandRequests.push(request);
            try {
                const regex = / /g;
                const links = yield wiki.retrieveAllLiks(node.title.replace(regex, "_"));
                request.links = links;
            }
            catch (err) {
                console.error(err);
            }
            finally {
                request.doneRequesting = true;
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
        this.gpu.nodeOutlineColor = new color.Color(255, 255, 255, 255);
        this.gpu.nodeOutlineWidth = 2;
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
        testNode.renderX = this.width / 2;
        testNode.renderY = this.height / 2;
        testNode.title = FirstTitle;
        testNode.color = color.getRandomColor();
        testNode.color.a = 255;
        this.nodeManager.pushNode(testNode);
        // TEST TEST TEST TEST
        this.gpu.submitNodeManager(this.nodeManager, DataSyncFlags.Everything);
    }
    handleEvent(e) {
        const focusLoseDist = 50;
        const unfocusNode = () => {
            if (this.focusedNode === null) {
                return;
            }
            this.focusedNode.syncedToRender = false;
            this.gpu.submitNodeManager(this.nodeManager, DataSyncFlags.NodeRenderPos);
            this.focusedNode = null;
        };
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
            this.tappedPos.x = x;
            this.tappedPos.y = y;
            // focus on node if we clicked
            this.focusedNode = this.getNodeUnderCursor(x, y);
            if (this.focusedNode !== null) {
                this.focusedNode.syncedToRender = true;
                this.focusedTick = this.globalTick;
                this.gpu.submitNodeManager(this.nodeManager, DataSyncFlags.NodeRenderPos);
                let quit = false;
                const node = this.focusedNode;
                const prevMass = node.mass;
                let ogRadius = node.getRadius();
                let radius = node.getRadius();
                // add node animation
                const update = (deltaTime) => {
                    const clickMinRadius = 50;
                    const expandMinRadius = 70;
                    let isFocused = true;
                    if (this.focusedNode === null) {
                        isFocused = false;
                    }
                    else if (this.focusedNode.id !== node.id) {
                        isFocused = false;
                    }
                    let isExpanding = node.isExpanding;
                    let gotBigger = node.mass > prevMass;
                    let targetRadius = ogRadius;
                    if (isFocused) {
                        targetRadius = Math.max(clickMinRadius, ogRadius);
                    }
                    if (isExpanding) {
                        targetRadius = Math.max(expandMinRadius, ogRadius);
                    }
                    if (gotBigger) {
                        targetRadius = node.getRadius();
                    }
                    const newRadius = math.lerp(radius, targetRadius, 0.2);
                    const scale = newRadius / node.getRadius();
                    node.renderRadiusScale = scale;
                    radius = newRadius;
                    if (!isFocused && !isExpanding && math.prettySame(radius, node.getRadius())) {
                        node.renderRadiusScale = 1;
                        quit = true;
                    }
                };
                const didEnd = () => {
                    return quit;
                };
                const skip = () => {
                    node.renderRadiusScale = 1;
                };
                let anim = {
                    update: update,
                    didEnd: didEnd,
                    skip: skip
                };
                this.addNodeAnimation(this.focusedNode.id, anim);
            }
        };
        const handlePointerMove = (x, y) => {
            if (this.draggingCanvas) {
                doDrag(x, y);
            }
            if (this.focusedNode !== null) {
                // if user moved cursor too much
                // unpin the node
                const dist = math.dist(x - this.tappedPos.x, y - this.tappedPos.y);
                if (dist > focusLoseDist) {
                    unfocusNode();
                }
            }
        };
        const handlePointerUp = () => {
            if (this.focusedNode !== null) {
                // expand node
                const nodeIndex = this.nodeManager.getIndexFromId(this.focusedNode.id);
                this.expandNode(nodeIndex);
                unfocusNode();
            }
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
                    console.log(mouseEvent);
                    // TEST TEST TEST TEST
                    if (mouseEvent.button === 1) {
                        // if (this.draggingNode === null) {
                        //     const node = this.getNodeUnderCursor(this.mouse.x, this.mouse.y)
                        //     if (node !== null) {
                        //         this.draggingNode = node
                        //         this.draggingNode.syncedToRender = true
                        //     }
                        // } else {
                        //     this.draggingNode = null
                        // }
                        // break
                        const node = this.getNodeUnderCursor(this.mouse.x, this.mouse.y);
                        if (node !== null) {
                            wiki.openWikipedia(node.title);
                        }
                        break;
                    }
                    // TEST TEST TEST TEST
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
                    unfocusNode();
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
                        unfocusNode();
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
                        unfocusNode();
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
        this.globalTick += deltaTime;
        // debug print stuff
        {
            let estimate = 1000.0 / deltaTime;
            debugPrint('FPS', Math.round(estimate).toString());
        }
        debugPrint('node count', this.nodeManager.nodes.length.toString());
        debugPrint('connection count', this.nodeManager.connections.length.toString());
        debugPrint('zoom', this.zoom.toFixed(2));
        debugPrint('animation count', this._animations.size.toString());
        // ================================
        // handle expand requests
        // ================================
        {
            let finished = [];
            let unfinished = [];
            for (const req of this._expandRequests) {
                if (req.doneRequesting) {
                    finished.push(req);
                }
                else {
                    unfinished.push(req);
                }
            }
            // =======================================
            // actually add nodes from links we got
            // =======================================
            for (const req of finished) {
                this.onNodePositionUpdated(() => {
                    if (req.links === null) {
                        return;
                    }
                    const angle = Math.PI * 2 / req.links.length;
                    // not an accurate mass of node that will expand
                    // but good enough
                    const offsetV = { x: 0, y: -(100 + DocNode.nodeMassToRadius(req.node.mass + req.links.length)) };
                    let index = this.nodeManager.getIndexFromId(req.node.id);
                    for (let i = 0; i < req.links.length; i++) {
                        const link = req.links[i];
                        const otherIndex = this.nodeManager.findNodeFromTitle(link);
                        if (index === otherIndex) {
                            continue;
                        }
                        if (otherIndex < 0) { // we have to make a new node
                            const newNode = new DocNode();
                            const newNodeIndex = this.nodeManager.nodes.length;
                            newNode.title = link;
                            const v = math.vector2Rotate(offsetV, angle * i);
                            newNode.posX = req.node.posX + v.x;
                            newNode.posY = req.node.posY + v.y;
                            newNode.renderX = newNode.posX;
                            newNode.renderY = newNode.posY;
                            this.nodeManager.pushNode(newNode);
                            this.nodeManager.setConnected(index, newNodeIndex, true);
                            req.node.mass += 1;
                            newNode.mass += 1;
                            // TEST TEST TEST TEST TEST
                            newNode.color = color.getRandomColor();
                            newNode.color.a = 255;
                            // TEST TEST TEST TEST TEST
                        }
                        else if (!this.nodeManager.isConnected(index, otherIndex)) { // we have to make a new connection
                            const otherNode = this.nodeManager.nodes[otherIndex];
                            this.nodeManager.setConnected(index, otherIndex, true);
                            req.node.mass += 1;
                            otherNode.mass += 1;
                        }
                    }
                    this.gpu.submitNodeManager(this.nodeManager, DataSyncFlags.Everything);
                });
            }
            // =====================================================
            // nodes with finished request are no longer expanding
            // =====================================================
            for (const req of finished) {
                req.node.isExpanding = false;
            }
            this._expandRequests = unfinished;
        }
        // ================================
        // node position updating
        // ================================
        if (!this._updatingNodePositions) {
            this._updatingNodePositions = true;
            this.gpu.updateNodePhysicsToNodeManager(this.nodeManager).then(() => {
                this._updatingNodePositions = false;
                for (const cb of this._onNodePostionsUpdated) {
                    cb();
                }
                this._onNodePostionsUpdated.length = 0;
            });
        }
        // ================================
        // update node render positions
        // ================================
        for (let i = 0; i < this.nodeManager.nodes.length; i++) {
            const node = this.nodeManager.nodes[i];
            if (node.syncedToRender) {
                continue;
            }
            let t1 = math.distSquared(node.renderX - node.posX, node.renderY - node.posY);
            let t2 = t1 / 50000.0;
            t2 = math.clamp(t2, 0, 0.2);
            const x = math.lerp(node.renderX, node.posX, t2);
            const y = math.lerp(node.renderY, node.posY, t2);
            node.renderX = x;
            node.renderY = y;
        }
        // ================================
        // update animations
        // ================================
        this._animations.forEach((anim, nodeId, _) => {
            anim.update(deltaTime);
            if (anim.didEnd()) {
                this._animations.delete(nodeId);
            }
        });
        // ================================
        // submit to gpu
        // ================================
        this.gpu.submitNodeManager(this.nodeManager, DataSyncFlags.NodeRenderPos);
        // ======================================
        // open wikipedia article
        // if user held on to node long enough
        // ======================================
        if (this.focusedNode !== null &&
            this.globalTick - this.focusedTick > this.linkOpenDuration) {
            wiki.openWikipedia(this.focusedNode.title);
            this.focusedNode = null;
        }
        this.gpu.zoom = this.zoom;
        this.gpu.offset.x = this.offset.x;
        this.gpu.offset.y = this.offset.y;
        this.gpu.mouse.x = this.mouse.x;
        this.gpu.mouse.y = this.mouse.y;
        this.gpu.globalTick = this.globalTick;
    }
    draw(deltaTime) {
        this.gpu.render();
        // =======================
        // cache node visibility
        // =======================
        {
            while (this._nodeVisibilityCache.length < this.nodeManager.nodes.length) {
                this._nodeVisibilityCache.push(false);
            }
            const viewMin = this.viewportToWorld(0, 0);
            const viewMax = this.viewportToWorld(this.width, this.height);
            const vx = viewMax.x - viewMin.x;
            const vy = viewMax.y - viewMin.y;
            viewMin.x -= vx * 0.5;
            viewMax.x += vx * 0.5;
            viewMin.y -= vy * 0.5;
            viewMax.y += vy * 0.5;
            for (let i = 0; i < this.nodeManager.nodes.length; i++) {
                const node = this.nodeManager.nodes[i];
                const radius = node.getRenderRadius();
                const minX = node.posX - radius;
                const maxX = node.posX + radius;
                const minY = node.posY - radius;
                const maxY = node.posY + radius;
                if (math.boxIntersects(minX, minY, maxX, maxY, viewMin.x, viewMin.y, viewMax.x, viewMax.y)) {
                    this._nodeVisibilityCache[i] = true;
                }
                else {
                    this._nodeVisibilityCache[i] = false;
                }
            }
        }
        const forVisibleNodes = (f) => {
            for (let i = 0; i < this.nodeManager.nodes.length; i++) {
                if (this._nodeVisibilityCache[i]) {
                    f(this.nodeManager.nodes[i]);
                }
            }
        };
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        // =========================
        // draw loading circle
        // =========================
        this.overlayCtx.resetTransform();
        if (assets.loadingCircleImage !== null) {
            this.overlayCtx.resetTransform();
            forVisibleNodes((node) => {
                if (node.isExpanding) {
                    const image = assets.loadingCircleImage;
                    this.overlayCtx.resetTransform();
                    const pos = this.worldToViewport(node.renderX, node.renderY);
                    this.overlayCtx.translate(pos.x, pos.y);
                    let scaleX = node.getRenderRadius() * this.zoom / (image.width * 0.5);
                    let scaleY = node.getRenderRadius() * this.zoom / (image.height * 0.5);
                    this.overlayCtx.scale(scaleX, scaleY);
                    this.overlayCtx.rotate(this.globalTick * 0.008);
                    this.overlayCtx.drawImage(image, -image.width * 0.5, -image.height * 0.5);
                }
            });
        }
        this.overlayCtx.resetTransform();
        // =========================
        // draw link open timer
        // =========================
        if (this.focusedNode !== null) {
            let tickSinceFocused = this.globalTick - this.focusedTick;
            if (tickSinceFocused > this.linkOpenDuration * 0.1) {
                tickSinceFocused -= this.linkOpenDuration * 0.1;
                this.overlayCtx.beginPath();
                const pos = this.worldToViewport(this.focusedNode.renderX, this.focusedNode.renderY);
                let lineWidth = this.focusedNode.getRenderRadius() * 0.4;
                this.overlayCtx.lineWidth = lineWidth * this.zoom;
                this.overlayCtx.lineCap = 'round';
                this.overlayCtx.strokeStyle = 'black';
                this.overlayCtx.arc(pos.x, pos.y, (this.focusedNode.getRenderRadius() + lineWidth * 0.5 + 2) * this.zoom, 0 - Math.PI * 0.5, (tickSinceFocused / (this.linkOpenDuration * 0.9)) * Math.PI * 2 - Math.PI * 0.5);
                this.overlayCtx.stroke();
            }
        }
        // =========================
        // draw texts
        // =========================
        this.overlayCtx.fillStyle = "black";
        this.overlayCtx.strokeStyle = "white";
        this.overlayCtx.lineWidth = 3 * this.zoom;
        this.overlayCtx.textAlign = "center";
        //this.overlayCtx.textRendering = "optimizeSpeed"
        this.overlayCtx.textBaseline = "bottom";
        forVisibleNodes((node) => {
            let fontSize = this.zoom * 12;
            if (node.mass > 20) {
                fontSize = 12;
            }
            if (this.zoom > 0.3 || node.mass > 20) {
                this.overlayCtx.font = `${fontSize}px sans-serif`;
                const pos = this.worldToViewport(node.renderX, node.renderY);
                this.overlayCtx.strokeText(node.title, pos.x, pos.y - (node.getRenderRadius() + 5.0) * this.zoom);
                this.overlayCtx.fillText(node.title, pos.x, pos.y - (node.getRenderRadius() + 5.0) * this.zoom);
            }
        });
    }
    addNodeAnimation(nodeId, anim) {
        if (this._animations.has(nodeId)) {
            const anim = this._animations.get(nodeId);
            anim.skip();
        }
        this._animations.set(nodeId, anim);
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
    getNodeUnderCursor(x, y) {
        let pos = this.viewportToWorld(x, y);
        for (let i = 0; i < this.nodeManager.nodes.length; i++) {
            const node = this.nodeManager.nodes[i];
            if (math.posInCircle(pos.x, pos.y, node.renderX, node.renderY, node.getRenderRadius())) {
                return node;
            }
        }
        return null;
    }
    serialize() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.gpu.updateNodePhysicsToNodeManager(this.nodeManager);
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
        });
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
                nodeCopy.renderX = node.posX;
                nodeCopy.renderY = node.posY;
                nodeCopy.title = node.title;
                nodeCopy.mass = 1;
                // TEST TEST TEST TEST TEST
                nodeCopy.color = color.getRandomColor();
                nodeCopy.color.a = 255;
                // TEST TEST TEST TEST TEST
                this.nodeManager.pushNode(nodeCopy);
            }
            // add mass to node if connected
            for (const con of container.connections) {
                const nodeA = this.nodeManager.nodes[con.nodeIndexA];
                const nodeB = this.nodeManager.nodes[con.nodeIndexB];
                nodeA.mass += 1;
                nodeB.mass += 1;
            }
            for (const con of container.connections) {
                this.nodeManager.setConnected(con.nodeIndexA, con.nodeIndexB, true);
            }
            this.offset.x = container.offsetX;
            this.offset.y = container.offsetY;
            this.zoom = container.zoom;
            this.gpu.submitNodeManager(this.nodeManager, DataSyncFlags.Everything);
        }
        catch (err) {
            console.error(err);
        }
    }
    onNodePositionUpdated(cb) {
        this._onNodePostionsUpdated.push(cb);
    }
    reset(addStartingNode) {
        this._onNodePostionsUpdated.length = 0;
        this._expandRequests.length = 0;
        this._animations.clear();
        this.offset.x = 0;
        this.offset.y = 0;
        this.zoom = 1;
        this.nodeManager.reset();
        this.focusedNode = null;
        if (addStartingNode) {
            // TEST TEST TEST TEST
            const testNode = new DocNode();
            testNode.posX = this.width / 2;
            testNode.posY = this.height / 2;
            testNode.renderX = this.width / 2;
            testNode.renderY = this.height / 2;
            testNode.title = FirstTitle;
            testNode.color = color.getRandomColor();
            testNode.color.a = 255;
            this.nodeManager.pushNode(testNode);
            // TEST TEST TEST TEST
        }
        this.gpu.submitNodeManager(this.nodeManager, DataSyncFlags.Everything);
    }
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
            downloadButton.onclick = () => __awaiter(this, void 0, void 0, function* () {
                const jsonString = yield app.serialize();
                util.saveBlob(new Blob([jsonString], { type: 'application/json' }), 'graph.json');
            });
            const uploadInput = document.getElementById('upload-input');
            uploadInput.onclick = () => {
                uploadInput.value = "";
            };
            uploadInput.addEventListener('input', (ev) => __awaiter(this, void 0, void 0, function* () {
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
            addSlider(5, 0, 50, 0.0001, "spring", (value) => { app.simParam.spring = value; });
            addSlider(600, 1, 1000, 1, "springDist", (value) => { app.simParam.springDist = value; });
            addSlider(100, 1, 1000, 1, "forceCap", (value) => { app.simParam.forceCap = value; });
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
