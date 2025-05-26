import * as color from "./color.js"
import * as util from "./util.js"

export class ColorTable {
    background: color.Color = new color.Color(255, 255, 255, 255)

    titleTextStroke: color.Color = new color.Color(255, 255, 255, 255)
    titleTextFill: color.Color = new color.Color(0, 0, 0, 255)

    nodeStroke: color.Color = new color.Color(255, 255, 255, 255)

    timerStroke: color.Color = new color.Color(0, 0, 0, 255)
}

export function serializeColorTable(table: ColorTable): string {
    return JSON.stringify(table)
}

export function deserializeColorTable(table: ColorTable, json: string) {
    const jsonObj = JSON.parse(json)
    if (!util.objHasMatchingKeys(jsonObj, table)) {
        throw new Error('json object is not a ColorTable')
    }

    for (const key in table) {
        table[key as keyof ColorTable].setFromColor(jsonObj[key])
    }
}
