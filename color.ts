import * as math from './math.js'

export class Color {
    // all 0 - 255
    // non alpha premultiplied
    r: number = 0
    g: number = 0
    b: number = 0
    a: number = 0
    constructor(
        r: number = 0,
        g: number = 0,
        b: number = 0,
        a: number = 0,
    ) {
        this.r = r
        this.g = g
        this.b = b
        this.a = a
    }

    copy(): Color {
        return new Color(this.r, this.g, this.b, this.a)
    }

    toCssString(): string {
        return `rgba(${this.r}, ${this.g}, ${this.b}, ${this.a / 255.0})`
    }
    toHexString(): string {
        const hex = (n: number): string => {
            let s = n.toString(16)
            if (s.length < 2) {
                s = '0' + s
            }
            return s
        }
        return hex(this.r) +
            hex(this.g) +
            hex(this.b) +
            hex(this.a)
    }

    setFromColor(otherColor: Color): Color {
        this.r = otherColor.r
        this.g = otherColor.g
        this.b = otherColor.b
        this.a = otherColor.a

        return this
    }

    // parse strings like aabbcc or aabbccdd
    setFromHexString(str: string): Color {
        let n = parseInt(str, 16)
        if (isNaN(n)) {
            return this
        }

        if (str.length > 6) {
            this.a = n & 0xFF
            n = n >> 8
        }
        this.b = n & 0xFF
        n = n >> 8
        this.g = n & 0xFF
        n = n >> 8
        this.r = n & 0xFF
        n = n >> 8

        return this
    }

    // normalize to 0-1
    getNormalized(): Color {
        return new Color(
            this.r / 255,
            this.g / 255,
            this.b / 255,
            this.a / 255,
        )
    }

    // then alpha premultiplied
    getPreMultiplied(): Color {
        const c = this.copy()
        c.r *= c.a / 255
        c.g *= c.a / 255
        c.b *= c.a / 255
        return c
    }
}

export function getRandomColor(): Color {
    const c = new Color()
    c.r = Math.round(Math.random() * 255)
    c.g = Math.round(Math.random() * 255)
    c.b = Math.round(Math.random() * 255)
    c.a = Math.round(Math.random() * 255)

    return c
}

export interface HSV {
    hue: number
    saturation: number
    value: number
}

export function colorToHSV(clr: Color): HSV {
    const norm = clr.getNormalized()

    const cMax = Math.max(norm.r, norm.g, norm.b)
    const cMin = Math.min(norm.r, norm.g, norm.b)

    const dist = cMax - cMin

    let hue: number = 0

    if (math.closeToZero(dist)) {
        hue = 0
    } else {
        if (cMax === norm.r) {
            hue = ((norm.g - norm.b) / dist) % 6.0
        } else if (cMax === norm.g) {
            hue = ((norm.b - norm.r) / dist) + 2.0
        } else {
            hue = ((norm.r - norm.g) / dist) + 4.0
        }
    }

    hue *= 60.0 * Math.PI / 180.0

    let saturation = 0
    if (cMax > 0) {
        saturation = dist / cMax
    }

    let brightness = cMax

    saturation = math.clamp(saturation, 0, 1)
    brightness = math.clamp(brightness, 0, 1)

    while (hue < 0) {
        hue += Math.PI * 2
    }

    while (hue > Math.PI) {
        hue -= Math.PI * 2
    }

    return {
        hue: hue,
        saturation: saturation,
        value: brightness
    }
}

export function colorFromHSV(hue: number, saturation: number, value: number): Color {
    while (hue < 0) {
        hue += Math.PI * 2
    }

    while (hue > Math.PI * 2) {
        hue -= Math.PI * 2
    }

    saturation = math.clamp(saturation, 0, 1)
    value = math.clamp(value, 0, 1)

    const c = saturation * value
    const h = hue / (60 * Math.PI / 180)
    const x = c * (1 - Math.abs((h % 2) - 1))

    let r: number = 0
    let g: number = 0
    let b: number = 0

    if (h < 1) {
        r = c
        g = x
        b = 0
    } else if (h < 2) {
        r = x
        g = c
        b = 0
    } else if (h < 3) {
        r = 0
        g = c
        b = x
    } else if (h < 4) {
        r = 0
        g = x
        b = c
    } else if (h < 5) {
        r = x
        g = 0
        b = c
    } else {
        r = c
        g = 0
        b = x
    }

    const m = value - c

    r += m
    g += m
    b += m

    r = math.clamp(r, 0, 1)
    g = math.clamp(g, 0, 1)
    b = math.clamp(b, 0, 1)

    return new Color(
        r * 255,
        g * 255,
        b * 255,
        255
    )
}
