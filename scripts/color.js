export class Color {
    constructor(r = 0, g = 0, b = 0, a = 0) {
        // all 0 - 255
        // non alpha premultiplied
        this.r = 0;
        this.g = 0;
        this.b = 0;
        this.a = 0;
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }
}
export function getRandomColor() {
    const c = new Color();
    c.r = Math.round(Math.random() * 255);
    c.g = Math.round(Math.random() * 255);
    c.b = Math.round(Math.random() * 255);
    c.a = Math.round(Math.random() * 255);
    return c;
}
