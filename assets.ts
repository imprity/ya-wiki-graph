import * as util from "./util.js"

export let circleImage: ImageBitmap | null = null
export let glowImage: ImageBitmap | null = null
export let loadingCircleImage: ImageBitmap | null = null

export async function loadAssets() {
    const loadImage = async (url: string, cb: (img: ImageBitmap | null) => void) => {
        const blob = await util.fetchBlob(url)
        let result = await createImageBitmap(blob)
        cb(result)
    }

    await Promise.all([
        loadImage('assets/circle.png', (img) => { circleImage = img }),
        loadImage('assets/glow.png', (img) => { glowImage = img }),
        loadImage('assets/loading-circle.png', (img) => { loadingCircleImage = img })
    ])
}
