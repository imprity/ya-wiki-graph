import * as cd from "./canvas.js"

let NODE_ID_MAX = -1

function getNewDocNodeId(): number {
    NODE_ID_MAX++;
    return NODE_ID_MAX
}

class DocNode {
    posX: number = 0
    posY: number = 0

    forceX: number = 0
    forceY: number = 0

    doc: string = ""

    id: number = 0

    constructor() {
        this.id = getNewDocNodeId()
    }
}

function drawDocNode(
    ctx: CanvasRenderingContext2D,
    node: DocNode,
) {
    const radius = 8
    cd.fillCircle(ctx, node.posX, node.posY, radius, "rgb(100, 100, 100)")

    ctx.font = "12px sans-serif"
    ctx.textAlign = "center"
    ctx.textRendering = "optimizeSpeed"
    ctx.textBaseline = "bottom"
    ctx.fillText(node.doc, node.posX, node.posY - radius - 2.0)
}

function applyRepulsion(nodeA: DocNode, nodeB: DocNode, force: number) {
    const atobX = nodeB.posX - nodeA.posX
    const atobY = nodeB.posY - nodeA.posY

    const distSquared = atobX * atobX + atobY * atobY
    const dist = Math.sqrt(distSquared)

    const atobNX = atobX / dist
    const atobNY = atobY / dist

    let atobFX = atobNX * (force / distSquared)
    let atobFY = atobNY * (force / distSquared)

    nodeA.forceX -= atobFX
    nodeA.forceY -= atobFY

    nodeB.forceX += atobFX
    nodeB.forceY += atobFY
}

function applySpring(
    nodeA: DocNode, nodeB: DocNode,
    relaxedDist: number,
    force: number
) {
    const atobX = nodeB.posX - nodeA.posX
    const atobY = nodeB.posY - nodeA.posY

    const distSquared = atobX * atobX + atobY * atobY
    const dist = Math.sqrt(distSquared)

    const atobNX = atobX / dist
    const atobNY = atobY / dist

    const delta = relaxedDist - dist

    let atobFX = atobNX * delta * force
    let atobFY = atobNY * delta * force

    nodeA.forceX -= atobFX
    nodeA.forceY -= atobFY

    nodeB.forceX += atobFX
    nodeB.forceY += atobFY
}

function applyForce(node: DocNode) {
    node.posX += node.forceX
    node.posY += node.forceY
}

function resetForce(node: DocNode) {
    node.forceX = 0
    node.forceY = 0
}

function calculateSum(a: number, b: number): number {
    return (b - a + 1) * (a + b) / 2
}

class ConnectionManager {
    isConnected(nodeIdA: number, nodeIdB: number): boolean {
        if (nodeIdA == nodeIdB) {
            return false
        }
        return this.connectionMatrix[this.getMatrixIndex(nodeIdA, nodeIdB)]
    }

    setConnected(
        nodeIdA: number, nodeIdB: number,
        connected: boolean
    ): void {
        if (nodeIdA == nodeIdB) {
            return
        }
        this.connectionMatrix[this.getMatrixIndex(nodeIdA, nodeIdB)] = connected
    }

    getConnections(nodeId: number): Array<number> {
        let connectedIds: Array<number> = []

        for (let otherId = 0; otherId < this.matrixSize; otherId++) {
            if (nodeId == otherId) {
                continue
            }
            if (this.isConnected(nodeId, otherId)) {
                connectedIds.push(otherId)
            }
        }

        return connectedIds
    }

    connectionMatrix: Array<boolean>

    matrixSize: number

    constructor(size: number) {
        const arraySize = calculateSum(1, size - 1)

        this.connectionMatrix = Array(arraySize).fill(false)
        this.matrixSize = size
    }

    getMatrixIndex(nodeIdA: number, nodeIdB: number): number {
        if (nodeIdA == nodeIdB) {
            return -1
        }

        const minId = Math.min(nodeIdA, nodeIdB)
        const maxId = Math.max(nodeIdA, nodeIdB)

        let index = 0

        if (minId > 0) {
            index = calculateSum(this.matrixSize - minId, this.matrixSize - 1)
        }
        index += maxId - (minId + 1)

        return index
    }
}

function main() {
    let ctx: CanvasRenderingContext2D

    const WIDTH = 300
    const HEIGHT = 300

    {
        const canvas = document.createElement('canvas')

        canvas.width = WIDTH
        canvas.height = HEIGHT

        canvas.style.width = `${WIDTH}px`
        canvas.style.height = `${HEIGHT}px`

        const tmp = canvas.getContext('2d')
        if (tmp == null) {
            throw new Error('failed to get canvas context')
        }
        ctx = tmp

        document.body.appendChild(canvas)
    }

    let nodes: Array<DocNode> = []

    for (let i = 0; i < 5; i++) {
        const node = new DocNode()

        node.posY = HEIGHT / 2
        node.posX = 20 + i * 40

        node.posX += Math.random() * 30
        node.posY += Math.random() * 40

        node.doc = `node ${i}`

        nodes.push(node)
    }

    const nodeCount = nodes.length

    const conManager = new ConnectionManager(nodeCount)

    conManager.setConnected(0, 1, true)
    conManager.setConnected(2, 4, true)
    conManager.setConnected(2, 3, true)
    conManager.setConnected(0, 2, true)

    const REPULSION = 2000
    const SPRING_DIST = 30
    const SPRING = 0.01

    let doLog = true

    const onFrame = () => {
        ctx.clearRect(0, 0, 300, 300)

        for (let a = 0; a < nodeCount; a++) {
            for (let b = a + 1; b < nodeCount; b++) {
                applyRepulsion(nodes[a], nodes[b], REPULSION)
                if (conManager.isConnected(a, b)) {
                    applySpring(nodes[a], nodes[b], SPRING_DIST, SPRING)
                }

                if (doLog) {
                    console.log(`${a}, ${b}`)
                }
            }
        }

        if (doLog && conManager.isConnected(1, 2)) {
            console.log("is connected")
        }

        doLog = false

        for (let i = 0; i < nodeCount; i++) {
            applyForce(nodes[i])
            resetForce(nodes[i])
        }

        for (let a = 0; a < nodeCount; a++) {
            for (let b = a + 1; b < nodeCount; b++) {
                if (conManager.isConnected(a, b)) {
                    cd.strokeLine(
                        ctx,
                        nodes[a].posX, nodes[a].posY,
                        nodes[b].posX, nodes[b].posY,
                        2, "grey"
                    )
                }
            }
        }

        for (let i = 0; i < nodeCount; i++) {
            drawDocNode(ctx, nodes[i])
        }

        // TODO: very bad way of keeping a 60 frames per second
        setTimeout(() => {
            requestAnimationFrame(onFrame)
        }, 1000 / 60)
    }

    requestAnimationFrame(onFrame)
}

main()

async function main2() {
    // we don't really have to rate limit ourself
    // but I think it's a good etiquette
    const RATE_LIMIT: number = 20 // rate / second
    let LAST_REQUEST_AT: number = 0

    const makeRequestToWiki = async (query: Record<string, string>): Promise<any> => {
        const wait = (milliseconds: number): Promise<void> => {
            return new Promise(res => {
                setTimeout(() => {
                    res()
                }, milliseconds,)
            })
        }

        let now: number = Date.now()

        if (now - LAST_REQUEST_AT < 1000 / RATE_LIMIT) {
            const toWait = 1000 / RATE_LIMIT - (now - LAST_REQUEST_AT)

            await wait(toWait)

            now = Date.now()
        }

        LAST_REQUEST_AT = now

        let link = 'https://en.wikipedia.org/w/api.php?'

        for (const key in query) {
            link = link + `&${key}=${query[key]}`
        }

        const response = await fetch(link)
        const json = await response.json()

        return json
    }

    const retrieveAllLiks = async (title: string): Promise<Array<any>> => {
        let results: Array<any> = []

        let doContinue = false
        let nextContinue = ""

        while (true) {
            let doBreak = false

            const query: Record<string, string> = {
                "action": "query",
                "prop": "links",
                "titles": title,
                "format": "json",
                "pllimit": "max",
                "plnamespace": "0",
                "origin": "*"
            }

            if (doContinue) {
                query["plcontinue"] = nextContinue
            }

            const response: any = await makeRequestToWiki(query)
            // TEST TEST TEST TEST TEST
            console.log(response)
            // TEST TEST TEST TEST TEST

            if (!("continue" in response)) {
                doBreak = true
            } else {
                doContinue = true
                nextContinue = response.continue.plcontinue
            }

            for (const pageId in response.query.pages) {
                const page = response.query.pages[pageId]

                // TEST TEST TEST TEST TEST
                for (const link of page.links) {
                    console.log(link)
                }
                // TEST TEST TEST TEST TEST

                results = results.concat(page.links)
            }

            if (doBreak) {
                break
            }
        }

        return results
    }

    const results = await retrieveAllLiks("Miss Meyers")

    console.log(results)
}
