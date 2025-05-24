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
