
// we don't really have to rate limit ourself
// but I think it's a good etiquette
const RATE_LIMIT: number = 20 // rate / second
let LAST_REQUEST_AT: number = 0

export async function makeRequestToWiki(query: Record<string, string>): Promise<any> {
    const wait = (milliseconds: number): Promise<void> => {
        return new Promise(res => {
            setTimeout(() => {
                res()
            }, milliseconds,)
        })
    }

    let now: number = Date.now()

    if (now - LAST_REQUEST_AT < 1000 / RATE_LIMIT) {
        const toWait = 1000 / RATE_LIMIT - (now - LAST_REQUEST_AT)

        await wait(toWait)

        now = Date.now()
    }

    LAST_REQUEST_AT = now

    let link = 'https://en.wikipedia.org/w/api.php?'

    for (const key in query) {
        link = link + `&${key}=${query[key]}`
    }

    const response = await fetch(link)
    const json = await response.json()

    return json
}

export async function retrieveAllLiks(title: string): Promise<Array<string>> {
    let results: Array<string> = []

    let doContinue = false
    let nextContinue = ""

    while (true) {
        let doBreak = false

        const query: Record<string, string> = {
            "action": "query",
            "prop": "links",
            "titles": title,
            "format": "json",
            "pllimit": "max",
            "plnamespace": "0",
            "origin": "*"
        }

        if (doContinue) {
            query["plcontinue"] = nextContinue
        }

        const response: any = await makeRequestToWiki(query)
        // TEST TEST TEST TEST TEST
        console.log(response)
        // TEST TEST TEST TEST TEST

        if (!("continue" in response)) {
            doBreak = true
        } else {
            doContinue = true
            nextContinue = response.continue.plcontinue
        }

        for (const pageId in response.query.pages) {
            const page = response.query.pages[pageId]

            for (const link of page.links) {
                // TEST TEST TEST TEST TEST
                console.log(link)
                // TEST TEST TEST TEST TEST
                results.push(link.title)
            }
        }

        if (doBreak) {
            break
        }
    }

    return results
}
