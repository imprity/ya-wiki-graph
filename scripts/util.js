var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export function saveBlob(blob, fileName) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
export function fetchBlob(url) {
    return __awaiter(this, void 0, void 0, function* () {
        const body = yield fetch(url);
        if (body.status !== 200) {
            throw new Error(`failed to fetch ${url}: ${body.statusText}`);
        }
        return yield body.blob();
    });
}
export function calculateSum(a, b) {
    return (b - a + 1) * (a + b) / 2;
}
export function objHasMatchingKeys(obj, instance, forgiveMissingProperties) {
    const keys = Reflect.ownKeys(instance);
    for (const key of keys) {
        const instanceType = typeof instance[key];
        const objType = typeof obj[key];
        if (forgiveMissingProperties && objType === 'undefined') {
            continue;
        }
        if (instanceType !== objType) {
            return false;
        }
        if (instanceType == "object") {
            if (Array.isArray(instance[key])) {
                if (!Array.isArray(obj[key])) {
                    return false;
                }
            }
            else {
                if (!objHasMatchingKeys(instance[key], obj[key], forgiveMissingProperties)) {
                    return false;
                }
            }
        }
    }
    return true;
}
export class Stack {
    constructor() {
        this.buffer = new Array(512);
        this.length = 0;
    }
    push(thing) {
        if (this.length >= this.buffer.length) {
            let cap = this.buffer.length;
            while (cap <= this.length) {
                cap *= 2;
            }
            this.buffer.length = cap;
        }
        this.buffer[this.length] = thing;
        this.length++;
    }
    pop() {
        const toReturn = this.buffer[this.length - 1];
        this.length--;
        return toReturn;
    }
    peekAt(at) {
        return this.buffer[at];
    }
    clear() {
        this.length = 0;
    }
}
export class ArrayView {
    constructor(data, start, length) {
        this.start = start;
        this.length = length;
        this.data = data;
    }
    get(at) {
        if (!(0 <= at && at < this.length)) {
            throw new Error(`index ${at} out of bound, length: ${this.length}`);
        }
        at -= this.start;
        return this.data[at];
    }
}
export class LinkedList {
    constructor(value) {
        this.next = null;
        this.value = value;
    }
}
export class ByteBuffer {
    constructor(type) {
        this._length = 0;
        this._buffer = new type(512);
        this._type = type;
    }
    length() {
        return this._length;
    }
    setLength(length) {
        if (this._buffer.length < length) {
            let capacity = this._buffer.length;
            while (capacity < length) {
                capacity *= 2;
            }
            this._buffer = new this._type(capacity);
        }
        this._length = length;
    }
    get(at) {
        return this._buffer[at];
    }
    set(at, value) {
        // if (!(0 <= at && at < this._length)) {
        //     throw new Error(`index out of bound !(0 <= at < ${this._length})`)
        // }
        this._buffer[at] = value;
    }
    cast(type, elementCount = this._length) {
        let view = new type(this._buffer.buffer);
        return view.subarray(0, elementCount);
    }
}
export function arrayRemove(array, toRemove) {
    if (!(0 <= toRemove && toRemove < array.length)) {
        return array;
    }
    for (let i = toRemove; i + 1 < array.length; i++) {
        array[i] = array[i + 1];
    }
    array.length -= 1;
    return array;
}
export function arrayRemoveFast(array, toRemove) {
    if (!(0 <= toRemove && toRemove < array.length)) {
        return array;
    }
    array[toRemove] = array[array.length - 1];
    array.length -= 1;
    return array;
}
export function fuzzyMatch(str, sub) {
    if (sub.length === 0 || str.length === 0) {
        return {
            start: 0,
            length: 0,
            distance: 0
        };
    }
    const width = str.length + 1;
    const height = sub.length + 1;
    const matrix = new Array(width * height).fill(0);
    const get = (x, y) => {
        return matrix[x + y * width];
    };
    const set = (x, y, to) => {
        matrix[x + y * width] = to;
    };
    // fill the first column
    for (let y = 1; y < height; y++) {
        set(0, y, y);
    }
    for (let y = 1; y < height; y++) {
        for (let x = 1; x < width; x++) {
            const c = str[x - 1];
            const subC = sub[y - 1];
            if (c === subC) {
                set(x, y, get(x - 1, y - 1));
            }
            else {
                set(x, y, 1 + Math.min(get(x, y - 1), get(x - 1, y), get(x - 1, y - 1)));
            }
        }
    }
    // TEST TEST TEST TEST
    // for (let y = 0; y < height; y++) {
    //     let row = ''
    //     for (let x = 0; x < width; x++) {
    //         row += `${get(x, y)} `
    //     }
    //     console.log(row)
    // }
    // TEST TEST TEST TEST
    let minCol = 0;
    let minDidst = Number.MAX_SAFE_INTEGER;
    for (let x = 0; x < width; x++) {
        let dist = get(x, height - 1);
        if (dist < minDidst) {
            minCol = x;
            minDidst = dist;
        }
    }
    // there is no matching word
    if (minCol === 0) {
        return {
            start: 0,
            length: 0,
            distance: minDidst
        };
    }
    let posX = minCol;
    let posY = height - 1;
    while (true) {
        let diag = get(posX - 1, posY - 1);
        let cur = get(posX, posY);
        if (diag === cur) {
            posX -= 1;
            posY -= 1;
        }
        else {
            let up = get(posX, posY - 1);
            let left = get(posX - 1, posY);
            let min = Math.min(up, left, diag);
            if (up === min) {
                posY -= 1;
            }
            else if (diag === min) {
                posX -= 1;
                posY -= 1;
            }
            else { // left === min
                posX -= 1;
            }
        }
        if (posX <= 0 || posY <= 0) {
            break;
        }
    }
    return {
        start: posX,
        length: minCol - posX,
        distance: minDidst
    };
}
export function mustGetElementById(id) {
    const elem = document.getElementById(id);
    if (elem === null) {
        throw new Error(`failed to get ${id}`);
    }
    return elem;
}
export function blurItAndChildren(element) {
    const toRecurse = (e) => {
        e.blur();
        //@ts-expect-error
        for (const child of e.children) {
            toRecurse(child);
        }
    };
    toRecurse(element);
}
