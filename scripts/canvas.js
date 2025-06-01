export function strokeLine(ctx, x1, y1, x2, y2, lineWidth, color) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}
export function strokeRect(ctx, x, y, width, height, lineWidth, color) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.stroke();
}
export function strokeCircle(ctx, x, y, r, lineWidth, color) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r, 0, 0, Math.PI * 2);
    ctx.stroke();
}
export function fillCircle(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r, 0, 0, Math.PI * 2);
    ctx.fill();
}
