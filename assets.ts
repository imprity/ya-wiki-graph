export let circleImage: ImageBitmap | null = null

export async function loadAssets() {
    const loadImage = async (url: string): Promise<ImageBitmap> => {
        const body = await fetch(url)
        if (body.status !== 200) {
            throw new Error(`failed to fetch ${url}: ${body.statusText}`)
        }
        const blob = await body.blob()
        return await createImageBitmap(blob)
    }

    circleImage = await loadImage('circle.png')
}
