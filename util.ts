export function saveBlob(blob: Blob, fileName: string) {
    const url = window.URL.createObjectURL(blob)

    const link = document.createElement('a');

    link.href = url;
    link.download = fileName

    document.body.appendChild(link);
    link.click();

    link.remove()
    URL.revokeObjectURL(url)
}

