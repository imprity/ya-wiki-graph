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
let NODE_ID_MAX = 0;
function getNewNodeId() {
    NODE_ID_MAX++;
    return NODE_ID_MAX;
}
class Node {
    constructor() {
        this.posX = 0;
        this.posY = 0;
        this.doc = "";
        this.id = 0;
        this.id = getNewNodeId();
    }
}
function drawNode(ctx, node) {
    const radius = 8;
    cd.fillCircle(ctx, node.posX, node.posY, radius, "rgb(100, 100, 100)");
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(node.doc, node.posX, node.posY - radius - 2);
}
function calculateSum(a, b) {
    return (b - a + 1) * (a + b) / 2;
}
class ConnectionManager {
    isConnected(nodeIdA, nodeIdB) {
        if (nodeIdA == nodeIdB) {
            return false;
        }
        return this.connectionMatrix[this.getMatrixIndex(nodeIdA, nodeIdB)];
    }
    setConnected(nodeIdA, nodeIdB, connected) {
        if (nodeIdA == nodeIdB) {
            return;
        }
        this.connectionMatrix[this.getMatrixIndex(nodeIdA, nodeIdB)] = connected;
    }
    getConnections(nodeId) {
        let connectedIds = [];
        for (let otherId = 0; otherId < this.matrixSize; otherId++) {
            if (nodeId == otherId) {
                continue;
            }
            if (this.isConnected(nodeId, otherId)) {
                connectedIds.push(otherId);
            }
        }
        return connectedIds;
    }
    constructor(size) {
        const arraySize = calculateSum(1, size - 1);
        this.connectionMatrix = Array(arraySize).fill(false);
        this.matrixSize = size;
    }
    getMatrixIndex(nodeIdA, nodeIdB) {
        if (nodeIdA == nodeIdB) {
            return -1;
        }
        const minId = Math.min(nodeIdA, nodeIdB);
        const maxId = Math.max(nodeIdA, nodeIdB);
        let index = 0;
        if (minId > 0) {
            index = calculateSum(this.matrixSize - minId, this.matrixSize - 1);
        }
        index += maxId - (minId + 1);
        return index;
    }
}
function main() {
    let ctx;
    {
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 300;
        canvas.style.width = '300px';
        canvas.style.height = '300px';
        const tmp = canvas.getContext('2d');
        if (tmp == null) {
            throw new Error('failed to get canvas context');
        }
        ctx = tmp;
        document.body.appendChild(canvas);
    }
    const node = new Node();
    node.doc = 'test node';
    node.posX = 150;
    node.posY = 150;
    drawNode(ctx, node);
}
main();
function main2() {
    return __awaiter(this, void 0, void 0, function* () {
        // we don't really have to rate limit ourself
        // but I think it's a good etiquette
        const RATE_LIMIT = 20; // rate / second
        let LAST_REQUEST_AT = 0;
        const makeRequestToWiki = (query) => __awaiter(this, void 0, void 0, function* () {
            const wait = (milliseconds) => {
                return new Promise(res => {
                    setTimeout(() => {
                        res();
                    }, milliseconds);
                });
            };
            let now = Date.now();
            if (now - LAST_REQUEST_AT < 1000 / RATE_LIMIT) {
                const toWait = 1000 / RATE_LIMIT - (now - LAST_REQUEST_AT);
                yield wait(toWait);
                now = Date.now();
            }
            LAST_REQUEST_AT = now;
            let link = 'https://en.wikipedia.org/w/api.php?';
            for (const key in query) {
                link = link + `&${key}=${query[key]}`;
            }
            const response = yield fetch(link);
            const json = yield response.json();
            return json;
        });
        const retrieveAllLiks = (title) => __awaiter(this, void 0, void 0, function* () {
            let results = [];
            let doContinue = false;
            let nextContinue = "";
            while (true) {
                let doBreak = false;
                const query = {
                    "action": "query",
                    "prop": "links",
                    "titles": title,
                    "format": "json",
                    "pllimit": "max",
                    "plnamespace": "0",
                    "origin": "*"
                };
                if (doContinue) {
                    query["plcontinue"] = nextContinue;
                }
                const response = yield makeRequestToWiki(query);
                // TEST TEST TEST TEST TEST
                console.log(response);
                // TEST TEST TEST TEST TEST
                if (!("continue" in response)) {
                    doBreak = true;
                }
                else {
                    doContinue = true;
                    nextContinue = response.continue.plcontinue;
                }
                for (const pageId in response.query.pages) {
                    const page = response.query.pages[pageId];
                    // TEST TEST TEST TEST TEST
                    for (const link of page.links) {
                        console.log(link);
                    }
                    // TEST TEST TEST TEST TEST
                    results = results.concat(page.links);
                }
                if (doBreak) {
                    break;
                }
            }
            return results;
        });
        const results = yield retrieveAllLiks("Miss Meyers");
        console.log(results);
    });
}
