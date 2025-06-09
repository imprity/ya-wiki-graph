
// we don't really have to rate limit ourself
// but I think it's a good etiquette
const RATE_LIMIT: number = 20 // rate / second
let LAST_REQUEST_AT: number = 0

export class WikipediSite {
    code: string
    name: string
    localname: string

    constructor(
        code: string,
        name: string,
        localname: string
    ) {
        this.code = code
        this.name = name
        this.localname = localname
    }
}

// check the domain name and see if wikipedia domain
export function isWikipediaURL(urlStr: string): boolean {
    let url: URL

    try {
        url = new URL(urlStr)
    } catch (err) {
        return false
    }

    const allowedDomains = [
        'wikimedia.org',
        'wikipedia.org'
    ]

    for (const domain of allowedDomains) {
        if (url.hostname.endsWith('.' + domain)) {
            return true
        }
    }

    return false
}

export async function makeRequestToWiki(urlStr: string, query: Record<string, string>): Promise<any> {
    if (!isWikipediaURL(urlStr)) {
        throw new Error(`${urlStr} is not a wikipedia url`)
    }

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

    const url = new URL(urlStr)
    const params = url.searchParams

    for (const key in query) {
        params.append(key, query[key])
    }

    const response = await fetch(url)
    const json = await response.json()

    return json
}

export async function getWikipediaSites(): Promise<Array<WikipediSite>> {
    let url = 'https://commons.wikimedia.org/w/api.php'

    const query: Record<string, string> = {
        "action": "sitematrix",
        "format": "json",
        "smtype": "language",
        "origin": "*",
        'smlimit': "100"
    }

    let sites: Array<WikipediSite> = []

    while (true) {
        const res = await makeRequestToWiki(url, query)

        for (const key in res.sitematrix) {
            if (key !== 'count') {
                const site = res.sitematrix[key]

                if (
                    typeof site.code === 'string' &&
                    typeof site.name === 'string' &&
                    typeof site.localname === 'string'
                ) {
                    sites.push(new WikipediSite(
                        site.code, site.name, site.localname))
                }
            }
        }

        if (res['query-continue']?.sitematrix?.smcontinue) {
            query['smcontinue'] = `${res['query-continue'].sitematrix.smcontinue}`
        } else {
            break
        }
    }

    return sites
}

export async function retrieveAllLiks(site: WikipediSite, title: string): Promise<Array<string>> {
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

        const link = `https://${site.code}.wikipedia.org/w/api.php`

        const response: any = await makeRequestToWiki(
            link, query
        )

        if (!("continue" in response)) {
            doBreak = true
        } else {
            doContinue = true
            nextContinue = response.continue.plcontinue
        }

        for (const pageId in response.query.pages) {
            const page = response.query.pages[pageId]

            for (const link of page.links) {
                results.push(link.title)
            }
        }

        if (doBreak) {
            break
        }
    }

    return results
}

export async function searchWiki(site: WikipediSite, search: string): Promise<string | null> {
    const link = `https://${site.code}.wikipedia.org/w/api.php`
    const query: Record<string, string> = {
        "action": "opensearch",
        "search": `${search}`,
        "limit": "1",
        "redirects": "resolve",
        "format": "json",
        "origin": "*",
    }

    const res = await makeRequestToWiki(link, query)

    console.log(res)

    if (res['1'].length <= 0) {
        return null
    } else {
        return res['1'][0]
    }
}

export function openWikipedia(site: WikipediSite, title: string) {
    const regex = / /g
    title = title.replace(regex, "_")
    let url = `https://${site.code}.wikipedia.org/wiki/${title}`
    if (!isWikipediaURL(url)) {
        throw new Error(`${url} is not a wikipedia url`)
    }
    window.open(url)
}
