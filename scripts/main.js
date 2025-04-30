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
        this.doc = "";
    }
}
function drawDocNode(ctx, node) {
    const radius = 8;
    cd.fillCircle(ctx, node.posX, node.posY, radius, "rgb(100, 100, 100)");
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textRendering = "optimizeSpeed";
    ctx.textBaseline = "bottom";
    ctx.fillText(node.doc, node.posX, node.posY - radius - 2.0);
}
function applyRepulsion(nodeA, nodeB, force) {
    const atobX = nodeB.posX - nodeA.posX;
    const atobY = nodeB.posY - nodeA.posY;
    const distSquared = atobX * atobX + atobY * atobY;
    const dist = Math.sqrt(distSquared);
    const atobNX = atobX / dist;
    const atobNY = atobY / dist;
    let atobFX = atobNX * (force / distSquared);
    let atobFY = atobNY * (force / distSquared);
    nodeA.forceX -= atobFX;
    nodeA.forceY -= atobFY;
    nodeB.forceX += atobFX;
    nodeB.forceY += atobFY;
}
function applySpring(nodeA, nodeB, relaxedDist, force) {
    const atobX = nodeB.posX - nodeA.posX;
    const atobY = nodeB.posY - nodeA.posY;
    const distSquared = atobX * atobX + atobY * atobY;
    const dist = Math.sqrt(distSquared);
    const atobNX = atobX / dist;
    const atobNY = atobY / dist;
    const delta = relaxedDist - dist;
    let atobFX = atobNX * delta * force;
    let atobFY = atobNY * delta * force;
    nodeA.forceX -= atobFX;
    nodeA.forceY -= atobFY;
    nodeB.forceX += atobFX;
    nodeB.forceY += atobFY;
}
function applyForce(node) {
    node.posX += node.forceX;
    node.posY += node.forceY;
}
function resetForce(node) {
    node.forceX = 0;
    node.forceY = 0;
}
function calculateSum(a, b) {
    return (b - a + 1) * (a + b) / 2;
}
class ConnectionManager {
    constructor(size) {
        const arraySize = calculateSum(1, size - 1);
        this._connectionMatrix = Array(arraySize).fill(false);
        this._matrixSize = size;
    }
    isConnected(nodeIdA, nodeIdB) {
        if (nodeIdA == nodeIdB) {
            return false;
        }
        return this._connectionMatrix[this.getMatrixIndex(nodeIdA, nodeIdB)];
    }
    setConnected(nodeIdA, nodeIdB, connected) {
        if (nodeIdA == nodeIdB) {
            return;
        }
        this._connectionMatrix[this.getMatrixIndex(nodeIdA, nodeIdB)] = connected;
    }
    getConnections(nodeId) {
        let connectedIds = [];
        for (let otherId = 0; otherId < this._matrixSize; otherId++) {
            if (nodeId == otherId) {
                continue;
            }
            if (this.isConnected(nodeId, otherId)) {
                connectedIds.push(otherId);
            }
        }
        return connectedIds;
    }
    _getMatrixIndexImpl(nodeIdA, nodeIdB, matrixSize) {
        if (nodeIdA == nodeIdB) {
            return -1;
        }
        const minId = Math.min(nodeIdA, nodeIdB);
        const maxId = Math.max(nodeIdA, nodeIdB);
        let index = 0;
        if (minId > 0) {
            index = calculateSum(matrixSize - minId, matrixSize - 1);
        }
        index += maxId - (minId + 1);
        return index;
    }
    getMatrixIndex(nodeIdA, nodeIdB) {
        return this._getMatrixIndexImpl(nodeIdA, nodeIdB, this._matrixSize);
    }
    getMatrixSize() {
        return this._matrixSize;
    }
    setMatrixSize(newSize) {
        const oldSize = this._matrixSize;
        const newArraySize = calculateSum(1, newSize - 1);
        const oldMatrix = this._connectionMatrix;
        const newMatrix = Array(newArraySize).fill(false);
        const minSize = Math.min(newSize, oldSize);
        for (let a = 0; a < minSize; a++) {
            for (let b = a + 1; b < minSize; b++) {
                const oldIndex = this._getMatrixIndexImpl(a, b, oldSize);
                const newIndex = this._getMatrixIndexImpl(a, b, newSize);
                newMatrix[newIndex] = oldMatrix[oldIndex];
            }
        }
        this._matrixSize = newSize;
        this._connectionMatrix = newMatrix;
    }
}
class App {
    constructor(canvas) {
        this.width = 0;
        this.height = 0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.zoom = 1;
        this.nodes = [];
        this.isRequesting = false;
        // constants
        this.nodeRadius = 8;
        this.expandNode = (nodeId) => __awaiter(this, void 0, void 0, function* () {
            if (this.isRequesting) {
                console.log("busy");
                return;
            }
            if (!(0 <= nodeId && nodeId < this.nodes.length)) {
                console.error(`node id ${nodeId} out of bound`);
                return;
            }
            const node = this.nodes[nodeId];
            console.log(`requesting ${node.doc}`);
            this.isRequesting = true;
            try {
                const regex = / /g;
                const links = yield wiki.retrieveAllLiks(node.doc.replace(regex, "_"));
                if (links.length > 0) {
                    const angle = Math.PI * 2 / links.length;
                    const offsetV = { x: 0, y: -50 };
                    let newNodeId = this.nodes.length;
                    //for (const link of links) {
                    for (let i = 0; i < links.length; i++) {
                        const link = links[i];
                        const newNode = new DocNode();
                        newNode.doc = link;
                        const v = vector2Rotate(offsetV, angle * i);
                        newNode.posX = node.posX + v.x;
                        newNode.posY = node.posY + v.y;
                        this.addNode(newNode);
                        this.conManager.setConnected(nodeId, newNodeId, true);
                        newNodeId++;
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
        if (ctx == null) {
            throw new Error("failed to get canvas context");
        }
        this.ctx = ctx;
        this.updateWidthAndHeight();
        this.conManager = new ConnectionManager(16);
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
        // TEST TEST TEST TEST
        const testNode = new DocNode();
        testNode.posX = 150;
        testNode.posY = 150;
        testNode.doc = "Miss Meyers";
        this.nodes.push(testNode);
        // TEST TEST TEST TEST
    }
    handleEvent(e) {
        //console.log(e)
        switch (e.type) {
            case "keydown":
                const keyEvent = e;
                switch (keyEvent.code) {
                    case "KeyW":
                        this.offsetY -= 10;
                        break;
                    case "KeyS":
                        this.offsetY += 10;
                        break;
                    case "KeyA":
                        this.offsetX -= 10;
                        break;
                    case "KeyD":
                        this.offsetX += 10;
                        break;
                }
                break;
            case "wheel":
                const wheelEvent = e;
                this.zoom -= wheelEvent.deltaY * 0.001;
                break;
            case "pointerdown":
                const pointerEvent = e;
                const pos = this.viewportToWorld(pointerEvent.offsetX, pointerEvent.offsetY);
                for (let i = 0; i < this.nodes.length; i++) {
                    const node = this.nodes[i];
                    const dx = pos.x - node.posX;
                    const dy = pos.y - node.posY;
                    const distSquared = dx * dx + dy * dy;
                    if (distSquared < this.nodeRadius * this.nodeRadius) {
                        //console.log(`clicked ${node.doc}`)
                        this.expandNode(i);
                        break;
                    }
                }
                break;
        }
    }
    addNode(node) {
        if (this.nodes.length >= this.conManager.getMatrixSize()) {
            this.conManager.setMatrixSize(this.conManager.getMatrixSize() * 2);
        }
        this.nodes.push(node);
    }
    update() {
        this.updateWidthAndHeight();
    }
    draw() {
        // draw circles
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            const pos = this.worldToViewport(node.posX, node.posY);
            const radius = this.nodeRadius * this.zoom;
            cd.fillCircle(this.ctx, pos.x, pos.y, radius, "grey");
        }
        // draw texts
        this.ctx.font = `${this.zoom * 12}px sans-serif`;
        this.ctx.textAlign = "center";
        this.ctx.textRendering = "optimizeSpeed";
        this.ctx.textBaseline = "bottom";
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            const pos = this.worldToViewport(node.posX, node.posY);
            this.ctx.fillText(node.doc, pos.x, pos.y - (this.nodeRadius + 5.0) * this.zoom);
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
        x *= this.zoom;
        y *= this.zoom;
        x += this.offsetX;
        y += this.offsetY;
        return { x: x, y: y };
    }
    viewportToWorld(x, y) {
        x -= this.offsetX;
        y -= this.offsetY;
        x /= this.zoom;
        y /= this.zoom;
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
        // TODO: very bad way of keeping a 60 frames per second
        setTimeout(() => {
            requestAnimationFrame(onFrame);
        }, 1000 / 60);
    };
    requestAnimationFrame(onFrame);
}
function main2() {
    let ctx;
    const WIDTH = 300;
    const HEIGHT = 300;
    {
        const canvas = document.createElement('canvas');
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        canvas.style.width = `${WIDTH}px`;
        canvas.style.height = `${HEIGHT}px`;
        const tmp = canvas.getContext('2d');
        if (tmp == null) {
            throw new Error('failed to get canvas context');
        }
        ctx = tmp;
        document.body.appendChild(canvas);
    }
    let nodes = [];
    for (let i = 0; i < 5; i++) {
        const node = new DocNode();
        node.posY = HEIGHT / 2;
        node.posX = 20 + i * 40;
        node.posX += Math.random() * 30;
        node.posY += Math.random() * 40;
        node.doc = `node ${i}`;
        nodes.push(node);
    }
    const nodeCount = nodes.length;
    const conManager = new ConnectionManager(nodeCount);
    conManager.setConnected(0, 1, true);
    conManager.setConnected(2, 4, true);
    conManager.setConnected(2, 3, true);
    conManager.setConnected(0, 2, true);
    const REPULSION = 2000;
    const SPRING_DIST = 30;
    const SPRING = 0.01;
    let doLog = true;
    const onFrame = () => {
        ctx.clearRect(0, 0, 300, 300);
        for (let a = 0; a < nodeCount; a++) {
            for (let b = a + 1; b < nodeCount; b++) {
                applyRepulsion(nodes[a], nodes[b], REPULSION);
                if (conManager.isConnected(a, b)) {
                    applySpring(nodes[a], nodes[b], SPRING_DIST, SPRING);
                }
                if (doLog) {
                    console.log(`${a}, ${b}`);
                }
            }
        }
        if (doLog && conManager.isConnected(1, 2)) {
            console.log("is connected");
        }
        doLog = false;
        for (let i = 0; i < nodeCount; i++) {
            applyForce(nodes[i]);
            resetForce(nodes[i]);
        }
        for (let a = 0; a < nodeCount; a++) {
            for (let b = a + 1; b < nodeCount; b++) {
                if (conManager.isConnected(a, b)) {
                    cd.strokeLine(ctx, nodes[a].posX, nodes[a].posY, nodes[b].posX, nodes[b].posY, 2, "grey");
                }
            }
        }
        for (let i = 0; i < nodeCount; i++) {
            drawDocNode(ctx, nodes[i]);
        }
        // TODO: very bad way of keeping a 60 frames per second
        setTimeout(() => {
            requestAnimationFrame(onFrame);
        }, 1000 / 60);
    };
    requestAnimationFrame(onFrame);
}
main();
