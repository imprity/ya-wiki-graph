var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as color from "./color.js";
import * as util from "./util.js";
export class ColorTable {
    constructor() {
        this.background = new color.Color(255, 255, 255, 255);
        this.titleTextStroke = new color.Color(255, 255, 255, 255);
        this.titleTextFill = new color.Color(0, 0, 0, 255);
        // TODO: remove this if not necessary
        this.nodeStroke = new color.Color(255, 255, 255, 255);
        this.timerStroke = new color.Color(0, 0, 0, 255);
        this.node0 = new color.Color(0xC4, 0xBD, 0xC0, 0xFF);
        this.node1 = new color.Color(0x78, 0x8D, 0xA8, 0xFF);
        this.node2 = new color.Color(0xD4, 0x72, 0x91, 0xFF);
        this.node3 = new color.Color(0x9F, 0xBA, 0xAE, 0xFF);
        this.node4 = new color.Color(0x72, 0x88, 0xCC, 0xFF);
    }
}
let _nodeColorArray = new Array(5);
export function tableNodeColors(table) {
    _nodeColorArray[0] = table.node0;
    _nodeColorArray[1] = table.node1;
    _nodeColorArray[2] = table.node2;
    _nodeColorArray[3] = table.node3;
    _nodeColorArray[4] = table.node4;
    return _nodeColorArray;
}
export function copyTable(src, dst) {
    for (const key in src) {
        dst[key] = src[key].copy();
    }
}
export function serializeColorTable(table) {
    return JSON.stringify(table);
}
export function deserializeColorTable(table, json) {
    const jsonObj = JSON.parse(json);
    if (!util.objHasMatchingKeys(jsonObj, table, true)) {
        throw new Error('json object is not a ColorTable');
    }
    for (const key in table) {
        const jsonColor = jsonObj[key];
        if (typeof jsonColor !== 'undefined') {
            table[key].setFromColor(jsonColor);
        }
    }
}
export function loadColorTable(url) {
    return __awaiter(this, void 0, void 0, function* () {
        const blob = yield util.fetchBlob(url);
        const tableJson = yield blob.text();
        const table = new ColorTable();
        deserializeColorTable(table, tableJson);
        return table;
    });
}
