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
function vector2Rotate(v, rot) {
    const sin = Math.sin(rot);
    const cos = Math.cos(rot);
    return {
        x: v.x * cos - v.y * sin,
        y: v.x * sin + v.y * cos,
    };
}
class DocNode {
    constructor() {
        this.posX = 0;
        this.posY = 0;
        this.forceX = 0;
        this.forceY = 0;
        this.title = "";
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
function applyRepulsion(nodeA, nodeB, force, minDist) {
    const atobX = nodeB.posX - nodeA.posX;
    const atobY = nodeB.posY - nodeA.posY;
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
    nodeA.posX -= atobFX;
    nodeA.posY -= atobFY;
    nodeB.posX += atobFX;
    nodeB.posY += atobFY;
}
function applySpring(nodeA, nodeB, relaxedDist, force, minDist) {
    const atobX = nodeB.posX - nodeA.posX;
    const atobY = nodeB.posY - nodeA.posY;
    let distSquared = atobX * atobX + atobY * atobY;
    if (distSquared < 0.001) {
        return;
    }
    distSquared = Math.max(distSquared, minDist * minDist);
    const dist = Math.sqrt(distSquared);
    const atobNX = atobX / dist;
    const atobNY = atobY / dist;
    let delta = relaxedDist - dist;
    let atobFX = atobNX * delta * force;
    let atobFY = atobNY * delta * force;
    nodeA.posX -= atobFX;
    nodeA.posY -= atobFY;
    nodeB.posX += atobFX;
    nodeB.posY += atobFY;
}
function applyForce(node) {
    node.posX += node.forceX;
    node.posY += node.forceY;
}
function resetForce(node) {
    node.forceX *= 0;
    node.forceY *= 0;
}
function calculateSum(a, b) {
    return (b - a + 1) * (a + b) / 2;
}
class NodeManager {
    constructor() {
        this._length = 0;
        this._titleToNodes = {};
        const initCapacity = 16;
        const matrixSize = calculateSum(1, initCapacity - 1);
        this._connectionMatrix = Array(matrixSize).fill(false);
        this._nodes = Array(matrixSize);
        this._capacity = initCapacity;
    }
    isConnected(nodeIdA, nodeIdB) {
        if (nodeIdA == nodeIdB) {
            return false;
        }
        return this._connectionMatrix[this.getConMatIndex(nodeIdA, nodeIdB)];
    }
    setConnected(nodeIdA, nodeIdB, connected) {
        if (nodeIdA == nodeIdB) {
            return;
        }
        this._connectionMatrix[this.getConMatIndex(nodeIdA, nodeIdB)] = connected;
    }
    getConnections(nodeId) {
        let connectedIds = [];
        for (let otherId = 0; otherId < this._length; otherId++) {
            if (nodeId == otherId) {
                continue;
            }
            if (this.isConnected(nodeId, otherId)) {
                connectedIds.push(otherId);
            }
        }
        return connectedIds;
    }
    getNodeAt(index) {
        return this._nodes[index];
    }
    _getConMatIndexImpl(nodeIdA, nodeIdB, capacity) {
        if (nodeIdA == nodeIdB) {
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
                        setTimeout(addNode, 3);
                    };
                    setTimeout(addNode, 3);
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
        if (ctx == null) {
            throw new Error("failed to get canvas context");
        }
        this.ctx = ctx;
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
        testNode.title = "Miss Meyers";
        this.nodeManager.pushNode(testNode);
        // TEST TEST TEST TEST
    }
    handleEvent(e) {
        //console.log(e)
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
                    console.log(`x:${this.offsetX}, y:${this.offsetY}`);
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
                            //console.log(`clicked ${node.doc}`)
                            this.expandNode(i);
                            break;
                        }
                    }
                }
                break;
        }
    }
    update() {
        this.updateWidthAndHeight();
        for (let a = 0; a < this.nodeManager.length(); a++) {
            for (let b = a + 1; b < this.nodeManager.length(); b++) {
                const nodeA = this.nodeManager.getNodeAt(a);
                const nodeB = this.nodeManager.getNodeAt(b);
                applyRepulsion(nodeA, nodeB, this.repulsion, this.nodeRadius);
                if (this.nodeManager.isConnected(a, b)) {
                    applySpring(nodeA, nodeB, this.springDist, this.spring, this.nodeRadius);
                }
            }
        }
        for (let i = 0; i < this.nodeManager.length(); i++) {
            const node = this.nodeManager.getNodeAt(i);
            applyForce(node);
            resetForce(node);
        }
    }
    draw() {
        // draw connections
        for (let a = 0; a < this.nodeManager.length(); a++) {
            for (let b = 0; b < this.nodeManager.length(); b++) {
                if (this.nodeManager.isConnected(a, b)) {
                    const nodeA = this.nodeManager.getNodeAt(a);
                    const nodeB = this.nodeManager.getNodeAt(b);
                    const posA = this.worldToViewport(nodeA.posX, nodeA.posY);
                    const posB = this.worldToViewport(nodeB.posX, nodeB.posY);
                    cd.strokeLine(this.ctx, posA.x, posA.y, posB.x, posB.y, 2 * this.zoom, "grey");
                }
            }
        }
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
}
function main() {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    canvas.style.width = "500px";
    canvas.style.height = "500px";
    canvas.style.border = 'solid';
    const app = new App(canvas);
    const onFrame = () => {
        app.update();
        app.draw();
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
