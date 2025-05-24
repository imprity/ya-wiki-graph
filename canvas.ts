export function strokeLine(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number,
    x2: number, y2: number,
    lineWidth: number,
    color: string
) {
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = color

    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke()
}

export function strokeRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    width: number, height: number,
    lineWidth: number,
    color: string
) {
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = color

    ctx.beginPath();
    ctx.rect(x, y, width, height)
    ctx.stroke()
}

export function strokeCircle(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, r: number,
    lineWidth: number,
    color: string
) {
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = color

    ctx.beginPath();
    ctx.ellipse(x, y, r, r, 0, 0, Math.PI)
    ctx.stroke()
}

export function fillCircle(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, r: number,
    color: string
) {
    ctx.fillStyle = color

    ctx.beginPath();
    ctx.ellipse(x, y, r, r, 0, 0, Math.PI * 2)
    ctx.fill()
}
