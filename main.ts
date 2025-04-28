import * as cd from "./canvas.js"

let NODE_ID_MAX = 0

function getNewNodeId(): number {
    NODE_ID_MAX++;
    return NODE_ID_MAX
}

class Node {
    posX: number = 0
    posY: number = 0

    doc: string = ""

    id: number = 0

    constructor() {
        this.id = getNewNodeId()
    }
}

function drawNode(
    ctx: CanvasRenderingContext2D,
    node: Node,
) {
    const radius = 8
    cd.fillCircle(ctx, node.posX, node.posY, radius, "rgb(100, 100, 100)")

    ctx.font = "12px sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "bottom"
    ctx.fillText(node.doc, node.posX, node.posY - radius - 2)
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

    {
        const canvas = document.createElement('canvas')

        canvas.width = 300
        canvas.height = 300

        canvas.style.width = '300px'
        canvas.style.height = '300px'

        const tmp = canvas.getContext('2d')
        if (tmp == null) {
            throw new Error('failed to get canvas context')
        }
        ctx = tmp

        document.body.appendChild(canvas)
    }

    const node = new Node()
    node.doc = 'test node'
    node.posX = 150
    node.posY = 150

    drawNode(ctx, node)
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
