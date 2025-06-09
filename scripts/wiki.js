var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// we don't really have to rate limit ourself
// but I think it's a good etiquette
const RATE_LIMIT = 20; // rate / second
let LAST_REQUEST_AT = 0;
export class WikipediSite {
    constructor(code, name, localname) {
        this.code = code;
        this.name = name;
        this.localname = localname;
    }
}
// check the domain name and see if wikipedia domain
export function isWikipediaURL(urlStr) {
    let url;
    try {
        url = new URL(urlStr);
    }
    catch (err) {
        return false;
    }
    const allowedDomains = [
        'wikimedia.org',
        'wikipedia.org'
    ];
    for (const domain of allowedDomains) {
        if (url.hostname.endsWith('.' + domain)) {
            return true;
        }
    }
    return false;
}
export function makeRequestToWiki(urlStr, query) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isWikipediaURL(urlStr)) {
            throw new Error(`${urlStr} is not a wikipedia url`);
        }
        const wait = (milliseconds) => {
            return new Promise(res => {
                setTimeout(() => {
                    res();
                }, milliseconds);
            });
        };
        let now = Date.now();
        if (now - LAST_REQUEST_AT < 1000 / RATE_LIMIT) {
            const toWait = 1000 / RATE_LIMIT - (now - LAST_REQUEST_AT);
            yield wait(toWait);
            now = Date.now();
        }
        LAST_REQUEST_AT = now;
        const url = new URL(urlStr);
        const params = url.searchParams;
        for (const key in query) {
            params.append(key, query[key]);
        }
        const response = yield fetch(url);
        const json = yield response.json();
        return json;
    });
}
export function getWikipediaSites() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        let url = 'https://commons.wikimedia.org/w/api.php';
        const query = {
            "action": "sitematrix",
            "format": "json",
            "smtype": "language",
            "origin": "*",
            'smlimit': "100"
        };
        let sites = [];
        while (true) {
            const res = yield makeRequestToWiki(url, query);
            for (const key in res.sitematrix) {
                if (key !== 'count') {
                    const site = res.sitematrix[key];
                    if (typeof site.code === 'string' &&
                        typeof site.name === 'string' &&
                        typeof site.localname === 'string') {
                        sites.push(new WikipediSite(site.code, site.name, site.localname));
                    }
                }
            }
            if ((_b = (_a = res['query-continue']) === null || _a === void 0 ? void 0 : _a.sitematrix) === null || _b === void 0 ? void 0 : _b.smcontinue) {
                query['smcontinue'] = `${res['query-continue'].sitematrix.smcontinue}`;
            }
            else {
                break;
            }
        }
        return sites;
    });
}
export function retrieveAllLiks(site, title) {
    return __awaiter(this, void 0, void 0, function* () {
        let results = [];
        let doContinue = false;
        let nextContinue = "";
        while (true) {
            let doBreak = false;
            const query = {
                "action": "query",
                "prop": "links",
                "titles": title,
                "format": "json",
                "pllimit": "max",
                "plnamespace": "0",
                "origin": "*"
            };
            if (doContinue) {
                query["plcontinue"] = nextContinue;
            }
            const link = `https://${site.code}.wikipedia.org/w/api.php`;
            const response = yield makeRequestToWiki(link, query);
            if (!("continue" in response)) {
                doBreak = true;
            }
            else {
                doContinue = true;
                nextContinue = response.continue.plcontinue;
            }
            for (const pageId in response.query.pages) {
                const page = response.query.pages[pageId];
                for (const link of page.links) {
                    results.push(link.title);
                }
            }
            if (doBreak) {
                break;
            }
        }
        return results;
    });
}
export function searchWiki(site, search) {
    return __awaiter(this, void 0, void 0, function* () {
        const link = `https://${site.code}.wikipedia.org/w/api.php`;
        const query = {
            "action": "opensearch",
            "search": `${search}`,
            "limit": "1",
            "redirects": "resolve",
            "format": "json",
            "origin": "*",
        };
        const res = yield makeRequestToWiki(link, query);
        console.log(res);
        if (res['1'].length <= 0) {
            return null;
        }
        else {
            return res['1'][0];
        }
    });
}
export function openWikipedia(site, title) {
    const regex = / /g;
    title = title.replace(regex, "_");
    let url = `https://${site.code}.wikipedia.org/wiki/${title}`;
    if (!isWikipediaURL(url)) {
        throw new Error(`${url} is not a wikipedia url`);
    }
    window.open(url);
}
