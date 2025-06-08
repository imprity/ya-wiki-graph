import * as color from "./color.js"
import * as util from "./util.js"

export class ColorTable {
    background: color.Color = new color.Color(255, 255, 255, 255)

    titleTextStroke: color.Color = new color.Color(255, 255, 255, 255)
    titleTextFill: color.Color = new color.Color(0, 0, 0, 255)

    titleHLTextStroke: color.Color = new color.Color(255, 255, 255, 255)
    titleHLTextFill: color.Color = new color.Color(0, 0, 0, 255)

    // TODO: remove this if not necessary
    nodeStroke: color.Color = new color.Color(255, 255, 255, 255)

    timerStroke: color.Color = new color.Color(0, 0, 0, 255)

    node0: color.Color = new color.Color(0xC4, 0xBD, 0xC0, 0xFF)
    node1: color.Color = new color.Color(0x78, 0x8D, 0xA8, 0xFF)
    node2: color.Color = new color.Color(0xD4, 0x72, 0x91, 0xFF)
    node3: color.Color = new color.Color(0x9F, 0xBA, 0xAE, 0xFF)
    node4: color.Color = new color.Color(0x72, 0x88, 0xCC, 0xFF)
}

let _nodeColorArray: Array<color.Color> = new Array(5)

export function tableNodeColors(table: ColorTable): Array<color.Color> {
    _nodeColorArray[0] = table.node0
    _nodeColorArray[1] = table.node1
    _nodeColorArray[2] = table.node2
    _nodeColorArray[3] = table.node3
    _nodeColorArray[4] = table.node4

    return _nodeColorArray
}

export function copyTable(src: ColorTable, dst: ColorTable) {
    for (const key in src) {
        dst[key as keyof ColorTable] = src[key as keyof ColorTable].copy()
    }
}

export function serializeColorTable(table: ColorTable): string {
    return JSON.stringify(table)
}

export function deserializeColorTable(table: ColorTable, json: string) {
    const jsonObj = JSON.parse(json)
    if (!util.objHasMatchingKeys(jsonObj, table, true)) {
        throw new Error('json object is not a ColorTable')
    }

    for (const key in table) {
        const jsonColor = jsonObj[key]
        if (typeof jsonColor !== 'undefined') {
            table[key as keyof ColorTable].setFromColor(jsonColor)
        }
    }
}

export async function loadColorTable(url: string): Promise<ColorTable> {
    const blob = await util.fetchBlob(url)
    const tableJson = await blob.text()
    const table = new ColorTable()
    deserializeColorTable(table, tableJson)
    return table
}
