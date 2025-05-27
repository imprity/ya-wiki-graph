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
export function boxIntersects(minX1, minY1, maxX1, maxY1, minX2, minY2, maxX2, maxY2) {
    if (maxX1 >= minX2 && maxX2 >= minX1 &&
        maxY1 >= minY2 && maxY2 >= minY1) {
        return true;
    }
    return false;
}
export function distSquared(x, y) {
    return x * x + y * y;
}
export function dist(x, y) {
    return Math.sqrt(distSquared(x, y));
}
export function posInBox(posX, posY, minX, minY, maxX, maxY) {
    return minX < posX && posX < maxX &&
        minY < posY && posY < maxY;
}
export function posInCircle(posX, posY, circleX, circleY, radius) {
    const dx = posX - circleX;
    const dy = posY - circleY;
    return dx * dx + dy * dy < radius * radius;
}
export function clamp(n, min, max) {
    n = Math.min(n, max);
    n = Math.max(n, min);
    return n;
}
export function clampAbs(n, abs) {
    if (n < -abs) {
        n = -abs;
    }
    else if (n > abs) {
        n = abs;
    }
    return n;
}
export function closeToZero(n) {
    return Math.abs(n) < 0.00001;
}
export function prettySame(a, b) {
    return Math.abs(a - b) < 0.00001;
}
export function lerp(a, b, t) {
    return a + (b - a) * t;
}
export function randomBetween(a, b) {
    return Math.random() * (b - a) + a;
}
// return random int between a and b
// b is inclusive
export function randomBetweenInt(a, b) {
    return Math.round(randomBetween(a, b));
}
// return random odd int between a and b
// b is inclusive
// if a and be are same, returns rounded a
export function randomOddBetween(a, b) {
    if (a === b) {
        return Math.round(a);
    }
    let n = randomBetween(a, b);
    let floor = Math.floor(n);
    let ceil = Math.ceil(n);
    if (floor % 2 == 0) {
        return ceil;
    }
    return floor;
}
// return random even int between a and b
// b is inclusive
// if a and be are same, returns rounded a
export function randomEvenBetween(a, b) {
    if (a === b) {
        return Math.round(a);
    }
    let n = randomBetween(a, b);
    let floor = Math.floor(n);
    let ceil = Math.ceil(n);
    if (floor % 2 == 0) {
        return floor;
    }
    return ceil;
}
