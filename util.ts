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
