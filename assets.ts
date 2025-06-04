import * as util from "./util.js"

export let circleImage: ImageBitmap | null = null
export let glowImage: ImageBitmap | null = null
export let loadingCircleImage: ImageBitmap | null = null

export async function loadAssets() {
    const loadImage = async (url: string): Promise<ImageBitmap> => {
        const blob = await util.fetchBlob(url)
        return await createImageBitmap(blob)
    }

    circleImage = await loadImage('assets/circle.png')
    glowImage = await loadImage('assets/glow.png')
    loadingCircleImage = await loadImage('assets/loading-circle.png')
}
