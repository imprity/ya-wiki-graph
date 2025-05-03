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

