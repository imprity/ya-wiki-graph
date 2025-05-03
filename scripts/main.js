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
function vector2Rotate(v, rot) {
    const sin = Math.sin(rot);
    const cos = Math.cos(rot);
    return {
        x: v.x * cos - v.y * sin,
        y: v.x * sin + v.y * cos,
    };
}
let DOC_NODE_MAX_ID = 0;
class DocNode {
    constructor() {
        this.posX = 0;
        this.posY = 0;
        this.id = 0;
        this.title = "";
        this.id = DOC_NODE_MAX_ID;
        DOC_NODE_MAX_ID++;
    }
}
class CenterOfMass {
    constructor() {
        this.posX = 0;
        this.posY = 0;
        this.mass = 0;
    }
}
function drawDocNode(ctx, node) {
    const radius = 8;
    cd.fillCircle(ctx, node.posX, node.posY, radius, "rgb(100, 100, 100)");
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textRendering = "optimizeSpeed";
    ctx.textBaseline = "bottom";
    ctx.fillText(node.title, node.posX, node.posY - radius - 2.0);
}
function applyRepulsion(node, otherX, otherY, force, minDist) {
    const aPosX = node.posX;
    const aPosY = node.posY;
    const bPosX = otherX;
    const bPosY = otherY;
    const atobX = bPosX - aPosX;
    const atobY = bPosY - aPosY;
    let distSquared = atobX * atobX + atobY * atobY;
    if (distSquared < 0.001) {
        return;
    }
    distSquared = Math.max(distSquared, minDist * minDist);
    const dist = Math.sqrt(distSquared);
    const atobNX = atobX / dist;
    const atobNY = atobY / dist;
    let atobFX = atobNX * (force / distSquared);
    let atobFY = atobNY * (force / distSquared);
    node.posX -= atobFX;
    node.posY -= atobFY;
    // nodeB.posX += atobFX
    // nodeB.posY += atobFY
    // nodeA.forceX -= atobFX
    // nodeA.forceY -= atobFY
    //
    // nodeB.forceX += atobFX
    // nodeB.forceY += atobFY
}
function applySpring(nodeA, nodeB, relaxedDist, maxDistDiff, force, minDist) {
    const aPosX = nodeA.posX;
    const aPosY = nodeA.posY;
    const bPosX = nodeB.posX;
    const bPosY = nodeB.posY;
    const atobX = bPosX - aPosX;
    const atobY = bPosY - aPosY;
    let distSquared = atobX * atobX + atobY * atobY;
    if (distSquared < 0.001) {
        return;
    }
    distSquared = Math.max(distSquared, minDist * minDist);
    const dist = Math.sqrt(distSquared);
    const atobNX = atobX / dist;
    const atobNY = atobY / dist;
    let delta = relaxedDist - dist;
    if (delta < -maxDistDiff) {
        delta = -maxDistDiff;
    }
    else if (delta > maxDistDiff) {
        delta = maxDistDiff;
    }
    let atobFX = atobNX * delta * force;
    let atobFY = atobNY * delta * force;
    nodeA.posX -= atobFX;
    nodeA.posY -= atobFY;
    nodeB.posX += atobFX;
    nodeB.posY += atobFY;
}
function calculateSum(a, b) {
    return (b - a + 1) * (a + b) / 2;
}
class Connection {
    constructor(nodeIdA, nodeIdB) {
        this.nodeIdA = nodeIdA;
        this.nodeIdB = nodeIdB;
    }
}
var Direction;
(function (Direction) {
    Direction[Direction["TopLeft"] = 0] = "TopLeft";
    Direction[Direction["TopRight"] = 1] = "TopRight";
    Direction[Direction["BottomLeft"] = 2] = "BottomLeft";
    Direction[Direction["BottomRight"] = 3] = "BottomRight";
})(Direction || (Direction = {}));
class QuadTree {
    constructor(minX, minY, maxX, maxY) {
        this.hasChildren = false;
        this.childrenTrees = new Array(4).fill(null);
        this.node = null;
        this.centerOfMassX = 0;
        this.centerOfMassY = 0;
        this.centerOfMassXSum = 0;
        this.centerOfMassYSum = 0;
        this.centerOfMassCached = false;
        this.nodeCount = 0;
        this.minX = minX;
        this.minY = minY;
        this.maxX = maxX;
        this.maxY = maxY;
        this.centerX = (this.minX + this.maxX) * 0.5;
        this.centerY = (this.minY + this.maxY) * 0.5;
    }
    getPosDirection(posX, posY) {
        let onLeft = false;
        let onTop = false;
        if (posX < this.centerX) {
            onLeft = true;
        }
        if (posY < this.centerY) {
            onTop = true;
        }
        if (onLeft) { // left
            if (onTop) { // top
                return Direction.TopLeft;
            }
            else { // bottom
                return Direction.BottomLeft;
            }
        }
        else { // right
            if (onTop) { // top
                return Direction.TopRight;
            }
            else { // bottom
                return Direction.BottomRight;
            }
        }
    }
    createChild(dir) {
        switch (dir) {
            case Direction.TopLeft:
                {
                    return new QuadTree(this.minX, this.minY, this.centerX, this.centerY);
                }
                break;
            case Direction.TopRight:
                {
                    return new QuadTree(this.centerX, this.minY, this.maxX, this.centerY);
                }
                break;
            case Direction.BottomLeft:
                {
                    return new QuadTree(this.minX, this.centerY, this.centerX, this.maxY);
                }
                break;
            case Direction.BottomRight:
                {
                    return new QuadTree(this.centerX, this.centerY, this.maxX, this.maxY);
                }
                break;
        }
    }
    cacheCenterOfMass() {
        if (this.centerOfMassCached) {
            return;
        }
        this.centerOfMassCached = true;
        if (this.node !== null) {
            this.centerOfMassX = this.node.posX;
            this.centerOfMassY = this.node.posY;
            this.centerOfMassXSum = this.node.posX;
            this.centerOfMassYSum = this.node.posY;
            return;
        }
        this.centerOfMassXSum = 0;
        this.centerOfMassYSum = 0;
        for (const child of this.childrenTrees) {
            if (child !== null) {
                child.cacheCenterOfMass();
                this.centerOfMassXSum += child.centerOfMassXSum;
                this.centerOfMassYSum += child.centerOfMassYSum;
            }
        }
        this.centerOfMassX = this.centerOfMassXSum / this.nodeCount;
        this.centerOfMassY = this.centerOfMassYSum / this.nodeCount;
    }
    pushNode(node) {
        this.nodeCount++;
        if (this.node === null && !this.hasChildren) {
            this.node = node;
            return;
        }
        this.hasChildren = true;
        if (this.node !== null) {
            const ogNode = this.node;
            this.node = null;
            const ogNodeDirection = this.getPosDirection(ogNode.posX, ogNode.posY);
            if (this.childrenTrees[ogNodeDirection] === null) {
                this.childrenTrees[ogNodeDirection] = this.createChild(ogNodeDirection);
            }
            this.childrenTrees[ogNodeDirection].pushNode(ogNode);
        }
        const nodeDirection = this.getPosDirection(node.posX, node.posY);
        if (this.childrenTrees[nodeDirection] === null) {
            this.childrenTrees[nodeDirection] = this.createChild(nodeDirection);
        }
        this.childrenTrees[nodeDirection].pushNode(node);
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
class NodeManager {
    constructor() {
        this._connectionMatrix = [];
        this._connections = [];
        this._length = 0;
        this._capacity = 0;
        this._nodes = [];
        this._titleToNodes = {};
        this.reset();
    }
    reset() {
        const initCapacity = 16;
        const matrixSize = calculateSum(1, initCapacity - 1);
        this._connectionMatrix = Array(matrixSize).fill(false);
        this._connections = [];
        this._length = 0;
        this._capacity = initCapacity;
        this._nodes = Array(initCapacity);
        this._titleToNodes = {};
    }
    isConnected(nodeIdA, nodeIdB) {
        if (nodeIdA === nodeIdB) {
            return false;
        }
        return this._connectionMatrix[this.getConMatIndex(nodeIdA, nodeIdB)];
    }
    setConnected(nodeIdA, nodeIdB, connected) {
        if (nodeIdA === nodeIdB) {
            return;
        }
        const index = this.getConMatIndex(nodeIdA, nodeIdB);
        const wasConnedted = this._connectionMatrix[index];
        if (wasConnedted != connected) {
            if (wasConnedted) { // we have to remove connection
                let toRemoveAt = -1;
                for (let i = 0; i < this._connections.length; i++) {
                    const con = this._connections[i];
                    if (con.nodeIdA === nodeIdA && con.nodeIdB === nodeIdB) {
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
                this._connections.push(new Connection(nodeIdA, nodeIdB));
            }
            this._connectionMatrix[index] = connected;
        }
    }
    getConnections() {
        return this._connections;
    }
    getNodeAt(index) {
        return this._nodes[index];
    }
    _getConMatIndexImpl(nodeIdA, nodeIdB, capacity) {
        if (nodeIdA === nodeIdB) {
            return -1;
        }
        const minId = Math.min(nodeIdA, nodeIdB);
        const maxId = Math.max(nodeIdA, nodeIdB);
        let index = 0;
        if (minId > 0) {
            index = calculateSum(capacity - minId, capacity - 1);
        }
        index += maxId - (minId + 1);
        return index;
    }
    getConMatIndex(nodeIdA, nodeIdB) {
        return this._getConMatIndexImpl(nodeIdA, nodeIdB, this._capacity);
    }
    pushNode(node) {
        if (this._length >= this._capacity) {
            const oldCap = this._capacity;
            const newCap = this._capacity * 2;
            const minCap = Math.min(oldCap, newCap);
            // grow connection matrix
            {
                const newMatrixSize = calculateSum(1, newCap - 1);
                const oldMatrix = this._connectionMatrix;
                const newMatrix = Array(newMatrixSize).fill(false);
                for (let a = 0; a < minCap; a++) {
                    for (let b = a + 1; b < minCap; b++) {
                        const oldIndex = this._getConMatIndexImpl(a, b, oldCap);
                        const newIndex = this._getConMatIndexImpl(a, b, newCap);
                        newMatrix[newIndex] = oldMatrix[oldIndex];
                    }
                }
                this._connectionMatrix = newMatrix;
            }
            // grow nodes
            {
                const oldNodes = this._nodes;
                const newNodes = Array(newCap);
                for (let i = 0; i < minCap; i++) {
                    newNodes[i] = oldNodes[i];
                }
                this._nodes = newNodes;
            }
            this._capacity = newCap;
        }
        this._nodes[this._length] = node;
        this._titleToNodes[node.title] = this._length;
        this._length++;
    }
    findNodeFromTitle(title) {
        if (title in this._titleToNodes) {
            return this._titleToNodes[title];
        }
        return -1;
    }
    buildQuadTree() {
        if (this.length() <= 0) {
            return new QuadTree(0, 0, 0, 0);
        }
        let minX = Number.MAX_VALUE;
        let minY = Number.MAX_VALUE;
        let maxX = -Number.MAX_VALUE;
        let maxY = -Number.MAX_VALUE;
        for (let i = 0; i < this.length(); i++) {
            const node = this._nodes[i];
            minX = Math.min(node.posX, minX);
            minY = Math.min(node.posY, minY);
            maxX = Math.max(node.posX, maxX);
            maxY = Math.max(node.posY, maxY);
        }
        const root = new QuadTree(minX, minY, maxX, maxY);
        for (let i = 0; i < this.length(); i++) {
            const node = this._nodes[i];
            root.pushNode(node);
        }
        return root;
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
        this.offsetX = 0;
        this.offsetY = 0;
        this.zoom = 1;
        this.isRequesting = false;
        this.mouseX = 0;
        this.mouseY = 0;
        // constants
        this.nodeRadius = 8;
        this.repulsion = 3000;
        this.springDist = 200;
        this.springDistDiffMax = 5000;
        this.spring = 0.002;
        this.expandNode = (nodeId) => __awaiter(this, void 0, void 0, function* () {
            if (this.isRequesting) {
                console.log("busy");
                return;
            }
            if (!(0 <= nodeId && nodeId < this.nodeManager.length())) {
                console.error(`node id ${nodeId} out of bound`);
                return;
            }
            const node = this.nodeManager.getNodeAt(nodeId);
            console.log(`requesting ${node.title}`);
            this.isRequesting = true;
            try {
                const regex = / /g;
                const links = yield wiki.retrieveAllLiks(node.title.replace(regex, "_"));
                if (links.length > 0) {
                    const angle = Math.PI * 2 / links.length;
                    const offsetV = { x: 0, y: -100 };
                    let index = 0;
                    const addNodeOneByOne = false;
                    const addNode = () => {
                        if (index >= links.length) {
                            return;
                        }
                        const link = links[index];
                        const existingNodeId = this.nodeManager.findNodeFromTitle(link);
                        if (existingNodeId < 0) {
                            const newNode = new DocNode();
                            const newNodeId = this.nodeManager.length();
                            newNode.title = link;
                            const v = vector2Rotate(offsetV, angle * index);
                            newNode.posX = node.posX + v.x + (Math.random() - 0.5) * 20;
                            newNode.posY = node.posY + v.y + (Math.random() - 0.5) * 20;
                            this.nodeManager.pushNode(newNode);
                            this.nodeManager.setConnected(nodeId, newNodeId, true);
                        }
                        else {
                            this.nodeManager.setConnected(nodeId, existingNodeId, true);
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
        // NOTE: we have to add it to window because canvas
        // doesn't take keyboard input
        // TODO: put canvas inside a div
        window.addEventListener("keydown", (e) => {
            this.handleEvent(e);
        });
        this.canvasElement.addEventListener("wheel", (e) => {
            this.handleEvent(e);
        });
        this.canvasElement.addEventListener("pointerdown", (e) => {
            this.handleEvent(e);
        });
        this.canvasElement.addEventListener("pointermove", (e) => {
            this.handleEvent(e);
        });
        // TEST TEST TEST TEST
        const testNode = new DocNode();
        testNode.posX = 150;
        testNode.posY = 150;
        testNode.title = "English language";
        //testNode.title = "Miss Meyers"
        this.nodeManager.pushNode(testNode);
        // TEST TEST TEST TEST
    }
    handleEvent(e) {
        switch (e.type) {
            case "keydown":
                {
                    const keyEvent = e;
                    switch (keyEvent.code) {
                        case "KeyW":
                            this.offsetY += 10;
                            break;
                        case "KeyS":
                            this.offsetY -= 10;
                            break;
                        case "KeyA":
                            this.offsetX += 10;
                            break;
                        case "KeyD":
                            this.offsetX -= 10;
                            break;
                    }
                }
                break;
            case "wheel":
                {
                    const wheelEvent = e;
                    const zoomOrigin = this.viewportToWorld(this.mouseX, this.mouseY);
                    let newZoom = this.zoom;
                    if (wheelEvent.deltaY < 0) {
                        newZoom *= 1.1;
                    }
                    else {
                        newZoom *= 0.9;
                    }
                    this.zoom = newZoom;
                    const newZoomOrigin = this.viewportToWorld(this.mouseX, this.mouseY);
                    this.offsetX += (newZoomOrigin.x - zoomOrigin.x);
                    this.offsetY += (newZoomOrigin.y - zoomOrigin.y);
                }
                break;
            case "pointermove":
                {
                    const pointerEvent = e;
                    this.mouseX = pointerEvent.offsetX;
                    this.mouseY = pointerEvent.offsetY;
                }
                break;
            case "pointerdown":
                {
                    const pointerEvent = e;
                    const pos = this.viewportToWorld(this.mouseX, this.mouseY);
                    for (let i = 0; i < this.nodeManager.length(); i++) {
                        const node = this.nodeManager.getNodeAt(i);
                        const dx = pos.x - node.posX;
                        const dy = pos.y - node.posY;
                        const distSquared = dx * dx + dy * dy;
                        if (distSquared < this.nodeRadius * this.nodeRadius) {
                            this.expandNode(i);
                            break;
                        }
                    }
                }
                break;
        }
    }
    update(deltaTime) {
        this.updateWidthAndHeight();
        // apply repulsion
        // for (let a = 0; a < this.nodeManager.length(); a++) {
        //     for (let b = a + 1; b < this.nodeManager.length(); b++) {
        //         const nodeA = this.nodeManager.getNodeAt(a)
        //         const nodeB = this.nodeManager.getNodeAt(b)
        //
        //         applyRepulsion(nodeA, nodeB, this.repulsion, this.nodeRadius)
        //     }
        // }
        {
            const root = this.nodeManager.buildQuadTree();
            root.cacheCenterOfMass();
            const applyRepulsionFromTree = (node, tree) => {
                if (tree.node !== null) {
                    if (tree.node.id != node.id) {
                        applyRepulsion(node, tree.node.posX, tree.node.posY, this.repulsion, this.nodeRadius);
                    }
                    return;
                }
                const toCenterX = tree.centerOfMassX - node.posX;
                const toCenterY = tree.centerOfMassY - node.posY;
                let distSquared = toCenterX * toCenterX + toCenterY * toCenterY;
                distSquared = Math.max(distSquared, 0.0001);
                const dist = Math.sqrt(distSquared);
                if ((tree.maxX - tree.minX) / dist < 1) {
                    applyRepulsion(node, tree.centerOfMassX, tree.centerOfMassY, this.repulsion * tree.nodeCount, this.nodeRadius);
                }
                else {
                    for (const child of tree.childrenTrees) {
                        if (child !== null) {
                            applyRepulsionFromTree(node, child);
                        }
                    }
                }
            };
            for (let i = 0; i < this.nodeManager.length(); i++) {
                const node = this.nodeManager.getNodeAt(i);
                applyRepulsionFromTree(node, root);
            }
        }
        // apply spring
        this.nodeManager.getConnections().forEach((con) => {
            const nodeA = this.nodeManager.getNodeAt(con.nodeIdA);
            const nodeB = this.nodeManager.getNodeAt(con.nodeIdB);
            applySpring(nodeA, nodeB, this.springDist, this.springDistDiffMax, this.spring, this.nodeRadius);
        });
    }
    draw(deltaTime) {
        // draw connections
        this.nodeManager.getConnections().forEach((con) => {
            const nodeA = this.nodeManager.getNodeAt(con.nodeIdA);
            const nodeB = this.nodeManager.getNodeAt(con.nodeIdB);
            const posA = this.worldToViewport(nodeA.posX, nodeA.posY);
            const posB = this.worldToViewport(nodeB.posX, nodeB.posY);
            cd.strokeLine(this.ctx, posA.x, posA.y, posB.x, posB.y, 2 * this.zoom, "grey");
        });
        // draw circles
        for (let i = 0; i < this.nodeManager.length(); i++) {
            const node = this.nodeManager.getNodeAt(i);
            const pos = this.worldToViewport(node.posX, node.posY);
            const radius = this.nodeRadius * this.zoom;
            cd.fillCircle(this.ctx, pos.x, pos.y, radius, "PaleTurquoise");
        }
        // draw texts
        this.ctx.font = `${this.zoom * 12}px sans-serif`;
        this.ctx.fillStyle = "black";
        this.ctx.textAlign = "center";
        this.ctx.textRendering = "optimizeSpeed";
        this.ctx.textBaseline = "bottom";
        for (let i = 0; i < this.nodeManager.length(); i++) {
            const node = this.nodeManager.getNodeAt(i);
            const pos = this.worldToViewport(node.posX, node.posY);
            this.ctx.fillText(node.title, pos.x, pos.y - (this.nodeRadius + 5.0) * this.zoom);
        }
        // draw circles
        {
            let pos = this.viewportToWorld(this.mouseX, this.mouseY);
            pos = this.worldToViewport(pos.x, pos.y);
            cd.fillCircle(this.ctx, pos.x, pos.y, 10 * this.zoom, "red");
        }
        /*
        // TEST TEST TEST TEST TEST
        // draw quad tree
        {
            const drawTree = (tree: QuadTree) => {
                const min = this.worldToViewport(tree.minX, tree.minY)
                const max = this.worldToViewport(tree.maxX, tree.maxY)

                cd.strokeRect(
                    this.ctx,
                    min.x, min.y,
                    (max.x - min.x) * 0.95, (max.y - min.y) * 0.95,
                    1, "green"
                )

                if (tree.hasChildren) {
                    const mass = this.worldToViewport(tree.centerOfMassX, tree.centerOfMassY)
                    cd.fillCircle(this.ctx, mass.x, mass.y, 4, "blue")
                }

                for (const child of tree.childrenTrees) {
                    if (child != null) {
                        drawTree(child)
                    }
                }
            }

            const root = this.nodeManager.buildQuadTree()
            root.cacheCenterOfMass()
            drawTree(root)
        }
        // TEST TEST TEST TEST TEST
        */
        // draw fps estimate
        {
            let estimate = 1000.0 / deltaTime;
            this.ctx.font = `16px sans-serif`;
            this.ctx.fillStyle = "red";
            this.ctx.textAlign = "start";
            this.ctx.textRendering = "optimizeSpeed";
            this.ctx.textBaseline = "top";
            this.ctx.fillText(Math.round(estimate).toString(), 0, 0);
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
        x += this.offsetX;
        y += this.offsetY;
        x *= this.zoom;
        y *= this.zoom;
        return { x: x, y: y };
    }
    viewportToWorld(x, y) {
        x /= this.zoom;
        y /= this.zoom;
        x -= this.offsetX;
        y -= this.offsetY;
        return { x: x, y: y };
    }
    serialize() {
        const container = new SerializationContainer();
        for (let i = 0; i < this.nodeManager.length(); i++) {
            container.nodes.push(this.nodeManager.getNodeAt(i));
        }
        container.connections = this.nodeManager.getConnections();
        container.offsetX = this.offsetX;
        container.offsetY = this.offsetY;
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
            this.nodeManager.reset();
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
                this.nodeManager.setConnected(con.nodeIdA, con.nodeIdB, true);
            }
            this.offsetX = container.offsetX;
            this.offsetY = container.offsetY;
            this.zoom = container.zoom;
        }
        catch (err) {
            console.error(err);
        }
    }
}
function main() {
    const canvas = document.getElementById('my-canvas');
    if (canvas === null) {
        throw new Error("failed to get canvas context");
    }
    const app = new App(canvas);
    // set up UI elements
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
    }
    let prevTime;
    const onFrame = (timestamp) => {
        if (prevTime === undefined) {
            prevTime = timestamp;
        }
        const deltaTime = timestamp - prevTime;
        prevTime = timestamp;
        app.update(deltaTime);
        app.draw(deltaTime);
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
