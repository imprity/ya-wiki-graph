export class Color {
    // all 0 - 255
    // non alpha premultiplied
    r: number = 0
    g: number = 0
    b: number = 0
    a: number = 0
}

export function getRandomColor(): Color {
    const c = new Color()
    c.r = Math.round(Math.random() * 255)
    c.g = Math.round(Math.random() * 255)
    c.b = Math.round(Math.random() * 255)
    c.a = Math.round(Math.random() * 255)

    return c
}
