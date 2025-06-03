let debugMsgs: Map<string, string> = new Map()
let debugPrintBox = document.getElementById('debug-print-box')

export function clearDebugPrint() {
    debugMsgs.clear()
}

export function debugPrint(key: string, value: string) {
    debugMsgs.set(key, value)
}

export function renderDebugPrint() {
    if (debugPrintBox === null) {
        return
    }

    const childrenCount = debugPrintBox.children.length
    const mapSize = debugMsgs.size

    for (let i = 0; i < mapSize - childrenCount; i++) {
        const p = document.createElement('p')
        p.classList.add('debug-print-msg')
        debugPrintBox.appendChild(p)
    }

    for (let i = 0; i < childrenCount - mapSize; i++) {
        const p = debugPrintBox.lastChild
        if (p == null) {
            break
        }
        p.remove()
    }

    const children = debugPrintBox.children
    let cursor = 0

    debugMsgs.forEach((value, key, map) => {
        const child = children[cursor]
        if ('innerText' in child) {
            child.innerText = `${key}: ${value}`
        }
        cursor++
    })
}

export function setDebugPrintVisible(visible: boolean) {
    if (debugPrintBox === null) {
        return
    }
    if (visible) {
        debugPrintBox.style.display = 'block'
    } else {
        debugPrintBox.style.display = 'none'
    }
}

export function isDebugPrintVisible(): boolean {
    if (debugPrintBox === null) {
        return false
    }
    return debugPrintBox.style.display !== 'none'
}
