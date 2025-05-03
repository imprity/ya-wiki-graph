export class Vector2 {
    constructor(x, y) {
        this.x = 0;
        this.y = 0;
        this.x = x;
        this.y = y;
    }
}
export function vector2Rotate(v, rot) {
    const sin = Math.sin(rot);
    const cos = Math.cos(rot);
    return new Vector2(v.x * cos - v.y * sin, v.x * sin + v.y * cos);
}
export function vector2Add(v1, v2) {
    return new Vector2(v1.x + v2.x, v1.y + v2.y);
}
export function vector2Sub(v1, v2) {
    return new Vector2(v1.x - v2.x, v1.y - v2.y);
}
export function vector2Scale(v, scale) {
    return new Vector2(v.x * scale, v.y * scale);
}
export function vector2DistSquared(v) {
    return v.x * v.x + v.y * v.y;
}
export function vector2Dist(v) {
    return Math.sqrt(vector2DistSquared(v));
}
