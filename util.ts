export function saveBlob(blob: Blob, fileName: string) {
    const url = window.URL.createObjectURL(blob)

    const link = document.createElement('a');

    link.href = url;
    link.download = fileName

    document.body.appendChild(link);
    link.click();

    link.remove()
    URL.revokeObjectURL(url)
}

export async function fetchBlob(url: string): Promise<Blob> {
    const body = await fetch(url)
    if (body.status !== 200) {
        throw new Error(`failed to fetch ${url}: ${body.statusText}`)
    }

    return await body.blob()
}

export function calculateSum(a: number, b: number): number {
    return (b - a + 1) * (a + b) / 2
}

export function objHasMatchingKeys(
    obj: any, instance: any,
    forgiveMissingProperties: boolean
): boolean {
    const keys = Reflect.ownKeys(instance)

    for (const key of keys) {
        const instanceType = typeof instance[key]
        const objType = typeof obj[key]

        if (forgiveMissingProperties && objType === 'undefined') {
            continue
        }

        if (instanceType !== objType) {
            return false
        }

        if (instanceType == "object") {
            if (Array.isArray(instance[key])) {
                if (!Array.isArray(obj[key])) {
                    return false
                }
            } else {
                if (!objHasMatchingKeys(
                    instance[key], obj[key],
                    forgiveMissingProperties
                )) {
                    return false
                }
            }
        }
    }

    return true
}

export class Stack<T> {
    buffer: Array<T> = new Array(512)
    length = 0

    push(thing: T) {
        if (this.length >= this.buffer.length) {
            let cap = this.buffer.length
            while (cap <= this.length) {
                cap *= 2
            }
            this.buffer.length = cap
        }

        this.buffer[this.length] = thing
        this.length++
    }

    pop(): T {
        const toReturn = this.buffer[this.length - 1]
        this.length--
        return toReturn
    }

    peekAt(at: number): T {
        return this.buffer[at]
    }

    clear() {
        this.length = 0
    }
}

export class ArrayView<T> {
    start: number
    length: number
    data: Array<T>

    constructor(data: Array<T>, start: number, length: number) {
        this.start = start
        this.length = length
        this.data = data
    }

    get(at: number) {
        if (!(0 <= at && at < this.length)) {
            throw new Error(`index ${at} out of bound, length: ${this.length}`)
        }
        at -= this.start
        return this.data[at]
    }
}

export class LinkedList<T> {
    next: LinkedList<T> | null = null
    value: T

    constructor(value: T) {
        this.value = value
    }
}

type TypedArray =
    | Int8Array
    | Uint8Array
    | Uint8ClampedArray
    | Int16Array
    | Uint16Array
    | Int32Array
    | Uint32Array
    | Float32Array
    | Float64Array

interface TypedArrayConstructor {
    BYTES_PER_ELEMENT: number
    new(elementCount: number): TypedArray
    new(buffer: ArrayBuffer): TypedArray
}

export class ByteBuffer {
    _buffer: TypedArray
    _type: TypedArrayConstructor
    _length = 0

    constructor(type: TypedArrayConstructor) {
        this._buffer = new type(512)
        this._type = type
    }

    length(): number {
        return this._length
    }

    setLength(length: number) {
        if (this._buffer.length < length) {
            let capacity = this._buffer.length
            while (capacity < length) {
                capacity *= 2
            }
            this._buffer = new this._type(capacity)
        }
        this._length = length
    }

    get(at: number): number {
        return this._buffer[at]
    }

    set(at: number, value: number) {
        // if (!(0 <= at && at < this._length)) {
        //     throw new Error(`index out of bound !(0 <= at < ${this._length})`)
        // }
        this._buffer[at] = value
    }

    cast(type: TypedArrayConstructor, elementCount: number = this._length): TypedArray {
        let view = new type(this._buffer.buffer)
        return view.subarray(0, elementCount)
    }
}

export function arrayRemove<T>(array: Array<T>, toRemove: number): Array<T> {
    if (!(0 <= toRemove && toRemove < array.length)) {
        return array
    }

    for (let i = toRemove; i + 1 < array.length; i++) {
        array[i] = array[i + 1]
    }
    array.length -= 1
    return array
}

export function arrayRemoveFast<T>(array: Array<any>, toRemove: number): Array<T> {
    if (!(0 <= toRemove && toRemove < array.length)) {
        return array
    }
    array[toRemove] = array[array.length - 1]
    array.length -= 1
    return array
}

export function fuzzyMatch(str: string, sub: string): {
    start: number,
    length: number
    distance: number
} {
    if (sub.length === 0 || str.length === 0) {
        return {
            start: 0,
            length: 0,
            distance: 0
        }
    }

    const width = str.length + 1
    const height = sub.length + 1

    const matrix: Array<number> = new Array(width * height).fill(0)

    const get = (x: number, y: number): number => {
        return matrix[x + y * width]
    }

    const set = (x: number, y: number, to: number) => {
        matrix[x + y * width] = to
    }

    // fill the first column
    for (let y = 1; y < height; y++) {
        set(0, y, y)
    }

    for (let y = 1; y < height; y++) {
        for (let x = 1; x < width; x++) {
            const c = str[x - 1]
            const subC = sub[y - 1]

            if (c === subC) {
                set(x, y, get(x - 1, y - 1))
            } else {
                set(x, y, 1 + Math.min(
                    get(x, y - 1),
                    get(x - 1, y),
                    get(x - 1, y - 1),
                ))
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

    let minCol = 0
    let minDidst = Number.MAX_SAFE_INTEGER
    for (let x = 0; x < width; x++) {
        let dist = get(x, height - 1)
        if (dist < minDidst) {
            minCol = x
            minDidst = dist
        }
    }

    // there is no matching word
    if (minCol === 0) {
        return {
            start: 0,
            length: 0,
            distance: minDidst
        }
    }

    let posX = minCol
    let posY = height - 1

    while (true) {
        let diag = get(posX - 1, posY - 1)
        let cur = get(posX, posY)

        if (diag === cur) {
            posX -= 1
            posY -= 1
        } else {
            let up = get(posX, posY - 1)
            let left = get(posX - 1, posY)

            let min = Math.min(up, left, diag)

            if (up === min) {
                posY -= 1
            } else if (diag === min) {
                posX -= 1
                posY -= 1
            } else { // left === min
                posX -= 1
            }
        }

        if (posX <= 0 || posY <= 0) {
            break
        }
    }

    return {
        start: posX,
        length: minCol - posX,
        distance: minDidst
    }
}

export function mustGetElementById(id: string): HTMLElement {
    const elem = document.getElementById(id)
    if (elem === null) {
        throw new Error(`failed to get ${id}`)
    }
    return elem
}
