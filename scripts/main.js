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
import { GpuRenderer, RenderSyncFlags, RenderParameter } from "./gpu_render.js";
import { GpuSimulator, SimulationParameter, } from "./gpu_simulate.js";
import { 
//clearDebugPrint,
debugPrint, renderDebugPrint, setDebugPrintVisible,
//isDebugPrintVisible,
 } from './debug_print.js';
import { 
// printError,
updateErrorMsgs } from './error_print.js';
import { ColorTable, serializeColorTable, deserializeColorTable, loadColorTable, tableNodeColors, copyTable } from "./color_table.js";
import { NodeManager, DocNode, 
//NodeConnection,
//DocNodeContainer,
//NodeConnectionContainer,
SerializationContainer, isSerializationContainer, } from "./graph_objects.js";
//@ts-expect-error
import IS_DEBUG from "./debug.js";
const FirstTitle = "English language";
class AppUI {
    constructor() {
        this.languageSelectLabelSet = false;
        this.onTextInput = null;
        this.onTextCommit = null;
        this.mainUIContainer = util.mustGetElementById('main-ui-container');
        this.textInput = util.mustGetElementById('search-bar-text');
        this.searchToggle = util.mustGetElementById('search-toggle');
        this.languageSelect = util.mustGetElementById('language-select');
        this.languageSelectLabel = util.mustGetElementById('language-select-label');
        // add callbacks
        this.textInput.addEventListener('input', () => {
            if (this.onTextInput !== null) {
                this.onTextInput(this.textInput.value);
            }
        });
        const form = util.mustGetElementById('search-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.blur();
            if (this.onTextCommit !== null) {
                this.onTextCommit(this.textInput.value);
            }
            util.mustGetElementById('main-ui-container').blur();
        });
        this.languageSelect.addEventListener('change', () => {
            this.languageSelectLabel.innerText = this.languageSelect.value.toUpperCase();
        });
        const lsContainer = util.mustGetElementById('language-select-container');
        lsContainer.style.display = 'none';
        const span = util.mustGetElementById('search-toggle-span');
        span.innerText = 'search graph';
        this.searchToggle.addEventListener('change', () => {
            if (this.searchToggle.checked) {
                lsContainer.style.display = 'flex';
                span.innerText = 'search wikipedia';
            }
            else {
                lsContainer.style.display = 'none';
                span.innerText = 'search graph';
            }
        });
    }
    addLangOption(site) {
        const opt = document.createElement('option');
        opt.value = site.code;
        opt.innerText = site.name;
        this.languageSelect.appendChild(opt);
        if (!this.languageSelectLabelSet) {
            this.languageSelectLabel.innerText = site.code.toUpperCase();
            this.languageSelectLabelSet = true;
        }
    }
    selectedLangeCode() {
        return this.languageSelect.value;
    }
    shouldDoWikiSearch() {
        return this.searchToggle.checked;
    }
    blur() {
        const toRecurse = (e) => {
            e.blur();
            //@ts-expect-error
            for (const child of e.children) {
                toRecurse(child);
            }
        };
        toRecurse(this.mainUIContainer);
    }
}
class App {
    constructor(mainCanvas, overlayCanvas, simCanvas) {
        this.dpiAdujustScaleX = 2;
        this.dpiAdujustScaleY = 2;
        // ==========================
        // UI stuff
        // ==========================
        this.appUI = new AppUI();
        this.renderParam = new RenderParameter();
        this.simParam = new SimulationParameter();
        // ==========================
        // viewport stuff
        // ==========================
        this.width = 0;
        this.height = 0;
        this.zoom = 1;
        this.offset = new math.Vector2(0, 0);
        // ==========================
        // simulation stuff
        // ==========================
        this._simulating = false;
        this._doingBeforeSimCBs = false;
        this._beforeSimCBs = [];
        this._doingAfterSimCBS = false;
        this._afterSimCBS = [];
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
        this._focusedNode = null;
        this.focusedTick = 0;
        // ========================
        // misc
        // ========================
        this.globalTick = 0;
        this._expandRequests = [];
        this.colorTable = new ColorTable();
        this._highlightedNodes = new util.Stack();
        this._isNodeHighlighted = new Array();
        this.currentWiki = new wiki.WikipediSite("en", "English", "English");
        this.wikiSites = [this.currentWiki];
        // how long a user has to hold node
        // before we open the wikipedia link
        this.linkOpenDuration = 1000; // constant
        this._visibleNodesCache = new util.Stack();
        this._visibleAndOnTopNodesCache = new util.Stack();
        this._visibleAndHLNodesCache = new util.Stack();
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
            this._expandRequests.push(request);
            try {
                const regex = / /g;
                const links = yield wiki.retrieveAllLiks(this.currentWiki, node.title.replace(regex, "_"));
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
        this.renderParam.colorTable = this.colorTable;
        this.renderParam.nodeOutlineWidth = 3;
        this.renderParam.connectionLineWidth = 1.2;
        this.gpuRenderer = new GpuRenderer(this.mainCanvas);
        this.gpuRenderer.renderParam = this.renderParam;
        this.gpuSimulator = new GpuSimulator(simCanvas);
        this.gpuSimulator.simParam = this.simParam;
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
        this.gpuSimulator.submitNodeManager(this.nodeManager);
        this.gpuRenderer.submitNodeManager(this.nodeManager, RenderSyncFlags.Everything);
        // get UI elements
        // {
        //     const textInput = document.getElementById('text-input')
        //     const searchButton = document.getElementById('search-button')
        //     const resetButton = document.getElementById('reset-button')
        //     const languageSelect = document.getElementById('wiki-language-select')
        //
        //     if (textInput === null) { throw new Error('failed to get text-input') }
        //     if (searchButton === null) { throw new Error('failed to get search-button') }
        //     if (resetButton === null) { throw new Error('failed to get reset-button') }
        //     if (languageSelect === null) { throw new Error('failed to get wiki-language-select') }
        //
        //     this.textInput = textInput as HTMLInputElement
        //     this.searchButton = searchButton as HTMLButtonElement
        //     this.resetButton = resetButton as HTMLButtonElement
        //     this.languageSelect = languageSelect as HTMLSelectElement
        // }
        // this.textInput.addEventListener('input', () => {
        //     if (this.textInput.value.length <= 0) {
        //         this.clearHighlights()
        //     }
        // })
        this.appUI.onTextInput = (str) => {
            if (str.length <= 0) {
                this.clearNodeHighlights();
            }
        };
        this.appUI.onTextCommit = (str) => {
            if (this.appUI.shouldDoWikiSearch()) {
                this.doWikiSearch(str);
            }
            else {
                this.doSearch(str);
            }
        };
        for (const site of this.wikiSites) {
            this.appUI.addLangOption(site);
        }
        wiki.getWikipediaSites().then((sites) => {
            const siteMap = new Map();
            for (const site of this.wikiSites) {
                siteMap.set(site.code, site);
            }
            for (const site of sites) {
                if (!siteMap.has(site.code)) {
                    this.wikiSites.push(site);
                    this.appUI.addLangOption(site);
                }
            }
            console.log(this.wikiSites);
        }).catch((err) => {
            console.log(err);
        });
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
        // debugPrint('animation count', this._animations.size.toString())
        debugPrint('do hover', this.renderParam.doHover.toString());
        // ================================
        // reset node attributes
        // ================================
        for (const node of this.nodeManager.nodes) {
            node.glowMin = 0;
            node.renderRadiusMin = 0;
            node.drawOnTop = false;
        }
        // ================================
        // node position updating
        // ================================
        debugPrint('before cb count', this._beforeSimCBs.length.toString());
        if (!this._simulating) {
            this._doingBeforeSimCBs = true;
            for (const cb of this._beforeSimCBs) {
                cb();
            }
            this._doingBeforeSimCBs = false;
            this._beforeSimCBs.length = 0;
            this._simulating = true;
            this.gpuSimulator.simulatePhysics(this.nodeManager).then(() => {
                this._simulating = false;
                this._doingAfterSimCBS = true;
                for (const cb of this._afterSimCBS) {
                    cb();
                }
                this._doingAfterSimCBS = false;
                this._afterSimCBS.length = 0;
            });
        }
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
            if (finished.length > 0) {
                this.beforeSimulation(() => {
                    for (const req of finished) {
                        if (req.links === null) {
                            continue;
                        }
                        const angle = Math.PI * 2 / req.links.length;
                        // not an accurate mass of node that will expand
                        // but good enough
                        const offsetV = { x: 0, y: -(100 + DocNode.nodeMassToRadius(req.node.mass + req.links.length)) };
                        let index = req.node.index;
                        const colorGenerator = this.getConnectedNodeColorGenerator(req.node.color);
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
                                newNode.renderRadius = newNode.getRadius();
                                newNode.color = colorGenerator();
                            }
                            else {
                                const otherNode = this.nodeManager.nodes[otherIndex];
                                // we have to make a new connection
                                if (!this.nodeManager.isConnected(index, otherIndex)) {
                                    this.nodeManager.setConnected(index, otherIndex, true);
                                    req.node.mass += 1;
                                    otherNode.mass += 1;
                                }
                            }
                        }
                        // ==========================
                        // make connected nodes glow
                        // ==========================
                        req.node.glow = 1;
                        for (const node of this.nodeManager.nodes) {
                            if (this.nodeManager.isConnected(req.node.index, node.index)) {
                                node.glow = 1;
                            }
                        }
                        // ==========================
                        // submit to gpu
                        // ==========================
                        this.gpuSimulator.submitNodeManager(this.nodeManager);
                        this.gpuRenderer.submitNodeManager(this.nodeManager, RenderSyncFlags.Everything);
                    }
                });
            }
            this._expandRequests = unfinished;
        }
        // ======================================
        // open wikipedia article
        // if user held on to node long enough
        // ======================================
        {
            const focusedNode = this.focusedNode();
            if (focusedNode !== null &&
                this.globalTick - this.focusedTick > this.linkOpenDuration) {
                try {
                    wiki.openWikipedia(this.currentWiki, focusedNode.title);
                }
                catch (err) {
                    // TODO: we should report this to our user as well.
                    // not just to console
                    console.error(`failed to open a page to ${focusedNode.title}`);
                }
                this.unfocusNode();
            }
        }
        // ================================
        // focused node styling
        // ================================
        {
            const focusedNode = this.focusedNode();
            if (focusedNode !== null) {
                focusedNode.wishRenderRadius(90);
                focusedNode.wishDrawOnTop();
            }
        }
        // =================================
        // expanding nodes styling
        // =================================
        for (const req of this._expandRequests) {
            req.node.wishRenderRadius(120);
            req.node.wishDrawOnTop();
        }
        // =================================
        // expanding nodes styling
        // =================================
        for (let i = 0; i < this._highlightedNodes.length; i++) {
            const node = this._highlightedNodes.peekAt(i);
            node.wishGlow(0.6);
        }
        // ================================
        // update nodes
        // ================================
        for (let i = 0; i < this.nodeManager.nodes.length; i++) {
            const node = this.nodeManager.nodes[i];
            if (!node.syncedToRender) {
                let t1 = math.distSquared(node.renderX - node.posX, node.renderY - node.posY);
                let t2 = t1 / 50000.0;
                t2 = math.clamp(t2, 0, 0.2);
                const x = math.lerp(node.renderX, node.posX, t2);
                const y = math.lerp(node.renderY, node.posY, t2);
                node.renderX = x;
                node.renderY = y;
            }
            // update node glow
            {
                let newGlow = math.lerp(Math.max(0, node.glowMin), node.glow, 0.995);
                node.glow = newGlow;
                node.glow = math.clamp(node.glow, 0, 1);
            }
            // update node render radius
            {
                let newRadius = math.lerp(Math.max(node.renderRadiusMin, node.getRadius()), node.renderRadius, 0.8);
                node.renderRadius = newRadius;
            }
        }
        // ================================
        // submit to gpu
        // ================================
        this.gpuRenderer.submitNodeManager(this.nodeManager, RenderSyncFlags.NodeRenderPosAndOrder);
        this.renderParam.zoom = this.zoom;
        this.renderParam.offset.x = this.offset.x;
        this.renderParam.offset.y = this.offset.y;
        this.renderParam.mouse.x = this.mouse.x;
        this.renderParam.mouse.y = this.mouse.y;
    }
    draw(deltaTime) {
        this.gpuRenderer.render();
        // =======================
        // cache stuff
        // =======================
        {
            this._visibleNodesCache.clear();
            this._visibleAndOnTopNodesCache.clear();
            this._visibleAndHLNodesCache.clear();
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
                // check if node is in viewport
                {
                    const radius = node.renderRadius;
                    const minX = node.posX - radius;
                    const maxX = node.posX + radius;
                    const minY = node.posY - radius;
                    const maxY = node.posY + radius;
                    if (math.boxIntersects(minX, minY, maxX, maxY, viewMin.x, viewMin.y, viewMax.x, viewMax.y)) {
                        this._visibleNodesCache.push(node);
                    }
                    // check if node is on top
                    if (node.drawOnTop) {
                        this._visibleAndOnTopNodesCache.push(node);
                    }
                    if (this.isNodeHighlighted(node)) {
                        this._visibleAndHLNodesCache.push(node);
                    }
                }
            }
        }
        const forVisibleNodes = (f) => {
            for (let i = 0; i < this._visibleNodesCache.length; i++) {
                f(this._visibleNodesCache.peekAt(i));
            }
        };
        const forNodesOnTop = (f) => {
            for (let i = 0; i < this._visibleAndOnTopNodesCache.length; i++) {
                f(this._visibleAndOnTopNodesCache.peekAt(i));
            }
        };
        const forHighlightedNodes = (f) => {
            for (let i = 0; i < this._visibleAndHLNodesCache.length; i++) {
                f(this._visibleAndHLNodesCache.peekAt(i));
            }
        };
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        this.resetTransform();
        // =========================
        // draw loading circle
        // =========================
        if (assets.loadingCircleImage !== null) {
            this.resetTransform();
            for (const req of this._expandRequests) {
                const node = req.node;
                const image = assets.loadingCircleImage;
                this.resetTransform();
                const pos = this.worldToViewport(node.renderX, node.renderY);
                this.overlayCtx.translate(pos.x, pos.y);
                let scaleX = node.renderRadius * this.zoom / (image.width * 0.5);
                let scaleY = node.renderRadius * this.zoom / (image.height * 0.5);
                this.overlayCtx.scale(scaleX, scaleY);
                this.overlayCtx.rotate(this.globalTick * 0.008);
                this.overlayCtx.drawImage(image, -image.width * 0.5, -image.height * 0.5);
            }
        }
        this.resetTransform();
        // =========================
        // draw link open timer
        // =========================
        {
            const focusedNode = this.focusedNode();
            if (focusedNode !== null) {
                let tickSinceFocused = this.globalTick - this.focusedTick;
                if (tickSinceFocused > this.linkOpenDuration * 0.1) {
                    tickSinceFocused -= this.linkOpenDuration * 0.1;
                    this.overlayCtx.beginPath();
                    const pos = this.worldToViewport(focusedNode.renderX, focusedNode.renderY);
                    let lineWidth = focusedNode.renderRadius * 0.4;
                    this.overlayCtx.lineWidth = lineWidth * this.zoom;
                    this.overlayCtx.lineCap = 'round';
                    this.overlayCtx.strokeStyle = this.colorTable.timerStroke.toCssString();
                    this.overlayCtx.arc(pos.x, pos.y, (focusedNode.renderRadius + lineWidth * 0.5 + 2) * this.zoom, 0 - Math.PI * 0.5, (tickSinceFocused / (this.linkOpenDuration * 0.9)) * Math.PI * 2 - Math.PI * 0.5);
                    this.overlayCtx.stroke();
                }
            }
        }
        // =========================
        // draw texts
        // =========================
        this.overlayCtx.fillStyle = this.colorTable.titleTextFill.toCssString();
        this.overlayCtx.strokeStyle = this.colorTable.titleTextStroke.toCssString();
        this.overlayCtx.textAlign = "center";
        this.overlayCtx.textBaseline = "bottom";
        this.overlayCtx.lineJoin = 'round';
        const drawText = (node, ignoreZoom) => {
            let fontSize = this.zoom * 14;
            this.overlayCtx.lineWidth = this.zoom * 4;
            if (ignoreZoom) {
                fontSize = 12;
                this.overlayCtx.lineWidth = 4;
            }
            this.overlayCtx.font = `bold ${fontSize}px sans-serif`;
            const pos = this.worldToViewport(node.renderX, node.renderY);
            this.overlayCtx.strokeText(node.title, pos.x, pos.y - (node.renderRadius + 5.0) * this.zoom);
            this.overlayCtx.fillText(node.title, pos.x, pos.y - (node.renderRadius + 5.0) * this.zoom);
        };
        forVisibleNodes((node) => {
            if (node.drawOnTop || this.isNodeHighlighted(node)) {
                return;
            }
            if (this.zoom > 0.3 || node.mass > 20) {
                drawText(node, node.mass > 20);
            }
        });
        forNodesOnTop((node) => {
            if (this.isNodeHighlighted(node)) {
                return;
            }
            if (this.zoom > 0.3 || node.mass > 20) {
                drawText(node, node.mass > 20);
            }
        });
        this.overlayCtx.fillStyle = this.colorTable.titleHLTextFill.toCssString();
        this.overlayCtx.strokeStyle = this.colorTable.titleHLTextStroke.toCssString();
        forHighlightedNodes((node) => {
            drawText(node, true);
        });
    }
    handleEvent(e) {
        const focusLoseDist = 50;
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
            var _a, _b, _c, _d, _e;
            // unfocus ui
            {
                // unselect texts
                // copy pasted from https://stackoverflow.com/questions/6562727/is-there-a-function-to-deselect-all-text-using-javascript
                if (window.getSelection) {
                    (_c = (_b = (_a = window.getSelection) === null || _a === void 0 ? void 0 : _a.call(window)) === null || _b === void 0 ? void 0 : _b.removeAllRanges) === null || _c === void 0 ? void 0 : _c.call(_b);
                    //@ts-expect-error
                }
                else if (document.selection) {
                    //@ts-expect-error
                    (_e = (_d = document.selection) === null || _d === void 0 ? void 0 : _d.empty) === null || _e === void 0 ? void 0 : _e.call(_d);
                }
                // unfocus UI elements
                this.appUI.blur();
            }
            startDragging(x, y);
            this.tappedPos.x = x;
            this.tappedPos.y = y;
            this.unfocusNode();
            // focus on node if we clicked
            const nodeUnderCurosor = this.getNodeUnderCursor(x, y);
            if (nodeUnderCurosor !== null) {
                this.focusOnNode(nodeUnderCurosor);
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
                    this.unfocusNode();
                }
            }
        };
        const handlePointerUp = () => {
            const focusedNode = this.focusedNode();
            if (focusedNode !== null) {
                // expand node
                const nodeIndex = focusedNode.index;
                this.expandNode(nodeIndex);
                this.unfocusNode();
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
                    //const mouseEvent = e as MouseEvent
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
                    this.unfocusNode();
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
                        this.unfocusNode();
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
                        this.unfocusNode();
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
        switch (e.type) {
            case "wheel":
            case "mousemove":
            case "mousedown":
            case "mouseup":
            case "mouseleave":
                this.renderParam.doHover = true;
                break;
            case "touchstart":
            case "touchmove":
            case "touchcancel":
            case "touchend":
                this.renderParam.doHover = false;
                break;
        }
    }
    updateWidthAndHeight() {
        const rect = this.mainCanvas.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
        this.mainCanvas.width = rect.width;
        this.mainCanvas.height = rect.height;
        // NOTE: https://stackoverflow.com/questions/19142993/how-draw-in-high-resolution-to-canvas-on-chrome-and-why-if-devicepixelratio
        this.overlayCanvas.width = Math.round(devicePixelRatio * rect.right)
            - Math.round(devicePixelRatio * rect.left);
        this.overlayCanvas.height = Math.round(devicePixelRatio * rect.bottom)
            - Math.round(devicePixelRatio * rect.top);
        this.dpiAdujustScaleX = this.overlayCanvas.width / this.width;
        this.dpiAdujustScaleY = this.overlayCanvas.height / this.height;
    }
    getNewNodeColor() {
        const nodeColors = tableNodeColors(this.colorTable);
        const c = nodeColors[math.randomBetweenInt(0, nodeColors.length - 1)];
        const hsv = color.colorToHSV(c);
        const variance = 0.1;
        hsv.hue += math.randomBetween(-Math.PI * variance, Math.PI * variance);
        hsv.saturation += math.randomBetween(-variance, variance);
        hsv.value += math.randomBetween(-variance, variance);
        return color.colorFromHSV(hsv.hue, hsv.saturation, hsv.value);
    }
    getConnectedNodeColorGenerator(nodeColor) {
        const nodeColors = tableNodeColors(this.colorTable);
        let closestColorIndex = 0;
        {
            let minDist = 69420;
            let hsv = color.colorToHSV(nodeColor);
            for (let i = 0; i < nodeColors.length; i++) {
                let candidate = nodeColors[i];
                let candidateHSV = color.colorToHSV(candidate);
                let dist = 0;
                dist += Math.abs(candidateHSV.hue - hsv.hue);
                dist += Math.abs(candidateHSV.saturation - hsv.saturation);
                dist += Math.abs(candidateHSV.value - hsv.value);
                if (dist < minDist) {
                    minDist = dist;
                    closestColorIndex = i;
                }
            }
        }
        let otherIndex = closestColorIndex + math.randomBetweenInt(1, nodeColors.length - 1);
        otherIndex = otherIndex % nodeColors.length;
        const hsv = color.colorToHSV(nodeColors[otherIndex]);
        return () => {
            let hue = hsv.hue;
            let saturation = hsv.saturation;
            let value = hsv.value;
            hue += math.randomBetween(-Math.PI * 0.1, Math.PI * 0.1);
            saturation += math.randomBetween(-0.15, 0.15);
            value += math.randomBetween(-0.2, 0.2);
            return color.colorFromHSV(hue, saturation, value);
        };
    }
    recolorWholeGraph() {
        let nodes = this.nodeManager.nodes.slice();
        nodes.sort((a, b) => {
            return b.mass - a.mass;
        });
        const alreadyColored = new Array(nodes.length).fill(false);
        if (nodes.length > 0) {
            nodes[0].color = this.getNewNodeColor();
            alreadyColored[0] = true;
        }
        //for (const node of nodes) {
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (node.mass <= 1) {
                break;
            }
            if (!alreadyColored[i]) {
                node.color = this.getNewNodeColor();
                alreadyColored[i] = true;
            }
            const generator = this.getConnectedNodeColorGenerator(node.color);
            //for (const otherNode of nodes) {
            for (let j = nodes.length - 1; j >= 0; j--) {
                const otherNode = nodes[j];
                if (otherNode.id === node.id) {
                    continue;
                }
                if (alreadyColored[j]) {
                    continue;
                }
                if (otherNode.mass >= node.mass) {
                    break;
                }
                if (this.nodeManager.isConnected(node.index, otherNode.index)) {
                    otherNode.color = generator();
                    alreadyColored[j] = true;
                }
            }
        }
        for (const colored of alreadyColored) {
            if (!colored) {
                console.error("some node hasn't been colored");
                break;
            }
        }
        this.gpuRenderer.submitNodeManager(this.nodeManager, RenderSyncFlags.NodeColors);
    }
    setColorTable(table) {
        copyTable(table, this.colorTable);
    }
    resetTransform() {
        this.overlayCtx.resetTransform();
        this.overlayCtx.scale(this.dpiAdujustScaleX, this.dpiAdujustScaleY);
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
    _ensureIsNodeHighlightedCap() {
        if (this._isNodeHighlighted.length < this.nodeManager.nodes.length) {
            let start = this._isNodeHighlighted.length;
            this._isNodeHighlighted.length = this.nodeManager.nodes.length;
            this._isNodeHighlighted.fill(false, start, this._isNodeHighlighted.length);
        }
    }
    isNodeHighlighted(node) {
        this._ensureIsNodeHighlightedCap();
        return this._isNodeHighlighted[node.index];
    }
    highlightNode(node) {
        if (this.isNodeHighlighted(node)) {
            return;
        }
        this._isNodeHighlighted[node.index] = true;
        this._highlightedNodes.push(node);
        node.mass = Math.max(node.mass, 100);
    }
    clearNodeHighlights() {
        if (this._highlightedNodes.length <= 0) {
            return;
        }
        this._isNodeHighlighted.fill(false);
        this._highlightedNodes.clear();
        for (const node of this.nodeManager.nodes) {
            node.mass = 0;
        }
        for (const con of this.nodeManager.connections) {
            this.nodeManager.nodes[con.nodeIndexA].mass++;
            this.nodeManager.nodes[con.nodeIndexB].mass++;
        }
    }
    getNodeUnderCursor(x, y) {
        let pos = this.viewportToWorld(x, y);
        for (let i = 0; i < this.nodeManager.nodes.length; i++) {
            const node = this.nodeManager.nodes[i];
            if (math.posInCircle(pos.x, pos.y, node.renderX, node.renderY, node.renderRadius)) {
                return node;
            }
        }
        return null;
    }
    doSearch(search) {
        this.clearNodeHighlights();
        if (search.length <= 0) {
            return;
        }
        search = search.toLowerCase();
        let maxDist = 2;
        if (search.length < 10) {
            maxDist = 1;
        }
        if (search.length < 5) {
            maxDist = 0;
        }
        for (const node of this.nodeManager.nodes) {
            const title = node.title.toLowerCase();
            const res = util.fuzzyMatch(title, search);
            if (res.distance <= maxDist) {
                console.log(node.title);
                this.highlightNode(node);
            }
        }
    }
    doWikiSearch(search) {
        this.clearNodeHighlights();
        if (search.length <= 0) {
            return;
        }
        let selectedSite = null;
        for (const site of this.wikiSites) {
            if (site.code === this.appUI.selectedLangeCode()) {
                selectedSite = site;
                break;
            }
        }
        if (selectedSite === null) {
            return;
        }
        wiki.searchWiki(selectedSite, search).then((result) => {
            if (result === null) {
                // TODO: we should tell users about this
                console.log(`no search result for ${search}`);
                return;
            }
            this.resetAndAddFirstNode(result);
            this.currentWiki = selectedSite;
        });
    }
    serialize() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.gpuSimulator.simulatePhysics(this.nodeManager);
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
        this.beforeSimulation(() => {
            try {
                const jsonObj = JSON.parse(jsonString);
                if (!isSerializationContainer(jsonObj)) {
                    throw new Error("json object is not a SerializationContainer");
                }
                const container = jsonObj;
                this.reset();
                for (const node of container.nodes) {
                    const nodeCopy = new DocNode();
                    nodeCopy.posX = node.posX;
                    nodeCopy.posY = node.posY;
                    nodeCopy.renderX = node.posX;
                    nodeCopy.renderY = node.posY;
                    nodeCopy.title = node.title;
                    nodeCopy.mass = 1;
                    nodeCopy.color = this.getNewNodeColor();
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
                // set node renderRadius
                for (const node of this.nodeManager.nodes) {
                    node.renderRadius = node.getRadius();
                }
                this.offset.x = container.offsetX;
                this.offset.y = container.offsetY;
                this.zoom = container.zoom;
                this.recolorWholeGraph();
                this.gpuSimulator.submitNodeManager(this.nodeManager);
                this.gpuRenderer.submitNodeManager(this.nodeManager, RenderSyncFlags.Everything);
            }
            catch (err) {
                console.error(err);
            }
        });
    }
    focusedNode() {
        return this._focusedNode;
    }
    focusOnNode(node) {
        if (this._focusedNode !== null) {
            this.unfocusNode();
        }
        this._focusedNode = node;
        this._focusedNode.syncedToRender = true;
        this.focusedTick = this.globalTick;
        this.gpuRenderer.submitNodeManager(this.nodeManager, RenderSyncFlags.NodeRenderPosAndOrder);
    }
    unfocusNode() {
        if (this._focusedNode === null) {
            return;
        }
        this._focusedNode.syncedToRender = false;
        this.gpuRenderer.submitNodeManager(this.nodeManager, RenderSyncFlags.NodeRenderPosAndOrder);
        this._focusedNode = null;
    }
    beforeSimulation(cb) {
        if (this._doingBeforeSimCBs) {
            cb();
        }
        else {
            this._beforeSimCBs.push(cb);
        }
    }
    afterSimulation(cb) {
        if (this._doingAfterSimCBS) {
            cb();
        }
        else {
            this._afterSimCBS.push(cb);
        }
    }
    reset() {
        this.beforeSimulation(() => {
            this._expandRequests.length = 0;
            this._highlightedNodes.length = 0;
            this._isNodeHighlighted.fill(false);
            this.offset.x = 0;
            this.offset.y = 0;
            this.zoom = 1;
            this.nodeManager.reset();
            this._focusedNode = null;
            this.gpuRenderer.submitNodeManager(this.nodeManager, RenderSyncFlags.Everything);
        });
    }
    resetAndAddFirstNode(title) {
        this.beforeSimulation(() => {
            this.reset();
            this.updateWidthAndHeight();
            const node = new DocNode();
            node.posX = this.width * 0.5;
            node.posY = this.height * 0.5;
            node.renderX = this.width * 0.5;
            node.renderY = this.height * 0.5;
            node.title = title;
            node.color = this.getNewNodeColor();
            node.renderRadius = node.getRadius();
            this.nodeManager.pushNode(node);
            this.gpuRenderer.submitNodeManager(this.nodeManager, RenderSyncFlags.Everything);
        });
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
        const simCanvas = document.getElementById('sim-canvas');
        if (simCanvas === null) {
            throw new Error("failed to get sim-canvas");
        }
        try {
            yield assets.loadAssets();
        }
        catch (err) {
            console.error(`failed to load assets: ${err}`);
        }
        const app = new App(mainCanvas, overlayCanvas, simCanvas);
        try {
            const table = yield loadColorTable('assets/color-table.table');
            app.setColorTable(table);
        }
        catch (err) {
            console.error(`failed to load color table: ${err}`);
        }
        // set up debug UI elements
        const setupDebugUI = () => {
            let debugUICounter = 0;
            let debugUIContainer = document.getElementById('debug-ui-container');
            if (debugUIContainer === null) {
                return;
            }
            if (!IS_DEBUG) {
                debugUIContainer.style.display = "none";
            }
            let debugUIdiv = document.createElement('div');
            debugUIContainer.appendChild(debugUIdiv);
            const getUIid = () => {
                debugUICounter++;
                return `debug-ui-id-${debugUICounter}`;
            };
            const addFileUpload = (accept, labelText, onValueChange) => {
                let div = document.createElement('div');
                div.classList.add('debug-ui-container');
                const id = getUIid();
                let label = document.createElement('label');
                label.innerText = `${labelText} `;
                label.htmlFor = id;
                let input = document.createElement('input');
                input.type = 'file';
                input.accept = accept;
                input.id = id;
                input.onclick = () => {
                    input.value = "";
                };
                input.addEventListener('input', (ev) => __awaiter(this, void 0, void 0, function* () {
                    if (input.files !== null) {
                        onValueChange(input.files);
                    }
                }));
                div.appendChild(label);
                div.appendChild(input);
                debugUIdiv.appendChild(div);
            };
            const addSlider = (startingValue, min, max, step, labelText, onValueChange) => {
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
                let div = document.createElement('div');
                div.classList.add('debug-ui-container');
                let button = document.createElement('button');
                button.innerText = text;
                button.onclick = onclick;
                div.appendChild(button);
                debugUIdiv.appendChild(div);
            };
            const addColorPicker = (startingValue, labelText, onValueChange) => {
                let labelDiv = document.createElement('div');
                labelDiv.classList.add('debug-ui-container');
                let label = document.createElement('label');
                label.innerText = ` ${labelText}: #${startingValue.toHexString()}`;
                labelDiv.appendChild(label);
                let inputDiv = document.createElement('div');
                inputDiv.classList.add('debug-ui-container');
                let colorInput = document.createElement('input');
                colorInput.type = 'color';
                colorInput.value = startingValue.toString();
                let alphaInput = document.createElement('input');
                alphaInput.type = 'range';
                alphaInput.min = '0';
                alphaInput.max = '255';
                alphaInput.step = '1';
                const setToColor = (c) => {
                    colorInput.value = '#' + c.toHexString().substring(0, 6);
                    alphaInput.value = c.a.toString();
                };
                setToColor(startingValue);
                const getInputColor = () => {
                    let alpha = parseInt(alphaInput.value);
                    let alphaStr = alpha.toString(16);
                    if (alphaStr.length < 2) {
                        alphaStr = '0' + alphaStr;
                    }
                    return new color.Color().setFromHexString(colorInput.value.substring(1) + alphaStr);
                };
                colorInput.addEventListener('input', (ev) => __awaiter(this, void 0, void 0, function* () {
                    const val = getInputColor();
                    label.innerText = ` ${labelText}: #${val.toHexString()}`;
                    onValueChange(val);
                }));
                alphaInput.addEventListener('input', (ev) => __awaiter(this, void 0, void 0, function* () {
                    const val = getInputColor();
                    label.innerText = ` ${labelText}: #${val.toHexString()}`;
                    onValueChange(val);
                }));
                inputDiv.appendChild(colorInput);
                inputDiv.appendChild(alphaInput);
                debugUIdiv.appendChild(labelDiv);
                debugUIdiv.appendChild(inputDiv);
                onValueChange(startingValue);
                return setToColor;
            };
            // =============================
            // debug UI start
            // =============================
            addCheckBox(false, 'view debug msgs', (visible) => {
                setDebugPrintVisible(visible);
            });
            addButton('download graph', () => __awaiter(this, void 0, void 0, function* () {
                const jsonString = yield app.serialize();
                util.saveBlob(new Blob([jsonString], { type: 'application/json' }), 'graph.graph');
            }));
            addFileUpload('.graph', 'upload graph', (files) => __awaiter(this, void 0, void 0, function* () {
                if (files.length > 0) {
                    try {
                        const file = files[0];
                        const text = yield file.text();
                        app.deserialize(text);
                    }
                    catch (err) {
                        console.error(err);
                    }
                }
            }));
            addButton('reset', () => {
                app.resetAndAddFirstNode(FirstTitle);
            });
            addSlider(1.8, 0, 5, 0.05, 'glowSize', (val) => {
                app.renderParam.glowSize = val;
            });
            addSlider(0.8, 0, 2, 0.05, 'glowBoost', (val) => {
                app.renderParam.glowBoost = val;
            });
            const colorTablePickerSetters = [];
            for (const key in app.colorTable) {
                const pickerSetter = addColorPicker(app.colorTable[key], key, ((val) => {
                    app.colorTable[key].setFromColor(val);
                }));
                colorTablePickerSetters.push({
                    pickerSetter: pickerSetter,
                    tableIndex: key
                });
            }
            addButton('download color table', () => __awaiter(this, void 0, void 0, function* () {
                const jsonString = serializeColorTable(app.colorTable);
                util.saveBlob(new Blob([jsonString], { type: 'application/json' }), 'color-table.table');
            }));
            addFileUpload('.table', 'upload color table', (files) => __awaiter(this, void 0, void 0, function* () {
                if (files.length > 0) {
                    try {
                        const file = files[0];
                        const text = yield file.text();
                        deserializeColorTable(app.colorTable, text);
                        for (const setter of colorTablePickerSetters) {
                            setter.pickerSetter(app.colorTable[setter.tableIndex]);
                        }
                        app.recolorWholeGraph();
                    }
                    catch (err) {
                        console.error(err);
                    }
                }
            }));
            addSlider(10, 0, 10, 0.01, "nodeMinDist", (value) => { app.simParam.nodeMinDist = value; });
            addSlider(7000, 0, 10000, 1, "repulsion", (value) => { app.simParam.repulsion = value; });
            addSlider(5, 0, 50, 0.0001, "spring", (value) => { app.simParam.spring = value; });
            addSlider(600, 1, 1000, 1, "springDist", (value) => { app.simParam.springDist = value; });
            addSlider(100, 1, 1000, 1, "forceCap", (value) => { app.simParam.forceCap = value; });
            addSlider(0.5, 0, 5, 0.01, "Barnes Hut threshold", (value) => { app.simParam.bhThreshold = value; });
            addButton('recolor graph', () => { app.recolorWholeGraph(); });
            let isShowing = true;
            const debugUIHideShowButton = document.createElement('button');
            debugUIContainer.insertBefore(debugUIHideShowButton, debugUIContainer.firstChild);
            debugUIHideShowButton.innerText = 'hide';
            debugUIHideShowButton.onclick = () => {
                if (isShowing) {
                    debugUIdiv.style.display = 'none';
                    debugUIHideShowButton.innerText = 'show';
                }
                else {
                    debugUIdiv.style.display = 'block';
                    debugUIHideShowButton.innerText = 'hide';
                }
                isShowing = !isShowing;
            };
        };
        setupDebugUI();
        app.resetAndAddFirstNode(FirstTitle);
        let prevTime;
        const onFrame = (timestamp) => {
            //clearDebugPrint()
            if (prevTime === undefined) {
                prevTime = timestamp;
            }
            const deltaTime = timestamp - prevTime;
            prevTime = timestamp;
            updateErrorMsgs(deltaTime);
            app.update(deltaTime);
            app.draw(deltaTime);
            renderDebugPrint();
            requestAnimationFrame(onFrame);
        };
        requestAnimationFrame(onFrame);
    });
}
main();
