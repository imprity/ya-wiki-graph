import * as color from "./color.js";
import * as util from "./util.js";
export class ColorTable {
    constructor() {
        this.background = new color.Color(255, 255, 255, 255);
        this.titleTextStroke = new color.Color(255, 255, 255, 255);
        this.titleTextFill = new color.Color(0, 0, 0, 255);
        this.nodeStroke = new color.Color(255, 255, 255, 255);
        this.timerStroke = new color.Color(0, 0, 0, 255);
    }
}
export function serializeColorTable(table) {
    return JSON.stringify(table);
}
export function deserializeColorTable(table, json) {
    const jsonObj = JSON.parse(json);
    if (!util.objHasMatchingKeys(jsonObj, table)) {
        throw new Error('json object is not a ColorTable');
    }
    for (const key in table) {
        table[key].setFromColor(jsonObj[key]);
    }
}
