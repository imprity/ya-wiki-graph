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

export function calculateSum(a: number, b: number): number {
    return (b - a + 1) * (a + b) / 2
}

export function objHasMatchingKeys(obj: any, instance: any): boolean {
    const keys = Reflect.ownKeys(instance)

    for (const key of keys) {
        const instanceType = typeof instance[key]
        const objType = typeof obj[key]

        if (instanceType !== objType) {
            return false
        }

        if (instanceType == "object") {
            if (Array.isArray(instance[key])) {
                if (!Array.isArray(obj[key])) {
                    return false
                }
            } else {
                if (!objHasMatchingKeys(instance[key], obj[key])) {
                    return false
                }
            }
        }
    }

    return true
}

