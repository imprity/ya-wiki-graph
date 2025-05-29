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
