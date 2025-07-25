export class Vector2 {
    x: number = 0
    y: number = 0

    constructor(x: number, y: number) {
        this.x = x
        this.y = y
    }
}

export function vector2Rotate(v: Vector2, rot: number): Vector2 {
    const sin = Math.sin(rot)
    const cos = Math.cos(rot)

    return new Vector2(
        v.x * cos - v.y * sin,
        v.x * sin + v.y * cos,
    )
}

export function vector2Add(v1: Vector2, v2: Vector2): Vector2 {
    return new Vector2(v1.x + v2.x, v1.y + v2.y)
}

export function vector2Sub(v1: Vector2, v2: Vector2): Vector2 {
    return new Vector2(v1.x - v2.x, v1.y - v2.y)
}

export function vector2Scale(v: Vector2, scale: number): Vector2 {
    return new Vector2(v.x * scale, v.y * scale)
}

export function vector2DistSquared(v: Vector2): number {
    return v.x * v.x + v.y * v.y
}

export function vector2Dist(v: Vector2): number {
    return Math.sqrt(vector2DistSquared(v))
}

export function boxIntersects(
    minX1: number, minY1: number, maxX1: number, maxY1: number,
    minX2: number, minY2: number, maxX2: number, maxY2: number,
): boolean {
    if (
        maxX1 >= minX2 && maxX2 >= minX1 &&
        maxY1 >= minY2 && maxY2 >= minY1
    ) {
        return true
    }
    return false
}

export function distSquared(x: number, y: number): number {
    return x * x + y * y
}

export function dist(x: number, y: number): number {
    return Math.sqrt(distSquared(x, y))
}

export function posInBox(
    posX: number, posY: number,
    minX: number, minY: number, maxX: number, maxY: number,
): boolean {
    return minX < posX && posX < maxX &&
        minY < posY && posY < maxY
}

export function posInCircle(
    posX: number, posY: number,
    circleX: number, circleY: number,
    radius: number
): boolean {
    const dx = posX - circleX
    const dy = posY - circleY

    return dx * dx + dy * dy < radius * radius
}

export function clamp(n: number, min: number, max: number): number {
    n = Math.min(n, max)
    n = Math.max(n, min)
    return n
}

export function clampAbs(n: number, abs: number): number {
    if (n < -abs) {
        n = -abs
    } else if (n > abs) {
        n = abs
    }
    return n
}

export function closeToZero(n: number): boolean {
    return Math.abs(n) < 0.00001
}

export function prettySame(a: number, b: number): boolean {
    return Math.abs(a - b) < 0.00001
}

export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
}

export function randomBetween(a: number, b: number): number {
    return Math.random() * (b - a) + a
}

// return random int between a and b
// b is inclusive
export function randomBetweenInt(a: number, b: number): number {
    return Math.round(randomBetween(a, b))
}

// return random odd int between a and b
// b is inclusive
// if a and be are same, returns rounded a
export function randomOddBetween(a: number, b: number): number {
    if (a === b) {
        return Math.round(a)
    }

    let n = randomBetween(a, b)
    let floor = Math.floor(n)
    let ceil = Math.ceil(n)

    if (floor % 2 == 0) {
        return ceil
    }
    return floor
}

// return random even int between a and b
// b is inclusive
// if a and be are same, returns rounded a
export function randomEvenBetween(a: number, b: number): number {
    if (a === b) {
        return Math.round(a)
    }

    let n = randomBetween(a, b)
    let floor = Math.floor(n)
    let ceil = Math.ceil(n)

    if (floor % 2 == 0) {
        return floor
    }
    return ceil
}

// copy pasted from https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript
export function splitmix32(a: number) {
    return function(): number {
        a |= 0;
        a = a + 0x9e3779b9 | 0;
        let t = a ^ a >>> 16;
        t = Math.imul(t, 0x21f0aaad);
        t = t ^ t >>> 15;
        t = Math.imul(t, 0x735a2d97);
        return ((t = t ^ t >>> 15) >>> 0) / 4294967296;
    }
}

// copy pasted from https://youtu.be/LSNQuFEDOyQ?t=3011
//
// use this instead of lerp for frame indipendent lerping
// 1 is pretty slow
// 30 is almost same as just assigning
export function expDecay(a: number, b: number, decay: number, dt: number): number {
    return b + (a - b) * Math.exp(-decay * dt / 1000)
}

